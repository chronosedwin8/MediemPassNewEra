import { z } from 'zod';
import {
  ASSESSMENT_AUDIENCE,
  ASSESSMENT_PURPOSE,
  ASSESSMENT_VERSION_STATUS,
  AUDIT_ACTION,
  DIFFICULTY,
  ERROR_CODE,
  LANGUAGE,
  type AssessmentAudience,
  type AssessmentPurpose,
  type LocalizedText,
  type Paginated,
  type QuestionType,
  type Role,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { buildPaginationMeta } from '../../shared/http/response.js';
import { assertOwnership, isAdmin } from '../../middleware/authorize.js';
import { recordAudit } from '../audit/audit.service.js';
import { getActiveScale } from '../settings/scales.service.js';
import { previewPurge, purgeFiles } from '../files/files.service.js';
import { stripSolution } from '../attempts/assessment-engine.js';
import { createLogger } from '../../shared/logger.js';
import type { PaginationQuery } from '../../middleware/validate.js';

const log = createLogger('assessments');

/**
 * Evaluaciones y sus versiones.
 *
 * La regla que gobierna todo este archivo: **una versión publicada es
 * inmutable**. Editar una evaluación publicada no la modifica, crea la versión
 * siguiente en borrador. Así, un docente puede corregir una pregunta después
 * de que ochenta estudiantes la hayan respondido sin que ninguno de esos
 * resultados cambie de significado.
 */

export const createAssessmentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  instructions: z.string().trim().max(5000).optional(),
  audience: z
    .enum([ASSESSMENT_AUDIENCE.STUDENT, ASSESSMENT_AUDIENCE.TEACHER])
    .default(ASSESSMENT_AUDIENCE.STUDENT),
  purpose: z
    .enum([
      ASSESSMENT_PURPOSE.EVALUATION,
      ASSESSMENT_PURPOSE.TRAINING,
      ASSESSMENT_PURPOSE.DIAGNOSTIC,
    ])
    .default(ASSESSMENT_PURPOSE.EVALUATION),
  subjectId: z.string().uuid().nullable().optional(),
  areaId: z.string().uuid().nullable().optional(),
  gradeLevelId: z.string().uuid().nullable().optional(),
  language: z.enum([LANGUAGE.ES, LANGUAGE.DE, LANGUAGE.EN]).default(LANGUAGE.ES),
  difficulty: z
    .enum([DIFFICULTY.BASIC, DIFFICULTY.INTERMEDIATE, DIFFICULTY.ADVANCED])
    .default(DIFFICULTY.INTERMEDIATE),
  timeLimitMinutes: z.number().int().min(0).max(600).nullable().optional(),
});

export const updateVersionSchema = z.object({
  name: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  instructions: z.string().trim().max(5000).nullable().optional(),
  difficulty: z.enum([DIFFICULTY.BASIC, DIFFICULTY.INTERMEDIATE, DIFFICULTY.ADVANCED]).optional(),
  timeLimitMinutes: z.number().int().min(0).max(600).nullable().optional(),
  passingPercentage: z.number().min(0).max(100).nullable().optional(),
  showResultsImmediately: z.boolean().optional(),
  showCorrectAnswers: z.boolean().optional(),
  showFeedback: z.boolean().optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
});

/**
 * La emisión de diplomas se cambia por su cuenta, y también ya publicada.
 *
 * Es la única excepción a la inmutabilidad de una versión publicada, y es
 * deliberada. Esa inmutabilidad existe para que un resultado de marzo siga
 * significando lo mismo en noviembre: protege las preguntas, los puntos y la
 * escala. Emitir diploma no toca nada de eso —no cambia ninguna nota ni ningún
 * desglose—, solo decide si de ese resultado se puede imprimir un documento.
 *
 * Sin esta excepción, el docente que se acuerda del diploma al ver las notas
 * —que es cuando uno se acuerda— tendría que crear una versión nueva y volver
 * a asignarla, y quienes ya respondieron se quedarían sin él para siempre.
 */
