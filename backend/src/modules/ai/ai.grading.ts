import {
  QUESTION_TYPE,
  SMART_DIMENSIONS,
  SMART_LETTER,
  SMART_LEVEL_MAX,
  type Language,
  type QuestionType,
  type SmartScores,
} from '@medienpass/shared';
import { z } from 'zod';
import { ERROR_CODE } from '@medienpass/shared';
import { env } from '../../config/env.js';
import { AppError, ExternalServiceError } from '../../shared/errors/app-error.js';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('ai-grading');

/**
 * Corrección asistida por IA.
 *
 * Propone una nota y una retroalimentación para una respuesta escrita. Lo que
 * devuelve es **una propuesta**, no una calificación: llega al formulario de
 * corrección relleno y se guarda cuando una persona pulsa guardar.
 *
 * No es una cautela de trámite. La plataforma dice en su propia portada que no
 * califica lo que un docente debe corregir a mano ni publica nada sin que
 * alguien lo lea, y eso vale especialmente aquí: el modelo puntúa igual de
 * seguro cuando acierta que cuando no ha entendido la respuesta, y quien
 * recibe la nota es un menor que no puede contrastarla.
 *
 * Solo corrige lo que puede leer. Una nota de voz o un vídeo no se le envían:
 * inventaría una valoración sobre algo que no ha visto.
 */

export const AI_GRADABLE_TYPES: readonly QuestionType[] = [
  QUESTION_TYPE.OPEN_TEXT,
  QUESTION_TYPE.LONG_ANSWER,
  QUESTION_TYPE.SHORT_ANSWER,
  QUESTION_TYPE.SMART_GOAL,
];

export function isAiGradable(type: QuestionType): boolean {
  return AI_GRADABLE_TYPES.includes(type);
}

export interface GradingParams {
  questionType: QuestionType;
  statement: string;
  /** Criterios que el docente escribió en la pregunta, si los hay. */
  rubric: string | null;
  answerText: string;
  pointsPossible: number;
  language: Language;
}

export interface GradingSuggestion {
  points: number;
  feedback: string;
  /** Solo en los objetivos SMART: la rúbrica dimensión a dimensión. */
  rubricScores: SmartScores | null;
  model: string;
}

const smartScoreSchema = z.number().int().min(0).max(SMART_LEVEL_MAX);

const suggestionSchema = z.object({
  points: z.number().min(0),
  feedback: z.string().trim().min(1).max(2000),
  smart: z
    .object({
      SPECIFIC: smartScoreSchema,
      MEASURABLE: smartScoreSchema,
      ACHIEVABLE: smartScoreSchema,
      RELEVANT: smartScoreSchema,
      TIME_BOUND: smartScoreSchema,
    })
    .nullish(),
});

const LANGUAGE_NAME: Record<Language, string> = { es: 'español', de: 'alemán', en: 'inglés' };

/**
 * El prompt de corrección.
 *
 * Tres cosas se le insisten al modelo, y cada una responde a un fallo que se
 * ve cuando no están: que puntúe sobre el máximo real de la pregunta y no
 * sobre diez; que la retroalimentación se dirija al estudiante y diga qué
 * mirar, no que resuma la respuesta; y que ante una respuesta que no entiende
 * puntúe bajo y lo diga, en lugar de inventar una interpretación generosa.
 */
