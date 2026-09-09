import { z } from 'zod';
import {
  AUDIT_ACTION,
  ENROLLMENT_STATUS,
  ERROR_CODE,
  EVALUABLE_ENROLLMENT_STATUSES,
  LANGUAGE,
  ROLE,
  USER_STATUS,
  type EnrollmentStatus,
  type LocalizedText,
  type Paginated,
  type Role,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { buildPaginationMeta } from '../../shared/http/response.js';
import { hashPassword } from '../../shared/security/password.js';
import { isAdmin } from '../../middleware/authorize.js';
import { recordAudit } from '../audit/audit.service.js';
import type { PaginationQuery } from '../../middleware/validate.js';

/**
 * Estudiantes.
 *
 * El alta masiva llega por sincronización con Phidias; esta API sirve para
 * consultarlos, corregirlos y crear los casos que Phidias no cubre.
 *
 * `email` es opcional a propósito: en la matrícula real hay estudiantes sin
 * correo, y esas cuentas acceden con credenciales locales.
 */

export const createStudentSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9._-]+$/),
  email: z.string().trim().email().max(200).nullable().optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  code: z.string().trim().max(30).nullable().optional(),
  gradeLevelId: z.string().uuid().nullable().optional(),
  preferredLanguage: z.enum([LANGUAGE.ES, LANGUAGE.DE, LANGUAGE.EN]).default(LANGUAGE.ES),
  password: z.string().min(10).max(128).optional(),
});

export const updateStudentSchema = z.object({
  code: z.string().trim().max(30).nullable().optional(),
  gradeLevelId: z.string().uuid().nullable().optional(),
  enrollmentStatus: z
    .enum([
      ENROLLMENT_STATUS.ACTIVE,
      ENROLLMENT_STATUS.ENROLLED,
      ENROLLMENT_STATUS.ADMITTED,
      ENROLLMENT_STATUS.PENDING,
      ENROLLMENT_STATUS.SUSPENDED,
      ENROLLMENT_STATUS.WITHDRAWN,
    ])
    .optional(),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export interface StudentView {
  id: string;
  userId: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  code: string | null;
  enrollmentStatus: EnrollmentStatus;
  status: string;
  externalId: number | null;
  gradeLevel: { id: string; code: string; name: LocalizedText } | null;
  groups: Array<{ id: string; code: string }>;
}

const studentInclude = {
  user: {
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
    },
  },
  gradeLevel: { select: { id: true, code: true, name: true } },
  memberships: {
    where: { active: true },
    select: { group: { select: { id: true, code: true } } },
  },
} as const;

type StudentRow = {
  id: string;
  code: string | null;
  enrollmentStatus: string;
  externalId: number | null;
  user: {
    id: string;
    username: string;
    email: string | null;
    firstName: string;
    lastName: string;
    status: string;
  };
  gradeLevel: { id: string; code: string; name: unknown } | null;
  memberships: Array<{ group: { id: string; code: string } }>;
};

function toView(row: StudentRow): StudentView {
  return {
    id: row.id,
    userId: row.user.id,
    username: row.user.username,
    email: row.user.email,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    code: row.code,
    enrollmentStatus: row.enrollmentStatus as EnrollmentStatus,
    status: row.user.status,
    externalId: row.externalId,
    gradeLevel: row.gradeLevel
      ? {
          id: row.gradeLevel.id,
          code: row.gradeLevel.code,
          name: row.gradeLevel.name as LocalizedText,
        }
      : null,
    groups: row.memberships.map((membership) => membership.group),
  };
}

interface Actor {
  userId: string;
  roles: Role[];
}

/**
 * Alcance de lectura.
 *
 * Un docente solo ve a los estudiantes de sus grupos. Sin esta restricción,
 * cualquier docente podría listar la matrícula completa del colegio, que es
 * justo lo que la minimización de datos pretende evitar.
 */
function scopeFor(actor: Actor): Record<string, unknown> {
  if (isAdmin(actor)) return {};
  if (actor.roles.includes(ROLE.TEACHER)) {
    return {
      memberships: {
        some: { active: true, group: { homeroomTeacherId: actor.userId, deletedAt: null } },
      },
    };
  }
  // Un estudiante solo se ve a sí mismo.
  return { user: { id: actor.userId } };
}

export async function listStudents(
  actor: Actor,
  query: PaginationQuery & {
    groupId?: string;
    gradeLevelId?: string;
    enrollmentStatus?: EnrollmentStatus;
    evaluableOnly?: boolean;
  },
): Promise<Paginated<StudentView>> {
  const where = {
    user: { deletedAt: null },
    ...scopeFor(actor),
    ...(query.groupId ? { memberships: { some: { groupId: query.groupId, active: true } } } : {}),
    ...(query.gradeLevelId ? { gradeLevelId: query.gradeLevelId } : {}),
    ...(query.enrollmentStatus ? { enrollmentStatus: query.enrollmentStatus } : {}),
    ...(query.evaluableOnly
      ? { enrollmentStatus: { in: [...EVALUABLE_ENROLLMENT_STATUSES] } }
      : {}),
    ...(query.search
      ? {
          user: {
            deletedAt: null,
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' as const } },
              { lastName: { contains: query.search, mode: 'insensitive' as const } },
              { username: { contains: query.search, mode: 'insensitive' as const } },
            ],
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy: { user: { lastName: 'asc' } },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: studentInclude,
    }),
  ]);

  return {
    items: rows.map((row) => toView(row as unknown as StudentRow)),
    meta: buildPaginationMeta(query.page, query.pageSize, total),
  };
}

