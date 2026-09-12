import { z } from 'zod';
import { RICH_TEXT_MAX_LENGTH } from '@medienpass/shared';
import {
  sanitizeOptionalRichText,
  sanitizeRequiredRichText,
} from '../../shared/security/sanitize.js';
import {
  DIFFICULTY,
  ERROR_CODE,
  QUESTION_TYPE,
  safeParseQuestionPayload,
  type QuestionType,
  type Role,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { assertCompetencyPair } from '../kmk/kmk.service.js';
import { getEditableVersion } from './assessments.service.js';

/**
 * Preguntas de una versión en borrador.
 *
 * Solo se pueden crear, editar o borrar dentro de una versión `DRAFT`:
 * `getEditableVersion` lo garantiza en cada operación. No hay ninguna ruta por
 * la que una pregunta de una versión publicada pueda cambiar.
 */

/**
 * Los tipos admitidos salen del propio enum.
 *
 * Antes eran una lista escrita a mano que repetía `QUESTION_TYPE` entrada por
 * entrada, y se quedó atrás en cuanto se añadieron los tipos de captura: el
 * esquema del contenido los aceptaba, el calificador existía y la interfaz los
 * ofrecía, pero crear la pregunta devolvía un 422 sin decir por qué.
 *
 * Derivarlo no es un atajo: es que no había dos listas, había una copia.
 */
const questionTypeSchema = z.enum(
  Object.values(QUESTION_TYPE) as [QuestionType, ...QuestionType[]],
);

export const createQuestionSchema = z
  .object({
    type: questionTypeSchema,
    /**
     * El enunciado admite formato. Llega como HTML y se limpia al guardar contra
     * una lista blanca; el máximo se comprueba después de limpiar, porque lo que
     * cuenta es lo que queda, no lo que se pegó.
     */
    statement: z.string().trim().min(3).max(RICH_TEXT_MAX_LENGTH),
    instructions: z.string().trim().max(RICH_TEXT_MAX_LENGTH).nullable().optional(),
    points: z.number().min(0.25).max(100).default(1),
    position: z.number().int().min(0).optional(),
    difficulty: z
      .enum([DIFFICULTY.BASIC, DIFFICULTY.INTERMEDIATE, DIFFICULTY.ADVANCED])
      .default(DIFFICULTY.INTERMEDIATE),
    /** Obligatoria: es la base de toda la analítica por competencia. */
    kmkCompetencyId: z.string().uuid(),
    kmkSubcompetencyId: z.string().uuid().nullable().optional(),
    feedbackCorrect: z.string().trim().max(2000).nullable().optional(),
    feedbackIncorrect: z.string().trim().max(2000).nullable().optional(),
    explanation: z.string().trim().max(3000).nullable().optional(),
    mediaUrl: z.string().trim().max(1000).nullable().optional(),
    /** El docente decide si esta pregunta admite adjuntar evidencia. */
    allowsEvidence: z.boolean().default(false),
    requiresEvidence: z.boolean().default(false),
    maxEvidenceFiles: z.number().int().min(1).max(10).default(3),
    /** Contenido específico del tipo; se valida contra su propio esquema. */
    payload: z.unknown(),
  })
  .superRefine((input, ctx) => {
    // Exigir evidencia sin admitirla es una configuración que bloquearía al
    // estudiante: no podría adjuntar nada y no podría terminar.
    if (input.requiresEvidence && !input.allowsEvidence) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requiresEvidence'],
        message: 'Para exigir evidencia hay que admitirla primero',
      });
    }
  });

export const updateQuestionSchema = createQuestionSchema.innerType().partial().omit({ type: true });

export const reorderSchema = z.object({
  questionIds: z.array(z.string().uuid()).min(1).max(200),
});

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

interface Actor {
  userId: string;
  roles: Role[];
}

