import { z } from 'zod';
import {
  ASSESSMENT_VERSION_STATUS,
  ASSIGNMENT_TARGET_TYPE,
  AUDIT_ACTION,
  ERROR_CODE,
  EVALUABLE_ENROLLMENT_STATUSES,
  RECIPIENT_STATUS,
  type Paginated,
  type Role,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { buildPaginationMeta } from '../../shared/http/response.js';
import { assertOwnership, isAdmin } from '../../middleware/authorize.js';
import { recordAudit } from '../audit/audit.service.js';
import { assertGroupAccess } from '../groups/groups.service.js';
import type { PaginationQuery } from '../../middleware/validate.js';

/**
 * Asignación de evaluaciones.
 *
 * Se separa el **acto de asignar** (`Assignment`: qué versión, a quién, en qué
 * ventana, con cuántos intentos) de **cada destinatario** concreto
 * (`AssignmentRecipient`, una fila por persona con su propio estado).
 *
 * Esa separación es lo que hace que el seguimiento sea una consulta indexada
 * simple y que un estudiante que entra al grupo más tarde pueda incorporarse
 * sin reescribir la asignación.
 *
 * La asignación fija una **versión concreta**: lo que el estudiante va a
 * responder no puede cambiar bajo sus pies porque el docente edite la
 * evaluación mientras tanto.
 */

export const createAssignmentSchema = z
  .object({
    assessmentVersionId: z.string().uuid(),
    targetType: z.enum([ASSIGNMENT_TARGET_TYPE.USER, ASSIGNMENT_TARGET_TYPE.GROUP]),
    /** Obligatorio si el destino es un grupo. */
    groupId: z.string().uuid().optional(),
    /** Obligatorio si el destino son personas concretas. */
    userIds: z.array(z.string().uuid()).max(500).optional(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date().nullable().optional(),
    attemptsAllowed: z.number().int().min(1).max(20).default(1),
    timeLimitMinutes: z.number().int().min(0).max(600).nullable().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.targetType === ASSIGNMENT_TARGET_TYPE.GROUP && !input.groupId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['groupId'],
        message: 'Falta el grupo destino',
      });
    }
    if (input.targetType === ASSIGNMENT_TARGET_TYPE.USER && !input.userIds?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['userIds'],
        message: 'Falta al menos un destinatario',
      });
    }
    if (input.endAt && input.endAt <= input.startAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endAt'],
        message: 'El cierre debe ser posterior a la apertura',
      });
    }
  });

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

interface Actor {
  userId: string;
  roles: Role[];
}

export interface AssignmentSummary {
  id: string;
  status: string;
  startAt: Date;
  endAt: Date | null;
  attemptsAllowed: number;
  timeLimitMinutes: number | null;
  assessment: { id: string; title: string; versionId: string; versionNumber: number };
  group: { id: string; code: string } | null;
  recipients: { total: number; completed: number; inProgress: number; pending: number };
  createdAt: Date;
}

/**
 * Estado de la asignación derivado de la ventana temporal.
 *
 * Se calcula en lugar de almacenarse porque depende del momento en que se
 * mira: guardarlo obligaría a un proceso que lo actualizara cada minuto y a
 * vivir con que a veces estuviera desactualizado.
 */
function resolveStatus(
  startAt: Date,
  endAt: Date | null,
  cancelled: boolean,
  now = new Date(),
): string {
  if (cancelled) return 'CANCELLED';
  if (now < startAt) return 'SCHEDULED';
  if (endAt && now > endAt) return 'CLOSED';
  return 'OPEN';
}

/**
 * Resuelve quiénes reciben la asignación.
 *
 * Con destino de grupo se toman sus miembros **evaluables**: incluir a quien
 * está retirado o suspendido generaría pendientes que nadie va a completar y
 * ensuciaría todas las tasas de cumplimiento.
 */
