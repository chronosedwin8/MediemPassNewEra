import { z } from 'zod';
import {
  DIFFICULTY,
  LANGUAGE,
  QUESTION_TYPE,
  type QuestionPayload,
  type QuestionType,
} from '@medienpass/shared';

/**
 * Contrato de lo que la IA debe devolver.
 *
 * La especificación es tajante: no se acepta texto arbitrario como respuesta
 * del modelo, y nada sin validar se guarda. Aquí hay **dos capas**, igual que
 * en las preguntas escritas a mano:
 *
 *  1. **Forma** (`aiResponseSchema`): que sea el JSON esperado.
 *  2. **Sentido** (`validateSemantics`): que una pregunta de respuesta única
 *     tenga exactamente una correcta, que los puntos sean positivos, que la
 *     competencia exista. Un modelo puede producir un JSON impecable y
 *     pedagógicamente inservible.
 *
 * Solo lo que supera ambas se convierte en un borrador editable.
 */

/**
 * Tipos que la IA puede generar.
 *
 * Deliberadamente no son los trece. Un modelo de texto no puede inventar
 * coordenadas de una zona sobre una imagen que no existe, ni URLs de imágenes
 * reales: pedírselo produciría preguntas rotas que el docente tendría que
 * rehacer enteras. Estos seis se generan bien y cubren la mayor parte del uso.
 */
export const AI_SUPPORTED_TYPES = [
  QUESTION_TYPE.SINGLE_CHOICE,
  QUESTION_TYPE.MULTIPLE_CHOICE,
  QUESTION_TYPE.TRUE_FALSE,
  QUESTION_TYPE.SHORT_ANSWER,
  QUESTION_TYPE.OPEN_TEXT,
  QUESTION_TYPE.ORDERING,
] as const;

export type AiQuestionType = (typeof AI_SUPPORTED_TYPES)[number];

const aiOptionSchema = z.object({
  text: z.string().trim().min(1).max(500),
  correct: z.boolean(),
});

const aiQuestionSchema = z.object({
  type: z.enum(AI_SUPPORTED_TYPES),
  statement: z.string().trim().min(10).max(2000),
  points: z.number().min(0.25).max(20),
  difficulty: z.enum([DIFFICULTY.BASIC, DIFFICULTY.INTERMEDIATE, DIFFICULTY.ADVANCED]),
  /** Código de la competencia (1..6), no su identificador interno. */
  competencyCode: z.string().trim().min(1).max(10),
  subcompetencyCode: z.string().trim().max(10).nullable().optional(),
  feedbackCorrect: z.string().trim().max(1000),
  feedbackIncorrect: z.string().trim().max(1000),
  explanation: z.string().trim().max(1500).optional(),

  /** Para los tipos de opción. */
  options: z.array(aiOptionSchema).max(8).optional(),
  /** Para verdadero/falso. */
  correctBoolean: z.boolean().optional(),
  /** Para respuesta corta: formas admitidas. */
  acceptedAnswers: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  /** Para ordenamiento: elementos ya en su orden correcto. */
  orderedItems: z.array(z.string().trim().min(1).max(300)).max(12).optional(),
});

export const aiResponseSchema = z.object({
  assessment: z.object({
    title: z.string().trim().min(5).max(200),
    description: z.string().trim().max(1000),
    instructions: z.string().trim().max(2000),
    difficulty: z.enum([DIFFICULTY.BASIC, DIFFICULTY.INTERMEDIATE, DIFFICULTY.ADVANCED]),
    language: z.enum([LANGUAGE.ES, LANGUAGE.DE, LANGUAGE.EN]),
  }),
  questions: z.array(aiQuestionSchema).min(1).max(50),
});

export type AiResponse = z.infer<typeof aiResponseSchema>;
export type AiQuestion = z.infer<typeof aiQuestionSchema>;

export interface SemanticIssue {
  questionIndex: number;
  rule: string;
  message: string;
}

/** Un problema encontrado, sin el índice: lo pone quien recorre el lote. */
type RuleViolation = Omit<SemanticIssue, 'questionIndex'>;

/**
 * Las reglas propias de cada tipo de pregunta.
 *
 * Es un registro indexado por tipo y no una cadena de `case`, por el mismo
 * motivo que el registro de calificadores: si mañana la IA aprende a generar
 * un tipo nuevo, olvidarse de validarlo es un error de compilación y no una
 * pregunta sin revisar que llega al borrador.
 */