/**
 * Valida el contenido específico del tipo.
 *
 * Se traduce el fallo de Zod a `QUESTION_PAYLOAD_INVALID` con el detalle campo
 * a campo, para que el editor del frontend pueda señalar exactamente qué está
 * mal en lugar de decir «datos inválidos».
 */
function validatePayload(type: QuestionType, payload: unknown): object {
  const parsed = safeParseQuestionPayload(type, payload);

  if (!parsed.success) {
    throw new AppError(
      ERROR_CODE.QUESTION_PAYLOAD_INVALID,
      `Invalid content for a ${type} question`,
      {
        issues: parsed.error.issues.map((issue) => ({
          path: ['payload', ...issue.path.map(String)].join('.'),
          rule: issue.code,
          message: issue.message,
        })),
      },
    );
  }

  return parsed.data as object;
}

export async function listQuestions(actor: Actor, versionId: string) {
  const version = await prisma.assessmentVersion.findUnique({
    where: { id: versionId },
    include: { assessment: { select: { createdById: true } } },
  });
  if (!version) throw AppError.notFound(ERROR_CODE.ASSESSMENT_VERSION_NOT_FOUND, { versionId });

  const questions = await prisma.question.findMany({
    where: { assessmentVersionId: versionId },
    orderBy: { position: 'asc' },
    include: {
      kmkCompetency: { select: { id: true, code: true, name: true, color: true } },
      kmkSubcompetency: { select: { id: true, code: true, name: true } },
    },
  });

  /*
   * Los puntos salen como número.
   *
   * Prisma devuelve `Decimal`, que al serializarse a JSON se convierte en
   * texto. El tipo del cliente decía `number`, así que nadie se enteraba hasta
   * que alguien sumaba: el total de una evaluación de cinco preguntas aparecía
   * como «023344» en lugar de 16, porque `0 + '2' + '3'…` concatena.
   *
   * Se convierte aquí y no en la pantalla porque el problema es del contrato:
   * si cada consumidor tiene que acordarse de convertirlo, el siguiente que
   * sume volverá a concatenar.
   */
  return questions.map((question) => ({ ...question, points: Number(question.points) }));
}

export async function createQuestion(actor: Actor, versionId: string, input: CreateQuestionInput) {
  await getEditableVersion(actor, versionId);
  await assertCompetencyPair(input.kmkCompetencyId, input.kmkSubcompetencyId);

  const payload = validatePayload(input.type, input.payload);

  // La posición se calcula si no se indica, para que añadir preguntas una tras
  // otra no obligue al cliente a llevar la cuenta.
  const position =
    input.position ??
    ((
      await prisma.question.aggregate({
        where: { assessmentVersionId: versionId },
        _max: { position: true },
      })
    )._max.position ?? -1) + 1;

  return prisma.question.create({
    data: {
      assessmentVersionId: versionId,
      type: input.type,
      statement: sanitizeRequiredRichText(input.statement, 'statement'),
      instructions: sanitizeOptionalRichText(input.instructions, 'instructions'),
      points: input.points,
      position,
      difficulty: input.difficulty,
      kmkCompetencyId: input.kmkCompetencyId,
      kmkSubcompetencyId: input.kmkSubcompetencyId ?? null,
      feedbackCorrect: sanitizeOptionalRichText(input.feedbackCorrect, 'feedbackCorrect'),
      feedbackIncorrect: sanitizeOptionalRichText(input.feedbackIncorrect, 'feedbackIncorrect'),
      explanation: sanitizeOptionalRichText(input.explanation, 'explanation'),
      mediaUrl: input.mediaUrl ?? null,
      allowsEvidence: input.allowsEvidence,
      requiresEvidence: input.requiresEvidence,
      maxEvidenceFiles: input.maxEvidenceFiles,
      payload,
    },
  });
}

/**
 * Traduce la entrada parcial a datos de actualización.
 *
 * Se distingue el campo ausente (no se toca) del campo enviado como nulo (se
 * borra): sin esa distinción, omitir la retroalimentación en una edición
 * parcial la borraría sin que nadie lo hubiera pedido.
 */
