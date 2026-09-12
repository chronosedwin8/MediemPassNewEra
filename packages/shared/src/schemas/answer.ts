import { z } from 'zod';
import { QUESTION_TYPE, type QuestionType } from '../enums.js';
import { MEDIA_MAX_SECONDS } from '../media.js';

/**
 * Respuestas del estudiante, una forma por tipo de pregunta.
 *
 * El servidor valida toda respuesta contra estos esquemas antes de guardarla,
 * incluso en el autoguardado: la especificación es explícita en que no se debe
 * confiar en los datos que envía el frontend. El frontend usa los mismos
 * esquemas para construir el estado local, de modo que el desajuste entre lo
 * que envía y lo que se espera es imposible por construcción.
 *
 * Toda respuesta admite estar "vacía": el estudiante puede dejar una pregunta
 * sin contestar y eso es un caso legítimo, no un error de validación.
 */

const optionId = z.string().trim().min(1).max(64);

const singleChoiceAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.SINGLE_CHOICE),
  optionId: optionId.nullable(),
});

const multipleChoiceAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.MULTIPLE_CHOICE),
  optionIds: z.array(optionId).max(12),
});

const trueFalseAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.TRUE_FALSE),
  value: z.boolean().nullable(),
});

const imageChoiceAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.IMAGE_CHOICE),
  optionIds: z.array(optionId).max(8),
});

const shortAnswerAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.SHORT_ANSWER),
  text: z.string().max(500),
});

const openTextAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.OPEN_TEXT),
  text: z.string().max(20000),
});

const longAnswerAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.LONG_ANSWER),
  text: z.string().max(50000),
});

/**
 * Respuestas de captura.
 *
 * Lo que se guarda no es el archivo sino su identificador: el vídeo ya viajó
 * a S3 por su propio camino —subida firmada y confirmación contra lo que hay
 * de verdad en el bucket— y meterlo aquí en base64 haría que cada
 * autoguardado arrastrara quince megas.
 *
 * `durationSeconds` es lo que el navegador dice haber grabado. Se guarda para
 * poder enseñarlo al corregir y se comprueba contra el tope del tipo, pero la
 * autoridad sobre el tamaño es el archivo que el servidor encuentra en S3, no
 * este número.
 */
const selfieAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.SELFIE),
  fileId: z.string().uuid().nullable(),
});

const videoResponseAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.VIDEO_RESPONSE),
  fileId: z.string().uuid().nullable(),
  durationSeconds: z.number().int().min(0).max(MEDIA_MAX_SECONDS.VIDEO_RESPONSE!).nullable(),
});

const audioResponseAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.AUDIO_RESPONSE),
  fileId: z.string().uuid().nullable(),
  durationSeconds: z.number().int().min(0).max(MEDIA_MAX_SECONDS.AUDIO_RESPONSE!).nullable(),
});

const fillBlankAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.FILL_BLANK),
  blanks: z.array(z.object({ id: optionId, text: z.string().max(300) })).max(20),
});

const matchingAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.MATCHING),
  pairs: z.array(z.object({ leftId: optionId, rightId: optionId })).max(12),
});

const groupingAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.GROUPING),
  assignments: z.array(z.object({ itemId: optionId, groupId: optionId })).max(40),
});

const orderingAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.ORDERING),
  /** Identificadores en el orden elegido por el estudiante. */
  order: z.array(optionId).max(20),
});

const timelineAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.TIMELINE),
  order: z.array(optionId).max(20),
});

const hotspotAnswer = z.object({
  kind: z.literal(QUESTION_TYPE.HOTSPOT),
  regionIds: z.array(optionId).max(20),
});

export const answerSchema = z.discriminatedUnion('kind', [
  singleChoiceAnswer,
  multipleChoiceAnswer,
  trueFalseAnswer,
  imageChoiceAnswer,
  shortAnswerAnswer,
  openTextAnswer,
  longAnswerAnswer,
  fillBlankAnswer,
  matchingAnswer,
  groupingAnswer,
  orderingAnswer,
  timelineAnswer,
  hotspotAnswer,
  selfieAnswer,
  videoResponseAnswer,
  audioResponseAnswer,
]);

export type Answer = z.infer<typeof answerSchema>;
export type AnswerOf<T extends QuestionType> = Extract<Answer, { kind: T }>;

export const ANSWER_SCHEMAS = {
  [QUESTION_TYPE.SINGLE_CHOICE]: singleChoiceAnswer,
  [QUESTION_TYPE.MULTIPLE_CHOICE]: multipleChoiceAnswer,
  [QUESTION_TYPE.TRUE_FALSE]: trueFalseAnswer,
  [QUESTION_TYPE.IMAGE_CHOICE]: imageChoiceAnswer,
  [QUESTION_TYPE.SHORT_ANSWER]: shortAnswerAnswer,
  [QUESTION_TYPE.OPEN_TEXT]: openTextAnswer,
  [QUESTION_TYPE.LONG_ANSWER]: longAnswerAnswer,
  [QUESTION_TYPE.FILL_BLANK]: fillBlankAnswer,
  [QUESTION_TYPE.MATCHING]: matchingAnswer,
  [QUESTION_TYPE.GROUPING]: groupingAnswer,
  [QUESTION_TYPE.ORDERING]: orderingAnswer,
  [QUESTION_TYPE.TIMELINE]: timelineAnswer,
  [QUESTION_TYPE.HOTSPOT]: hotspotAnswer,
  [QUESTION_TYPE.SELFIE]: selfieAnswer,
  [QUESTION_TYPE.VIDEO_RESPONSE]: videoResponseAnswer,
  [QUESTION_TYPE.AUDIO_RESPONSE]: audioResponseAnswer,
} as const;