const SEMANTIC_RULES: Record<AiQuestion['type'], (question: AiQuestion) => RuleViolation[]> = {
  [QUESTION_TYPE.SINGLE_CHOICE]: (question) => {
    const options = question.options ?? [];
    if (options.length < 2) {
      return [{ rule: 'TOO_FEW_OPTIONS', message: 'Una pregunta de opción necesita al menos dos' }];
    }

    const correct = options.filter((option) => option.correct).length;
    if (correct !== 1) {
      return [
        {
          rule: 'WRONG_CORRECT_COUNT',
          message: `Debe haber exactamente una correcta, hay ${correct}`,
        },
      ];
    }

    return [];
  },

  [QUESTION_TYPE.MULTIPLE_CHOICE]: (question) => {
    const options = question.options ?? [];
    if (options.length < 3) {
      return [
        {
          rule: 'TOO_FEW_OPTIONS',
          message: 'Una pregunta de respuesta múltiple necesita al menos tres',
        },
      ];
    }

    const correct = options.filter((option) => option.correct).length;
    if (correct === 0) {
      return [{ rule: 'NO_CORRECT_ANSWER', message: 'No hay ninguna opción correcta' }];
    }
    if (correct === options.length) {
      return [
        { rule: 'ALL_CORRECT', message: 'Si todas son correctas, la pregunta no discrimina nada' },
      ];
    }

    return [];
  },

  [QUESTION_TYPE.TRUE_FALSE]: (question) =>
    typeof question.correctBoolean === 'boolean'
      ? []
      : [{ rule: 'MISSING_ANSWER', message: 'Falta indicar si el enunciado es verdadero o falso' }],

  [QUESTION_TYPE.SHORT_ANSWER]: (question) =>
    question.acceptedAnswers?.length
      ? []
      : [{ rule: 'MISSING_ANSWER', message: 'Falta al menos una respuesta admitida' }],

  [QUESTION_TYPE.ORDERING]: (question) =>
    (question.orderedItems?.length ?? 0) >= 3
      ? []
      : [{ rule: 'TOO_FEW_ITEMS', message: 'Un ordenamiento necesita al menos tres elementos' }],

  // No hay respuesta que validar: la corrige el docente. Pero sí se exige que
  // la retroalimentación diga algo, porque es lo único que el estudiante
  // recibirá automáticamente.
  [QUESTION_TYPE.OPEN_TEXT]: (question) =>
    question.feedbackCorrect.trim().length >= 10
      ? []
      : [
          {
            rule: 'WEAK_FEEDBACK',
            message: 'La retroalimentación de una pregunta abierta debe orientar',
          },
        ],
};

/**
 * Comprueba que cada pregunta tiene sentido pedagógico.
 *
 * Se devuelven **todos** los problemas, no el primero: quien revise el
 * rechazo quiere saber si falló una pregunta o el lote entero.
 */
export function validateSemantics(
  response: AiResponse,
  knownCompetencyCodes: Set<string>,
): SemanticIssue[] {
  const issues: SemanticIssue[] = [];

  for (const [questionIndex, question] of response.questions.entries()) {
    if (!knownCompetencyCodes.has(question.competencyCode)) {
      issues.push({
        questionIndex,
        rule: 'UNKNOWN_COMPETENCY',
        message: `La competencia "${question.competencyCode}" no existe en el marco KMK`,
      });
    }

    for (const violation of SEMANTIC_RULES[question.type](question)) {
      issues.push({ questionIndex, ...violation });
    }
  }

  return issues;
}

/**
 * Traduce una pregunta generada al contenido interno de su tipo.
 *
 * Se hace aquí y no en el prompt para que el modelo trabaje con una forma
 * simple —opciones con texto y una marca de correcta— y no tenga que acertar
 * los identificadores internos ni la estructura exacta del `payload`. Pedirle
 * menos precisión estructural produce mejores preguntas.
 */
export function toQuestionPayload(question: AiQuestion): QuestionPayload {
  const optionId = (index: number): string => String.fromCharCode(97 + index);

  switch (question.type) {
    case QUESTION_TYPE.SINGLE_CHOICE:
    case QUESTION_TYPE.MULTIPLE_CHOICE:
      return {
        kind: question.type,
        ...(question.type === QUESTION_TYPE.MULTIPLE_CHOICE
          ? { partialCredit: true, penalizeIncorrect: true }
          : {}),
        options: (question.options ?? []).map((option, index) => ({
          id: optionId(index),
          text: option.text,
          correct: option.correct,
        })),
      } as QuestionPayload;

    case QUESTION_TYPE.TRUE_FALSE:
      return { kind: QUESTION_TYPE.TRUE_FALSE, correct: question.correctBoolean === true };

    case QUESTION_TYPE.SHORT_ANSWER:
      return {
        kind: QUESTION_TYPE.SHORT_ANSWER,
        acceptedAnswers: question.acceptedAnswers ?? [],
        caseSensitive: false,
        ignoreAccents: true,
      };

    case QUESTION_TYPE.OPEN_TEXT:
      return { kind: QUESTION_TYPE.OPEN_TEXT, minWords: 30, maxWords: 300 };

    case QUESTION_TYPE.ORDERING:
      return {
        kind: QUESTION_TYPE.ORDERING,
        partialCredit: true,
        items: (question.orderedItems ?? []).map((text, index) => ({
          id: `i${index + 1}`,
          text,
          correctPosition: index,
        })),
      };
  }
}

export function isAiSupportedType(type: QuestionType): type is AiQuestionType {
  return (AI_SUPPORTED_TYPES as readonly QuestionType[]).includes(type);
}
