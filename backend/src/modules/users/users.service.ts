import { randomBytes } from 'node:crypto';
import {
  AUDIT_ACTION,
  ERROR_CODE,
  ROLE,
  USER_STATUS,
  type Language,
  type Paginated,
  type Role,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { buildPaginationMeta } from '../../shared/http/response.js';
import { hashPassword } from '../../shared/security/password.js';
import { recordAudit } from '../audit/audit.service.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.dto.js';

/**
 * Gestión de usuarios.
 *
 * Este servicio no conoce Express: recibe datos ya validados y lanza
 * `AppError` con códigos de dominio. Eso permite probarlo sin servidor y
 * reutilizarlo desde una tarea programada o un comando.
 */

export interface UserSummary {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  status: string;
  preferredLanguage: Language;
  roles: Role[];
  lastLoginAt: Date | null;
  createdAt: Date;
}

const userSelection = {
  id: true,
  username: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  preferredLanguage: true,
  lastLoginAt: true,
  createdAt: true,
  roles: { select: { role: { select: { code: true } } } },
} as const;

type UserRow = {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  status: string;
  preferredLanguage: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  roles: Array<{ role: { code: string } }>;
};

function toSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    status: row.status,
    preferredLanguage: row.preferredLanguage as Language,
    roles: row.roles.map((link) => link.role.code as Role),
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}

export async function listUsers(query: ListUsersQuery): Promise<Paginated<UserSummary>> {
  const where = {
    deletedAt: null,
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.roles?.length
      ? { roles: { some: { role: { code: { in: query.roles } } } } }
      : query.role
        ? { roles: { some: { role: { code: query.role } } } }
        : {}),
    ...(query.search
      ? {
          OR: [
            { username: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
            { firstName: { contains: query.search, mode: 'insensitive' as const } },
            { lastName: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  // Se cuentan y se leen en paralelo: son dos consultas independientes y
  // encadenarlas duplicaría la latencia de cada listado.
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: userSelection,
      orderBy: { [query.sort ?? 'createdAt']: query.order },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items: rows.map((row) => toSummary(row as UserRow)),
    meta: buildPaginationMeta(query.page, query.pageSize, total),
  };
}

export async function getUser(id: string): Promise<UserSummary> {
  const row = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: userSelection,
  });
  if (!row) throw AppError.notFound(ERROR_CODE.USER_NOT_FOUND, { id });
  return toSummary(row as UserRow);
}

async function assertIdentifiersFree(username: string, email: string | null): Promise<void> {
  const clash = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [{ username }, ...(email ? [{ email }] : [])],
    },
    select: { username: true, email: true },
  });

  if (!clash) return;
  if (clash.username === username) {
    throw AppError.conflict(ERROR_CODE.DUPLICATE_RESOURCE, 'Username already in use', { username });
  }
  throw AppError.conflict(ERROR_CODE.EMAIL_ALREADY_IN_USE, 'Email already in use', { email });
}

export async function createUser(
  input: CreateUserInput,
  actorId: string,
): Promise<UserSummary & { temporaryPassword?: string }> {
  const username = input.username.toLowerCase();
  const email = input.email?.toLowerCase() ?? null;

  await assertIdentifiersFree(username, email);

  // Sin contraseña, la cuenta queda pendiente de activación: es el estado de
  // quien entrará por SSO, y evita crear cuentas activas sin credencial alguna.
  const password = input.password;
  const roles = await prisma.role.findMany({ where: { code: { in: input.roles } } });
  if (roles.length !== input.roles.length) {
    throw AppError.notFound(ERROR_CODE.NOT_FOUND, { message: 'Unknown role' });
  }

  const created = await prisma.user.create({
    data: {
      username,
      email,
      firstName: input.firstName,
      lastName: input.lastName,
      preferredLanguage: input.preferredLanguage,
      status: password ? USER_STATUS.ACTIVE : USER_STATUS.PENDING_ACTIVATION,
      passwordHash: password ? await hashPassword(password) : null,
      passwordUpdatedAt: password ? new Date() : null,
      mustChangePassword: Boolean(password),
      roles: { create: roles.map((role) => ({ roleId: role.id })) },
    },
    select: userSelection,
  });

  await recordAudit({
    userId: actorId,
    action: AUDIT_ACTION.CREATE_USER,
    entityType: 'user',
    entityId: created.id,
    metadata: { username, roles: input.roles },
  });

  return toSummary(created as UserRow);
}

/**
 * Traduce la entrada parcial a datos de actualización.
 *
 * Se distingue `undefined` (el campo no viene, no se toca) de `null` (el
 * campo viene vacío, se borra). Sin esa distinción, omitir el correo en una
 * actualización parcial lo borraría.
 */
