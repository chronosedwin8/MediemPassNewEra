import {
  QUESTION_TYPE,
  SMART_DIMENSIONS,
  SMART_LEVEL_MAX,
  resolveSmartBand,
  totalSmartScore,
  type SmartBand,
  type SmartDimension,
  type SmartScores,
} from '@medienpass/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.js';
import { buildAnswerFilter, type StatisticsActor, type StatisticsFilters } from './filters.js';

/**
 * Estadística de los objetivos SMART.
 *
 * Es la razón de guardar el desglose por dimensión y no solo los puntos. Con
 * los puntos, lo más que se puede decir es que los objetivos SMART se dan
 * regular; con el desglose se puede decir en qué —casi siempre el plazo y el
 * indicador medible— y eso sí cambia la clase siguiente.
 *
 * Se lee de `rubricScores`, que es JSON, así que hay que traerlo y plegarlo
 * aquí en lugar de agrupar en la base. El tope acota el coste: son las
 * respuestas ya corregidas de un curso, no el histórico del colegio.
 */

const ROW_LIMIT = 5_000;

export interface SmartDimensionStat {
  dimension: SmartDimension;
  /** Media de 0 a 4, que es como se puntúa cada dimensión. */
  average: number;
  /** La misma media sobre 100, para el gráfico. */
  percentage: number;
  scored: number;
}

export interface SmartReport {
  /** Objetivos corregidos con rúbrica completa. */
  evaluated: number;
  /** Media del total sobre 20. */
  averageScore: number;
  dimensions: SmartDimensionStat[];
  /** Cuántos objetivos cayeron en cada banda. */
  bands: Array<{ band: SmartBand; count: number }>;
  /** La dimensión más floja, que es lo que hay que enseñar de nuevo. */
  weakest: SmartDimension | null;
  strongest: SmartDimension | null;
}

interface Bucket {
  sum: number;
  count: number;
}

interface Folded {
  totals: Map<SmartDimension, Bucket>;
  bandCounts: Map<SmartBand, number>;
  scoreSum: number;
  evaluated: number;
}

/**
 * Suma las rúbricas en una sola pasada.
 *
 * Se salta las respuestas sin ninguna dimensión puntuada. Existen: una fila
 * puede tener `rubricScores` escrito y vacío si alguien guardó a medias, y
 * contarla como un objetivo evaluado bajaría la media con un cero que nadie
 * puso.
 */
function fold(rows: Array<{ rubricScores: unknown }>): Folded {
  const totals = new Map<SmartDimension, Bucket>(
    SMART_DIMENSIONS.map((dimension) => [dimension, { sum: 0, count: 0 }]),
  );
  const bandCounts = new Map<SmartBand, number>();
  let scoreSum = 0;
  let evaluated = 0;

  for (const row of rows) {
    const scores = row.rubricScores as SmartScores | null;
    if (!scores) continue;

    const scored = SMART_DIMENSIONS.filter((dimension) => typeof scores[dimension] === 'number');
    if (scored.length === 0) continue;

    for (const dimension of scored) {
      const bucket = totals.get(dimension)!;
      bucket.sum += scores[dimension]!;
      bucket.count += 1;
    }

    const total = totalSmartScore(scores);
    scoreSum += total;
    evaluated += 1;

    const band = resolveSmartBand(total);
    bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
  }

  return { totals, bandCounts, scoreSum, evaluated };
}

export async function getSmartReport(
  actor: StatisticsActor,
  filters: StatisticsFilters,
): Promise<SmartReport> {
  const rows = await prisma.attemptAnswer.findMany({
    where: {
      AND: [
        buildAnswerFilter(actor, filters),
        { questionType: QUESTION_TYPE.SMART_GOAL },
        { rubricScores: { not: Prisma.JsonNull } },
      ],
    },
    orderBy: { answeredAt: 'desc' },
    take: ROW_LIMIT,
    select: { rubricScores: true },
  });

  const { totals, bandCounts, scoreSum, evaluated } = fold(rows);

  const dimensions: SmartDimensionStat[] = SMART_DIMENSIONS.map((dimension) => {
    const bucket = totals.get(dimension)!;
    const average = bucket.count > 0 ? bucket.sum / bucket.count : 0;

    return {
      dimension,
      average: Math.round(average * 100) / 100,
      percentage: Math.round((average / SMART_LEVEL_MAX) * 10000) / 100,
      scored: bucket.count,
    };
  });

  /*
   * La más floja y la más fuerte se buscan solo entre las que se han puntuado.
   * Declarar «más floja» una dimensión que nadie evaluó sería engañoso, y es
   * justo la que aparecería con cero.
   */
  const measured = dimensions.filter((entry) => entry.scored > 0);

  /*
   * `sort` es estable, así que un empate se resuelve por el orden del
   * acrónimo. Da igual cuál se elija mientras sea siempre la misma: lo que no
   * puede pasar es que la pantalla enseñe una dimensión distinta en cada
   * recarga con exactamente los mismos datos.
   */
  const ordered = [...measured].sort((a, b) => b.average - a.average);

  return {
    evaluated,
    averageScore: evaluated > 0 ? Math.round((scoreSum / evaluated) * 100) / 100 : 0,
    dimensions,
    bands: [...bandCounts.entries()].map(([band, count]) => ({ band, count })),
    strongest: ordered[0]?.dimension ?? null,
    weakest: ordered.length > 1 ? (ordered[ordered.length - 1]?.dimension ?? null) : null,
  };
}
