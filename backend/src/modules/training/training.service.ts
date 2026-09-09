import { z } from 'zod';
import {
  ASSESSMENT_AUDIENCE,
  ASSESSMENT_PURPOSE,
  ASSESSMENT_VERSION_STATUS,
  ASSIGNMENT_TARGET_TYPE,
  ERROR_CODE,
  localizedTextSchema,
  toPercentage,
  type LocalizedText,
  type Role,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { isAdmin } from '../../middleware/authorize.js';

/**
 * Capacitación docente en competencias KMK.
 *
 * La evaluación de cada módulo **no tiene motor propio**: es una `Assessment`
 * normal con audiencia `TEACHER` y propósito `TRAINING`. Eso significa que la
 * puntuación, la escala, el guardado de respuestas y la analítica por
 * competencia son exactamente los mismos que para un estudiante.
 *
 * Construir aquí un segundo motor habría duplicado la corrección de trece
 * tipos de pregunta y dejado la estadística de docentes fuera del informe KMK.
 */

export const createModuleSchema = z.object({
  code: z.string().trim().min(2).max(30),
  kmkCompetencyId: z.string().uuid(),
  title: localizedTextSchema,
  description: localizedTextSchema,
  estimatedMinutes: z.number().int().min(1).max(600).nullable().optional(),
  position: z.number().int().min(0).optional(),
});

export const createContentSchema = z.object({
  type: z.enum(['TEXT', 'VIDEO', 'DOCUMENT', 'LINK', 'ACTIVITY']),
  title: localizedTextSchema,
  body: localizedTextSchema.optional(),
  url: z.string().trim().max(1000).optional(),
  position: z.number().int().min(0).optional(),
});

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type CreateContentInput = z.infer<typeof createContentSchema>;

interface Actor {
  userId: string;
  roles: Role[];
}

export interface TrainingModuleView {
  id: string;
  code: string;
  title: LocalizedText;
  description: LocalizedText;
  estimatedMinutes: number | null;
  position: number;
  competency: { id: string; code: string; name: LocalizedText; color: string };
  contentCount: number;
  assessmentId: string | null;
  /** Progreso del usuario que consulta. */
  progress: {
    status: string;
    contentsSeen: number;
    completedAt: Date | null;
    /** Resultado de la evaluación del módulo, si la hizo. */
    assessmentPercentage: number | null;
    assessmentPassed: boolean | null;
  };
}

const moduleInclude = {
  kmkCompetency: { select: { id: true, code: true, name: true, color: true } },
  _count: { select: { contents: true } },
} as const;

/**
 * Resultado del docente en la evaluación del módulo.
 *
 * Se busca su mejor intento: repetir una capacitación para mejorar es
 * deseable, y quedarse con el primer intento penalizaría precisamente a quien
 * vuelve a estudiar.
 */
async function resolveAssessmentOutcome(
  userId: string,
  assessmentId: string | null,
): Promise<{ percentage: number | null; passed: boolean | null }> {
  if (!assessmentId) return { percentage: null, passed: null };

  const best = await prisma.assessmentAttempt.findFirst({
    where: {
      userId,
      version: { assessmentId },
      status: { in: ['GRADED', 'PENDING_REVIEW'] },
    },
    orderBy: { percentage: 'desc' },
    select: { percentage: true, passed: true },
  });

  if (!best) return { percentage: null, passed: null };
  return { percentage: Number(best.percentage), passed: best.passed };
}

export async function listModules(actor: Actor): Promise<TrainingModuleView[]> {
  const [modules, progress] = await Promise.all([
    prisma.trainingModule.findMany({
      where: { active: true },
      orderBy: { position: 'asc' },
      include: moduleInclude,
    }),
    prisma.trainingProgress.findMany({ where: { userId: actor.userId } }),
  ]);

  const progressByModule = new Map(progress.map((row) => [row.moduleId, row]));

  return Promise.all(
    modules.map(async (module) => {
      const own = progressByModule.get(module.id);
      const outcome = await resolveAssessmentOutcome(actor.userId, module.assessmentId);

      return {
        id: module.id,
        code: module.code,
        title: module.title as LocalizedText,
        description: module.description as LocalizedText,
        estimatedMinutes: module.estimatedMinutes,
        position: module.position,
        competency: {
          id: module.kmkCompetency.id,
          code: module.kmkCompetency.code,
          name: module.kmkCompetency.name as LocalizedText,
          color: module.kmkCompetency.color,
        },
        contentCount: module._count.contents,
        assessmentId: module.assessmentId,
        progress: {
          status: own?.status ?? 'NOT_STARTED',
          contentsSeen: own?.contentsSeen ?? 0,
          completedAt: own?.completedAt ?? null,
          assessmentPercentage: outcome.percentage,
          assessmentPassed: outcome.passed,
        },
      };
    }),
  );
}

export async function getModule(actor: Actor, id: string) {
  const module = await prisma.trainingModule.findFirst({
    where: { id, active: true },
    include: {
      ...moduleInclude,
      contents: { orderBy: { position: 'asc' } },
      assessment: {
        select: {
          id: true,
          title: true,
          versions: {
            where: { status: ASSESSMENT_VERSION_STATUS.PUBLISHED },
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: { id: true, questionCount: true, totalPoints: true },
          },
        },
      },
    },
  });

  if (!module) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { id });

  const [progress, outcome] = await Promise.all([
    prisma.trainingProgress.findUnique({
      where: { moduleId_userId: { moduleId: id, userId: actor.userId } },
    }),
    resolveAssessmentOutcome(actor.userId, module.assessmentId),
  ]);

  return { ...module, progress, assessmentOutcome: outcome };
}