function buildGradingPrompt(params: GradingParams): string {
  const isSmart = params.questionType === QUESTION_TYPE.SMART_GOAL;

  const smartBlock = isSmart
    ? `
Esta pregunta pide formular un objetivo SMART. Puntúa cada dimensión de 0 a ${SMART_LEVEL_MAX}
y devuélvelas en el campo "smart":
${SMART_DIMENSIONS.map((dimension) => `  ${SMART_LETTER[dimension]} (${dimension})`).join('\n')}

Niveles: 0 el criterio está ausente · 1 evidencia mínima · 2 cumple parcialmente ·
3 cumple con pequeñas deficiencias · 4 cumple por completo.

Lo que se evalúa es **cómo está formulado** el objetivo, no si se cumplirá.
Los puntos deben ser proporcionales: (suma de las cinco / 20) × ${params.pointsPossible}.
`
    : '';

  const rubricBlock = params.rubric ? `\nCRITERIOS DEL DOCENTE\n"""\n${params.rubric}\n"""\n` : '';

  return `Eres docente y corriges una respuesta escrita. Devuelve solo JSON.

PREGUNTA
"""
${params.statement}
"""
${rubricBlock}
RESPUESTA DEL ESTUDIANTE
"""
${params.answerText}
"""
${smartBlock}
REGLAS
- "points": número entre 0 y ${params.pointsPossible}. Ese es el máximo de esta pregunta; no uses otra escala.
- "feedback": en ${LANGUAGE_NAME[params.language]}, dirigido al estudiante, de 1 a 3 frases.
  Di qué hizo bien y qué concretamente mirar la próxima vez. No resumas su respuesta.
- Si la respuesta está vacía, es ilegible o no responde a lo que se pregunta,
  puntúa bajo y dilo en la retroalimentación. No interpretes con generosidad
  lo que no está escrito.`;
}

const GEMINI_GRADING_SCHEMA = {
  type: 'object',
  properties: {
    points: { type: 'number' },
    feedback: { type: 'string' },
    smart: {
      type: 'object',
      properties: {
        SPECIFIC: { type: 'integer' },
        MEASURABLE: { type: 'integer' },
        ACHIEVABLE: { type: 'integer' },
        RELEVANT: { type: 'integer' },
        TIME_BOUND: { type: 'integer' },
      },
      required: ['SPECIFIC', 'MEASURABLE', 'ACHIEVABLE', 'RELEVANT', 'TIME_BOUND'],
    },
  },
  required: ['points', 'feedback'],
};

/**
 * Pide la propuesta al modelo y la valida.
 *
 * Los puntos se recortan al máximo de la pregunta aunque el modelo se pase:
 * un 12 sobre una pregunta de 10 no es una propuesta, es un error, y
 * rechazarla entera por eso obligaría a corregir a mano algo que por lo demás
 * estaba bien.
 */
/**
 * La llamada al modelo, aislada de las reglas de la corrección.
 *
 * Separada para que `suggestGrade` se lea como lo que decide —qué se envía,
 * qué se acepta y cómo se recorta— y no como una mezcla de eso con el manejo
 * de una petición HTTP.
 */
async function askModel(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.AI_MODEL}:generateContent`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.AI_API_KEY! },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_GRADING_SCHEMA,
          // Más baja que al generar: corregir no es una tarea creativa, y la
          // misma respuesta debería recibir la misma nota dos veces seguidas.
          temperature: 0.2,
        },
      }),
      signal: AbortSignal.timeout(env.AI_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ExternalServiceError(
      'ai',
      ERROR_CODE.AI_PROVIDER_ERROR,
      'No se pudo contactar con el proveedor de IA',
      { cause: error },
    );
  }

  if (!response.ok) {
    // No se propaga el cuerpo: puede reflejar la clave enviada.
    log.warn({ status: response.status }, 'el proveedor de IA devolvió un error al corregir');
    throw new ExternalServiceError(
      'ai',
      ERROR_CODE.AI_PROVIDER_ERROR,
      'El proveedor de IA devolvió un error',
    );
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return payload.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export async function suggestGrade(params: GradingParams): Promise<GradingSuggestion> {
  if (!env.AI_API_KEY) {
    throw new AppError(ERROR_CODE.AI_PROVIDER_ERROR, 'AI_API_KEY is not configured');
  }

  const text = await askModel(buildGradingPrompt(params));

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError(ERROR_CODE.AI_RESPONSE_INVALID, 'La respuesta del modelo no era JSON');
  }

  const result = suggestionSchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError(ERROR_CODE.AI_RESPONSE_INVALID, 'La propuesta no tenía la forma esperada');
  }

  const points = Math.min(Math.max(0, result.data.points), params.pointsPossible);

  return {
    points: Math.round(points * 100) / 100,
    feedback: result.data.feedback,
    rubricScores:
      params.questionType === QUESTION_TYPE.SMART_GOAL && result.data.smart
        ? (result.data.smart as SmartScores)
        : null,
    model: env.AI_MODEL,
  };
}
