import { z } from 'zod';
import { QUESTION_TYPE, type QuestionType } from '../enums.js';

/**
 * Contenido específico de cada tipo de pregunta.
 *
 * Es la mitad JSONB del modelo híbrido: lo que se consulta y se agrega
 * (puntos, orden, dificultad, competencia) está normalizado en columnas; lo
 * que solo se lee al renderizar y al calificar vive aquí, validado por un
 * esquema propio de cada tipo.
 *
 * La validación tiene dos capas deliberadamente separadas:
 *
 *  1. **Estructura** (`...Base`): forma y tipos. Es lo que compone la unión
 *     discriminada, que exige objetos planos.
 *  2. **Reglas pedagógicas** (`QUESTION_PAYLOAD_SCHEMAS`): que una pregunta de
 *     respuesta única tenga exactamente una correcta, que los pares apunten a
 *     elementos existentes, que las posiciones de un ordenamiento sean
 *     consecutivas. Separarlas permite además responder con un código de error
 *     específico —`QUESTION_HAS_NO_CORRECT_ANSWER`— en vez de un genérico
 *     fallo de validación.
 *
 * Añadir un tipo nuevo es: registrar su código en `enums.ts`, añadir aquí su
 * esquema y su calificador en el backend. Las evaluaciones ya publicadas no se
 * ven afectadas, porque cada versión es inmutable.
 */

const optionId = z.string().trim().min(1).max(64);
const richText = z.string().trim().min(1).max(5000);

// =============================================================================
// Estructura
// =============================================================================

const choiceOption = z.object({
  id: optionId,
  text: richText,
  correct: z.boolean(),
  /** Retroalimentación específica de esta opción, opcional. */
  feedback: z.string().trim().max(1000).optional(),
});

const singleChoiceBase = z.object({
  kind: z.literal(QUESTION_TYPE.SINGLE_CHOICE),
  options: z.array(choiceOption).min(2).max(12),
});

const multipleChoiceBase = z.object({
  kind: z.literal(QUESTION_TYPE.MULTIPLE_CHOICE),
  options: z.array(choiceOption).min(2).max(12),
  /** Reparte los puntos de forma proporcional a los aciertos. */
  partialCredit: z.boolean().default(true),
  /** Descuenta por cada opción incorrecta marcada (nunca baja de cero). */
  penalizeIncorrect: z.boolean().default(true),
});

const trueFalseBase = z.object({
  kind: z.literal(QUESTION_TYPE.TRUE_FALSE),
  correct: z.boolean(),
});

const imageChoiceBase = z.object({
  kind: z.literal(QUESTION_TYPE.IMAGE_CHOICE),
  options: z
    .array(
      z.object({
        id: optionId,
        imageUrl: z.string().trim().min(1).max(1000),
        /** Obligatorio: sin texto alternativo la pregunta es inaccesible. */
        alt: z.string().trim().min(1).max(300),
        label: z.string().trim().max(200).optional(),
        correct: z.boolean(),
      }),
    )
    .min(2)
    .max(8),
  multiple: z.boolean().default(false),
});

const shortAnswerBase = z.object({
  kind: z.literal(QUESTION_TYPE.SHORT_ANSWER),
  /** Todas las formas admitidas como correctas. */
  acceptedAnswers: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
  caseSensitive: z.boolean().default(false),
  /** Ignora tildes al comparar, útil en evaluaciones de idiomas. */
  ignoreAccents: z.boolean().default(true),
});

const openTextBase = z.object({
  kind: z.literal(QUESTION_TYPE.OPEN_TEXT),
  minWords: z.number().int().min(0).max(5000).optional(),
  maxWords: z.number().int().min(1).max(5000).optional(),
  /** Criterios que ve el docente al calificar a mano. */
  rubric: z.string().trim().max(3000).optional(),
});

const longAnswerBase = z.object({
  kind: z.literal(QUESTION_TYPE.LONG_ANSWER),
  minWords: z.number().int().min(0).max(5000).optional(),
  maxWords: z.number().int().min(1).max(5000).optional(),
  rubric: z.string().trim().max(3000).optional(),
});

