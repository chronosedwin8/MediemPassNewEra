import { z } from 'zod';
import {
  AI_GENERATION_STATUS,
  ASSESSMENT_AUDIENCE,
  ASSESSMENT_PURPOSE,
  ASSESSMENT_VERSION_STATUS,
  AUDIT_ACTION,
  DIFFICULTY,
  ERROR_CODE,
  LANGUAGE,
  SETTING_KEY,
  type LocalizedText,
  type Role,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { createLogger } from '../../shared/logger.js';
import { recordAudit } from '../audit/audit.service.js';
import { getSetting } from '../settings/settings.service.js';
import { getActiveScale } from '../settings/scales.service.js';
import { env } from '../../config/env.js';
import { getAiProvider, type GenerationOutcome, type GenerationParams } from './ai.provider.js';
import {
  AI_SUPPORTED_TYPES,
  aiResponseSchema,
  toQuestionPayload,
  validateSemantics,
  type AiResponse,
  type SemanticIssue,
} from './ai.schema.js';

const log = createLogger('ai:service');

/**
 * Generación de evaluaciones con IA.
 *
 * El flujo es innegociable y está en la especificación:
 *
 *   parámetros → modelo → validación → **borrador** → revisión → publicación
 *
 * La IA **nunca publica**. Lo que produce aterriza siempre como una versión en
 * estado borrador que un docente tiene que revisar, editar y publicar a mano.
 * No hay ninguna ruta de código que salte ese paso, y hay una prueba que lo
 * comprueba.
 */

export const generateSchema = z.object({
  audience: z
    .enum([ASSESSMENT_AUDIENCE.STUDENT, ASSESSMENT_AUDIENCE.TEACHER])
    .default(ASSESSMENT_AUDIENCE.STUDENT),
  subjectId: z.string().uuid().nullable().optional(),
  gradeLevelId: z.string().uuid().nullable().optional(),
  topic: z.string().trim().min(3).max(200),
  /**
   * Indicaciones libres del docente.
   *
   * Es lo que separa una evaluación genérica sobre «fuentes digitales» de una
   * que encaja en la clase concreta: qué se vio en el aula, con qué
   * herramientas se trabaja, qué vocabulario se ha usado, qué evitar. El
   * modelo lo recibe como contexto adicional, nunca como instrucciones sobre
   * el formato de salida: la forma la fija el esquema y no se negocia.
   */
  context: z.string().trim().max(2000).nullable().optional(),
  difficulty: z
    .enum([DIFFICULTY.BASIC, DIFFICULTY.INTERMEDIATE, DIFFICULTY.ADVANCED])
    .default(DIFFICULTY.INTERMEDIATE),
  language: z.enum([LANGUAGE.ES, LANGUAGE.DE, LANGUAGE.EN]).default(LANGUAGE.ES),
  questionCount: z.number().int().min(1).max(50).default(10),
  /** Al menos una competencia: sin ella no hay nada que medir. */
  competencyIds: z.array(z.string().uuid()).min(1).max(6),
  questionTypes: z
    .array(z.enum(AI_SUPPORTED_TYPES))
    .min(1)
    .default([...AI_SUPPORTED_TYPES]),
});

export type GenerateInput = z.infer<typeof generateSchema>;

interface Actor {
  userId: string;
  roles: Role[];
}

export interface GenerationResult {
  requestId: string;
  status: string;
  assessmentId: string | null;
  versionId: string | null;
  questionsCreated: number;
  /** Problemas encontrados si la respuesta se rechazó. */
  issues: SemanticIssue[] | null;
}

/** Cuota diaria por persona: protege el presupuesto, no solo la CPU. */
async function assertWithinQuota(userId: string): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const used = await prisma.aiGenerationRequest.count({
    where: { requestedById: userId, createdAt: { gte: since } },
  });

  if (used >= env.AI_RATE_LIMIT_PER_USER_PER_DAY) {
    throw new AppError(ERROR_CODE.AI_QUOTA_EXCEEDED, 'Daily AI generation limit reached', {
      details: { limit: env.AI_RATE_LIMIT_PER_USER_PER_DAY, used },
    });
  }
}