/**
 * Registra el avance por el contenido del módulo.
 *
 * Se guarda cuántos contenidos ha visto, no cuáles: para el propósito
 * —saber si recorrió el material antes de evaluarse— basta con el número, y
 * guardar la lista exigiría una tabla más por un dato que nadie consulta.
 */
export async function recordProgress(
  actor: Actor,
  moduleId: string,
  contentsSeen: number,
): Promise<void> {
  const module = await prisma.trainingModule.findFirst({
    where: { id: moduleId, active: true },
    include: { _count: { select: { contents: true } } },
  });
  if (!module) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { moduleId });

  const total = module._count.contents;
  const seen = Math.max(0, Math.min(total, contentsSeen));

  // El módulo se marca completado cuando se recorrió todo el material. Si
  // además tiene evaluación, aprobarla es lo que cuenta para la certificación,
  // y eso se resuelve aparte en `getTrainingSummary`.
  const status = seen === 0 ? 'NOT_STARTED' : seen >= total ? 'COMPLETED' : 'IN_PROGRESS';

  await prisma.trainingProgress.upsert({
    where: { moduleId_userId: { moduleId, userId: actor.userId } },
    create: {
      moduleId,
      userId: actor.userId,
      contentsSeen: seen,
      status,
      startedAt: new Date(),
      lastAccessAt: new Date(),
      completedAt: status === 'COMPLETED' ? new Date() : null,
    },
    update: {
      contentsSeen: seen,
      status,
      lastAccessAt: new Date(),
      completedAt: status === 'COMPLETED' ? new Date() : null,
    },
  });
}

/**
 * Asigna al docente la evaluación del módulo.
 *
 * Es el mismo mecanismo de asignación que usan los estudiantes: se crea una
 * asignación dirigida a esa persona sobre la versión publicada. A partir de
 * ahí, el intento lo gestiona el motor común.
 */
