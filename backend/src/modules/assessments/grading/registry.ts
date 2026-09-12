import {
  ERROR_CODE,
  QUESTION_TYPE,
  isAnswerEmpty,
  safeParseAnswer,
  safeParseQuestionPayload,
  type Answer,
  type QuestionType,
} from '@medienpass/shared';
import { AppError } from '../../../shared/errors/app-error.js';
import {
  hotspotGrader,
  imageChoiceGrader,
  multipleChoiceGrader,
  singleChoiceGrader,
  trueFalseGrader,
} from './choice.graders.js';
import {
  fillBlankGrader,
  longAnswerGrader,
  openTextGrader,
  shortAnswerGrader,
} from './text.graders.js';
import {
  groupingGrader,
  matchingGrader,
  orderingGrader,
  timelineGrader,
} from './relation.graders.js';
import { audioResponseGrader, selfieGrader, videoResponseGrader } from './media.graders.js';
import { EMPTY_OUTCOME, type GradeOutcome, type Grader } from './types.js';

/**
 * Registro de calificadores.
 *
 * Un único punto donde se resuelve qué calificador corresponde a cada tipo. El
 * registro está tipado como un mapa completo sobre `QuestionType`, de modo que
 * añadir un tipo nuevo al enum sin implementar su calificador es un error de
 * compilación, no una sorpresa en producción cuando alguien intente entregar
 * una evaluación.
 */
const GRADERS: { [T in QuestionType]: Grader<T> } = {
  [QUESTION_TYPE.SINGLE_CHOICE]: singleChoiceGrader,
  [QUESTION_TYPE.MULTIPLE_CHOICE]: multipleChoiceGrader,
  [QUESTION_TYPE.TRUE_FALSE]: trueFalseGrader,
  [QUESTION_TYPE.IMAGE_CHOICE]: imageChoiceGrader,
  [QUESTION_TYPE.HOTSPOT]: hotspotGrader,
  [QUESTION_TYPE.SHORT_ANSWER]: shortAnswerGrader,
  [QUESTION_TYPE.FILL_BLANK]: fillBlankGrader,
  [QUESTION_TYPE.OPEN_TEXT]: openTextGrader,
  [QUESTION_TYPE.LONG_ANSWER]: longAnswerGrader,
  [QUESTION_TYPE.MATCHING]: matchingGrader,
  [QUESTION_TYPE.GROUPING]: groupingGrader,
  [QUESTION_TYPE.ORDERING]: orderingGrader,
  [QUESTION_TYPE.TIMELINE]: timelineGrader,
  [QUESTION_TYPE.SELFIE]: selfieGrader,
  [QUESTION_TYPE.VIDEO_RESPONSE]: videoResponseGrader,
  [QUESTION_TYPE.AUDIO_RESPONSE]: audioResponseGrader,
};

export function getGrader<T extends QuestionType>(type: T): Grader<T> {
  return GRADERS[type];
}

export function requiresManualGrading(type: QuestionType): boolean {
  return GRADERS[type].requiresManualGrading;
}

/**
 * Califica una respuesta.
 *
 * Valida el contenido de la pregunta y la respuesta antes de puntuar. Es
 * deliberadamente estricto con el contenido —una pregunta guardada con un
 * `payload` inválido es un defecto que hay que ver— y deliberadamente
 * indulgente con la respuesta: si lo que envió el estudiante no encaja con el
 * tipo, se puntúa como no contestada en lugar de reventar la entrega y
 * hacerle perder el intento entero.
 */
export function gradeAnswer(
  type: QuestionType,
  rawPayload: unknown,
  rawAnswer: unknown,
  points: number,
): GradeOutcome {
  const payload = safeParseQuestionPayload(type, rawPayload);
  if (!payload.success) {
    throw new AppError(
      ERROR_CODE.QUESTION_PAYLOAD_INVALID,
      `Stored payload for a ${type} question is invalid`,
      { details: { type, issues: payload.error.issues.slice(0, 3) } },
    );
  }

  if (rawAnswer === null || rawAnswer === undefined) return EMPTY_OUTCOME;

  const answer = safeParseAnswer(type, rawAnswer);
  if (!answer.success) return EMPTY_OUTCOME;

  if (isAnswerEmpty(answer.data as Answer)) {
    // Una respuesta vacía a una pregunta abierta se puntúa con cero sin
    // esperar al docente: no hay nada que valorar.
    return EMPTY_OUTCOME;
  }

  const grader = GRADERS[type] as Grader<QuestionType>;
  const outcome = grader.grade(payload.data as never, answer.data as never, points);

  // Salvaguarda final: ningún calificador debe poder devolver puntos
  // negativos ni superiores a los que la pregunta vale.
  return {
    ...outcome,
    pointsEarned: Math.max(0, Math.min(points, outcome.pointsEarned)),
  };
}
