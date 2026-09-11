/**
 * Nivel alcanzado en una competencia.
 *
 * Los cortes se eligen para que digan algo pedagógicamente: por debajo del
 * 50 % la competencia no está adquirida, y por encima del 90 % lo está con
 * solvencia. No se reutiliza la escala de calificación porque una nota es un
 * juicio sobre una evaluación concreta y esto es una tendencia acumulada.
 *
 * Vive en su propio archivo porque lo usan tanto el informe general como el
 * desglose por materia, grupo y estudiante. Con una copia en cada sitio,
 * bastaría con mover un corte en uno para que la misma competencia apareciera
 * «consolidada» en una pantalla y «en desarrollo» en la de al lado.
 */

export const COMPETENCY_LEVELS = ['INICIAL', 'EN_DESARROLLO', 'CONSOLIDADO', 'AVANZADO'] as const;

export type CompetencyLevel = (typeof COMPETENCY_LEVELS)[number];

export function resolveLevel(percentage: number): CompetencyLevel {
  if (percentage >= 90) return 'AVANZADO';
  if (percentage >= 70) return 'CONSOLIDADO';
  if (percentage >= 50) return 'EN_DESARROLLO';
  return 'INICIAL';
}