/**
 * Reúne el contexto que el modelo necesita.
 *
 * Nombre y descripción de cada competencia salen de la base, no del prompt:
 * si alguien edita el marco KMK, la generación se entera sola.
 */
async function buildParams(input: GenerateInput): Promise<GenerationParams> {
  const [competencies, subject, gradeLevel] = await Promise.all([
    prisma.kmkCompetency.findMany({
      where: { id: { in: input.competencyIds } },
      select: { code: true, name: true, description: true },
      orderBy: { position: 'asc' },
    }),
    input.subjectId
      ? prisma.subject.findUnique({ where: { id: input.subjectId }, select: { name: true } })
      : null,
    input.gradeLevelId
      ? prisma.gradeLevel.findUnique({ where: { id: input.gradeLevelId }, select: { name: true } })
      : null,
  ]);

  if (competencies.length === 0) {
    throw AppError.notFound(ERROR_CODE.COMPETENCY_NOT_FOUND, { ids: input.competencyIds });
  }

  const localized = (value: unknown): string =>
    (value as LocalizedText | null)?.[input.language] ?? (value as LocalizedText | null)?.es ?? '';

  return {
    audience: input.audience,
    subjectName: subject ? localized(subject.name) : 'General',
    gradeLabel: gradeLevel ? localized(gradeLevel.name) : null,
    topic: input.topic,
    context: input.context ?? null,
    difficulty: input.difficulty,
    language: input.language,
    questionCount: input.questionCount,
    questionTypes: input.questionTypes,
    competencies: competencies.map((competency) => ({
      code: competency.code,
      name: localized(competency.name),
      description: localized(competency.description),
    })),
  };
}

/**
 * Convierte la respuesta validada en una versión borrador.
 *
 * Se crea igual que si el docente la hubiera escrito: misma tabla, mismo
 * estado, mismas reglas. A partir de aquí, la evaluación generada por IA es
 * indistinguible de cualquier otra, y eso es deliberado: no hay dos caminos
 * de publicación que puedan divergir.
 */
interface DraftResult {
  assessmentId: string;
  versionId: string;
  questionsCreated: number;
}

async function materialiseDraft(
  actor: Actor,
  input: GenerateInput,
  response: AiResponse,
): Promise<DraftResult> {
  const competencies = await prisma.kmkCompetency.findMany({
    where: { code: { in: response.questions.map((question) => question.competencyCode) } },
    select: { id: true, code: true },
  });
  const competencyByCode = new Map(competencies.map((row) => [row.code, row.id]));

  const scale = await getActiveScale(input.audience);

  return prisma.$transaction(async (tx) => {
    const assessment = await tx.assessment.create({
      data: {
        title: response.assessment.title,
        audience: input.audience,
        purpose:
          input.audience === ASSESSMENT_AUDIENCE.TEACHER
            ? ASSESSMENT_PURPOSE.TRAINING
            : ASSESSMENT_PURPOSE.EVALUATION,
        subjectId: input.subjectId ?? null,
        gradeLevelId: input.gradeLevelId ?? null,
        language: response.assessment.language,
        createdById: actor.userId,
      },
    });

    const version = await tx.assessmentVersion.create({
      data: {
        assessmentId: assessment.id,
        versionNumber: 1,
        // Borrador. Siempre. Publicar es una decisión de una persona.
        status: ASSESSMENT_VERSION_STATUS.DRAFT,
        name: response.assessment.title,
        description: response.assessment.description,
        instructions: response.assessment.instructions,
        difficulty: response.assessment.difficulty,
        language: response.assessment.language,
        gradingScaleId: scale.id,
      },
    });

    for (const [position, question] of response.questions.entries()) {
      await tx.question.create({
        data: {
          assessmentVersionId: version.id,
          type: question.type,
          statement: question.statement,
          points: question.points,
          position,
          difficulty: question.difficulty,
          kmkCompetencyId: competencyByCode.get(question.competencyCode)!,
          feedbackCorrect: question.feedbackCorrect,
          feedbackIncorrect: question.feedbackIncorrect,
          explanation: question.explanation ?? null,
          payload: toQuestionPayload(question) as object,
        },
      });
    }

    /*
     * Los contadores de la versión se actualizan aquí.
     *
     * Sin esto, el borrador queda con `questionCount: 0` aunque tenga diez
     * preguntas, y el listado de evaluaciones anuncia «0 preguntas». Quien lo
     * ve concluye, razonablemente, que la generación no produjo nada, y ni
     * siquiera entra a mirar. Al crear preguntas a mano se recalcula al
     * publicar; aquí se crean en bloque y nadie pasaba por ese camino.
     */
    const totalPoints = response.questions.reduce((sum, question) => sum + question.points, 0);
    await tx.assessmentVersion.update({
      where: { id: version.id },
      data: { questionCount: response.questions.length, totalPoints },
    });

    return {
      assessmentId: assessment.id,
      versionId: version.id,
      questionsCreated: response.questions.length,
    };
  });
}

