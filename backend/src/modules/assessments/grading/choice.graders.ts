import { QUESTION_TYPE, type AnswerOf, type PayloadOf } from '@medienpass/shared';
import {
  EMPTY_OUTCOME,
  allOrNothing,
  partialPoints,
  type GradeOutcome,
  type Grader,
} from './types.js';

/**
 * Calificadores de la familia de opciones.
 *
 * La decisión de fondo en respuesta múltiple es cómo puntuar los aciertos
 * parciales. Se implementa el criterio habitual en evaluación: cuentan los
 * aciertos, restan los errores, y el resultado nunca baja de cero. Sin la
 * resta, marcar todas las opciones garantizaría la puntuación máxima, que es
 * el fallo clásico de este tipo de pregunta.
 */

export const singleChoiceGrader: Grader<typeof QUESTION_TYPE.SINGLE_CHOICE> = {
  type: QUESTION_TYPE.SINGLE_CHOICE,
  requiresManualGrading: false,

  grade(payload, answer, points): GradeOutcome {
    if (!answer.optionId) return EMPTY_OUTCOME;
    const chosen = payload.options.find((option) => option.id === answer.optionId);
    return allOrNothing(chosen?.correct === true, points);
  },
};

export const trueFalseGrader: Grader<typeof QUESTION_TYPE.TRUE_FALSE> = {
  type: QUESTION_TYPE.TRUE_FALSE,
  requiresManualGrading: false,

  grade(payload, answer, points): GradeOutcome {
    if (answer.value === null) return EMPTY_OUTCOME;
    return allOrNothing(answer.value === payload.correct, points);
  },
};

/**
 * Puntuación de respuesta múltiple.
 *
 * Compartida por `MULTIPLE_CHOICE` e `IMAGE_CHOICE`, que se diferencian en
 * cómo se presentan pero no en cómo se corrigen.
 */
function gradeMultipleSelection(
  options: ReadonlyArray<{ id: string; correct: boolean }>,
  selectedIds: readonly string[],
  points: number,
  settings: { partialCredit: boolean; penalizeIncorrect: boolean },
): GradeOutcome {
  if (selectedIds.length === 0) return EMPTY_OUTCOME;

  const selected = new Set(selectedIds);
  const correctIds = options.filter((option) => option.correct).map((option) => option.id);
  const totalCorrect = correctIds.length;

  const hits = correctIds.filter((id) => selected.has(id)).length;
  const misses = [...selected].filter(
    (id) => !correctIds.includes(id) && options.some((option) => option.id === id),
  ).length;

  const isFullyCorrect = hits === totalCorrect && misses === 0;

  if (!settings.partialCredit) {
    return allOrNothing(isFullyCorrect, points);
  }

  const effectiveHits = settings.penalizeIncorrect ? hits - misses : hits;

  return {
    pointsEarned: partialPoints(effectiveHits, totalCorrect, points),
    isCorrect: isFullyCorrect,
    requiresManualGrading: false,
  };
}

export const multipleChoiceGrader: Grader<typeof QUESTION_TYPE.MULTIPLE_CHOICE> = {
  type: QUESTION_TYPE.MULTIPLE_CHOICE,
  requiresManualGrading: false,

  grade(
    payload: PayloadOf<typeof QUESTION_TYPE.MULTIPLE_CHOICE>,
    answer: AnswerOf<typeof QUESTION_TYPE.MULTIPLE_CHOICE>,
    points: number,
  ): GradeOutcome {
    return gradeMultipleSelection(payload.options, answer.optionIds, points, {
      partialCredit: payload.partialCredit,
      penalizeIncorrect: payload.penalizeIncorrect,
    });
  },
};

export const imageChoiceGrader: Grader<typeof QUESTION_TYPE.IMAGE_CHOICE> = {
  type: QUESTION_TYPE.IMAGE_CHOICE,
  requiresManualGrading: false,

  grade(payload, answer, points): GradeOutcome {
    // Sin selección múltiple es una pregunta de respuesta única: marcar más de
    // una opción es, por definición, incorrecto.
    if (!payload.multiple) {
      if (answer.optionIds.length !== 1) return EMPTY_OUTCOME;
      const chosen = payload.options.find((option) => option.id === answer.optionIds[0]);
      return allOrNothing(chosen?.correct === true, points);
    }

    return gradeMultipleSelection(payload.options, answer.optionIds, points, {
      partialCredit: true,
      penalizeIncorrect: true,
    });
  },
};

export const hotspotGrader: Grader<typeof QUESTION_TYPE.HOTSPOT> = {
  type: QUESTION_TYPE.HOTSPOT,
  requiresManualGrading: false,

  grade(payload, answer, points): GradeOutcome {
    if (answer.regionIds.length === 0) return EMPTY_OUTCOME;

    if (!payload.multiple) {
      if (answer.regionIds.length !== 1) return EMPTY_OUTCOME;
      const region = payload.regions.find((candidate) => candidate.id === answer.regionIds[0]);
      return allOrNothing(region?.correct === true, points);
    }

    return gradeMultipleSelection(payload.regions, answer.regionIds, points, {
      partialCredit: true,
      penalizeIncorrect: true,
    });
  },
};