export const certificateSettingSchema = z.object({
  enabled: z.boolean(),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
export type UpdateVersionInput = z.infer<typeof updateVersionSchema>;

interface Actor {
  userId: string;
  roles: Role[];
}

export interface AssessmentSummary {
  id: string;
  title: string;
  audience: string;
  purpose: string;
  language: string;
  createdBy: { id: string; firstName: string; lastName: string };
  subject: { id: string; code: string } | null;
  gradeLevel: { id: string; code: string } | null;
  versionCount: number;
  latestVersion: {
    id: string;
    versionNumber: number;
    status: string;
    questionCount: number;
    totalPoints: number;
  } | null;
  createdAt: Date;
}

const assessmentInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  subject: { select: { id: true, code: true } },
  gradeLevel: { select: { id: true, code: true } },
  versions: {
    orderBy: { versionNumber: 'desc' as const },
    take: 1,
    select: {
      id: true,
      versionNumber: true,
      status: true,
      questionCount: true,
      totalPoints: true,
    },
  },
  _count: { select: { versions: true } },
} as const;

type AssessmentRow = {
  id: string;
  title: string;
  audience: string;
  purpose: string;
  language: string;
  createdAt: Date;
  createdBy: { id: string; firstName: string; lastName: string };
  subject: { id: string; code: string } | null;
  gradeLevel: { id: string; code: string } | null;
  versions: Array<{
    id: string;
    versionNumber: number;
    status: string;
    questionCount: number;
    totalPoints: unknown;
  }>;
  _count: { versions: number };
};

function toSummary(row: AssessmentRow): AssessmentSummary {
  const latest = row.versions[0];
  return {
    id: row.id,
    title: row.title,
    audience: row.audience,
    purpose: row.purpose,
    language: row.language,
    createdBy: row.createdBy,
    subject: row.subject,
    gradeLevel: row.gradeLevel,
    versionCount: row._count.versions,
    latestVersion: latest
      ? {
          id: latest.id,
          versionNumber: latest.versionNumber,
          status: latest.status,
          questionCount: latest.questionCount,
          totalPoints: Number(latest.totalPoints),
        }
      : null,
    createdAt: row.createdAt,
  };
}

/**
 * Alcance de lectura.
 *
 * Un docente ve las suyas salvo que tenga el permiso de ver todas. No se
 * resuelve en el middleware porque depende de la fila, no de la acción.
 */
function scopeFor(actor: Actor, canReadAll: boolean): Record<string, unknown> {
  if (isAdmin(actor) || canReadAll) return {};
  return { createdById: actor.userId };
}

export async function listAssessments(
  actor: Actor,
  canReadAll: boolean,
  query: PaginationQuery & {
    audience?: AssessmentAudience;
    purpose?: AssessmentPurpose;
    subjectId?: string;
    status?: string;
  },
): Promise<Paginated<AssessmentSummary>> {
  const where = {
    deletedAt: null,
    ...scopeFor(actor, canReadAll),
    ...(query.audience ? { audience: query.audience } : {}),
    ...(query.purpose ? { purpose: query.purpose } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.search ? { title: { contains: query.search, mode: 'insensitive' as const } } : {}),
    ...(query.status ? { versions: { some: { status: query.status as never } } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.assessment.count({ where }),
    prisma.assessment.findMany({
      where,
      orderBy: { createdAt: query.order },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: assessmentInclude,
    }),
  ]);

  return {
    items: rows.map((row) => toSummary(row as unknown as AssessmentRow)),
    meta: buildPaginationMeta(query.page, query.pageSize, total),
  };
}

/** Recupera la evaluación comprobando además que el actor puede tocarla. */
export async function getAssessmentForEditing(actor: Actor, id: string) {
  const assessment = await prisma.assessment.findFirst({
    where: { id, deletedAt: null },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  });
  if (!assessment) throw AppError.notFound(ERROR_CODE.ASSESSMENT_NOT_FOUND, { id });

  assertOwnership(actor, assessment.createdById, { assessmentId: id });
  return assessment;
}

export async function getAssessment(actor: Actor, canReadAll: boolean, id: string) {
  const assessment = await prisma.assessment.findFirst({
    where: { id, deletedAt: null, ...scopeFor(actor, canReadAll) },
    include: {
      ...assessmentInclude,
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: { _count: { select: { questions: true, assignments: true } } },
      },
    },
  });
  if (!assessment) throw AppError.notFound(ERROR_CODE.ASSESSMENT_NOT_FOUND, { id });
  return assessment;
}

/**
 * Crea la evaluación junto con su primera versión en borrador.
 *
 * Se hacen a la vez porque una evaluación sin versión no es editable ni
 * publicable: sería un registro inútil que habría que limpiar después.
 */
export async function createAssessment(
  actor: Actor,
  input: CreateAssessmentInput,
): Promise<{ assessmentId: string; versionId: string }> {
  const scale = await getActiveScale(input.audience);

  const result = await prisma.$transaction(async (tx) => {
    const assessment = await tx.assessment.create({
      data: {
        title: input.title,
        audience: input.audience,
        purpose: input.purpose,
        subjectId: input.subjectId ?? null,
        areaId: input.areaId ?? null,
        gradeLevelId: input.gradeLevelId ?? null,
        language: input.language,
        createdById: actor.userId,
      },
    });

    const version = await tx.assessmentVersion.create({
      data: {
        assessmentId: assessment.id,
        versionNumber: 1,
        status: ASSESSMENT_VERSION_STATUS.DRAFT,
        name: input.title,
        description: input.description ?? null,
        instructions: input.instructions ?? null,
        difficulty: input.difficulty,
        language: input.language,
        timeLimitMinutes: input.timeLimitMinutes ?? null,
        gradingScaleId: scale.id,
      },
    });

    return { assessmentId: assessment.id, versionId: version.id };
  });

  await recordAudit({
    userId: actor.userId,
    action: AUDIT_ACTION.CREATE_ASSESSMENT,
    entityType: 'assessment',
    entityId: result.assessmentId,
    metadata: { title: input.title, audience: input.audience },
  });

  return result;
}

/** Comprueba que la versión existe, es del actor y admite modificación. */
export async function getEditableVersion(actor: Actor, versionId: string) {
  const version = await prisma.assessmentVersion.findUnique({
    where: { id: versionId },
    include: { assessment: { select: { id: true, createdById: true, deletedAt: true } } },
  });

  if (!version || version.assessment.deletedAt) {
    throw AppError.notFound(ERROR_CODE.ASSESSMENT_VERSION_NOT_FOUND, { versionId });
  }

  assertOwnership(actor, version.assessment.createdById, { versionId });

  if (version.status !== ASSESSMENT_VERSION_STATUS.DRAFT) {
    throw AppError.conflict(
      ERROR_CODE.VERSION_IMMUTABLE,
      'A published version cannot be modified. Create a new version instead.',
      { versionId, status: version.status },
    );
  }

  return version;
}

/**
 * Traduce la entrada parcial a datos de actualización de la versión.
 *
 * Se recorren los campos declarados en lugar de encadenar difusiones
 * condicionales: añadir un ajuste nuevo pasa a ser una línea en la lista.
 */
function buildVersionUpdate(input: UpdateVersionInput): Record<string, unknown> {
  const fields = [
    'name',
    'description',
    'instructions',
    'difficulty',
    'timeLimitMinutes',
    'passingPercentage',
    'showResultsImmediately',
    'showCorrectAnswers',
    'showFeedback',
    'shuffleQuestions',
    'shuffleOptions',
  ] as const;

  const data: Record<string, unknown> = {};
  for (const field of fields) {
    if (input[field] !== undefined) data[field] = input[field];
  }
  return data;
}

export async function updateVersion(actor: Actor, versionId: string, input: UpdateVersionInput) {
  await getEditableVersion(actor, versionId);

  const updated = await prisma.assessmentVersion.update({
    where: { id: versionId },
    data: buildVersionUpdate(input) as never,
  });

  // El título de la evaluación refleja el de su última versión, para que los
  // listados no obliguen a un JOIN en cada fila.
  if (input.name) {
    await prisma.assessment.update({
      where: { id: updated.assessmentId },
      data: { title: input.name },
    });
  }

  await recordAudit({
    userId: actor.userId,
    action: AUDIT_ACTION.UPDATE_ASSESSMENT,
    entityType: 'assessment_version',
    entityId: versionId,
  });

  return updated;
}

/**
 * Activa o desactiva el diploma de una versión, publicada o no.
 *
 * Deja constancia en la auditoría porque certificar es una afirmación sobre
 * personas: quién la habilitó y cuándo debe poder consultarse.
 */
export async function setCertificateEnabled(
  actor: Actor,
  versionId: string,
  enabled: boolean,
): Promise<{ versionId: string; certificateEnabled: boolean }> {
  const version = await prisma.assessmentVersion.findUnique({
    where: { id: versionId },
    select: { id: true, assessment: { select: { createdById: true } } },
  });
  if (!version) throw AppError.notFound(ERROR_CODE.ASSESSMENT_VERSION_NOT_FOUND, { versionId });

  assertOwnership(actor, version.assessment.createdById, { versionId });

  const updated = await prisma.assessmentVersion.update({
    where: { id: versionId },
    data: { certificateEnabled: enabled },
    select: { id: true, certificateEnabled: true },
  });

  await recordAudit({
    userId: actor.userId,
    action: AUDIT_ACTION.UPDATE_ASSESSMENT,
    entityType: 'assessment_version',
    entityId: versionId,
    metadata: { certificateEnabled: enabled },
  });

  return { versionId: updated.id, certificateEnabled: updated.certificateEnabled };
}

/**
 * Publica una versión.
 *
 * A partir de aquí la versión no se puede tocar. Se materializan el total de
 * puntos y el número de preguntas para no recalcularlos en cada listado, y se
 * fija la escala vigente: es lo que permite que el resultado siga
 * significando lo mismo dentro de dos años.
 */
export async function publishVersion(actor: Actor, versionId: string) {
  const version = await getEditableVersion(actor, versionId);

  const questions = await prisma.question.findMany({
    where: { assessmentVersionId: versionId },
    select: { id: true, points: true, kmkCompetencyId: true },
  });

  if (questions.length === 0) {
    throw AppError.conflict(
      ERROR_CODE.ASSESSMENT_HAS_NO_QUESTIONS,
      'An assessment cannot be published without questions',
    );
  }

  // Cada pregunta debe medir una competencia: es el requisito sobre el que se
  // sostiene toda la analítica KMK.
  const orphan = questions.find((question) => !question.kmkCompetencyId);
  if (orphan) {
    throw new AppError(
      ERROR_CODE.KMK_COMPETENCY_REQUIRED,
      'Every question must be linked to a KMK competency',
      { details: { questionId: orphan.id } },
    );
  }

  const totalPoints = questions.reduce((sum, question) => sum + Number(question.points), 0);

  const assessment = await prisma.assessment.findUniqueOrThrow({
    where: { id: version.assessmentId },
    select: { audience: true },
  });
  const scale = await getActiveScale(assessment.audience as AssessmentAudience);

  const published = await prisma.assessmentVersion.update({
    where: { id: versionId },
    data: {
      status: ASSESSMENT_VERSION_STATUS.PUBLISHED,
      publishedAt: new Date(),
      publishedById: actor.userId,
      totalPoints,
      questionCount: questions.length,
      gradingScaleId: version.gradingScaleId ?? scale.id,
    },
  });

  await recordAudit({
    userId: actor.userId,
    action: AUDIT_ACTION.PUBLISH_ASSESSMENT,
    entityType: 'assessment_version',
    entityId: versionId,
    metadata: { versionNumber: published.versionNumber, questions: questions.length, totalPoints },
  });

  return published;
}

/**
 * Crea una versión nueva a partir de la última, copiando sus preguntas.
 *
 * Las preguntas se **copian**, no se comparten: si se referenciaran, editarlas
 * alteraría la versión anterior y con ella los resultados ya emitidos, que es
 * exactamente lo que el versionado existe para impedir.
 */
export async function createNewVersion(actor: Actor, assessmentId: string) {
  const assessment = await getAssessmentForEditing(actor, assessmentId);

  const latest = assessment.versions[0];
  if (!latest) throw AppError.notFound(ERROR_CODE.ASSESSMENT_VERSION_NOT_FOUND, { assessmentId });

  if (latest.status === ASSESSMENT_VERSION_STATUS.DRAFT) {
    throw AppError.conflict(
      ERROR_CODE.CONFLICT,
      'There is already a draft version; finish or publish it first',
      { versionId: latest.id },
    );
  }

  const questions = await prisma.question.findMany({
    where: { assessmentVersionId: latest.id },
    orderBy: { position: 'asc' },
  });

  const created = await prisma.$transaction(async (tx) => {
    const version = await tx.assessmentVersion.create({
      data: {
        assessmentId,
        versionNumber: latest.versionNumber + 1,
        status: ASSESSMENT_VERSION_STATUS.DRAFT,
        name: latest.name,
        description: latest.description,
        instructions: latest.instructions,
        difficulty: latest.difficulty,
        language: latest.language,
        timeLimitMinutes: latest.timeLimitMinutes,
        passingPercentage: latest.passingPercentage,
        gradingScaleId: latest.gradingScaleId,
        showResultsImmediately: latest.showResultsImmediately,
        showCorrectAnswers: latest.showCorrectAnswers,
        showFeedback: latest.showFeedback,
        shuffleQuestions: latest.shuffleQuestions,
        shuffleOptions: latest.shuffleOptions,
        certificateEnabled: latest.certificateEnabled,
      },
    });

    if (questions.length > 0) {
      await tx.question.createMany({
        data: questions.map((question) => ({
          assessmentVersionId: version.id,
          type: question.type,
          statement: question.statement,
          instructions: question.instructions,
          points: question.points,
          position: question.position,
          difficulty: question.difficulty,
          kmkCompetencyId: question.kmkCompetencyId,
          kmkSubcompetencyId: question.kmkSubcompetencyId,
          feedbackCorrect: question.feedbackCorrect,
          feedbackIncorrect: question.feedbackIncorrect,
          explanation: question.explanation,
          payload: question.payload as object,
          mediaUrl: question.mediaUrl,
        })),
      });
    }

    return version;
  });

  await recordAudit({
    userId: actor.userId,
    action: AUDIT_ACTION.UPDATE_ASSESSMENT,
    entityType: 'assessment_version',
    entityId: created.id,
    metadata: { newVersion: created.versionNumber, copiedQuestions: questions.length },
  });

  return created;
}

export async function archiveVersion(actor: Actor, versionId: string) {
  const version = await prisma.assessmentVersion.findUnique({
    where: { id: versionId },
    include: { assessment: { select: { createdById: true } } },
  });
  if (!version) throw AppError.notFound(ERROR_CODE.ASSESSMENT_VERSION_NOT_FOUND, { versionId });

  assertOwnership(actor, version.assessment.createdById);

  const openAssignments = await prisma.assignment.count({
    where: { assessmentVersionId: versionId, status: { in: ['SCHEDULED', 'OPEN'] } },
  });
  if (openAssignments > 0) {
    throw AppError.conflict(ERROR_CODE.ASSESSMENT_IN_USE, 'The version has open assignments', {
      openAssignments,
    });
  }

  const archived = await prisma.assessmentVersion.update({
    where: { id: versionId },
    data: { status: ASSESSMENT_VERSION_STATUS.ARCHIVED, archivedAt: new Date() },
  });

  await recordAudit({
    userId: actor.userId,
    action: AUDIT_ACTION.ARCHIVE_ASSESSMENT,
    entityType: 'assessment_version',
    entityId: versionId,
  });

  return archived;
}

export async function deleteAssessment(actor: Actor, id: string): Promise<void> {
  const assessment = await getAssessmentForEditing(actor, id);

  const attempts = await prisma.assessmentAttempt.count({
    where: { version: { assessmentId: id } },
  });
  if (attempts > 0) {
    // Con intentos realizados, borrar significaría destruir historial
    // académico. Se archiva en su lugar.
    throw AppError.conflict(ERROR_CODE.ASSESSMENT_IN_USE, 'The assessment has recorded attempts', {
      attempts,
    });
  }

  await prisma.assessment.update({
    where: { id: assessment.id },
    data: { deletedAt: new Date() },
  });
}

/**
 * Lo que se destruiría al borrar. Se consulta antes de confirmar.
 *
 * La interfaz necesita poder decir «esto borrará 84 intentos y sus notas» en
 * lugar de un «¿seguro?» genérico. Una advertencia que no dice cuánto se
 * pierde no es una advertencia: es un trámite que la gente aprende a saltarse.
 */
export interface AssessmentImpact {
  assessmentId: string;
  title: string;
  versions: number;
  questions: number;
  assignments: number;
  attempts: number;
  answers: number;
  /** Estudiantes distintos con al menos un intento registrado. */
  students: number;
  /** Archivos en el almacenamiento externo que se destruirían con ella. */
  files: number;
  fileBytes: number;
}

export async function getDeletionImpact(actor: Actor, id: string): Promise<AssessmentImpact> {
  const assessment = await prisma.assessment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, title: true, createdById: true },
  });
  if (!assessment) throw AppError.notFound(ERROR_CODE.ASSESSMENT_NOT_FOUND, { id });

  assertOwnership(actor, assessment.createdById, { assessmentId: id });

  const [versions, questions, assignments, attempts, answers, students, files] = await Promise.all([
    prisma.assessmentVersion.count({ where: { assessmentId: id } }),
    prisma.question.count({ where: { version: { assessmentId: id } } }),
    prisma.assignment.count({ where: { version: { assessmentId: id } } }),
    prisma.assessmentAttempt.count({ where: { version: { assessmentId: id } } }),
    prisma.attemptAnswer.count({ where: { attempt: { version: { assessmentId: id } } } }),
    prisma.assessmentAttempt
      .findMany({
        where: { version: { assessmentId: id } },
        distinct: ['userId'],
        select: { userId: true },
      })
      .then((rows) => rows.length),
    previewPurge({ assessmentId: id }),
  ]);

  return {
    assessmentId: assessment.id,
    title: assessment.title,
    versions,
    questions,
    assignments,
    attempts,
    answers,
    students,
    files: files.files,
    fileBytes: files.bytes,
  };
}

