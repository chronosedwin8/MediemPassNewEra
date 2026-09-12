import { QUESTION_TYPE, type QuestionType } from '@medienpass/shared';

/**
 * Qué editor corresponde a cada tipo de pregunta.
 *
 * Vive fuera del componente porque es una tabla de decisión, no interfaz:
 * añadir un tipo es añadirlo a su familia, y tenerlo aquí deja el editor
 * ocupándose de lo suyo, que es el formulario.
 */

/** Opciones marcables: una, varias, verdadero/falso o imágenes. */
export const CHOICE_FAMILY: QuestionType[] = [
  QUESTION_TYPE.SINGLE_CHOICE,
  QUESTION_TYPE.MULTIPLE_CHOICE,
  QUESTION_TYPE.TRUE_FALSE,
  QUESTION_TYPE.IMAGE_CHOICE,
];

/** Todo lo que se edita como listas: textos, órdenes, parejas y grupos. */
export const LIST_FAMILY: QuestionType[] = [
  QUESTION_TYPE.SHORT_ANSWER,
  QUESTION_TYPE.OPEN_TEXT,
  QUESTION_TYPE.LONG_ANSWER,
  QUESTION_TYPE.ORDERING,
  QUESTION_TYPE.TIMELINE,
  QUESTION_TYPE.MATCHING,
  QUESTION_TYPE.GROUPING,
  QUESTION_TYPE.FILL_BLANK,
];

/** Foto, vídeo y nota de voz: el enunciado es la consigna y poco más. */
export const MEDIA_FAMILY: QuestionType[] = [
  QUESTION_TYPE.SELFIE,
  QUESTION_TYPE.VIDEO_RESPONSE,
  QUESTION_TYPE.AUDIO_RESPONSE,
];