export async function startModuleAssessment(actor: Actor, moduleId: string): Promise<string> {
  const module = await prisma.trainingModule.findFirst({
    where: { id: moduleId, active: true },
    select: { id: true, assessmentId: true },
  });
  if (!module?.assessmentId) {
    throw AppError.notFound(ERROR_CODE.ASSESSMENT_NOT_FOUND, { moduleId });
  }

  const version = await prisma.assessmentVersion.findFirst({
    where: { assessmentId: module.assessmentId, status: ASSESSMENT_VERSION_STATUS.PUBLISHED },
    orderBy: { versionNumber: 'desc' },
    select: { id: true },
  });
  if (!version) {
    throw AppError.conflict(
      ERROR_CODE.ASSESSMENT_NOT_PUBLISHED,
      'The module assessment has no published version',
    );
  }

  // Si ya tiene una asignación viva para esa versión se reutiliza: repetir la
  // capacitación no debe multiplicar asignaciones.
  const existing = await prisma.assignmentRecipient.findFirst({
    where: {
      userId: actor.userId,
      assignment: { assessmentVersionId: version.id, status: { not: 'CANCELLED' } },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const recipient = await prisma.$transaction(async (tx) => {
    const assignment = await tx.assignment.create({
      data: {
        assessmentVersionId: version.id,
        assignedById: actor.userId,
        targetType: ASSIGNMENT_TARGET_TYPE.USER,
        startAt: new Date(),
        // La capacitación se repite libremente: aprender no se raciona.
        attemptsAllowed: 5,
        status: 'OPEN',
      },
    });

    return tx.assignmentRecipient.create({
      data: { assignmentId: assignment.id, userId: actor.userId },
    });
  });

  return recipient.id;
}

export interface TrainingSummary {
  totalModules: number;
  completedModules: number;
  /** Módulos cuya evaluación se aprobó. Es lo que cuenta para certificar. */
  certifiedModules: number;
  completionRate: number;
  byCompetency: Array<{
    competencyCode: string;
    competencyName: LocalizedText;
    moduleTitle: LocalizedText;
    status: string;
    assessmentPercentage: number | null;
    assessmentPassed: boolean | null;
  }>;
}

/** Estado de la capacitación de una persona, competencia a competencia. */
export async function getTrainingSummary(
  actor: Actor,
  targetUserId?: string,
): Promise<TrainingSummary> {
  const userId = targetUserId && isAdmin(actor) ? targetUserId : actor.userId;
  const modules = await listModules({ ...actor, userId });

  const completed = modules.filter((module) => module.progress.status === 'COMPLETED').length;
  const certified = modules.filter((module) => module.progress.assessmentPassed === true).length;

  return {
    totalModules: modules.length,
    completedModules: completed,
    certifiedModules: certified,
    completionRate: modules.length > 0 ? toPercentage(completed, modules.length) : 0,
    byCompetency: modules.map((module) => ({
      competencyCode: module.competency.code,
      competencyName: module.competency.name,
      moduleTitle: module.title,
      status: module.progress.status,
      assessmentPercentage: module.progress.assessmentPercentage,
      assessmentPassed: module.progress.assessmentPassed,
    })),
  };
}

// --- Administración del contenido -------------------------------------------

export async function createModule(input: CreateModuleInput) {
  const competency = await prisma.kmkCompetency.findUnique({
    where: { id: input.kmkCompetencyId },
    select: { id: true },
  });
  if (!competency) throw AppError.notFound(ERROR_CODE.COMPETENCY_NOT_FOUND);

  const existing = await prisma.trainingModule.findUnique({ where: { code: input.code } });
  if (existing)
    throw AppError.conflict(ERROR_CODE.DUPLICATE_RESOURCE, 'Module code already exists');

  const maxPosition = await prisma.trainingModule.aggregate({ _max: { position: true } });

  return prisma.trainingModule.create({
    data: {
      code: input.code,
      kmkCompetencyId: input.kmkCompetencyId,
      title: input.title,
      description: input.description,
      estimatedMinutes: input.estimatedMinutes ?? null,
      position: input.position ?? (maxPosition._max.position ?? -1) + 1,
    },
    include: moduleInclude,
  });
}

export async function addContent(moduleId: string, input: CreateContentInput) {
  const module = await prisma.trainingModule.findUnique({
    where: { id: moduleId },
    select: { id: true },
  });
  if (!module) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { moduleId });

  const maxPosition = await prisma.trainingContent.aggregate({
    where: { moduleId },
    _max: { position: true },
  });

  return prisma.trainingContent.create({
    data: {
      moduleId,
      type: input.type,
      title: input.title,
      body: input.body ?? undefined,
      url: input.url ?? null,
      position: input.position ?? (maxPosition._max.position ?? -1) + 1,
    },
  });
}

/**
 * Vincula una evaluación al módulo.
 *
 * Se exige que sea de audiencia docente y propósito de capacitación: enlazar
 * por error una evaluación de estudiantes la calificaría con la escala 1.0–6.0
 * en lugar del porcentaje, y aparecería en las estadísticas del alumnado.
 */
export async function linkAssessment(moduleId: string, assessmentId: string) {
  const [module, assessment] = await Promise.all([
    prisma.trainingModule.findUnique({ where: { id: moduleId }, select: { id: true } }),
    prisma.assessment.findFirst({
      where: { id: assessmentId, deletedAt: null },
      select: { id: true, audience: true, purpose: true },
    }),
  ]);

  if (!module) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { moduleId });
  if (!assessment) throw AppError.notFound(ERROR_CODE.ASSESSMENT_NOT_FOUND, { assessmentId });

  if (
    assessment.audience !== ASSESSMENT_AUDIENCE.TEACHER ||
    assessment.purpose !== ASSESSMENT_PURPOSE.TRAINING
  ) {
    throw AppError.conflict(
      ERROR_CODE.CONFLICT,
      'A module assessment must target teachers with a training purpose',
      { audience: assessment.audience, purpose: assessment.purpose },
    );
  }

  return prisma.trainingModule.update({
    where: { id: moduleId },
    data: { assessmentId },
    include: moduleInclude,
  });
}