/**
 * Borrado definitivo, con todo lo asociado.
 *
 * Es la única operación del sistema que destruye historial académico sin
 * vuelta atrás: desaparecen los intentos, las respuestas y las notas de
 * estudiantes reales. Por eso lleva tres cerrojos y no uno:
 *
 *  1. **Solo un administrador.** Un docente puede borrar lo suyo mientras
 *     nadie lo haya respondido; en cuanto hay notas de por medio, la decisión
 *     deja de ser solo suya.
 *  2. **Hay que escribir el título.** No para molestar, sino porque obliga a
 *     mirar qué se está borrando. Un botón de confirmación se pulsa por
 *     inercia; un título hay que leerlo.
 *  3. **Queda en auditoría** con el recuento de lo destruido, que es lo único
 *     que quedará si alguien pregunta meses después.
 *
 * El recorrido se hace **explícito y en orden**, no por cascada de la base.
 * Intentos y asignaciones referencian la versión sin `onDelete: Cascade`, y es
 * deliberado: si cascadearan, borrar una versión por error se llevaría por
 * delante las notas de un curso sin que nadie lo pidiera. La restricción
 * estricta obliga a que destruir historial sea siempre un acto voluntario, y
 * este es el único sitio que lo hace.
 */
export interface PurgeOutcome extends AssessmentImpact {
  /** Archivos realmente eliminados del almacenamiento externo. */
  filesDeleted: number;
  bytesDeleted: number;
}