const fillBlankBase = z.object({
  kind: z.literal(QUESTION_TYPE.FILL_BLANK),
  /** Texto con marcadores `{{id}}` en el lugar de cada hueco. */
  template: z.string().trim().min(1).max(5000),
  blanks: z
    .array(
      z.object({
        id: optionId,
        acceptedAnswers: z.array(z.string().trim().min(1).max(200)).min(1).max(10),
        caseSensitive: z.boolean().default(false),
        ignoreAccents: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(20),
});

const matchingBase = z.object({
  kind: z.literal(QUESTION_TYPE.MATCHING),
  left: z.array(z.object({ id: optionId, text: richText })).min(2).max(12),
  right: z.array(z.object({ id: optionId, text: richText })).min(2).max(12),
  pairs: z.array(z.object({ leftId: optionId, rightId: optionId })).min(1),
  partialCredit: z.boolean().default(true),
});

const groupingBase = z.object({
  kind: z.literal(QUESTION_TYPE.GROUPING),
  groups: z.array(z.object({ id: optionId, label: richText })).min(2).max(8),
  items: z.array(z.object({ id: optionId, text: richText, groupId: optionId })).min(2).max(40),
  partialCredit: z.boolean().default(true),
});

const orderingBase = z.object({
  kind: z.literal(QUESTION_TYPE.ORDERING),
  items: z
    .array(
      z.object({
        id: optionId,
        text: richText,
        /** Posición correcta, empezando en 0. */
        correctPosition: z.number().int().min(0).max(50),
      }),
    )
    .min(2)
    .max(20),
  partialCredit: z.boolean().default(true),
});

/**
 * Línea de tiempo: es un ordenamiento con etiqueta temporal. Comparte el
 * calificador con `ORDERING`; se mantiene como tipo propio por su valor
 * pedagógico y porque la interfaz lo presenta de otra manera.
 */
const timelineBase = z.object({
  kind: z.literal(QUESTION_TYPE.TIMELINE),
  items: z
    .array(
      z.object({
        id: optionId,
        text: richText,
        correctPosition: z.number().int().min(0).max(50),
        /** Etiqueta temporal mostrada tras responder ("1969", "siglo XIX"). */
        dateLabel: z.string().trim().max(100).optional(),
      }),
    )
    .min(2)
    .max(20),
  partialCredit: z.boolean().default(true),
});

const hotspotBase = z.object({
  kind: z.literal(QUESTION_TYPE.HOTSPOT),
  imageUrl: z.string().trim().min(1).max(1000),
  alt: z.string().trim().min(1).max(300),
  regions: z
    .array(
      z.object({
        id: optionId,
        label: z.string().trim().max(200),
        shape: z.enum(['rect', 'circle']),
        /** Coordenadas en porcentaje, para no depender del tamaño de la imagen. */
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
        width: z.number().min(0).max(100).optional(),
        height: z.number().min(0).max(100).optional(),
        radius: z.number().min(0).max(100).optional(),
        correct: z.boolean(),
      }),
    )
    .min(1)
    .max(20),
  multiple: z.boolean().default(false),
});

/** Unión estructural. No comprueba reglas pedagógicas. */
export const questionPayloadSchema = z.discriminatedUnion('kind', [
  singleChoiceBase,
  multipleChoiceBase,
  trueFalseBase,
  imageChoiceBase,
  shortAnswerBase,
  openTextBase,
  longAnswerBase,
  fillBlankBase,
  matchingBase,
  groupingBase,
  orderingBase,
  timelineBase,
  hotspotBase,
]);

export type QuestionPayload = z.infer<typeof questionPayloadSchema>;
export type PayloadOf<T extends QuestionType> = Extract<QuestionPayload, { kind: T }>;

// =============================================================================
// Reglas pedagógicas
// =============================================================================

function uniqueIds(items: Array<{ id: string }>): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

function hasContiguousPositions(items: Array<{ correctPosition: number }>): boolean {
  const positions = items.map((item) => item.correctPosition).sort((a, b) => a - b);
  return positions.every((position, index) => position === index);
}

const singleChoicePayload = singleChoiceBase
  .refine((payload) => uniqueIds(payload.options), {
    message: 'Los identificadores de las opciones deben ser únicos',
    path: ['options'],
  })
  .refine((payload) => payload.options.filter((option) => option.correct).length === 1, {
    message: 'Una pregunta de respuesta única debe tener exactamente una opción correcta',
    path: ['options'],
  });

const multipleChoicePayload = multipleChoiceBase
  .refine((payload) => uniqueIds(payload.options), {
    message: 'Los identificadores de las opciones deben ser únicos',
    path: ['options'],
  })
  .refine((payload) => payload.options.some((option) => option.correct), {
    message: 'Una pregunta de respuesta múltiple necesita al menos una opción correcta',
    path: ['options'],
  })
  .refine((payload) => payload.options.some((option) => !option.correct), {
    message: 'Si todas las opciones son correctas la pregunta no discrimina nada',
    path: ['options'],
  });

const imageChoicePayload = imageChoiceBase
  .refine((payload) => uniqueIds(payload.options), {
    message: 'Los identificadores de las imágenes deben ser únicos',
    path: ['options'],
  })
  .refine((payload) => payload.options.some((option) => option.correct), {
    message: 'Debe haber al menos una imagen correcta',
    path: ['options'],
  })
  .refine(
    (payload) => payload.multiple || payload.options.filter((option) => option.correct).length === 1,
    {
      message: 'Sin selección múltiple solo puede haber una imagen correcta',
      path: ['options'],
    },
  );

const openTextPayload = openTextBase.refine(
  (payload) => payload.minWords === undefined || payload.maxWords === undefined || payload.minWords <= payload.maxWords,
  { message: 'El mínimo de palabras no puede superar al máximo', path: ['minWords'] },
);

const longAnswerPayload = longAnswerBase.refine(
  (payload) => payload.minWords === undefined || payload.maxWords === undefined || payload.minWords <= payload.maxWords,
  { message: 'El mínimo de palabras no puede superar al máximo', path: ['minWords'] },
);

const fillBlankPayload = fillBlankBase
  .refine((payload) => uniqueIds(payload.blanks), {
    message: 'Los identificadores de los huecos deben ser únicos',
    path: ['blanks'],
  })
  .superRefine((payload, ctx) => {
    for (const blank of payload.blanks) {
      if (!payload.template.includes(`{{${blank.id}}}`)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['template'],
          message: `El texto no contiene el marcador {{${blank.id}}}`,
        });
      }
    }
  });

const matchingPayload = matchingBase
  .refine((payload) => uniqueIds(payload.left) && uniqueIds(payload.right), {
    message: 'Los identificadores de cada columna deben ser únicos',
    path: ['left'],
  })
  .superRefine((payload, ctx) => {
    const leftIds = new Set(payload.left.map((item) => item.id));
    const rightIds = new Set(payload.right.map((item) => item.id));
    for (const pair of payload.pairs) {
      if (!leftIds.has(pair.leftId) || !rightIds.has(pair.rightId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pairs'],
          message: `El par ${pair.leftId}→${pair.rightId} referencia un elemento inexistente`,
        });
      }
    }
  });