async function resolveRecipients(actor: Actor, input: CreateAssignmentInput): Promise<string[]> {
  if (input.targetType === ASSIGNMENT_TARGET_TYPE.GROUP) {
    await assertGroupAccess(actor, input.groupId!);

    const memberships = await prisma.groupMembership.findMany({
      where: {
        groupId: input.groupId!,
        active: true,
        student: { enrollmentStatus: { in: [...EVALUABLE_ENROLLMENT_STATUSES] } },
      },
      select: { student: { select: { userId: true } } },
    });

    if (memberships.length === 0) {
      throw AppError.conflict(
        ERROR_CODE.CONFLICT,
        'The group has no students that can be evaluated',
      );
    }

    return memberships.map((membership) => membership.student.userId);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: input.userIds! }, deletedAt: null },
    select: { id: true },
  });
  if (users.length !== input.userIds!.length) {
    throw AppError.notFound(ERROR_CODE.USER_NOT_FOUND, { message: 'Some recipients do not exist' });
  }

  return users.map((user) => user.id);
}

export async function createAssignment(actor: Actor, input: CreateAssignmentInput) {
  const version = await prisma.assessmentVersion.findUnique({
    where: { id: input.assessmentVersionId },
    include: { assessment: { select: { id: true, title: true, createdById: true } } },
  });
  if (!version) {
    throw AppError.notFound(ERROR_CODE.ASSESSMENT_VERSION_NOT_FOUND, {
      id: input.assessmentVersionId,
    });
  }

  assertOwnership(actor, version.assessment.createdById, { versionId: version.id });

  // Solo se asigna lo publicado: un borrador puede cambiar en cualquier
  // momento y no tiene puntos ni escala materializados.
  if (version.status !== ASSESSMENT_VERSION_STATUS.PUBLISHED) {
    throw AppError.conflict(
      ERROR_CODE.ASSESSMENT_NOT_PUBLISHED,
      'Only a published version can be assigned',
      { status: version.status },
    );
  }

  const recipientIds = await resolveRecipients(actor, input);

  const assignment = await prisma.$transaction(async (tx) => {
    const created = await tx.assignment.create({
      data: {
        assessmentVersionId: input.assessmentVersionId,
        assignedById: actor.userId,
        targetType: input.targetType,
        groupId: input.targetType === ASSIGNMENT_TARGET_TYPE.GROUP ? input.groupId! : null,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        attemptsAllowed: input.attemptsAllowed,
        timeLimitMinutes: input.timeLimitMinutes ?? null,
        status: resolveStatus(input.startAt, input.endAt ?? null, false) as never,
      },
    });

    await tx.assignmentRecipient.createMany({
      data: recipientIds.map((userId) => ({ assignmentId: created.id, userId })),
      skipDuplicates: true,
    });

    return created;
  });

  await recordAudit({
    userId: actor.userId,
    action: AUDIT_ACTION.ASSIGN_ASSESSMENT,
    entityType: 'assignment',
    entityId: assignment.id,
    metadata: {
      assessmentId: version.assessment.id,
      versionNumber: version.versionNumber,
      recipients: recipientIds.length,
      targetType: input.targetType,
    },
  });

  return { ...assignment, recipientCount: recipientIds.length };
}

export async function listAssignments(
  actor: Actor,
  query: PaginationQuery & { groupId?: string; assessmentId?: string },
): Promise<Paginated<AssignmentSummary>> {
  const where = {
    ...(isAdmin(actor) ? {} : { assignedById: actor.userId }),
    ...(query.groupId ? { groupId: query.groupId } : {}),
    ...(query.assessmentId ? { version: { assessmentId: query.assessmentId } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.assignment.count({ where }),
    prisma.assignment.findMany({
      where,
      orderBy: { createdAt: query.order },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        version: {
          select: {
            id: true,
            versionNumber: true,
            assessment: { select: { id: true, title: true } },
          },
        },
        group: { select: { id: true, code: true } },
        recipients: { select: { status: true } },
      },
    }),
  ]);

  const now = new Date();

  return {
    items: rows.map((row) => ({
      id: row.id,
      status: resolveStatus(row.startAt, row.endAt, row.status === 'CANCELLED', now),
      startAt: row.startAt,
      endAt: row.endAt,
      attemptsAllowed: row.attemptsAllowed,
      timeLimitMinutes: row.timeLimitMinutes,
      assessment: {
        id: row.version.assessment.id,
        title: row.version.assessment.title,
        versionId: row.version.id,
        versionNumber: row.version.versionNumber,
      },
      group: row.group,
      recipients: {
        total: row.recipients.length,
        completed: row.recipients.filter((r) => r.status === RECIPIENT_STATUS.COMPLETED).length,
        inProgress: row.recipients.filter((r) => r.status === RECIPIENT_STATUS.IN_PROGRESS).length,
        pending: row.recipients.filter((r) => r.status === RECIPIENT_STATUS.PENDING).length,
      },
      createdAt: row.createdAt,
    })),
    meta: buildPaginationMeta(query.page, query.pageSize, total),
  };
}

