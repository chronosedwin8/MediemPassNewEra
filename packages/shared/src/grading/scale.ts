import { SCALE_KIND, type ScaleKind } from '../enums.js';

/**
 * Conversión de porcentaje a nota. Lógica pura, sin dependencias.
 *
 * Vive en el paquete compartido para que backend y frontend calculen
 * exactamente lo mismo: el backend es la autoridad y persiste el resultado,
 * el frontend reutiliza estas funciones para vistas previas y para el
 * configurador de escalas del administrador. La especificación prohíbe
 * expresamente escribir estas reglas dentro de componentes Vue (sección 19).
 */

/**
 * Banda de una escala.
 *
 * `minPercentage` es el único umbral autoritativo. El límite superior se
 * deriva del umbral de la banda siguiente, de modo que una escala nunca
 * puede tener huecos ni solapamientos: un 89,995 % siempre cae en algún
 * sitio. El máximo mostrado al usuario se calcula con `bandDisplayRange`.
 */
export interface GradingBand {
  /** Umbral inferior inclusivo, 0–100. */
  minPercentage: number;
  /** Valor de la nota. Escala alemana: 1.0 (mejor) … 6.0 (peor). */
  value: number;
  /** Etiqueta corta, p. ej. "Excelente". Traducible por clave si se desea. */
  label: string;
  /** Color de acento para insignias y gráficos (hex). */
  color: string;
  /** Orden de presentación: 0 es siempre el mejor resultado. */
  position: number;
}

export interface GradingScale {
  id: string;
  name: string;
  kind: ScaleKind;
  /** Porcentaje mínimo para aprobar. Se fija en el resultado histórico. */
  passingPercentage: number;
  /**
   * `true` cuando un valor numérico menor es mejor (escala alemana 1.0–6.0).
   * `false` en escalas donde más es mejor (0–100).
   */
  lowerIsBetter: boolean;
  bands: GradingBand[];
}

export interface GradeResult {
  percentage: number;
  passed: boolean;
  /** Nulo en escalas `PERCENTAGE`, donde el porcentaje ya es la nota. */
  band: GradingBand | null;
  stars: StarRating | null;
}

/**
 * Representación por estrellas.
 *
 * Ojo: aquí las estrellas NO son una valoración convencional. Reflejan la
 * escala alemana, donde 1.0 es el mejor resultado y 6.0 el peor (sección 20).
 * Nunca deben presentarse solas: siempre acompañadas del valor numérico y
 * de la etiqueta textual, por accesibilidad.
 */
export interface StarRating {
  filled: number;
  total: number;
}

export class InvalidScaleError extends Error {
  constructor(readonly reason: string) {
    super(`Invalid grading scale: ${reason}`);
    this.name = 'InvalidScaleError';
  }
}

/** Redondea a dos decimales evitando el ruido del punto flotante binario. */
export function roundPercentage(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula el porcentaje obtenido.
 * Un total de 0 puntos posibles devuelve 0 en lugar de `NaN`.
 */
export function toPercentage(pointsEarned: number, pointsPossible: number): number {
  if (pointsPossible <= 0) return 0;
  const raw = (pointsEarned / pointsPossible) * 100;
  return roundPercentage(Math.min(100, Math.max(0, raw)));
}

/**
 * Comprueba las invariantes de una escala.
 * Se ejecuta antes de guardar cualquier escala creada por el administrador:
 * una escala inconsistente corrompería todas las notas que dependan de ella.
 */
export function validateScaleBands(bands: readonly GradingBand[]): void {
  if (bands.length === 0) throw new InvalidScaleError('a scale needs at least one band');

  const sorted = [...bands].sort((a, b) => a.position - b.position);

  const positions = sorted.map((b) => b.position);
  if (new Set(positions).size !== positions.length) {
    throw new InvalidScaleError('band positions must be unique');
  }

  for (const band of sorted) {
    if (band.minPercentage < 0 || band.minPercentage > 100) {
      throw new InvalidScaleError(`minPercentage out of range: ${band.minPercentage}`);
    }
  }

  // La posición 0 es la mejor: su umbral debe ser el más alto y descender.
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1]!;
    const current = sorted[i]!;
    if (current.minPercentage >= previous.minPercentage) {
      throw new InvalidScaleError(
        `thresholds must strictly decrease with position (position ${current.position} ` +
          `has ${current.minPercentage}%, not below position ${previous.position})`,
      );
    }
  }

  // La peor banda debe empezar en 0 para que toda nota tenga destino.
  const worst = sorted[sorted.length - 1]!;
  if (worst.minPercentage !== 0) {
    throw new InvalidScaleError('the lowest band must start at 0%');
  }

  const values = sorted.map((b) => b.value);
  if (new Set(values).size !== values.length) {
    throw new InvalidScaleError('band values must be unique');
  }
}