export async function purgeAssessment(
  actor: Actor,
  id: string,
  confirmation: string,
): Promise<PurgeOutcome> {
  const impact = await getDeletionImpact(actor, id);

  if (impact.attempts > 0 && !isAdmin(actor)) {
    throw AppError.forbidden(ERROR_CODE.NOT_RESOURCE_OWNER, {
      reason: 'Only an administrator can delete an assessment with recorded attempts',
      attempts: impact.attempts,
    });
  }

  if (confirmation.trim() !== impact.title.trim()) {
    throw AppError.validation([
      {
        path: 'confirmation',
        rule: 'title_mismatch',
        message: 'Escribe el título exacto de la evaluación para confirmar',
      },
    ]);
  }

  // El registro se escribe ANTES de borrar: si la transacción falla a mitad,
  // es preferible una entrada de auditoría de más que un borrado sin rastro.
  await recordAudit({
    userId: actor.userId,
    action: AUDIT_ACTION.DELETE_ASSESSMENT,
    entityType: 'assessment',
    entityId: id,
    metadata: { ...impact },
  });

  /*
   * Los archivos se borran ANTES de la transacción, y no dentro.
   *
   * Borrar en S3 es una llamada de red que puede fallar o tardar; meterla en
   * una transacción de base la mantendría abierta mientras tanto. Y el orden
   * importa: la clave foránea de `stored_files` impide borrar la evaluación
   * mientras le queden archivos, así que si esto falla, la transacción no
   * llega a ejecutarse y no queda nada a medias.
   */
  const purged = await purgeFiles(actor, { assessmentId: id }, 'assessment_purge');

  await prisma.$transaction(async (tx) => {
    const versionIds = (
      await tx.assessmentVersion.findMany({ where: { assessmentId: id }, select: { id: true } })
    ).map((version) => version.id);

    // De las hojas hacia la raíz. Las respuestas cuelgan del intento y los
    // destinatarios de la asignación, ambos con cascada propia, pero se
    // borran igualmente de forma explícita: el orden completo a la vista vale
    // más que ahorrarse dos líneas.
    await tx.attemptAnswer.deleteMany({
      where: { attempt: { assessmentVersionId: { in: versionIds } } },
    });
    await tx.assessmentAttempt.deleteMany({
      where: { assessmentVersionId: { in: versionIds } },
    });
    await tx.assignmentRecipient.deleteMany({
      where: { assignment: { assessmentVersionId: { in: versionIds } } },
    });
    await tx.assignment.deleteMany({ where: { assessmentVersionId: { in: versionIds } } });

    /*
     * Estas tres referencias se desligan en lugar de borrarse: un ítem de plan,
     * un módulo de capacitación o una solicitud de IA son registros con vida
     * propia que *mencionan* la evaluación. Borrarlos convertiría «eliminé una
     * evaluación» en «desapareció un módulo de capacitación entero».
     */
    await tx.aiGenerationRequest.updateMany({
      where: { assessmentVersionId: { in: versionIds } },
      data: { assessmentVersionId: null },
    });
    await tx.evaluationPlanItem.updateMany({
      where: { assessmentId: id },
      data: { assessmentId: null },
    });
    await tx.trainingModule.updateMany({
      where: { assessmentId: id },
      data: { assessmentId: null },
    });

    await tx.question.deleteMany({ where: { assessmentVersionId: { in: versionIds } } });
    await tx.assessmentVersion.deleteMany({ where: { assessmentId: id } });
    await tx.assessment.delete({ where: { id } });
  });

  log.warn(
    {
      assessmentId: id,
      title: impact.title,
      attempts: impact.attempts,
      filesDeleted: purged.files,
      actorId: actor.userId,
    },
    'evaluación eliminada definitivamente con su historial',
  );

  return { ...impact, filesDeleted: purged.files, bytesDeleted: purged.bytes };
}