const groupingPayload = groupingBase
  .refine((payload) => uniqueIds(payload.groups) && uniqueIds(payload.items), {
    message: 'Los identificadores de grupos y elementos deben ser únicos',
    path: ['items'],
  })
  .superRefine((payload, ctx) => {
    const groupIds = new Set(payload.groups.map((group) => group.id));
    for (const item of payload.items) {
      if (!groupIds.has(item.groupId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items'],
          message: `El elemento ${item.id} apunta a un grupo inexistente`,
        });
      }
    }
  });

const orderingPayload = orderingBase
  .refine((payload) => uniqueIds(payload.items), {
    message: 'Los identificadores de los elementos deben ser únicos',
    path: ['items'],
  })
  .refine((payload) => hasContiguousPositions(payload.items), {
    message: 'Las posiciones correctas deben ser consecutivas empezando en 0',
    path: ['items'],
  });

const timelinePayload = timelineBase
  .refine((payload) => uniqueIds(payload.items), {
    message: 'Los identificadores de los hitos deben ser únicos',
    path: ['items'],
  })
  .refine((payload) => hasContiguousPositions(payload.items), {
    message: 'Las posiciones correctas deben ser consecutivas empezando en 0',
    path: ['items'],
  });

const hotspotPayload = hotspotBase
  .refine((payload) => uniqueIds(payload.regions), {
    message: 'Los identificadores de las zonas deben ser únicos',
    path: ['regions'],
  })
  .refine((payload) => payload.regions.some((region) => region.correct), {
    message: 'Debe haber al menos una zona correcta',
    path: ['regions'],
  })
  .superRefine((payload, ctx) => {
    for (const region of payload.regions) {
      const missing =
        region.shape === 'rect'
          ? region.width === undefined || region.height === undefined
          : region.radius === undefined;
      if (missing) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['regions'],
          message: `La zona ${region.id} no define las medidas propias de su forma`,
        });
      }
    }
  });

/**
 * Esquema completo por tipo: estructura más reglas pedagógicas. Es el que se
 * usa para validar antes de guardar una pregunta.
 */
export const QUESTION_PAYLOAD_SCHEMAS = {
  [QUESTION_TYPE.SINGLE_CHOICE]: singleChoicePayload,
  [QUESTION_TYPE.MULTIPLE_CHOICE]: multipleChoicePayload,
  [QUESTION_TYPE.TRUE_FALSE]: trueFalseBase,
  [QUESTION_TYPE.IMAGE_CHOICE]: imageChoicePayload,
  [QUESTION_TYPE.SHORT_ANSWER]: shortAnswerBase,
  [QUESTION_TYPE.OPEN_TEXT]: openTextPayload,
  [QUESTION_TYPE.LONG_ANSWER]: longAnswerPayload,
  [QUESTION_TYPE.FILL_BLANK]: fillBlankPayload,
  [QUESTION_TYPE.MATCHING]: matchingPayload,
  [QUESTION_TYPE.GROUPING]: groupingPayload,
  [QUESTION_TYPE.ORDERING]: orderingPayload,
  [QUESTION_TYPE.TIMELINE]: timelinePayload,
  [QUESTION_TYPE.HOTSPOT]: hotspotPayload,
} as const;

/**
 * Valida el contenido contra el esquema del tipo declarado en la columna.
 * Un `payload` cuyo `kind` no coincida con el tipo pasaría la unión pero
 * rompería el calificador, así que se comprueba explícitamente.
 */
export function parseQuestionPayload(type: QuestionType, payload: unknown): QuestionPayload {
  return QUESTION_PAYLOAD_SCHEMAS[type].parse(payload) as QuestionPayload;
}

export function safeParseQuestionPayload(
  type: QuestionType,
  payload: unknown,
): z.SafeParseReturnType<unknown, QuestionPayload> {
  return QUESTION_PAYLOAD_SCHEMAS[type].safeParse(payload) as z.SafeParseReturnType<
    unknown,
    QuestionPayload
  >;
}
