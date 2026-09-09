import type { Answer, AnswerOf, PayloadOf, QuestionType } from '@medienpass/shared';

/**
 * Contrato de los calificadores.
 *
 * Un calificador es una función pura: recibe el contenido de la pregunta, la
 * respuesta del estudiante y los puntos en juego, y devuelve cuántos puntos
 * corresponden. No consulta la base, no conoce Express y no sabe qué intento
 * está corrigiendo, lo que lo hace trivial de probar y reutilizable desde
 * cualquier sitio.
 *
 * Añadir un tipo de pregunta es: registrar su código en `enums.ts`, añadir su
 * esquema de contenido y de respuesta en el paquete compartido, e implementar
 * un calificador aquí. Las evaluaciones ya publicadas no se ven afectadas,
 * porque sus versiones son inmutables y siguen usando el calificador de su
 * propio tipo.
 */

export interface GradeOutcome {
  /** Puntos obtenidos. Nunca negativo, nunca superior a los puntos en juego. */
  pointsEarned: number;
  /**
   * `true` si la respuesta es enteramente correcta, `false` si no lo es,
   * `null` cuando la corrección depende de un criterio humano.
   */
  isCorrect: boolean | null;
  requiresManualGrading: boolean;
}

export interface Grader<T extends QuestionType = QuestionType> {
  readonly type: T;
  /** Los tipos abiertos no se pueden calificar solos. */
  readonly requiresManualGrading: boolean;
  grade(payload: PayloadOf<T>, answer: AnswerOf<T>, points: number): GradeOutcome;
}

/** Resultado de una pregunta que el estudiante dejó en blanco. */
export const EMPTY_OUTCOME: GradeOutcome = {
  pointsEarned: 0,
  isCorrect: false,
  requiresManualGrading: false,
};

/** Resultado de una pregunta que espera la corrección del docente. */
export const PENDING_MANUAL_OUTCOME: GradeOutcome = {
  pointsEarned: 0,
  isCorrect: null,
  requiresManualGrading: true,
};

/**
 * Reparte puntos de forma proporcional.
 *
 * Se acota entre 0 y el total, y se redondea a dos decimales: sin el
 * redondeo, sumar tercios de punto produce totales como 7.199999999999999,
 * que acaban apareciendo tal cual en un boletín.
 */
export function partialPoints(correct: number, total: number, points: number): number {
  if (total <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, correct / total));
  return Math.round(ratio * points * 100) / 100;
}

export function allOrNothing(isCorrect: boolean, points: number): GradeOutcome {
  return {
    pointsEarned: isCorrect ? points : 0,
    isCorrect,
    requiresManualGrading: false,
  };
}

/** Normaliza texto para comparar respuestas escritas por una persona. */
export function normalizeText(
  value: string,
  options: { caseSensitive: boolean; ignoreAccents: boolean },
): string {
  let result = value.trim().replace(/\s+/g, ' ');
  if (!options.caseSensitive) result = result.toLocaleLowerCase('es');
  if (options.ignoreAccents) {
    result = result.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  return result;
}

export type AnyAnswer = Answer;