export async function getStudent(actor: Actor, id: string): Promise<StudentView> {
  const row = await prisma.student.findFirst({
    where: { id, user: { deletedAt: null }, ...scopeFor(actor) },
    include: studentInclude,
  });
  if (!row) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { id });
  return toView(row as unknown as StudentRow);
}

export async function createStudent(input: CreateStudentInput): Promise<StudentView> {
  const username = input.username.toLowerCase();
  const email = input.email?.toLowerCase() ?? null;

  const clash = await prisma.user.findFirst({
    where: { deletedAt: null, OR: [{ username }, ...(email ? [{ email }] : [])] },
    select: { username: true },
  });
  if (clash) {
    throw AppError.conflict(
      clash.username === username ? ERROR_CODE.DUPLICATE_RESOURCE : ERROR_CODE.EMAIL_ALREADY_IN_USE,
      'Username or email already in use',
    );
  }

  const studentRole = await prisma.role.findUnique({ where: { code: ROLE.STUDENT } });
  if (!studentRole) throw AppError.internal('El rol STUDENT no está sembrado');

  const passwordHash = input.password ? await hashPassword(input.password) : null;

  const studentId = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username,
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        preferredLanguage: input.preferredLanguage,
        status: passwordHash ? USER_STATUS.ACTIVE : USER_STATUS.PENDING_ACTIVATION,
        passwordHash,
        passwordUpdatedAt: passwordHash ? new Date() : null,
        mustChangePassword: Boolean(passwordHash),
        roles: { create: { roleId: studentRole.id } },
      },
    });

    const student = await tx.student.create({
      data: {
        userId: user.id,
        code: input.code ?? null,
        gradeLevelId: input.gradeLevelId ?? null,
        enrollmentStatus: ENROLLMENT_STATUS.ACTIVE,
      },
    });

    return student.id;
  });

  const created = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: studentInclude,
  });
  return toView(created as unknown as StudentRow);
}

// --- Credenciales ------------------------------------------------------------

export const issueCredentialsSchema = z
  .object({
    /** Estudiantes concretos. */
    studentIds: z.array(z.string().uuid()).max(1000).optional(),
    /** Todos los de un grupo. */
    groupId: z.string().uuid().optional(),
    /** Todos los que aún no pueden entrar. Es el caso tras sincronizar. */
    onlyWithoutCredentials: z.boolean().default(false),
    /**
     * Contraseña a asignar. Si se omite, se genera una distinta por estudiante
     * y se devuelven todas una única vez.
     */
    password: z.string().min(10).max(128).optional(),
    /** Obligar a cambiarla en el primer acceso. */
    mustChangePassword: z.boolean().default(true),
  })
  .refine(
    (input) =>
      Boolean(input.studentIds?.length) || Boolean(input.groupId) || input.onlyWithoutCredentials,
    { message: 'Indica estudiantes, un grupo, o marca los que no tienen credenciales' },
  );