/**
 * Las condiciones previas: que la función esté activa, que el número de
 * preguntas quepa en lo configurado y que el docente no haya agotado su cupo.
 *
 * Se comprueban antes de gastar una llamada al proveedor, que se cobra.
 */
async function assertGenerationAllowed(actor: Actor, input: GenerateInput): Promise<void> {
  const enabled = await getSetting(SETTING_KEY.AI_ENABLED);
  if (!enabled) {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'AI generation is disabled');
  }

  const maxQuestions = await getSetting(SETTING_KEY.AI_MAX_QUESTIONS);
  if (input.questionCount > maxQuestions) {
    throw AppError.validation([
      {
        path: 'questionCount',
        rule: 'too_big',
        message: `El máximo configurado es ${maxQuestions}`,
      },
    ]);
  }

  await assertWithinQuota(actor.userId);
}

/**
 * Las dos capas de validación, en orden: forma y sentido.
 *
 * Cualquiera de las dos que falle termina en `rejectRequest`, que lanza. Si
 * esta función devuelve, la respuesta es utilizable; no hay estado intermedio
 * que el llamador tenga que interpretar.
 */
async function validateResponse(
  requestId: string,
  raw: string,
  knownCodes: Set<string>,
): Promise<{ data: AiResponse; json: unknown }> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return rejectRequest(requestId, raw, [
      { questionIndex: -1, rule: 'INVALID_JSON', message: 'La respuesta no es JSON válido' },
    ]);
  }

  const parsed = aiResponseSchema.safeParse(json);
  if (!parsed.success) {
    return rejectRequest(
      requestId,
      raw,
      parsed.error.issues.map((issue) => ({
        questionIndex: typeof issue.path[1] === 'number' ? issue.path[1] : -1,
        rule: issue.code,
        message: `${issue.path.join('.')}: ${issue.message}`,
      })),
    );
  }

  const semanticIssues = validateSemantics(parsed.data, knownCodes);
  if (semanticIssues.length > 0) {
    log.warn({ requestId, issues: semanticIssues.length }, 'respuesta rechazada');
    return rejectRequest(requestId, raw, semanticIssues);
  }

  return { data: parsed.data, json };
}