/**
 * Rango que se muestra al usuario para una banda.
 * El máximo se deriva de la banda inmediatamente mejor, restando 0,01, que es
 * la resolución con la que se calculan los porcentajes.
 */
export function bandDisplayRange(
  band: GradingBand,
  bands: readonly GradingBand[],
): { min: number; max: number } {
  const better = bands
    .filter((b) => b.minPercentage > band.minPercentage)
    .sort((a, b) => a.minPercentage - b.minPercentage)[0];
  return { min: band.minPercentage, max: better ? roundPercentage(better.minPercentage - 0.01) : 100 };
}

/** Devuelve la banda a la que pertenece un porcentaje. */
export function resolveBand(percentage: number, scale: GradingScale): GradingBand | null {
  if (scale.kind === SCALE_KIND.PERCENTAGE) return null;
  const candidates = [...scale.bands].sort((a, b) => b.minPercentage - a.minPercentage);
  return candidates.find((band) => percentage >= band.minPercentage) ?? null;
}

/**
 * Traduce una banda a estrellas.
 *
 * El total se deriva del número de niveles de la escala (N niveles → N-1
 * estrellas), de modo que sigue funcionando si el administrador cambia la
 * cantidad de niveles. Con la escala alemana por defecto de seis niveles:
 * 1.0 → 5 estrellas, 6.0 → 0 estrellas.
 */
export function starsForBand(band: GradingBand, scale: GradingScale): StarRating | null {
  if (scale.kind === SCALE_KIND.PERCENTAGE) return null;
  const total = scale.bands.length - 1;
  if (total <= 0) return null;
  const ordered = [...scale.bands].sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((b) => b.position === band.position);
  if (index < 0) return null;
  return { filled: total - index, total };
}

/** Punto de entrada único: de porcentaje a resultado completo. */
export function gradeFromPercentage(percentage: number, scale: GradingScale): GradeResult {
  const rounded = roundPercentage(percentage);
  const band = resolveBand(rounded, scale);
  return {
    percentage: rounded,
    passed: rounded >= scale.passingPercentage,
    band,
    stars: band ? starsForBand(band, scale) : null,
  };
}

/** De puntos directamente a resultado, que es el camino habitual del motor. */
export function gradeFromPoints(
  pointsEarned: number,
  pointsPossible: number,
  scale: GradingScale,
): GradeResult {
  return gradeFromPercentage(toPercentage(pointsEarned, pointsPossible), scale);
}

/**
 * Escala alemana por defecto para estudiantes (sección 19).
 * Se usa como semilla inicial; el administrador puede modificarla y cada
 * cambio genera una versión nueva, sin alterar notas ya emitidas.
 */
export const DEFAULT_STUDENT_SCALE_BANDS: readonly Omit<GradingBand, never>[] = [
  { position: 0, value: 1.0, minPercentage: 90, label: 'Sehr gut', color: '#15803d' },
  { position: 1, value: 2.0, minPercentage: 80, label: 'Gut', color: '#4d7c0f' },
  { position: 2, value: 3.0, minPercentage: 70, label: 'Befriedigend', color: '#a16207' },
  { position: 3, value: 4.0, minPercentage: 60, label: 'Ausreichend', color: '#c2410c' },
  { position: 4, value: 5.0, minPercentage: 50, label: 'Mangelhaft', color: '#b91c1c' },
  { position: 5, value: 6.0, minPercentage: 0, label: 'Ungenügend', color: '#7f1d1d' },
];

export const DEFAULT_STUDENT_PASSING_PERCENTAGE = 70;
export const DEFAULT_TEACHER_PASSING_PERCENTAGE = 80;