// --- Previsualización --------------------------------------------------------

/**
 * Una pregunta tal como se va a previsualizar.
 *
 * `payload` es el contenido que **vería el estudiante**, podado con la misma
 * función que usa el motor. `solution` solo llega cuando el docente pide ver
 * las respuestas, y va en un campo aparte para que la interfaz no pueda
 * mezclarlas por descuido al pintar.
 */
export interface PreviewQuestion {
  id: string;
  type: string;
  statement: string;
  instructions: string | null;
  points: number;
  position: number;
  mediaUrl: string | null;
  payload: unknown;
  allowsEvidence: boolean;
  requiresEvidence: boolean;
  maxEvidenceFiles: number;
  competency: { id: string; code: string; name: LocalizedText; color: string };
  solution: {
    payload: unknown;
    feedbackCorrect: string | null;
    feedbackIncorrect: string | null;
    explanation: string | null;
  } | null;
}

export interface AssessmentPreview {
  assessmentId: string;
  versionId: string;
  versionNumber: number;
  status: string;
  title: string;
  name: string;
  instructions: string | null;
  timeLimitMinutes: number | null;
  passingPercentage: number | null;
  questionCount: number;
  totalPoints: number;
  questions: PreviewQuestion[];
}

/**
 * Previsualiza una versión, publicada o en borrador.
 *
 * Existe por una razón concreta: entre escribir una evaluación y publicarla no
 * había ningún momento en que el docente viera lo que va a ver su clase. Con
 * las generadas por IA la necesidad es mayor todavía, porque nadie escribió esas
 * preguntas y alguien tiene que leerlas antes de que lleguen a un estudiante.
 *
 * La clave del diseño está en `stripSolution`: es **la misma** función que usa
 * el motor al servir un intento real. Una previsualización con su propia idea
 * de qué ocultar deja de decir la verdad en cuanto una de las dos cambia, y
 * entonces sirve para lo contrario de lo que existe.
 */