function buildUpdateData(input: UpdateUserInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (input.email !== undefined) data['email'] = input.email?.toLowerCase() ?? null;
  if (input.firstName !== undefined) data['firstName'] = input.firstName;
  if (input.lastName !== undefined) data['lastName'] = input.lastName;
  if (input.preferredLanguage !== undefined) data['preferredLanguage'] = input.preferredLanguage;
  if (input.status !== undefined) data['status'] = input.status;
  return data;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actorId: string,
): Promise<UserSummary> {
  const existing = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw AppError.notFound(ERROR_CODE.USER_NOT_FOUND, { id });

  if (input.email && input.email.toLowerCase() !== existing.email) {
    const clash = await prisma.user.findFirst({
      where: { email: input.email.toLowerCase(), deletedAt: null, NOT: { id } },
      select: { id: true },
    });
    if (clash) throw AppError.conflict(ERROR_CODE.EMAIL_ALREADY_IN_USE, 'Email already in use');
  }

  const updated = await prisma.user.update({
    where: { id },
    data: buildUpdateData(input) as never,
    select: userSelection,
  });

  // Suspender una cuenta debe surtir efecto ya, no cuando caduque su token de
  // acceso: se revocan sus sesiones.
  if (input.status && input.status !== USER_STATUS.ACTIVE) {
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await recordAudit({
    userId: actorId,
    action: AUDIT_ACTION.UPDATE_USER,
    entityType: 'user',
    entityId: id,
    metadata: { changed: Object.keys(input) },
  });

  return toSummary(updated as UserRow);
}

/**
 * Impide que la plataforma se quede sin nadie que pueda administrarla.
 *
 * El borrado ya estaba a salvo por otra razón: nadie puede borrarse a sí
 * mismo, así que quien borra siempre sobrevive. Quitar roles no tenía esa
 * protección, y un administrador que se quitara el suyo siendo el único
 * dejaba la instalación sin forma de crear usuarios, asignar roles ni
 * recuperar el acceso. Se arregla con base de datos, y eso en un colegio
 * significa llamar a alguien un domingo.
 */
async function assertQuedaAlgunAdministrador(userId: string, nuevos: Role[]): Promise<void> {
  if (nuevos.includes(ROLE.ADMIN)) return;

  const loEra = await prisma.userRole.count({
    where: { userId, role: { code: ROLE.ADMIN } },
  });
  if (loEra === 0) return;

  const administradores = await prisma.user.count({
    where: { deletedAt: null, roles: { some: { role: { code: ROLE.ADMIN } } } },
  });

  if (administradores <= 1) {
    throw AppError.conflict(
      ERROR_CODE.LAST_ADMIN,
      'No se puede quitar el rol de administrador al único que queda',
    );
  }
}

export async function setUserRoles(
  id: string,
  roles: Role[],
  actorId: string,
): Promise<UserSummary> {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!user) throw AppError.notFound(ERROR_CODE.USER_NOT_FOUND, { id });

  await assertQuedaAlgunAdministrador(id, roles);

  const roleRows = await prisma.role.findMany({ where: { code: { in: roles } } });
  if (roleRows.length !== roles.length) {
    throw AppError.notFound(ERROR_CODE.NOT_FOUND, { message: 'Unknown role' });
  }

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: id } }),
    prisma.userRole.createMany({
      data: roleRows.map((role) => ({ userId: id, roleId: role.id })),
    }),
  ]);

  await recordAudit({
    userId: actorId,
    action: AUDIT_ACTION.UPDATE_USER,
    entityType: 'user',
    entityId: id,
    metadata: { roles },
  });

  return getUser(id);
}

/**
 * Restablece la contraseña. Devuelve la temporal exactamente una vez: no se
 * almacena en claro en ningún sitio, así que si el administrador la pierde
 * hay que generar otra.
 */
export async function resetUserPassword(
  id: string,
  password: string | undefined,
  actorId: string,
): Promise<{ temporaryPassword: string }> {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!user) throw AppError.notFound(ERROR_CODE.USER_NOT_FOUND, { id });

  const temporaryPassword = password ?? `${randomBytes(6).toString('base64url')}Aa1`;

  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      passwordUpdatedAt: new Date(),
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      status: USER_STATUS.ACTIVE,
    },
  });

  await prisma.refreshToken.updateMany({
    where: { userId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await recordAudit({
    userId: actorId,
    action: AUDIT_ACTION.UPDATE_USER,
    entityType: 'user',
    entityId: id,
    metadata: { passwordReset: true },
  });

  return { temporaryPassword };
}

/**
 * Borrado lógico.
 *
 * Se conserva la fila para no romper el historial académico, pero se liberan
 * los identificadores únicos: el correo puede necesitar reasignarse y el
 * nombre de usuario no debe quedar bloqueado para siempre.
 */
export async function deleteUser(id: string, actorId: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, username: true },
  });
  if (!user) throw AppError.notFound(ERROR_CODE.USER_NOT_FOUND, { id });

  if (id === actorId) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'A user cannot delete their own account');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: USER_STATUS.INACTIVE,
        email: null,
        username: `eliminado_${Date.now()}_${user.username}`.slice(0, 60),
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await recordAudit({
    userId: actorId,
    action: AUDIT_ACTION.DELETE_USER,
    entityType: 'user',
    entityId: id,
  });
}
