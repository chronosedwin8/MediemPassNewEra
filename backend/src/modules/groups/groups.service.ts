import { z } from 'zod';
import {
  ERROR_CODE,
  ROLE,
  type LocalizedText,
  type Paginated,
  type Role,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { buildPaginationMeta } from '../../shared/http/response.js';
import { assertInScope, isAdmin } from '../../middleware/authorize.js';
import type { PaginationQuery } from '../../middleware/validate.js';

/**
 * Grupos de estudiantes.
 *
 * Aquí vive la primera guarda de alcance real del sistema: un docente ve y
 * gestiona **sus** grupos, no todos. El permiso `group:read` dice que puede
 * leer grupos; este servicio decide cuáles.
 */

export const createGroupSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9]+$/, 'Solo mayúsculas y números'),
  name: z.string().trim().min(1).max(100).optional(),
  academicYearId: z.string().uuid(),
  gradeLevelId: z.string().uuid(),
  subjectId: z.string().uuid().nullable().optional(),
  homeroomTeacherId: z.string().uuid().nullable().optional(),
});

export const updateGroupSchema = createGroupSchema.partial().omit({ code: true, academicYearId: true });

export const membershipSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(200),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export interface GroupView {
  id: string;
  code: string;
  name: string;
  active: boolean;
  studentCount: number;
  academicYear: { id: string; code: string };
  gradeLevel: { id: string; code: string; name: LocalizedText };
  subject: { id: string; code: string; name: LocalizedText } | null;
  homeroomTeacher: { id: string; firstName: string; lastName: string } | null;
}

interface Actor {
  userId: string;
  roles: Role[];
}

/**
 * Restricción de alcance para un actor.
 *
 * Un administrador no lleva restricción. Un docente ve los grupos de los que
 * es titular. Un estudiante ve aquellos a los que pertenece.
 */
function scopeFor(actor: Actor): Record<string, unknown> {
  if (isAdmin(actor)) return {};

  if (actor.roles.includes(ROLE.TEACHER)) {
    return { homeroomTeacherId: actor.userId };
  }

  return { memberships: { some: { student: { userId: actor.userId }, active: true } } };
}

const groupInclude = {
  academicYear: { select: { id: true, code: true } },
  gradeLevel: { select: { id: true, code: true, name: true } },
  subject: { select: { id: true, code: true, name: true } },
  homeroomTeacher: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { memberships: { where: { active: true } } } },
} as const;

type GroupRow = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  academicYear: { id: string; code: string };
  gradeLevel: { id: string; code: string; name: unknown };
  subject: { id: string; code: string; name: unknown } | null;
  homeroomTeacher: { id: string; firstName: string; lastName: string } | null;
  _count: { memberships: number };
};

function toView(row: GroupRow): GroupView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active,
    studentCount: row._count.memberships,
    academicYear: row.academicYear,
    gradeLevel: {
      id: row.gradeLevel.id,
      code: row.gradeLevel.code,
      name: row.gradeLevel.name as LocalizedText,
    },
    subject: row.subject
      ? { id: row.subject.id, code: row.subject.code, name: row.subject.name as LocalizedText }
      : null,
    homeroomTeacher: row.homeroomTeacher,
  };
}

export async function listGroups(
  actor: Actor,
  query: PaginationQuery & { academicYearId?: string; gradeLevelId?: string },
): Promise<Paginated<GroupView>> {
  const where = {
    deletedAt: null,
    ...scopeFor(actor),
    ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
    ...(query.gradeLevelId ? { gradeLevelId: query.gradeLevelId } : {}),
    ...(query.search ? { code: { contains: query.search.toUpperCase() } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.group.count({ where }),
    prisma.group.findMany({
      where,
      orderBy: { code: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: groupInclude,
    }),
  ]);

  return {
    items: rows.map((row) => toView(row as unknown as GroupRow)),
    meta: buildPaginationMeta(query.page, query.pageSize, total),
  };
}

/** Comprueba que el actor puede operar sobre el grupo indicado. */
export async function assertGroupAccess(actor: Actor, groupId: string): Promise<void> {
  if (isAdmin(actor)) return;

  const group = await prisma.group.findFirst({
    where: { id: groupId, deletedAt: null, ...scopeFor(actor) },
    select: { id: true },
  });

  assertInScope(actor, Boolean(group), { groupId });
}

export async function getGroup(actor: Actor, id: string): Promise<GroupView> {
  const row = await prisma.group.findFirst({
    where: { id, deletedAt: null },
    include: groupInclude,
  });
  if (!row) throw AppError.notFound(ERROR_CODE.GROUP_NOT_FOUND, { id });

  await assertGroupAccess(actor, id);
  return toView(row as unknown as GroupRow);
}

export async function createGroup(actor: Actor, input: CreateGroupInput): Promise<GroupView> {
  const [year, gradeLevel] = await Promise.all([
    prisma.academicYear.findUnique({ where: { id: input.academicYearId }, select: { id: true } }),
    prisma.gradeLevel.findUnique({ where: { id: input.gradeLevelId }, select: { id: true } }),
  ]);
  if (!year) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { academicYearId: input.academicYearId });
  if (!gradeLevel) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { gradeLevelId: input.gradeLevelId });

  const clash = await prisma.group.findFirst({
    where: { academicYearId: input.academicYearId, code: input.code, deletedAt: null },
    select: { id: true },
  });
  if (clash) {
    throw AppError.conflict(ERROR_CODE.DUPLICATE_RESOURCE, 'Group code already exists this year', {
      code: input.code,
    });
  }

  // Un docente que crea un grupo queda como titular salvo que sea un
  // administrador asignando a otra persona: si no, crearía grupos que después
  // no podría ver.
  const homeroomTeacherId = isAdmin(actor)
    ? (input.homeroomTeacherId ?? null)
    : (input.homeroomTeacherId ?? actor.userId);

  const createdRow = await prisma.group.create({
    data: {
      code: input.code,
      name: input.name ?? input.code,
      academicYearId: input.academicYearId,
      gradeLevelId: input.gradeLevelId,
      subjectId: input.subjectId ?? null,
      homeroomTeacherId,
    },
    include: groupInclude,
  });

  return toView(createdRow as unknown as GroupRow);
}

