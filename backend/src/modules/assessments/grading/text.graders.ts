import { QUESTION_TYPE } from '@medienpass/shared';
import {
  EMPTY_OUTCOME,
  PENDING_MANUAL_OUTCOME,
  allOrNothing,
  normalizeText,
  partialPoints,
  type GradeOutcome,
  type Grader,
} from './types.js';

/**
 * Calificadores de la familia de texto.
 *
 * Los de respuesta corta y huecos comparan contra una lista de formas
 * aceptadas, con normalización configurable de mayúsculas y tildes: en una
 * evaluación de matemáticas «Función» y «funcion» son la misma respuesta, pero
 * en una de alemán la diferencia entre «schon» y «schön» sí importa, y por eso
 * es el docente quien decide.
 *
 * Los de respuesta abierta no se corrigen solos. Se marcan como pendientes de
 * revisión: inventar una nota automática para un texto libre sería peor que no
 * dar ninguna.
 */

export const shortAnswerGrader: Grader<typeof QUESTION_TYPE.SHORT_ANSWER> = {
  type: QUESTION_TYPE.SHORT_ANSWER,
  requiresManualGrading: false,

  grade(payload, answer, points): GradeOutcome {
    if (answer.text.trim().length === 0) return EMPTY_OUTCOME;

    const options = { caseSensitive: payload.caseSensitive, ignoreAccents: payload.ignoreAccents };
    const given = normalizeText(answer.text, options);
    const accepted = payload.acceptedAnswers.map((value) => normalizeText(value, options));

    return allOrNothing(accepted.includes(given), points);
  },
};

export const fillBlankGrader: Grader<typeof QUESTION_TYPE.FILL_BLANK> = {
  type: QUESTION_TYPE.FILL_BLANK,
  requiresManualGrading: false,

  grade(payload, answer, points): GradeOutcome {
    if (answer.blanks.length === 0) return EMPTY_OUTCOME;

    const given = new Map(answer.blanks.map((blank) => [blank.id, blank.text]));
    let hits = 0;

    for (const blank of payload.blanks) {
      const text = given.get(blank.id);
      if (!text || text.trim().length === 0) continue;

      const options = { caseSensitive: blank.caseSensitive, ignoreAccents: blank.ignoreAccents };
      const normalized = normalizeText(text, options);
      const accepted = blank.acceptedAnswers.map((value) => normalizeText(value, options));

      if (accepted.includes(normalized)) hits += 1;
    }

    // Cada hueco puntúa por separado: acertar tres de cuatro debe valer más
    // que acertar uno, aunque la respuesta no sea perfecta.
    return {
      pointsEarned: partialPoints(hits, payload.blanks.length, points),
      isCorrect: hits === payload.blanks.length,
      requiresManualGrading: false,
    };
  },
};

/**
 * Respuestas abiertas.
 *
 * `OPEN_TEXT` y `LONG_ANSWER` comparten comportamiento: el motor las deja
 * pendientes y el intento queda en `PENDING_REVIEW` hasta que el docente las
 * puntúa. Solo se distingue el caso de la respuesta vacía, que sí se puede
 * calificar sin intervención: cero.
 */
function gradeOpenAnswer(text: string): GradeOutcome {
  if (text.trim().length === 0) return EMPTY_OUTCOME;
  return PENDING_MANUAL_OUTCOME;
}

export const openTextGrader: Grader<typeof QUESTION_TYPE.OPEN_TEXT> = {
  type: QUESTION_TYPE.OPEN_TEXT,
  requiresManualGrading: true,
  grade: (_payload, answer): GradeOutcome => gradeOpenAnswer(answer.text),
};

export const longAnswerGrader: Grader<typeof QUESTION_TYPE.LONG_ANSWER> = {
  type: QUESTION_TYPE.LONG_ANSWER,
  requiresManualGrading: true,
  grade: (_payload, answer): GradeOutcome => gradeOpenAnswer(answer.text),
};

/**
 * Objetivo SMART.
 *
 * Se comporta como una redacción: el motor no puede decidir si un objetivo
 * está bien formulado, así que lo deja pendiente y alguien lo puntúa con la
 * rúbrica de cinco dimensiones. Lo único automático sigue siendo el campo
 * vacío, que vale cero sin necesidad de que nadie lo lea.
 */
export const smartGoalGrader: Grader<typeof QUESTION_TYPE.SMART_GOAL> = {
  type: QUESTION_TYPE.SMART_GOAL,
  requiresManualGrading: true,
  grade: (_payload, answer): GradeOutcome => gradeOpenAnswer(answer.text),
};
