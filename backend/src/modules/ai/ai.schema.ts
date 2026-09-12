import { z } from 'zod';
import {
  DIFFICULTY,
  LANGUAGE,
  MEDIA_MAX_SECONDS,
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
 * Quita el adorno de un código de competencia.
 *
 * «KMK 1», «kmk-1», «KMK 2.3» y « 1 » son todos el mismo código para quien
 * escribió la respuesta. Se conserva el punto porque separa competencia de
 * subcompetencia y sí es significativo.
 */
export function normaliseCompetencyCode(value: string): string {
  return value
    .trim()
    .replace(/^kmk[\s._-]*/i, '')
    .trim();
}

/**
 * Tipos que la IA puede generar.
 *
 * Deliberadamente no son todos. Quedan fuera los que exigen material que el
 * modelo no tiene: no puede inventar coordenadas sobre una imagen que no ha
 * visto, ni URLs de imágenes reales; pedírselo produciría preguntas rotas que
 * el docente tendría que rehacer enteras.
 *
 * Los tipos de captura —selfie, vídeo y nota de voz— sí entran, y puede
 * sorprender porque el modelo no ve ni oye nada. Pero no se le pide que
 * corrija una grabación: se le pide que escriba la consigna que la provoca, y
 * eso es redactar. Lo mismo vale para el objetivo SMART, donde lo generado es
 * el ámbito sobre el que el estudiante formulará el suyo.
 */
export const AI_SUPPORTED_TYPES = [
  QUESTION_TYPE.SINGLE_CHOICE,
  QUESTION_TYPE.MULTIPLE_CHOICE,
  QUESTION_TYPE.TRUE_FALSE,
  QUESTION_TYPE.SHORT_ANSWER,
  QUESTION_TYPE.OPEN_TEXT,
  QUESTION_TYPE.LONG_ANSWER,
  QUESTION_TYPE.ORDERING,
  QUESTION_TYPE.SMART_GOAL,
  QUESTION_TYPE.SELFIE,
  QUESTION_TYPE.VIDEO_RESPONSE,
  QUESTION_TYPE.AUDIO_RESPONSE,
] as const;

export type AiQuestionType = (typeof AI_SUPPORTED_TYPES)[number];

/**
 * Los que vienen marcados en el formulario.
 *
 * No son todos los admitidos, y la diferencia es deliberada. Marcar los once
 * produciría evaluaciones donde una de cada tres preguntas pide grabar algo:
 * una clase de treinta estudiantes son treinta vídeos que alguien tiene que
 * ver enteros, y esa decisión la toma el docente, no el valor por defecto.
 *
 * Los tipos de captura y el objetivo SMART siguen a un clic de distancia. Lo
 * que cambia es quién los pide.
 */
export const AI_DEFAULT_TYPES: readonly AiQuestionType[] = [
  QUESTION_TYPE.SINGLE_CHOICE,
  QUESTION_TYPE.MULTIPLE_CHOICE,
  QUESTION_TYPE.TRUE_FALSE,
  QUESTION_TYPE.SHORT_ANSWER,
  QUESTION_TYPE.OPEN_TEXT,
  QUESTION_TYPE.ORDERING,
];

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
  /**
   * Código de la competencia, normalizado al entrar.
   *
   * El modelo devuelve «KMK 1» tantas veces como «1», y es comprensible: en el
   * prompt las competencias se listan con esa etiqueta delante. Rechazar la
   * respuesta entera por el prefijo sería descartar cinco preguntas buenas por
   * una diferencia de formato, así que se limpia aquí, una vez, y todo lo que
   * viene después trabaja ya con el código limpio.
   *
   * Lo que **no** hace es adivinar: si el código no existe en el marco, la
   * validación semántica lo rechaza igual. Esto solo quita el adorno.
   */
  competencyCode: z.string().trim().min(1).max(20).transform(normaliseCompetencyCode),
  subcompetencyCode: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .optional()
    .transform((value) => (value ? normaliseCompetencyCode(value) : value)),
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
  /**
   * Para los tipos que se responden grabando: qué debe verse u oírse.
   *
   * Es la parte que convierte «graba un vídeo» en un ejercicio evaluable. Sin
   * ella el estudiante no sabe a qué apuntar y quien corrige no tiene contra
   * qué comparar, así que la validación semántica la exige.
   */
  guidance: z.string().trim().max(500).optional(),
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
/**
 * Lo que se le exige a un enunciado que se responde grabando.
 *
 * El tipo no tiene solución que contrastar, así que la única forma de que la
 * pregunta sea corregible es que diga qué se espera ver u oír. Un modelo que
 * escribe «grábate un vídeo sobre el tema» ha producido algo sintácticamente
 * válido y pedagógicamente vacío, y eso es justo lo que esta capa filtra.
 */
function requireGuidance(question: AiQuestion): RuleViolation[] {
  return (question.guidance ?? '').trim().length >= 15
    ? []
    : [
        {
          rule: 'MISSING_GUIDANCE',
          message: 'Falta decir qué debe verse u oírse en la grabación',
        },
      ];
}

/** Una retroalimentación que no orienta no sirve: es lo único automático. */
function requireUsefulFeedback(question: AiQuestion): RuleViolation[] {
  return question.feedbackCorrect.trim().length >= 10
    ? []
    : [
        {
          rule: 'WEAK_FEEDBACK',
          message: 'La retroalimentación de una pregunta abierta debe orientar',
        },
      ];
}

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
  // recibirá automáticamente. Una respuesta larga se corrige igual.
  [QUESTION_TYPE.OPEN_TEXT]: requireUsefulFeedback,
  [QUESTION_TYPE.LONG_ANSWER]: requireUsefulFeedback,

  /*
   * El objetivo SMART no tiene nada estructural que validar: lo escribe el
   * estudiante y se puntúa con la rúbrica. Se enumera igualmente para que el
   * mapa siga completo y el compilador avise si mañana gana estructura.
   */
  [QUESTION_TYPE.SMART_GOAL]: () => [],

  [QUESTION_TYPE.SELFIE]: requireGuidance,
  [QUESTION_TYPE.VIDEO_RESPONSE]: requireGuidance,
  [QUESTION_TYPE.AUDIO_RESPONSE]: requireGuidance,
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

/** La indicación, solo si el modelo la escribió: el campo es opcional. */
function guidanceOf(question: AiQuestion): { guidance?: string } {
  return question.guidance ? { guidance: question.guidance } : {};
}

/** Identificadores de opción legibles: a, b, c... */
function optionId(index: number): string {
  return String.fromCharCode(97 + index);
}

function choicePayload(question: AiQuestion): QuestionPayload {
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
}

/**
 * El contenido interno de cada tipo, en una tabla.
 *
 * Una tabla y no un `switch`, por lo mismo que las reglas semánticas: cuando
 * la IA aprenda un tipo nuevo, olvidarse de traducirlo debe ser un error de
 * compilación. Con un `switch` el caso que falta cae en un retorno implícito y
 * la pregunta se guarda sin contenido.
 *
 * El modelo trabaja con una forma simple —opciones con texto y una marca de
 * correcta— y no tiene que acertar los identificadores internos: pedirle menos
 * precisión estructural produce mejores preguntas, y la estructura se arma
 * aquí.
 */
const PAYLOAD_BUILDERS: Record<AiQuestionType, (question: AiQuestion) => QuestionPayload> = {
  [QUESTION_TYPE.SINGLE_CHOICE]: choicePayload,
  [QUESTION_TYPE.MULTIPLE_CHOICE]: choicePayload,

  [QUESTION_TYPE.TRUE_FALSE]: (question) => ({
    kind: QUESTION_TYPE.TRUE_FALSE,
    correct: question.correctBoolean === true,
  }),

  [QUESTION_TYPE.SHORT_ANSWER]: (question) => ({
    kind: QUESTION_TYPE.SHORT_ANSWER,
    acceptedAnswers: question.acceptedAnswers ?? [],
    caseSensitive: false,
    ignoreAccents: true,
  }),

  [QUESTION_TYPE.OPEN_TEXT]: () => ({
    kind: QUESTION_TYPE.OPEN_TEXT,
    minWords: 30,
    maxWords: 300,
  }),

  [QUESTION_TYPE.LONG_ANSWER]: () => ({
    kind: QUESTION_TYPE.LONG_ANSWER,
    minWords: 120,
    maxWords: 800,
  }),

  [QUESTION_TYPE.SMART_GOAL]: () => ({
    kind: QUESTION_TYPE.SMART_GOAL,
    minChars: 80,
    showRubric: true,
  }),

  /*
   * Los tipos de captura son enunciado, indicación y un tope de duración.
   * El tope se deja en el máximo del tipo a propósito: el docente sabe si su
   * pregunta necesita menos, el modelo no, y quedarse corto obligaría a cortar
   * una explicación a medias.
   */
  [QUESTION_TYPE.SELFIE]: (question) => ({
    kind: QUESTION_TYPE.SELFIE,
    ...guidanceOf(question),
  }),

  [QUESTION_TYPE.VIDEO_RESPONSE]: (question) => ({
    kind: QUESTION_TYPE.VIDEO_RESPONSE,
    maxSeconds: MEDIA_MAX_SECONDS[QUESTION_TYPE.VIDEO_RESPONSE]!,
    ...guidanceOf(question),
  }),

  [QUESTION_TYPE.AUDIO_RESPONSE]: (question) => ({
    kind: QUESTION_TYPE.AUDIO_RESPONSE,
    maxSeconds: MEDIA_MAX_SECONDS[QUESTION_TYPE.AUDIO_RESPONSE]!,
    ...guidanceOf(question),
  }),

  [QUESTION_TYPE.ORDERING]: (question) => ({
    kind: QUESTION_TYPE.ORDERING,
    partialCredit: true,
    items: (question.orderedItems ?? []).map((text, index) => ({
      id: `i${index + 1}`,
      text,
      correctPosition: index,
    })),
  }),
};

export function toQuestionPayload(question: AiQuestion): QuestionPayload {
  return PAYLOAD_BUILDERS[question.type](question);
}

export function isAiSupportedType(type: QuestionType): type is AiQuestionType {
  return (AI_SUPPORTED_TYPES as readonly QuestionType[]).includes(type);
}