/** Seguimiento individual: quién ha terminado, quién va por dónde. */
export async function listRecipients(actor: Actor, assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, assignedById: true },
  });
  if (!assignment) throw AppError.notFound(ERROR_CODE.ASSIGNMENT_NOT_FOUND, { assignmentId });

  assertOwnership(actor, assignment.assignedById, { assignmentId });

  return prisma.assignmentRecipient.findMany({
    where: { assignmentId },
    orderBy: { user: { lastName: 'asc' } },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, username: true } },
      attempts: {
        orderBy: { attemptNumber: 'desc' },
        select: {
          id: true,
          attemptNumber: true,
          status: true,
          percentage: true,
          gradeValue: true,
          passed: true,
          submittedAt: true,
        },
      },
    },
  });
}

/**
 * Incorpora a los estudiantes que entraron al grupo después de asignar.
 *
 * Es el caso real de un traslado a mitad de periodo: sin esto, el estudiante
 * nuevo simplemente no vería la evaluación y nadie se enteraría.
 */
export async function syncGroupRecipients(
  actor: Actor,
  assignmentId: string,
): Promise<{ added: number }> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, assignedById: true, groupId: true, targetType: true },
  });
  if (!assignment) throw AppError.notFound(ERROR_CODE.ASSIGNMENT_NOT_FOUND, { assignmentId });

  assertOwnership(actor, assignment.assignedById, { assignmentId });

  if (assignment.targetType !== ASSIGNMENT_TARGET_TYPE.GROUP || !assignment.groupId) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'Only group assignments can be resynchronised');
  }

  const [memberships, existing] = await Promise.all([
    prisma.groupMembership.findMany({
      where: {
        groupId: assignment.groupId,
        active: true,
        student: { enrollmentStatus: { in: [...EVALUABLE_ENROLLMENT_STATUSES] } },
      },
      select: { student: { select: { userId: true } } },
    }),
    prisma.assignmentRecipient.findMany({
      where: { assignmentId },
      select: { userId: true },
    }),
  ]);

  const already = new Set(existing.map((recipient) => recipient.userId));
  const missing = memberships
    .map((membership) => membership.student.userId)
    .filter((userId) => !already.has(userId));

  if (missing.length > 0) {
    await prisma.assignmentRecipient.createMany({
      data: missing.map((userId) => ({ assignmentId, userId })),
      skipDuplicates: true,
    });
  }

  return { added: missing.length };
}

export async function cancelAssignment(actor: Actor, assignmentId: string): Promise<void> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, assignedById: true },
  });
  if (!assignment) throw AppError.notFound(ERROR_CODE.ASSIGNMENT_NOT_FOUND, { assignmentId });

  assertOwnership(actor, assignment.assignedById, { assignmentId });

  await prisma.$transaction([
    prisma.assignment.update({ where: { id: assignmentId }, data: { status: 'CANCELLED' } }),
    // Solo se cancela lo que nadie ha terminado: un intento completado ya
    // produjo una nota y esa nota no desaparece porque se cancele el reparto.
    prisma.assignmentRecipient.updateMany({
      where: {
        assignmentId,
        status: { in: [RECIPIENT_STATUS.PENDING, RECIPIENT_STATUS.IN_PROGRESS] },
      },
      data: { status: RECIPIENT_STATUS.CANCELLED },
    }),
  ]);
}