export async function updateGroup(
  actor: Actor,
  id: string,
  input: z.infer<typeof updateGroupSchema>,
): Promise<GroupView> {
  await assertGroupAccess(actor, id);

  // Solo un administrador puede cambiar de titular: si un docente pudiera,
  // podría cederse a sí mismo cualquier grupo o perder el suyo por error.
  if (input.homeroomTeacherId !== undefined && !isAdmin(actor)) {
    throw AppError.forbidden(ERROR_CODE.INSUFFICIENT_PERMISSIONS, {
      message: 'Only an administrator can reassign the homeroom teacher',
    });
  }

  const updated = await prisma.group.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.gradeLevelId ? { gradeLevelId: input.gradeLevelId } : {}),
      ...(input.subjectId !== undefined ? { subjectId: input.subjectId ?? null } : {}),
      ...(input.homeroomTeacherId !== undefined
        ? { homeroomTeacherId: input.homeroomTeacherId ?? null }
        : {}),
    },
    include: groupInclude,
  });

  return toView(updated as unknown as GroupRow);
}

export interface GroupMemberView {
  studentId: string;
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string | null;
  enrollmentStatus: string;
  joinedAt: Date;
}

export async function listMembers(actor: Actor, groupId: string): Promise<GroupMemberView[]> {
  await assertGroupAccess(actor, groupId);

  const rows = await prisma.groupMembership.findMany({
    where: { groupId, active: true },
    include: {
      student: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, username: true, email: true } },
        },
      },
    },
    orderBy: { student: { user: { lastName: 'asc' } } },
  });

  return rows.map((row) => ({
    studentId: row.student.id,
    userId: row.student.user.id,
    firstName: row.student.user.firstName,
    lastName: row.student.user.lastName,
    username: row.student.user.username,
    email: row.student.user.email,
    enrollmentStatus: row.student.enrollmentStatus,
    joinedAt: row.joinedAt,
  }));
}

/**
 * Añade estudiantes al grupo.
 *
 * Es idempotente: volver a añadir a alguien que ya está reactiva su
 * pertenencia en lugar de fallar. Añadir treinta estudiantes de los que
 * veintinueve ya estaban no debería ser un error.
 */
export async function addMembers(
  actor: Actor,
  groupId: string,
  studentIds: string[],
): Promise<{ added: number; reactivated: number; alreadyPresent: number }> {
  await assertGroupAccess(actor, groupId);

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: { id: true },
  });
  if (students.length !== studentIds.length) {
    const found = new Set(students.map((student) => student.id));
    throw AppError.notFound(ERROR_CODE.NOT_FOUND, {
      message: 'Unknown students',
      missing: studentIds.filter((id) => !found.has(id)),
    });
  }

  const existing = await prisma.groupMembership.findMany({
    where: { groupId, studentId: { in: studentIds } },
    select: { studentId: true, active: true },
  });

  const existingMap = new Map(existing.map((row) => [row.studentId, row.active]));
  const toCreate = studentIds.filter((id) => !existingMap.has(id));
  const toReactivate = studentIds.filter((id) => existingMap.get(id) === false);

  await prisma.$transaction([
    prisma.groupMembership.createMany({
      data: toCreate.map((studentId) => ({ groupId, studentId })),
      skipDuplicates: true,
    }),
    prisma.groupMembership.updateMany({
      where: { groupId, studentId: { in: toReactivate } },
      data: { active: true, leftAt: null },
    }),
  ]);

  return {
    added: toCreate.length,
    reactivated: toReactivate.length,
    alreadyPresent: studentIds.length - toCreate.length - toReactivate.length,
  };
}

/**
 * Retira a un estudiante del grupo.
 *
 * No borra la pertenencia: la marca inactiva con su fecha de salida. Las
 * respuestas ya calificadas conservan el `group_id` que tenían, de modo que
 * el histórico sigue atribuido al grupo en el que realmente estaba.
 */
export async function removeMember(actor: Actor, groupId: string, studentId: string): Promise<void> {
  await assertGroupAccess(actor, groupId);

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_studentId: { groupId, studentId } },
  });
  if (!membership) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { groupId, studentId });

  await prisma.groupMembership.update({
    where: { id: membership.id },
    data: { active: false, leftAt: new Date() },
  });
}

export async function deleteGroup(actor: Actor, id: string): Promise<void> {
  await assertGroupAccess(actor, id);

  const group = await prisma.group.findFirst({ where: { id, deletedAt: null }, select: { code: true } });
  if (!group) throw AppError.notFound(ERROR_CODE.GROUP_NOT_FOUND, { id });

  const openAssignments = await prisma.assignment.count({
    where: { groupId: id, status: { in: ['SCHEDULED', 'OPEN'] } },
  });
  if (openAssignments > 0) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'Group has open assignments', { openAssignments });
  }

  await prisma.group.update({
    where: { id },
    data: { deletedAt: new Date(), active: false },
  });
}