export type IssueCredentialsInput = z.infer<typeof issueCredentialsSchema>;

export interface IssuedCredential {
  studentId: string;
  username: string;
  email: string | null;
  fullName: string;
  /** Se devuelve una única vez: no se guarda en claro en ningún sitio. */
  password: string;
}

/**
 * Genera una contraseña legible de un solo uso.
 *
 * Se evitan los caracteres que se confunden al dictarla o copiarla a mano
 * (l/I/1, O/0): estas contraseñas se van a leer en voz alta en un aula.
 */
function generatePassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (source: string, count: number): string =>
    Array.from({ length: count }, () => source[randomInt(source.length)]).join('');

  return `${pick(upper, 1)}${pick(letters, 6)}${pick(digits, 3)}`;
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

/**
 * Asigna credenciales a un conjunto de estudiantes.
 *
 * Sirve tanto justo después de sincronizar con Phidias —cuando llegan mil
 * cuentas sin contraseña— como para un caso suelto meses después. La cuenta
 * pasa a activa: hasta ahora estaba pendiente precisamente por no tener
 * credenciales.
 *
 * Las contraseñas generadas se devuelven **una sola vez**. No se almacenan en
 * claro, así que si se pierden hay que volver a emitirlas.
 */
export async function issueCredentials(
  input: IssueCredentialsInput,
  actorId: string,
): Promise<{ issued: IssuedCredential[]; skipped: number }> {
  const where = {
    user: { deletedAt: null },
    ...(input.studentIds?.length ? { id: { in: input.studentIds } } : {}),
    ...(input.groupId ? { memberships: { some: { groupId: input.groupId, active: true } } } : {}),
    ...(input.onlyWithoutCredentials ? { user: { deletedAt: null, passwordHash: null } } : {}),
  };

  const students = await prisma.student.findMany({
    where,
    include: {
      user: { select: { id: true, username: true, email: true, firstName: true, lastName: true } },
    },
    orderBy: { user: { lastName: 'asc' } },
    take: 1000,
  });

  if (students.length === 0) return { issued: [], skipped: 0 };

  const issued: IssuedCredential[] = [];

  for (const student of students) {
    const password = input.password ?? generatePassword();

    await prisma.user.update({
      where: { id: student.user.id },
      data: {
        passwordHash: await hashPassword(password),
        passwordUpdatedAt: new Date(),
        mustChangePassword: input.mustChangePassword,
        status: USER_STATUS.ACTIVE,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    issued.push({
      studentId: student.id,
      username: student.user.username,
      email: student.user.email,
      fullName: `${student.user.firstName} ${student.user.lastName}`,
      password,
    });
  }

  await recordAudit({
    userId: actorId,
    action: AUDIT_ACTION.UPDATE_USER,
    entityType: 'student',
    metadata: {
      credentialsIssued: issued.length,
      // Nunca la contraseña: ni la compartida ni las generadas.
      sharedPassword: input.password !== undefined,
      groupId: input.groupId,
    },
  });

  return { issued, skipped: 0 };
}

export async function updateStudent(
  id: string,
  input: z.infer<typeof updateStudentSchema>,
): Promise<StudentView> {
  const student = await prisma.student.findUnique({ where: { id }, select: { id: true } });
  if (!student) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { id });

  const updated = await prisma.student.update({
    where: { id },
    data: {
      ...(input.code !== undefined ? { code: input.code ?? null } : {}),
      ...(input.gradeLevelId !== undefined ? { gradeLevelId: input.gradeLevelId ?? null } : {}),
      ...(input.enrollmentStatus ? { enrollmentStatus: input.enrollmentStatus } : {}),
    },
    include: studentInclude,
  });

  return toView(updated as unknown as StudentRow);
}
