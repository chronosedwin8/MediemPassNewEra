import { QUESTION_TYPE } from '@medienpass/shared';
import {
  EMPTY_OUTCOME,
  allOrNothing,
  partialPoints,
  type GradeOutcome,
  type Grader,
} from './types.js';

/**
 * Calificadores de relación, agrupación y orden.
 *
 * Todos reparten puntos por elemento acertado cuando el docente lo permite:
 * ordenar bien cuatro de cinco hitos demuestra más que ordenar bien uno, y una
 * puntuación de todo o nada perdería esa información.
 */

export const matchingGrader: Grader<typeof QUESTION_TYPE.MATCHING> = {
  type: QUESTION_TYPE.MATCHING,
  requiresManualGrading: false,

  grade(payload, answer, points): GradeOutcome {
    if (answer.pairs.length === 0) return EMPTY_OUTCOME;

    const expected = new Map(payload.pairs.map((pair) => [pair.leftId, pair.rightId]));
    const given = new Map(answer.pairs.map((pair) => [pair.leftId, pair.rightId]));

    let hits = 0;
    for (const [leftId, rightId] of expected) {
      if (given.get(leftId) === rightId) hits += 1;
    }

    const isCorrect = hits === expected.size && given.size === expected.size;

    return payload.partialCredit
      ? {
          pointsEarned: partialPoints(hits, expected.size, points),
          isCorrect,
          requiresManualGrading: false,
        }
      : allOrNothing(isCorrect, points);
  },
};

export const groupingGrader: Grader<typeof QUESTION_TYPE.GROUPING> = {
  type: QUESTION_TYPE.GROUPING,
  requiresManualGrading: false,

  grade(payload, answer, points): GradeOutcome {
    if (answer.assignments.length === 0) return EMPTY_OUTCOME;

    const expected = new Map(payload.items.map((item) => [item.id, item.groupId]));
    const given = new Map(
      answer.assignments.map((assignment) => [assignment.itemId, assignment.groupId]),
    );

    let hits = 0;
    for (const [itemId, groupId] of expected) {
      if (given.get(itemId) === groupId) hits += 1;
    }

    const isCorrect = hits === expected.size;

    return payload.partialCredit
      ? {
          pointsEarned: partialPoints(hits, expected.size, points),
          isCorrect,
          requiresManualGrading: false,
        }
      : allOrNothing(isCorrect, points);
  },
};

/**
 * Puntuación de una secuencia ordenada.
 *
 * Se cuenta cuántos elementos quedaron en su posición correcta. Compartida por
 * `ORDERING` y `TIMELINE`, que son el mismo ejercicio: la línea de tiempo se
 * mantiene como tipo propio por su valor pedagógico y porque la interfaz la
 * presenta de otra manera, pero corregirla dos veces sería duplicar lógica.
 */
function gradeSequence(
  items: ReadonlyArray<{ id: string; correctPosition: number }>,
  order: readonly string[],
  points: number,
  partialCredit: boolean,
): GradeOutcome {
  if (order.length === 0) return EMPTY_OUTCOME;

  const expected = new Map(items.map((item) => [item.id, item.correctPosition]));

  let hits = 0;
  order.forEach((id, index) => {
    if (expected.get(id) === index) hits += 1;
  });

  const isCorrect = hits === items.length && order.length === items.length;

  return partialCredit
    ? {
        pointsEarned: partialPoints(hits, items.length, points),
        isCorrect,
        requiresManualGrading: false,
      }
    : allOrNothing(isCorrect, points);
}

export const orderingGrader: Grader<typeof QUESTION_TYPE.ORDERING> = {
  type: QUESTION_TYPE.ORDERING,
  requiresManualGrading: false,
  grade: (payload, answer, points) =>
    gradeSequence(payload.items, answer.order, points, payload.partialCredit),
};

export const timelineGrader: Grader<typeof QUESTION_TYPE.TIMELINE> = {
  type: QUESTION_TYPE.TIMELINE,
  requiresManualGrading: false,
  grade: (payload, answer, points) =>
    gradeSequence(payload.items, answer.order, points, payload.partialCredit),
};
