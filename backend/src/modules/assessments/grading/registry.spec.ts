import { describe, expect, it } from 'vitest';
import { QUESTION_TYPE } from '@medienpass/shared';
import { gradeAnswer, requiresManualGrading } from './registry.js';

/**
 * Pruebas de los calificadores.
 *
 * Cada tipo se prueba en sus cuatro situaciones: acierto completo, acierto
 * parcial, error y sin contestar. Son las cuatro que producen notas distintas
 * y las cuatro que un cambio descuidado rompe.
 */

const options = [
  { id: 'a', text: 'Primera', correct: false },
  { id: 'b', text: 'Segunda', correct: true },
  { id: 'c', text: 'Tercera', correct: false },
];

describe('SINGLE_CHOICE', () => {
  const payload = { kind: QUESTION_TYPE.SINGLE_CHOICE, options };

  it('otorga todos los puntos al acertar', () => {
    const result = gradeAnswer(
      QUESTION_TYPE.SINGLE_CHOICE,
      payload,
      { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' },
      3,
    );
    expect(result).toEqual({ pointsEarned: 3, isCorrect: true, requiresManualGrading: false });
  });

  it('no otorga puntos al fallar', () => {
    const result = gradeAnswer(
      QUESTION_TYPE.SINGLE_CHOICE,
      payload,
      { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'a' },
      3,
    );
    expect(result.pointsEarned).toBe(0);
    expect(result.isCorrect).toBe(false);
  });

  it('trata como incorrecta una opción inexistente', () => {
    const result = gradeAnswer(
      QUESTION_TYPE.SINGLE_CHOICE,
      payload,
      { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'inventada' },
      3,
    );
    expect(result.pointsEarned).toBe(0);
  });

  it('puntúa con cero si no se contesta', () => {
    const result = gradeAnswer(
      QUESTION_TYPE.SINGLE_CHOICE,
      payload,
      { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: null },
      3,
    );
    expect(result.pointsEarned).toBe(0);
  });
});

describe('MULTIPLE_CHOICE', () => {
  const payload = {
    kind: QUESTION_TYPE.MULTIPLE_CHOICE,
    partialCredit: true,
    penalizeIncorrect: true,
    options: [
      { id: 'a', text: 'Correcta 1', correct: true },
      { id: 'b', text: 'Correcta 2', correct: true },
      { id: 'c', text: 'Incorrecta 1', correct: false },
      { id: 'd', text: 'Incorrecta 2', correct: false },
    ],
  };

  const grade = (optionIds: string[], custom = payload) =>
    gradeAnswer(QUESTION_TYPE.MULTIPLE_CHOICE, custom, { kind: QUESTION_TYPE.MULTIPLE_CHOICE, optionIds }, 4);

  it('otorga todos los puntos con las dos correctas', () => {
    expect(grade(['a', 'b'])).toMatchObject({ pointsEarned: 4, isCorrect: true });
  });

  it('reparte proporcionalmente un acierto parcial', () => {
    expect(grade(['a'])).toMatchObject({ pointsEarned: 2, isCorrect: false });
  });

  it('descuenta los errores marcados', () => {
    // Dos aciertos menos un error = uno neto sobre dos correctas = mitad.
    expect(grade(['a', 'b', 'c']).pointsEarned).toBe(2);
  });

  it('marcar todas las opciones no garantiza la nota máxima', () => {
    // Es el fallo clásico de este tipo de pregunta: sin penalización, la
    // estrategia de marcarlo todo sería óptima.
    expect(grade(['a', 'b', 'c', 'd']).pointsEarned).toBe(0);
  });

  it('nunca baja de cero por muchos errores que se marquen', () => {
    expect(grade(['c', 'd']).pointsEarned).toBe(0);
  });

  it('respeta la opción de todo o nada', () => {
    const strict = { ...payload, partialCredit: false };
    expect(grade(['a'], strict).pointsEarned).toBe(0);
    expect(grade(['a', 'b'], strict).pointsEarned).toBe(4);
  });

  it('no descuenta si el docente lo desactiva', () => {
    const lenient = { ...payload, penalizeIncorrect: false };
    expect(grade(['a', 'b', 'c'], lenient).pointsEarned).toBe(4);
  });
});

describe('TRUE_FALSE', () => {
  const payload = { kind: QUESTION_TYPE.TRUE_FALSE, correct: true };

  it('acierta', () => {
    expect(
      gradeAnswer(QUESTION_TYPE.TRUE_FALSE, payload, { kind: QUESTION_TYPE.TRUE_FALSE, value: true }, 2)
        .pointsEarned,
    ).toBe(2);
  });

  it('falla', () => {
    expect(
      gradeAnswer(QUESTION_TYPE.TRUE_FALSE, payload, { kind: QUESTION_TYPE.TRUE_FALSE, value: false }, 2)
        .pointsEarned,
    ).toBe(0);
  });

  it('distingue no contestar de contestar «falso»', () => {
    const blank = gradeAnswer(
      QUESTION_TYPE.TRUE_FALSE,
      payload,
      { kind: QUESTION_TYPE.TRUE_FALSE, value: null },
      2,
    );
    expect(blank.pointsEarned).toBe(0);
    expect(blank.requiresManualGrading).toBe(false);
  });
});

describe('SHORT_ANSWER', () => {
  const payload = {
    kind: QUESTION_TYPE.SHORT_ANSWER,
    acceptedAnswers: ['site:', 'operador site'],
    caseSensitive: false,
    ignoreAccents: true,
  };

  const grade = (text: string, custom = payload) =>
    gradeAnswer(QUESTION_TYPE.SHORT_ANSWER, custom, { kind: QUESTION_TYPE.SHORT_ANSWER, text }, 2);

  it('acepta cualquiera de las formas admitidas', () => {
    expect(grade('site:').pointsEarned).toBe(2);
    expect(grade('operador site').pointsEarned).toBe(2);
  });

  it('ignora mayúsculas y espacios sobrantes', () => {
    expect(grade('  Operador   Site  ').pointsEarned).toBe(2);
  });

  it('ignora las tildes cuando así se configura', () => {
    const accented = { ...payload, acceptedAnswers: ['función'] };
    expect(grade('funcion', accented).pointsEarned).toBe(2);
  });

  it('distingue tildes cuando el docente lo exige', () => {
    // En una evaluación de idiomas la diferencia sí importa.
    const strict = { ...payload, acceptedAnswers: ['schön'], ignoreAccents: false };
    expect(grade('schon', strict).pointsEarned).toBe(0);
    expect(grade('schön', strict).pointsEarned).toBe(2);
  });

  it('rechaza una respuesta distinta', () => {
    expect(grade('no lo sé').pointsEarned).toBe(0);
  });

  it('puntúa con cero el texto vacío', () => {
    expect(grade('   ').pointsEarned).toBe(0);
  });
});

describe('FILL_BLANK', () => {
  const payload = {
    kind: QUESTION_TYPE.FILL_BLANK,
    template: 'La pendiente vale {{m}} y corta el eje en {{b}}.',
    blanks: [
      { id: 'm', acceptedAnswers: ['-2'], caseSensitive: false, ignoreAccents: true },
      { id: 'b', acceptedAnswers: ['7'], caseSensitive: false, ignoreAccents: true },
    ],
  };

  const grade = (blanks: Array<{ id: string; text: string }>) =>
    gradeAnswer(QUESTION_TYPE.FILL_BLANK, payload, { kind: QUESTION_TYPE.FILL_BLANK, blanks }, 4);

  it('otorga todos los puntos con ambos huecos correctos', () => {
    expect(
      grade([
        { id: 'm', text: '-2' },
        { id: 'b', text: '7' },
      ]),
    ).toMatchObject({ pointsEarned: 4, isCorrect: true });
  });

  it('puntúa cada hueco por separado', () => {
    expect(
      grade([
        { id: 'm', text: '-2' },
        { id: 'b', text: '99' },
      ]),
    ).toMatchObject({ pointsEarned: 2, isCorrect: false });
  });

  it('ignora huecos dejados en blanco', () => {
    expect(grade([{ id: 'm', text: '-2' }]).pointsEarned).toBe(2);
  });

  it('puntúa con cero si no se rellena ninguno', () => {
    expect(grade([]).pointsEarned).toBe(0);
  });
});

describe('MATCHING', () => {
  const payload = {
    kind: QUESTION_TYPE.MATCHING,
    partialCredit: true,
    left: [
      { id: 'f1', text: 'y = 2x' },
      { id: 'f2', text: 'y = -x + 4' },
    ],
    right: [
      { id: 'd1', text: 'Creciente' },
      { id: 'd2', text: 'Decreciente' },
    ],
    pairs: [
      { leftId: 'f1', rightId: 'd1' },
      { leftId: 'f2', rightId: 'd2' },
    ],
  };

  const grade = (pairs: Array<{ leftId: string; rightId: string }>, custom = payload) =>
    gradeAnswer(QUESTION_TYPE.MATCHING, custom, { kind: QUESTION_TYPE.MATCHING, pairs }, 4);

  it('otorga todos los puntos con las dos relaciones correctas', () => {
    expect(grade(payload.pairs)).toMatchObject({ pointsEarned: 4, isCorrect: true });
  });

  it('reparte por cada relación acertada', () => {
    expect(
      grade([
        { leftId: 'f1', rightId: 'd1' },
        { leftId: 'f2', rightId: 'd1' },
      ]),
    ).toMatchObject({ pointsEarned: 2, isCorrect: false });
  });

  it('respeta el todo o nada cuando se configura', () => {
    const strict = { ...payload, partialCredit: false };
    expect(grade([{ leftId: 'f1', rightId: 'd1' }], strict).pointsEarned).toBe(0);
  });
});

describe('GROUPING', () => {
  const payload = {
    kind: QUESTION_TYPE.GROUPING,
    partialCredit: true,
    groups: [
      { id: 'g1', label: 'Gráficas' },
      { id: 'g2', label: 'Cálculo' },
    ],
    items: [
      { id: 'i1', text: 'GeoGebra', groupId: 'g1' },
      { id: 'i2', text: 'Desmos', groupId: 'g1' },
      { id: 'i3', text: 'Hoja de cálculo', groupId: 'g2' },
      { id: 'i4', text: 'Tabla dinámica', groupId: 'g2' },
    ],
  };

  const grade = (assignments: Array<{ itemId: string; groupId: string }>) =>
    gradeAnswer(QUESTION_TYPE.GROUPING, payload, { kind: QUESTION_TYPE.GROUPING, assignments }, 4);

  it('otorga todos los puntos con la clasificación completa', () => {
    expect(grade(payload.items.map((i) => ({ itemId: i.id, groupId: i.groupId })))).toMatchObject({
      pointsEarned: 4,
      isCorrect: true,
    });
  });

  it('puntúa cada elemento bien colocado', () => {
    expect(
      grade([
        { itemId: 'i1', groupId: 'g1' },
        { itemId: 'i2', groupId: 'g2' },
        { itemId: 'i3', groupId: 'g2' },
        { itemId: 'i4', groupId: 'g1' },
      ]).pointsEarned,
    ).toBe(2);
  });
});

describe('ORDERING y TIMELINE', () => {
  const items = [
    { id: 'i1', text: 'Definir', correctPosition: 0 },
    { id: 'i2', text: 'Buscar', correctPosition: 1 },
    { id: 'i3', text: 'Contrastar', correctPosition: 2 },
    { id: 'i4', text: 'Citar', correctPosition: 3 },
  ];
  const payload = { kind: QUESTION_TYPE.ORDERING, partialCredit: true, items };

  const grade = (order: string[]) =>
    gradeAnswer(QUESTION_TYPE.ORDERING, payload, { kind: QUESTION_TYPE.ORDERING, order }, 4);

  it('otorga todos los puntos con el orden correcto', () => {
    expect(grade(['i1', 'i2', 'i3', 'i4'])).toMatchObject({ pointsEarned: 4, isCorrect: true });
  });

  it('puntúa cada elemento en su sitio', () => {
    // Los dos primeros aciertan; los dos últimos están intercambiados.
    expect(grade(['i1', 'i2', 'i4', 'i3']).pointsEarned).toBe(2);
  });

  it('no otorga puntos si el orden está completamente invertido', () => {
    expect(grade(['i4', 'i3', 'i2', 'i1']).pointsEarned).toBe(0);
  });

  it('la línea de tiempo se corrige igual que el ordenamiento', () => {
    const timeline = {
      kind: QUESTION_TYPE.TIMELINE,
      partialCredit: true,
      items: items.map((item) => ({ ...item, dateLabel: '1969' })),
    };
    const result = gradeAnswer(
      QUESTION_TYPE.TIMELINE,
      timeline,
      { kind: QUESTION_TYPE.TIMELINE, order: ['i1', 'i2', 'i3', 'i4'] },
      4,
    );
    expect(result).toMatchObject({ pointsEarned: 4, isCorrect: true });
  });
});

describe('IMAGE_CHOICE y HOTSPOT', () => {
  it('la selección única de imagen rechaza marcar dos', () => {
    const payload = {
      kind: QUESTION_TYPE.IMAGE_CHOICE,
      multiple: false,
      options: [
        { id: 'a', imageUrl: '/a.png', alt: 'Imagen A', correct: true },
        { id: 'b', imageUrl: '/b.png', alt: 'Imagen B', correct: false },
      ],
    };

    expect(
      gradeAnswer(QUESTION_TYPE.IMAGE_CHOICE, payload, { kind: QUESTION_TYPE.IMAGE_CHOICE, optionIds: ['a'] }, 2)
        .pointsEarned,
    ).toBe(2);
    expect(
      gradeAnswer(
        QUESTION_TYPE.IMAGE_CHOICE,
        payload,
        { kind: QUESTION_TYPE.IMAGE_CHOICE, optionIds: ['a', 'b'] },
        2,
      ).pointsEarned,
    ).toBe(0);
  });

  it('la zona de imagen puntúa como una opción', () => {
    const payload = {
      kind: QUESTION_TYPE.HOTSPOT,
      imageUrl: '/mapa.png',
      alt: 'Mapa',
      multiple: false,
      regions: [
        { id: 'r1', label: 'Norte', shape: 'rect' as const, x: 10, y: 10, width: 20, height: 20, correct: true },
        { id: 'r2', label: 'Sur', shape: 'rect' as const, x: 50, y: 50, width: 20, height: 20, correct: false },
      ],
    };

    expect(
      gradeAnswer(QUESTION_TYPE.HOTSPOT, payload, { kind: QUESTION_TYPE.HOTSPOT, regionIds: ['r1'] }, 3)
        .pointsEarned,
    ).toBe(3);
    expect(
      gradeAnswer(QUESTION_TYPE.HOTSPOT, payload, { kind: QUESTION_TYPE.HOTSPOT, regionIds: ['r2'] }, 3)
        .pointsEarned,
    ).toBe(0);
  });
});

describe('respuestas abiertas', () => {
  const payload = { kind: QUESTION_TYPE.OPEN_TEXT, minWords: 10 };

  it('quedan pendientes de la corrección del docente', () => {
    const result = gradeAnswer(
      QUESTION_TYPE.OPEN_TEXT,
      payload,
      { kind: QUESTION_TYPE.OPEN_TEXT, text: 'Comprobaría la fuente original y la fecha.' },
      5,
    );
    expect(result).toEqual({ pointsEarned: 0, isCorrect: null, requiresManualGrading: true });
  });

  it('una respuesta en blanco no espera al docente: es cero', () => {
    const result = gradeAnswer(
      QUESTION_TYPE.OPEN_TEXT,
      payload,
      { kind: QUESTION_TYPE.OPEN_TEXT, text: '   ' },
      5,
    );
    expect(result.requiresManualGrading).toBe(false);
    expect(result.pointsEarned).toBe(0);
  });

  it('el registro declara qué tipos exigen corrección humana', () => {
    expect(requiresManualGrading(QUESTION_TYPE.OPEN_TEXT)).toBe(true);
    expect(requiresManualGrading(QUESTION_TYPE.LONG_ANSWER)).toBe(true);
    expect(requiresManualGrading(QUESTION_TYPE.SINGLE_CHOICE)).toBe(false);
  });
});

describe('robustez', () => {
  const payload = { kind: QUESTION_TYPE.SINGLE_CHOICE, options };

  it('una respuesta con forma equivocada se puntúa como no contestada', () => {
    // Preferible a reventar la entrega y hacerle perder el intento entero.
    const result = gradeAnswer(QUESTION_TYPE.SINGLE_CHOICE, payload, { basura: true }, 3);
    expect(result.pointsEarned).toBe(0);
  });

  it('una respuesta nula se puntúa como no contestada', () => {
    expect(gradeAnswer(QUESTION_TYPE.SINGLE_CHOICE, payload, null, 3).pointsEarned).toBe(0);
  });

  it('un contenido de pregunta corrupto sí es un error visible', () => {
    // Es un defecto de datos que hay que ver, no algo que deba silenciarse.
    expect(() =>
      gradeAnswer(QUESTION_TYPE.SINGLE_CHOICE, { kind: 'SINGLE_CHOICE' }, { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' }, 3),
    ).toThrow(/payload/i);
  });

  it('nunca devuelve más puntos de los que vale la pregunta', () => {
    const result = gradeAnswer(
      QUESTION_TYPE.SINGLE_CHOICE,
      payload,
      { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' },
      2.5,
    );
    expect(result.pointsEarned).toBeLessThanOrEqual(2.5);
  });
});
