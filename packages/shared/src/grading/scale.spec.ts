import { describe, expect, it } from 'vitest';
import { SCALE_KIND } from '../enums.js';
import {
  DEFAULT_STUDENT_PASSING_PERCENTAGE,
  DEFAULT_STUDENT_SCALE_BANDS,
  DEFAULT_TEACHER_PASSING_PERCENTAGE,
  InvalidScaleError,
  bandDisplayRange,
  gradeFromPercentage,
  gradeFromPoints,
  resolveBand,
  roundPercentage,
  starsForBand,
  toPercentage,
  validateScaleBands,
  type GradingBand,
  type GradingScale,
} from './scale.js';

const studentScale: GradingScale = {
  id: 'scale-student-v1',
  name: 'Escala alemana 1.0–6.0',
  kind: SCALE_KIND.BANDED,
  passingPercentage: DEFAULT_STUDENT_PASSING_PERCENTAGE,
  lowerIsBetter: true,
  bands: [...DEFAULT_STUDENT_SCALE_BANDS] as GradingBand[],
};

const teacherScale: GradingScale = {
  id: 'scale-teacher-v1',
  name: 'Porcentaje 0–100',
  kind: SCALE_KIND.PERCENTAGE,
  passingPercentage: DEFAULT_TEACHER_PASSING_PERCENTAGE,
  lowerIsBetter: false,
  bands: [],
};

describe('toPercentage', () => {
  it('convierte puntos a porcentaje con dos decimales', () => {
    expect(toPercentage(86, 100)).toBe(86);
    expect(toPercentage(7, 9)).toBe(77.78);
  });

  it('devuelve 0 cuando no hay puntos posibles, en lugar de NaN', () => {
    expect(toPercentage(0, 0)).toBe(0);
  });

  it('acota el resultado al rango 0–100', () => {
    expect(toPercentage(120, 100)).toBe(100);
    expect(toPercentage(-5, 100)).toBe(0);
  });

  it('evita el ruido de coma flotante', () => {
    expect(roundPercentage(0.1 + 0.2)).toBe(0.3);
  });
});

describe('escala de estudiantes — fronteras exigidas por la especificación', () => {
  const cases: Array<{ percentage: number; value: number; passed: boolean }> = [
    { percentage: 0, value: 6.0, passed: false },
    { percentage: 49.99, value: 6.0, passed: false },
    { percentage: 50, value: 5.0, passed: false },
    { percentage: 59.99, value: 5.0, passed: false },
    { percentage: 60, value: 4.0, passed: false },
    { percentage: 69.99, value: 4.0, passed: false },
    { percentage: 70, value: 3.0, passed: true },
    { percentage: 79.99, value: 3.0, passed: true },
    { percentage: 80, value: 2.0, passed: true },
    { percentage: 89.99, value: 2.0, passed: true },
    { percentage: 90, value: 1.0, passed: true },
    { percentage: 100, value: 1.0, passed: true },
  ];

  it.each(cases)(
    '$percentage% → nota $value (aprobado: $passed)',
    ({ percentage, value, passed }) => {
      const result = gradeFromPercentage(percentage, studentScale);
      expect(result.band?.value).toBe(value);
      expect(result.passed).toBe(passed);
    },
  );

  it('no deja huecos entre bandas: cualquier porcentaje tiene banda', () => {
    for (let p = 0; p <= 10000; p += 1) {
      const percentage = p / 100;
      expect(resolveBand(percentage, studentScale), `sin banda para ${percentage}%`).not.toBeNull();
    }
  });

  it('89,995 % cae en una banda pese a no estar en los rangos mostrados', () => {
    expect(gradeFromPercentage(89.995, studentScale).band?.value).toBe(1.0);
  });
});