/** Cierra la solicitud como aplicada y deja constancia en auditoría. */
async function recordSuccess(input: {
  actor: Actor;
  request: { id: string };
  generateInput: GenerateInput;
  draft: DraftResult;
  outcome: GenerationOutcome;
  json: unknown;
  startedAt: number;
}): Promise<void> {
  const { actor, request, draft, outcome, json, startedAt } = input;

  await prisma.aiGenerationRequest.update({
    where: { id: request.id },
    data: {
      status: AI_GENERATION_STATUS.APPLIED,
      rawResponse: json as object,
      assessmentVersionId: draft.versionId,
      promptTokens: outcome.promptTokens,
      completionTokens: outcome.completionTokens,
      durationMs: Date.now() - startedAt,
      completedAt: new Date(),
    },
  });

  await recordAudit({
    userId: actor.userId,
    action: AUDIT_ACTION.GENERATE_AI_ASSESSMENT,
    entityType: 'assessment_version',
    entityId: draft.versionId,
    metadata: {
      provider: outcome.provider,
      model: outcome.model,
      questions: draft.questionsCreated,
      topic: input.generateInput.topic,
    },
  });
}

/**
 * Genera un borrador de evaluación.
 *
 * El resultado es **siempre** un borrador: la IA propone y el docente decide.
 * Nada de lo que produce este flujo llega a un estudiante sin que alguien lo
 * haya leído y publicado.
 */
export async function generateAssessment(
  actor: Actor,
  input: GenerateInput,
): Promise<GenerationResult> {
  await assertGenerationAllowed(actor, input);

  const params = await buildParams(input);
  const provider = getAiProvider();
  const startedAt = Date.now();

  const request = await prisma.aiGenerationRequest.create({
    data: {
      requestedById: actor.userId,
      status: AI_GENERATION_STATUS.IN_PROGRESS,
      provider: provider.id,
      model: env.AI_MODEL,
      params: input as object,
    },
  });

  try {
    const outcome = await provider.generate(params);
    const knownCodes = new Set(params.competencies.map((competency) => competency.code));
    const { data, json } = await validateResponse(request.id, outcome.raw, knownCodes);

    // Solo entonces se persiste algo que un docente vaya a ver.
    const draft = await materialiseDraft(actor, input, data);
    await recordSuccess({ actor, request, generateInput: input, draft, outcome, json, startedAt });

    return {
      requestId: request.id,
      status: AI_GENERATION_STATUS.APPLIED,
      assessmentId: draft.assessmentId,
      versionId: draft.versionId,
      questionsCreated: draft.questionsCreated,
      issues: null,
    };
  } catch (error) {
    // `updateMany` con el estado en el filtro, y no `update` por id: un rechazo
    // por validación ya dejó la solicitud en REJECTED con sus motivos, y
    // marcarla aquí como FAILED borraría justo la información que explica por
    // qué se descartó. Solo se cierra lo que siga realmente en curso.
    await prisma.aiGenerationRequest.updateMany({
      where: { id: request.id, status: AI_GENERATION_STATUS.IN_PROGRESS },
      data: {
        status: AI_GENERATION_STATUS.FAILED,
        errorMessage: error instanceof Error ? error.message : 'error desconocido',
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

/**
 * Registra el rechazo sin crear nada.
 *
 * La respuesta cruda se conserva para poder auditar qué produjo el modelo,
 * incluso —sobre todo— cuando no sirvió. Es lo que permite mejorar el prompt
 * en lugar de adivinar.
 */
async function rejectRequest(
  requestId: string,
  raw: string,
  issues: SemanticIssue[],
): Promise<never> {
  await prisma.aiGenerationRequest.update({
    where: { id: requestId },
    data: {
      status: AI_GENERATION_STATUS.REJECTED,
      rawResponse: { raw: raw.slice(0, 20_000) },
      validationErrors: issues as unknown as object,
      completedAt: new Date(),
    },
  });

  throw new AppError(
    ERROR_CODE.AI_RESPONSE_INVALID,
    'The AI response did not pass validation and was discarded',
    { details: { requestId, issues: issues.slice(0, 10) } },
  );
}

export async function listGenerationRequests(actor: Actor, limit = 20) {
  return prisma.aiGenerationRequest.findMany({
    where: { requestedById: actor.userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      status: true,
      provider: true,
      model: true,
      params: true,
      validationErrors: true,
      assessmentVersionId: true,
      durationMs: true,
      createdAt: true,
    },
  });
}