export function parseAnswer(type: QuestionType, value: unknown): Answer {
  return ANSWER_SCHEMAS[type].parse(value) as Answer;
}

export function safeParseAnswer(
  type: QuestionType,
  value: unknown,
): z.SafeParseReturnType<unknown, Answer> {
  return ANSWER_SCHEMAS[type].safeParse(value) as z.SafeParseReturnType<unknown, Answer>;
}

/*
 * Los dos `switch` siguientes son exhaustivos sobre los trece tipos de
 * pregunta: es justamente lo que hace que TypeScript avise si mañana se añade
 * un tipo y alguien olvida contemplarlo aquí. La métrica de complejidad los
 * penaliza, pero partirlos en funciones sueltas perdería esa garantía.
 */
/* eslint-disable complexity */

/** Respuesta vacía inicial para cada tipo, usada por el runner del estudiante. */
export function emptyAnswer(type: QuestionType): Answer {
  switch (type) {
    case QUESTION_TYPE.SINGLE_CHOICE:
      return { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: null };
    case QUESTION_TYPE.MULTIPLE_CHOICE:
      return { kind: QUESTION_TYPE.MULTIPLE_CHOICE, optionIds: [] };
    case QUESTION_TYPE.TRUE_FALSE:
      return { kind: QUESTION_TYPE.TRUE_FALSE, value: null };
    case QUESTION_TYPE.IMAGE_CHOICE:
      return { kind: QUESTION_TYPE.IMAGE_CHOICE, optionIds: [] };
    case QUESTION_TYPE.SHORT_ANSWER:
      return { kind: QUESTION_TYPE.SHORT_ANSWER, text: '' };
    case QUESTION_TYPE.OPEN_TEXT:
      return { kind: QUESTION_TYPE.OPEN_TEXT, text: '' };
    case QUESTION_TYPE.LONG_ANSWER:
      return { kind: QUESTION_TYPE.LONG_ANSWER, text: '' };
    case QUESTION_TYPE.FILL_BLANK:
      return { kind: QUESTION_TYPE.FILL_BLANK, blanks: [] };
    case QUESTION_TYPE.MATCHING:
      return { kind: QUESTION_TYPE.MATCHING, pairs: [] };
    case QUESTION_TYPE.GROUPING:
      return { kind: QUESTION_TYPE.GROUPING, assignments: [] };
    case QUESTION_TYPE.ORDERING:
      return { kind: QUESTION_TYPE.ORDERING, order: [] };
    case QUESTION_TYPE.TIMELINE:
      return { kind: QUESTION_TYPE.TIMELINE, order: [] };
    case QUESTION_TYPE.HOTSPOT:
      return { kind: QUESTION_TYPE.HOTSPOT, regionIds: [] };
    case QUESTION_TYPE.SELFIE:
      return { kind: QUESTION_TYPE.SELFIE, fileId: null };
    case QUESTION_TYPE.VIDEO_RESPONSE:
      return { kind: QUESTION_TYPE.VIDEO_RESPONSE, fileId: null, durationSeconds: null };
    case QUESTION_TYPE.AUDIO_RESPONSE:
      return { kind: QUESTION_TYPE.AUDIO_RESPONSE, fileId: null, durationSeconds: null };
  }
}

/** `true` cuando el estudiante no ha aportado contenido alguno. */
export function isAnswerEmpty(answer: Answer): boolean {
  switch (answer.kind) {
    case QUESTION_TYPE.SINGLE_CHOICE:
      return answer.optionId === null;
    case QUESTION_TYPE.MULTIPLE_CHOICE:
    case QUESTION_TYPE.IMAGE_CHOICE:
      return answer.optionIds.length === 0;
    case QUESTION_TYPE.TRUE_FALSE:
      return answer.value === null;
    case QUESTION_TYPE.SHORT_ANSWER:
    case QUESTION_TYPE.OPEN_TEXT:
    case QUESTION_TYPE.LONG_ANSWER:
      return answer.text.trim().length === 0;
    case QUESTION_TYPE.FILL_BLANK:
      return answer.blanks.every((blank) => blank.text.trim().length === 0);
    case QUESTION_TYPE.MATCHING:
      return answer.pairs.length === 0;
    case QUESTION_TYPE.GROUPING:
      return answer.assignments.length === 0;
    case QUESTION_TYPE.ORDERING:
    case QUESTION_TYPE.TIMELINE:
      return answer.order.length === 0;
    case QUESTION_TYPE.HOTSPOT:
      return answer.regionIds.length === 0;
    // Sin archivo no hay respuesta: el enunciado pedía una grabación.
    case QUESTION_TYPE.SELFIE:
    case QUESTION_TYPE.VIDEO_RESPONSE:
    case QUESTION_TYPE.AUDIO_RESPONSE:
      return answer.fileId === null;
  }
}
/* eslint-enable complexity */
