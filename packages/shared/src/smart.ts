/**
 * Rúbrica SMART.
 *
 * SMART no es un criterio de evaluación: es un marco para **formular**
 * objetivos. Dejarlo como definición dentro de una plataforma de evaluación
 * sería decoración, así que aquí está convertido en lo que sí se puede
 * puntuar: cinco dimensiones, un indicador observable por dimensión y cinco
 * niveles de desempeño.
 *
 * La consecuencia práctica de esa distinción es que lo que se evalúa no es el
 * logro de la meta —eso pasará o no dentro de seis semanas— sino **cómo está
 * escrita**. Un objetivo puede estar impecablemente formulado y no cumplirse;
 * son dos juicios distintos y esta rúbrica solo emite el primero.
 */

export const SMART_DIMENSION = {
  SPECIFIC: 'SPECIFIC',
  MEASURABLE: 'MEASURABLE',
  ACHIEVABLE: 'ACHIEVABLE',
  RELEVANT: 'RELEVANT',
  TIME_BOUND: 'TIME_BOUND',
} as const;

export type SmartDimension = (typeof SMART_DIMENSION)[keyof typeof SMART_DIMENSION];

/** Las cinco, en el orden del acrónimo: es como se enseñan y como se leen. */
export const SMART_DIMENSIONS: readonly SmartDimension[] = [
  SMART_DIMENSION.SPECIFIC,
  SMART_DIMENSION.MEASURABLE,
  SMART_DIMENSION.ACHIEVABLE,
  SMART_DIMENSION.RELEVANT,
  SMART_DIMENSION.TIME_BOUND,
];

/** La letra del acrónimo. Se imprime junto al nombre para anclarlo. */
export const SMART_LETTER: Record<SmartDimension, string> = {
  [SMART_DIMENSION.SPECIFIC]: 'S',
  [SMART_DIMENSION.MEASURABLE]: 'M',
  [SMART_DIMENSION.ACHIEVABLE]: 'A',
  [SMART_DIMENSION.RELEVANT]: 'R',
  [SMART_DIMENSION.TIME_BOUND]: 'T',
};

/**
 * Niveles de desempeño, de 0 a 4.
 *
 * Cinco niveles y no tres: con «cumple / no cumple» toda la franja intermedia
 * —la meta que menciona un plazo vago, o que mide algo pero sin decir cuánto—
 * cae del mismo lado, y ahí es justo donde está casi todo el alumnado.
 */
export const SMART_LEVEL_MIN = 0;
export const SMART_LEVEL_MAX = 4;

/** Cinco dimensiones por cuatro puntos. */
export const SMART_MAX_SCORE = SMART_DIMENSIONS.length * SMART_LEVEL_MAX;

export const SMART_BAND = {
  EXCELENTE: 'EXCELENTE',
  ALTO: 'ALTO',
  BASICO: 'BASICO',
  BAJO: 'BAJO',
  INICIAL: 'INICIAL',
} as const;

export type SmartBand = (typeof SMART_BAND)[keyof typeof SMART_BAND];

interface BandRange {
  band: SmartBand;
  min: number;
  max: number;
}

/**
 * Bandas sobre los 20 puntos.
 *
 * Son las del colegio y se enumeran de mayor a menor para que resolverlas sea
 * encontrar la primera que encaja. No se derivan de porcentajes: 18 sobre 20
 * es el corte acordado, no el 90 % redondeado, y escribirlo como porcentaje
 * invitaría a que alguien lo «ajustara» sin darse cuenta de que mueve la nota.
 */
export const SMART_BANDS: readonly BandRange[] = [
  { band: SMART_BAND.EXCELENTE, min: 18, max: 20 },
  { band: SMART_BAND.ALTO, min: 15, max: 17 },
  { band: SMART_BAND.BASICO, min: 11, max: 14 },
  { band: SMART_BAND.BAJO, min: 6, max: 10 },
  { band: SMART_BAND.INICIAL, min: 0, max: 5 },
];

export function resolveSmartBand(score: number): SmartBand {
  const clamped = Math.max(0, Math.min(SMART_MAX_SCORE, score));
  return SMART_BANDS.find((range) => clamped >= range.min)?.band ?? SMART_BAND.INICIAL;
}

/** Puntuación de cada dimensión. Ausente significa «todavía sin valorar». */
export type SmartScores = Partial<Record<SmartDimension, number>>;

export function isSmartScoreComplete(scores: SmartScores): boolean {
  return SMART_DIMENSIONS.every((dimension) => typeof scores[dimension] === 'number');
}

export function totalSmartScore(scores: SmartScores): number {
  return SMART_DIMENSIONS.reduce((sum, dimension) => {
    const value = scores[dimension];
    if (typeof value !== 'number') return sum;
    return sum + Math.max(SMART_LEVEL_MIN, Math.min(SMART_LEVEL_MAX, Math.round(value)));
  }, 0);
}

/**
 * Traduce la rúbrica a los puntos de la pregunta.
 *
 * La rúbrica vale 20 y la pregunta vale lo que el docente decidiera; se
 * reparte proporcionalmente. Es lo que permite que SMART conviva con la escala
 * alemana sin competir con ella: la rúbrica puntúa **esta** pregunta y la nota
 * final de la evaluación se sigue calculando como siempre, con la escala del
 * colegio. Dos escalas para dos cosas distintas, no dos notas para la misma.
 */
export function smartScoreToPoints(scores: SmartScores, questionPoints: number): number {
  if (questionPoints <= 0) return 0;
  const ratio = totalSmartScore(scores) / SMART_MAX_SCORE;
  return Math.round(ratio * questionPoints * 100) / 100;
}