describe('estrellas', () => {
  it('1.0 es el mejor resultado y llena todas las estrellas', () => {
    expect(gradeFromPercentage(95, studentScale).stars).toEqual({ filled: 5, total: 5 });
  });

  it('6.0 es el peor resultado y no llena ninguna', () => {
    expect(gradeFromPercentage(10, studentScale).stars).toEqual({ filled: 0, total: 5 });
  });

  it('recorre la escala completa de forma monótona', () => {
    expect(gradeFromPercentage(85, studentScale).stars?.filled).toBe(4);
    expect(gradeFromPercentage(75, studentScale).stars?.filled).toBe(3);
    expect(gradeFromPercentage(65, studentScale).stars?.filled).toBe(2);
    expect(gradeFromPercentage(55, studentScale).stars?.filled).toBe(1);
  });

  it('el total se adapta si el administrador cambia el número de niveles', () => {
    const fourLevels: GradingScale = {
      ...studentScale,
      bands: [
        { position: 0, value: 1, minPercentage: 85, label: 'A', color: '#000' },
        { position: 1, value: 2, minPercentage: 70, label: 'B', color: '#000' },
        { position: 2, value: 3, minPercentage: 50, label: 'C', color: '#000' },
        { position: 3, value: 4, minPercentage: 0, label: 'D', color: '#000' },
      ],
    };
    expect(gradeFromPercentage(90, fourLevels).stars).toEqual({ filled: 3, total: 3 });
    expect(gradeFromPercentage(20, fourLevels).stars).toEqual({ filled: 0, total: 3 });
  });

  it('una escala porcentual no produce estrellas', () => {
    expect(starsForBand(DEFAULT_STUDENT_SCALE_BANDS[0] as GradingBand, teacherScale)).toBeNull();
  });
});

describe('escala docente (porcentual)', () => {
  it('aprueba desde el 80 % y no produce banda ni estrellas', () => {
    const approved = gradeFromPercentage(80, teacherScale);
    expect(approved.passed).toBe(true);
    expect(approved.band).toBeNull();
    expect(approved.stars).toBeNull();

    expect(gradeFromPercentage(79.99, teacherScale).passed).toBe(false);
  });

  it('calcula desde puntos', () => {
    expect(gradeFromPoints(24, 30, teacherScale)).toMatchObject({ percentage: 80, passed: true });
  });
});

describe('validateScaleBands', () => {
  it('acepta la escala por defecto', () => {
    expect(() => validateScaleBands(DEFAULT_STUDENT_SCALE_BANDS as GradingBand[])).not.toThrow();
  });

  it('rechaza una escala vacía', () => {
    expect(() => validateScaleBands([])).toThrow(InvalidScaleError);
  });

  it('rechaza umbrales que no descienden con la posición', () => {
    expect(() =>
      validateScaleBands([
        { position: 0, value: 1, minPercentage: 50, label: 'A', color: '#000' },
        { position: 1, value: 2, minPercentage: 80, label: 'B', color: '#000' },
        { position: 2, value: 3, minPercentage: 0, label: 'C', color: '#000' },
      ]),
    ).toThrow(/strictly decrease/);
  });

  it('exige que la peor banda empiece en 0 %', () => {
    expect(() =>
      validateScaleBands([
        { position: 0, value: 1, minPercentage: 90, label: 'A', color: '#000' },
        { position: 1, value: 2, minPercentage: 40, label: 'B', color: '#000' },
      ]),
    ).toThrow(/must start at 0%/);
  });

  it('rechaza valores de nota repetidos', () => {
    expect(() =>
      validateScaleBands([
        { position: 0, value: 1, minPercentage: 50, label: 'A', color: '#000' },
        { position: 1, value: 1, minPercentage: 0, label: 'B', color: '#000' },
      ]),
    ).toThrow(/values must be unique/);
  });

  it('rechaza posiciones repetidas', () => {
    expect(() =>
      validateScaleBands([
        { position: 0, value: 1, minPercentage: 50, label: 'A', color: '#000' },
        { position: 0, value: 2, minPercentage: 0, label: 'B', color: '#000' },
      ]),
    ).toThrow(/positions must be unique/);
  });
});

describe('bandDisplayRange', () => {
  it('deriva los rangos mostrados al usuario', () => {
    const bands = DEFAULT_STUDENT_SCALE_BANDS as GradingBand[];
    expect(bandDisplayRange(bands[0]!, bands)).toEqual({ min: 90, max: 100 });
    expect(bandDisplayRange(bands[1]!, bands)).toEqual({ min: 80, max: 89.99 });
    expect(bandDisplayRange(bands[5]!, bands)).toEqual({ min: 0, max: 49.99 });
  });
});
