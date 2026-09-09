import { z } from 'zod';
import {
  ALL_PERMISSIONS,
  PERMISSION,
  ROLE,
  ROLE_PERMISSIONS,
  localize,
  type Language,
  type LocalizedText,
  type Permission,
  type Role,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ERROR_CODE } from '@medienpass/shared';
import { recordAudit } from '../audit/audit.service.js';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('roles');

/**
 * Permisos por rol, editables desde la administración.
 *
 * Hasta ahora la correspondencia entre rol y permisos vivía únicamente en la
 * semilla, de modo que cambiar quién puede generar evaluaciones con IA exigía
 * tocar código y desplegar. Este módulo la vuelve un dato: el administrador
 * marca y desmarca, y el efecto es inmediato porque la autorización ya lee los
 * permisos del usuario en cada petición.
 *
 * Dos cosas que **no** son configurables, y conviene entender por qué:
 *
 *  - El rol de administrador conserva siempre todos los permisos. Permitir
 *    quitárselos deja la instalación sin nadie capaz de devolvérselos, y la
 *    única salida es entrar a la base de datos a mano.
 *  - No se pueden conceder permisos que no existan en el catálogo. El catálogo
 *    es de código porque cada permiso tiene sentido solo si algo lo comprueba.
 */

export const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.enum(ALL_PERMISSIONS as unknown as [Permission, ...Permission[]])),
});

export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;

interface Actor {
  userId: string;
  roles: Role[];
}

export interface RoleView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: Permission[];
  /** El de administrador no admite cambios; la interfaz lo muestra bloqueado. */
  editable: boolean;
}

/**
 * Agrupa el catálogo por recurso para que la interfaz no tenga que conocerlo.
 *
 * Ochenta casillas sueltas son ilegibles; agrupadas por «evaluaciones»,
 * «estudiantes» o «capacitación» se revisan de un vistazo.
 */
export function listPermissionCatalog(): Array<{ resource: string; permissions: Permission[] }> {
  const byResource = new Map<string, Permission[]>();

  for (const permission of ALL_PERMISSIONS) {
    const resource = permission.split(':')[0]!;
    const bucket = byResource.get(resource) ?? [];
    bucket.push(permission);
    byResource.set(resource, bucket);
  }

  return [...byResource.entries()].map(([resource, permissions]) => ({ resource, permissions }));
}

export async function listRoles(language: string): Promise<RoleView[]> {
  const roles = await prisma.role.findMany({
    include: {
      permissions: { select: { permission: { select: { code: true } } } },
      _count: { select: { users: true } },
    },
    orderBy: { code: 'asc' },
  });

  return roles.map((role) => ({
    id: role.id,
    code: role.code,
    name: localize(role.name as LocalizedText, language as Language),
    description: role.description
      ? localize(role.description as LocalizedText, language as Language)
      : null,
    isSystem: role.isSystem,
    userCount: role._count.users,
    permissions: role.permissions.map((entry) => entry.permission.code as Permission),
    editable: role.code !== ROLE.ADMIN,
  }));
}

export async function updateRolePermissions(
  actor: Actor,
  roleId: string,
  input: UpdateRolePermissionsInput,
): Promise<RoleView> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { permissions: { select: { permission: { select: { code: true } } } } },
  });
  if (!role) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { roleId });

  if (role.code === ROLE.ADMIN) {
    throw AppError.conflict(
      ERROR_CODE.CONFLICT,
      'The administrator role always keeps every permission',
      { roleCode: role.code },
    );
  }

  const requested = new Set(input.permissions);
  const permissions = await prisma.permission.findMany({
    where: { code: { in: [...requested] } },
    select: { id: true, code: true },
  });

  if (permissions.length !== requested.size) {
    const found = new Set(permissions.map((permission) => permission.code));
    throw AppError.validation([
      {
        path: 'permissions',
        rule: 'unknown_permission',
        message: `Permisos inexistentes: ${[...requested].filter((code) => !found.has(code)).join(', ')}`,
      },
    ]);
  }

  const before = role.permissions.map((entry) => entry.permission.code as Permission).sort();

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
    }),
  ]);

  const after = [...requested].sort();

  await recordAudit({
    userId: actor.userId,
    action: 'UPDATE_ROLE_PERMISSIONS',
    entityType: 'role',
    entityId: roleId,
    metadata: {
      roleCode: role.code,
      // Se registra la diferencia, no la lista entera: al revisar la auditoría
      // interesa qué cambió, no repetir ochenta códigos que siguen igual.
      granted: after.filter((code) => !before.includes(code)),
      revoked: before.filter((code) => !after.includes(code)),
    },
  });

  log.info(
    { roleCode: role.code, total: after.length, actorId: actor.userId },
    'permisos de rol actualizados',
  );

  const roles = await listRoles('es');
  return roles.find((entry) => entry.id === roleId)!;
}

/**
 * Deja el rol como lo define el código.
 *
 * Es la salida cuando alguien se pasa quitando permisos y la aplicación deja
 * de comportarse como debería: en lugar de adivinar qué faltaba, se vuelve al
 * punto de partida conocido.
 */
export async function resetRolePermissions(actor: Actor, roleId: string): Promise<RoleView> {
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { code: true } });
  if (!role) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { roleId });

  const defaults = ROLE_PERMISSIONS[role.code as Role];
  if (!defaults) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'This role has no defaults in code', {
      roleCode: role.code,
    });
  }

  return updateRolePermissions(actor, roleId, { permissions: [...defaults] });
}

export const ROLE_PERMISSION_GUARD = PERMISSION.USER_MANAGE_ROLES;