function buildQuestionUpdate(
  input: UpdateQuestionInput,
  payload?: object,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const direct = [
    'points',
    'difficulty',
    'kmkCompetencyId',
    'kmkSubcompetencyId',
    'mediaUrl',
    'allowsEvidence',
    'requiresEvidence',
    'maxEvidenceFiles',
  ] as const;

  for (const field of direct) {
    if (input[field] !== undefined) data[field] = input[field];
  }

  // Los campos con formato pasan por el saneado, nunca directos.
  if (input.statement !== undefined) {
    data['statement'] = sanitizeRequiredRichText(input.statement, 'statement');
  }
  for (const field of [
    'instructions',
    'feedbackCorrect',
    'feedbackIncorrect',
    'explanation',
  ] as const) {
    if (input[field] !== undefined) data[field] = sanitizeOptionalRichText(input[field], field);
  }
  if (payload) data['payload'] = payload;

  return data;
}

export async function updateQuestion(actor: Actor, questionId: string, input: UpdateQuestionInput) {
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) throw AppError.notFound(ERROR_CODE.QUESTION_NOT_FOUND, { questionId });

  await getEditableVersion(actor, question.assessmentVersionId);

  if (input.kmkCompetencyId) {
    await assertCompetencyPair(input.kmkCompetencyId, input.kmkSubcompetencyId);
  }

  // El contenido se revalida contra el tipo **ya guardado**: el tipo de una
  // pregunta no se puede cambiar, porque hacerlo dejaría el contenido y el
  // calificador desalineados.
  const payload =
    input.payload !== undefined ? validatePayload(question.type, input.payload) : undefined;

  return prisma.question.update({
    where: { id: questionId },
    data: buildQuestionUpdate(input, payload) as never,
  });
}

export async function deleteQuestion(actor: Actor, questionId: string): Promise<void> {
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) throw AppError.notFound(ERROR_CODE.QUESTION_NOT_FOUND, { questionId });

  await getEditableVersion(actor, question.assessmentVersionId);

  // Se recolocan las posiciones para que no queden huecos: el índice único
  // (versión, posición) no los tolera y la interfaz los mostraría raros.
  await prisma.$transaction(async (tx) => {
    await tx.question.delete({ where: { id: questionId } });

    const remaining = await tx.question.findMany({
      where: { assessmentVersionId: question.assessmentVersionId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });

    // Se desplazan primero fuera de rango para evitar chocar con el índice
    // único mientras se renumera.
    for (const [index, row] of remaining.entries()) {
      await tx.question.update({ where: { id: row.id }, data: { position: 1000 + index } });
    }
    for (const [index, row] of remaining.entries()) {
      await tx.question.update({ where: { id: row.id }, data: { position: index } });
    }
  });
}

/**
 * Reordena las preguntas en una sola operación.
 *
 * El cliente envía el orden completo, no movimientos individuales: así dos
 * arrastres seguidos no pueden dejar el orden a medias.
 */
export async function reorderQuestions(
  actor: Actor,
  versionId: string,
  questionIds: string[],
): Promise<void> {
  await getEditableVersion(actor, versionId);

  const existing = await prisma.question.findMany({
    where: { assessmentVersionId: versionId },
    select: { id: true },
  });

  const existingIds = new Set(existing.map((question) => question.id));
  if (questionIds.length !== existingIds.size || questionIds.some((id) => !existingIds.has(id))) {
    throw AppError.conflict(
      ERROR_CODE.CONFLICT,
      'The order must contain exactly the questions of this version',
      { expected: existingIds.size, received: questionIds.length },
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const [index, id] of questionIds.entries()) {
      await tx.question.update({ where: { id }, data: { position: 1000 + index } });
    }
    for (const [index, id] of questionIds.entries()) {
      await tx.question.update({ where: { id }, data: { position: index } });
    }
  });
}