export async function previewVersion(
  actor: Actor,
  versionId: string,
  withSolutions: boolean,
): Promise<AssessmentPreview> {
  const version = await prisma.assessmentVersion.findUnique({
    where: { id: versionId },
    include: {
      assessment: { select: { id: true, title: true, createdById: true } },
      questions: {
        orderBy: { position: 'asc' },
        include: {
          kmkCompetency: { select: { id: true, code: true, name: true, color: true } },
        },
      },
    },
  });
  if (!version) throw AppError.notFound(ERROR_CODE.ASSESSMENT_VERSION_NOT_FOUND, { versionId });

  assertOwnership(actor, version.assessment.createdById, { versionId });

  return {
    assessmentId: version.assessment.id,
    versionId: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    title: version.assessment.title,
    name: version.name,
    instructions: version.instructions,
    timeLimitMinutes: version.timeLimitMinutes,
    passingPercentage: version.passingPercentage ? Number(version.passingPercentage) : null,
    // Se cuentan las preguntas reales en lugar de leer el contador guardado:
    // si alguna vez se desincroniza, la previsualización debe mostrar lo que
    // hay, no lo que la fila dice que hay.
    questionCount: version.questions.length,
    totalPoints: version.questions.reduce((sum, question) => sum + Number(question.points), 0),
    questions: version.questions.map((question) => ({
      id: question.id,
      type: question.type,
      statement: question.statement,
      instructions: question.instructions,
      points: Number(question.points),
      position: question.position,
      mediaUrl: question.mediaUrl,
      payload: stripSolution(question.type as QuestionType, question.payload),
      allowsEvidence: question.allowsEvidence,
      requiresEvidence: question.requiresEvidence,
      maxEvidenceFiles: question.maxEvidenceFiles,
      competency: {
        id: question.kmkCompetency.id,
        code: question.kmkCompetency.code,
        name: question.kmkCompetency.name as LocalizedText,
        color: question.kmkCompetency.color,
      },
      solution: withSolutions
        ? {
            payload: question.payload,
            feedbackCorrect: question.feedbackCorrect,
            feedbackIncorrect: question.feedbackIncorrect,
            explanation: question.explanation,
          }
        : null,
    })),
  };
}
