import { z } from 'zod';
import {
  ERROR_CODE,
  RECIPIENT_STATUS,
  toPercentage,
  type Paginated,
  type Role,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { buildPaginationMeta } from '../../shared/http/response.js';
import { assertOwnership, isAdmin } from '../../middleware/authorize.js';
import type { PaginationQuery } from '../../middleware/validate.js';

/**
 * Planes de evaluación.
 *
 * Un plan declara **qué se va a evaluar en cada periodo**, antes de que exista
 * la evaluación concreta. Sirve para dos cosas: planificar la cobertura de
 * competencias a lo largo del curso, y después medir cuánto de lo planificado
 * se cumplió realmente.
 *
 * Un ítem del plan puede existir sin evaluación asociada —es una intención— y
 * ganarla más tarde. Esa es la diferencia entre un plan y una lista de
 * asignaciones.
 */

export const createPlanSchema = z.object({
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  academicYearId: z.string().uuid(),
  subjectId: z.string().uuid().nullable().optional(),
  gradeLevelId: z.string().uuid().nullable().optional(),
});

export const createPlanItemSchema = z.object({
  academicPeriodId: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  assessmentId: z.string().uuid().nullable().optional(),
  kmkCompetencyId: z.string().uuid().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  required: z.boolean().default(true),
  position: z.number().int().min(0).optional(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type CreatePlanItemInput = z.infer<typeof createPlanItemSchema>;

interface Actor {
  userId: string;
  roles: Role[];
}

function scopeFor(actor: Actor): Record<string, unknown> {
  return isAdmin(actor) ? {} : { createdById: actor.userId };
}

const planInclude = {
  academicYear: { select: { id: true, code: true } },
  subject: { select: { id: true, code: true } },
  gradeLevel: { select: { id: true, code: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  items: {
    orderBy: { position: 'asc' as const },
    include: {
      academicPeriod: { select: { id: true, name: true, position: true } },
      assessment: { select: { id: true, title: true } },
      kmkCompetency: { select: { id: true, code: true, name: true, color: true } },
    },
  },
} as const;

export async function listPlans(
  actor: Actor,
  query: PaginationQuery & { academicYearId?: string },
): Promise<Paginated<unknown>> {
  const where = {
    deletedAt: null,
    ...scopeFor(actor),
    ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.evaluationPlan.count({ where }),
    prisma.evaluationPlan.findMany({
      where,
      orderBy: { createdAt: query.order },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: planInclude,
    }),
  ]);

  return { items: rows, meta: buildPaginationMeta(query.page, query.pageSize, total) };
}

export async function getPlan(actor: Actor, id: string) {
  const plan = await prisma.evaluationPlan.findFirst({
    where: { id, deletedAt: null },
    include: planInclude,
  });
  if (!plan) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { id });

  assertOwnership(actor, plan.createdById, { planId: id });
  return plan;
}

export async function createPlan(actor: Actor, input: CreatePlanInput) {
  const year = await prisma.academicYear.findUnique({
    where: { id: input.academicYearId },
    select: { id: true },
  });
  if (!year)
    throw AppError.notFound(ERROR_CODE.NOT_FOUND, { academicYearId: input.academicYearId });

  return prisma.evaluationPlan.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      academicYearId: input.academicYearId,
      subjectId: input.subjectId ?? null,
      gradeLevelId: input.gradeLevelId ?? null,
      createdById: actor.userId,
    },
    include: planInclude,
  });
}

export async function addPlanItem(actor: Actor, planId: string, input: CreatePlanItemInput) {
  const plan = await getPlan(actor, planId);

  const period = await prisma.academicPeriod.findFirst({
    where: { id: input.academicPeriodId, academicYearId: plan.academicYearId },
    select: { id: true },
  });
  // El periodo debe pertenecer al año del plan: aceptar uno de otro año
  // produciría un cumplimiento que nadie sabría interpretar.
  if (!period) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'The period does not belong to the plan year');
  }

  const position =
    input.position ??
    ((
      await prisma.evaluationPlanItem.aggregate({
        where: { planId },
        _max: { position: true },
      })
    )._max.position ?? -1) + 1;

  await prisma.evaluationPlanItem.create({
    data: {
      planId,
      academicPeriodId: input.academicPeriodId,
      title: input.title,
      assessmentId: input.assessmentId ?? null,
      kmkCompetencyId: input.kmkCompetencyId ?? null,
      dueAt: input.dueAt ?? null,
      required: input.required,
      position,
    },
  });

  return getPlan(actor, planId);
}

export async function removePlanItem(actor: Actor, itemId: string) {
  const item = await prisma.evaluationPlanItem.findUnique({
    where: { id: itemId },
    select: { id: true, planId: true },
  });
  if (!item) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { itemId });

  await getPlan(actor, item.planId);
  await prisma.evaluationPlanItem.delete({ where: { id: itemId } });

  return getPlan(actor, item.planId);
}

/**
 * Duplica un plan completo.
 *
 * El caso real es preparar el curso siguiente a partir del anterior: se copia
 * la estructura y los periodos se reasignan al año nuevo emparejándolos por
 * posición. Las evaluaciones asociadas **no** se copian: pertenecen al curso
 * anterior y el docente decidirá cuáles reutilizar.
 */
export async function duplicatePlan(actor: Actor, planId: string, targetYearId: string) {
  const plan = await getPlan(actor, planId);

  const [targetYear, targetPeriods, sourcePeriods] = await Promise.all([
    prisma.academicYear.findUnique({
      where: { id: targetYearId },
      select: { id: true, code: true },
    }),
    prisma.academicPeriod.findMany({
      where: { academicYearId: targetYearId },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    }),
    prisma.academicPeriod.findMany({
      where: { academicYearId: plan.academicYearId },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    }),
  ]);

  if (!targetYear) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { targetYearId });
  if (targetPeriods.length === 0) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'The target year has no periods defined');
  }

  const periodByPosition = new Map(targetPeriods.map((period) => [period.position, period.id]));
  const sourcePositions = new Map(sourcePeriods.map((period) => [period.id, period.position]));

  const created = await prisma.$transaction(async (tx) => {
    const copy = await tx.evaluationPlan.create({
      data: {
        name: `${plan.name} (${targetYear.code})`,
        description: plan.description,
        academicYearId: targetYearId,
        subjectId: plan.subjectId,
        gradeLevelId: plan.gradeLevelId,
        createdById: actor.userId,
      },
    });

    for (const item of plan.items) {
      const sourcePosition = sourcePositions.get(item.academicPeriodId) ?? 0;
      // Si el año destino tiene menos periodos, el ítem cae en el último:
      // es preferible a descartarlo en silencio.
      const targetPeriodId =
        periodByPosition.get(sourcePosition) ?? targetPeriods[targetPeriods.length - 1]!.id;

      await tx.evaluationPlanItem.create({
        data: {
          planId: copy.id,
          academicPeriodId: targetPeriodId,
          title: item.title,
          kmkCompetencyId: item.kmkCompetencyId,
          required: item.required,
          position: item.position,
          // Ni la evaluación ni la fecha límite se copian: pertenecen al curso
          // anterior y deben decidirse de nuevo.
          assessmentId: null,
          dueAt: null,
        },
      });
    }

    return copy;
  });

  return getPlan(actor, created.id);
}

// --- Cumplimiento ------------------------------------------------------------

export interface PlanItemCompliance {
  itemId: string;
  title: string;
  periodName: string;
  required: boolean;
  dueAt: Date | null;
  assessmentId: string | null;
  assessmentTitle: string | null;
  /** `true` cuando el ítem tiene evaluación publicada y asignada. */
  assigned: boolean;
  recipients: number;
  completed: number;
  completionRate: number;
  status: 'NOT_PLANNED' | 'PLANNED' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
}

export interface PlanCompliance {
  planId: string;
  name: string;
  items: PlanItemCompliance[];
  /** Porcentaje de ítems obligatorios completados. */
  overallCompletion: number;
  requiredItems: number;
  completedItems: number;
}

/**
 * Estado de un ítem del plan.
 *
 * El orden de las comprobaciones importa: un ítem completado no es «vencido»
 * aunque su fecha haya pasado, y uno sin evaluación asociada no puede estar
 * «en curso» por mucho que la fecha se acerque.
 */
function resolveItemStatus(
  item: { assessmentId: string | null; dueAt: Date | null },
  recipients: number,
  completed: number,
): PlanItemCompliance['status'] {
  if (!item.assessmentId) {
    return item.dueAt && item.dueAt < new Date() ? 'OVERDUE' : 'NOT_PLANNED';
  }
  if (recipients === 0) {
    return item.dueAt && item.dueAt < new Date() ? 'OVERDUE' : 'PLANNED';
  }
  if (completed === 0) return 'ASSIGNED';
  if (completed < recipients) {
    return item.dueAt && item.dueAt < new Date() ? 'OVERDUE' : 'IN_PROGRESS';
  }
  return 'COMPLETED';
}

/**
 * Cumplimiento del plan.
 *
 * Mide lo planificado contra lo que de verdad ocurrió: cuántos destinatarios
 * había y cuántos terminaron. Es la respuesta a «¿vamos según lo previsto?».
 */
export async function getPlanCompliance(actor: Actor, planId: string): Promise<PlanCompliance> {
  const plan = await getPlan(actor, planId);

  const items: PlanItemCompliance[] = [];

  for (const item of plan.items) {
    const recipients = item.assessmentId
      ? await prisma.assignmentRecipient.findMany({
          where: {
            assignment: {
              OR: [{ planItemId: item.id }, { version: { assessmentId: item.assessmentId } }],
              status: { not: 'CANCELLED' },
            },
          },
          select: { status: true },
        })
      : [];

    const completed = recipients.filter(
      (recipient) => recipient.status === RECIPIENT_STATUS.COMPLETED,
    ).length;

    items.push({
      itemId: item.id,
      title: item.title,
      periodName: item.academicPeriod.name,
      required: item.required,
      dueAt: item.dueAt,
      assessmentId: item.assessmentId,
      assessmentTitle: item.assessment?.title ?? null,
      assigned: recipients.length > 0,
      recipients: recipients.length,
      completed,
      completionRate: recipients.length > 0 ? toPercentage(completed, recipients.length) : 0,
      status: resolveItemStatus(item, recipients.length, completed),
    });
  }

  // El cumplimiento global cuenta solo los ítems obligatorios: los opcionales
  // se incluyen en el plan precisamente porque no siempre se hacen.
  const required = items.filter((item) => item.required);
  const completedRequired = required.filter((item) => item.status === 'COMPLETED').length;

  return {
    planId: plan.id,
    name: plan.name,
    items,
    requiredItems: required.length,
    completedItems: completedRequired,
    overallCompletion: required.length > 0 ? toPercentage(completedRequired, required.length) : 0,
  };
}

export async function deletePlan(actor: Actor, id: string): Promise<void> {
  await getPlan(actor, id);
  await prisma.evaluationPlan.update({ where: { id }, data: { deletedAt: new Date() } });
}
