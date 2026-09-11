import { z } from 'zod';
import { toPercentage, type LocalizedText } from '@medienpass/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.js';
import { buildAnswerFilter, type StatisticsActor, type StatisticsFilters } from './filters.js';
import { resolveLevel, type CompetencyLevel } from './levels.js';

/**
 * Desglose de competencias KMK por materia, grupo o estudiante.
 *
 * El informe que ya existía respondía «cómo va esto en conjunto» y admitía
 * filtrar por una materia, un grupo o un alumno. Eso deja sin responder la
 * pregunta que de verdad se hace un docente o una coordinación: **comparar**.
 * Cuál de mis cursos flojea en evaluar fuentes; qué materias están ejercitando
 * la competencia 6 y cuáles no la tocan; quién de mi clase necesita ayuda y en
 * qué. Con filtros sueltos eso son cincuenta consultas y una hoja de cálculo a
 * mano.
 *
 * Aquí sale como una matriz: una fila por materia, grupo o estudiante, y una
 * columna por competencia. Es una única consulta agrupada sobre las columnas
 * desnormalizadas de `attempt_answers`, que existen exactamente para esto.
 */

export const BREAKDOWN_DIMENSIONS = ['subject', 'group', 'student'] as const;

export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

export const breakdownQuerySchema = z.object({
  dimension: z.enum(BREAKDOWN_DIMENSIONS),
});

/** Una celda de la matriz: una competencia dentro de una fila. */
export interface BreakdownCell {
  competencyId: string;
  percentage: number;
  answerCount: number;
  correctCount: number;
  correctRate: number;
  level: CompetencyLevel;
}

export interface BreakdownRow {
  /** Identificador de la entidad: materia, grupo o estudiante. */
  id: string;
  /** Código corto y estable. El del estudiante puede faltar. */
  code: string | null;
  /** Nombre para mostrar. Localizado en materias, literal en personas. */
  name: LocalizedText | string;
  /** Contexto de la fila: el área de la materia, el curso del grupo… */
  context: string | null;
  answerCount: number;
  percentage: number;
  level: CompetencyLevel;
  /** Una entrada por competencia medida; las no medidas no aparecen. */
  cells: BreakdownCell[];
}

export interface KmkBreakdown {
  dimension: BreakdownDimension;
  competencies: Array<{ id: string; code: string; name: LocalizedText; color: string }>;
  rows: BreakdownRow[];
  /** Filas con datos frente a filas existentes: mide la cobertura real. */
  coverage: { measured: number; total: number };
  totalAnswers: number;
  /** Cierto cuando se recortó la lista: hay más entidades que el tope. */
  truncated: boolean;
}

/**
 * Tope de filas.
 *
 * Un administrador sin filtros pidiendo el desglose por estudiante tocaría los
 * 1 177 matriculados. La tabla resultante no la lee nadie y la consulta pesa,
 * así que se recortan las filas con más respuestas —las que tienen algo que
 * contar— y se avisa de que se recortó. Lo normal es filtrar por grupo antes,
 * que además es la pregunta que se está haciendo de verdad.
 */
const ROW_LIMIT = 60;

/**
 * Columna por la que se agrupa y cómo se resuelve la etiqueta de cada fila.
 *
 * Como tabla y no como `switch` repartido por la función: el día que haya que
 * desglosar por periodo o por nivel, es una entrada más, y el compilador
 * obliga a rellenarla entera.
 */
interface DimensionSpec {
  /** Columna desnormalizada de `attempt_answers` por la que se agrupa. */
  column: 'subjectId' | 'groupId' | 'studentId';
  /** Etiquetas de las entidades que aparecen en el resultado. */
  describe: (
    ids: string[],
  ) => Promise<Map<string, Omit<BreakdownRow, 'cells' | 'answerCount' | 'percentage' | 'level'>>>;
}

const DIMENSIONS: Record<BreakdownDimension, DimensionSpec> = {
  subject: {
    column: 'subjectId',
    describe: async (ids) => {
      const subjects = await prisma.subject.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true, name: true, area: { select: { name: true } } },
      });
      return new Map(
        subjects.map((subject) => [
          subject.id,
          {
            id: subject.id,
            code: subject.code,
            name: subject.name as LocalizedText,
            context: localizedOrNull(subject.area?.name),
          },
        ]),
      );
    },
  },

  group: {
    column: 'groupId',
    describe: async (ids) => {
      const groups = await prisma.group.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          code: true,
          name: true,
          gradeLevel: { select: { name: true } },
        },
      });
      return new Map(
        groups.map((group) => [
          group.id,
          {
            id: group.id,
            code: group.code,
            name: group.name,
            context: localizedOrNull(group.gradeLevel?.name),
          },
        ]),
      );
    },
  },

  student: {
    column: 'studentId',
    describe: async (ids) => {
      const students = await prisma.student.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          code: true,
          user: { select: { firstName: true, lastName: true } },
          memberships: {
            where: { active: true },
            take: 1,
            select: { group: { select: { code: true } } },
          },
        },
      });
      return new Map(
        students.map((student) => [
          student.id,
          {
            id: student.id,
            code: student.code,
            /*
             * Apellido primero: es como se ordena un listado de clase y como
             * un docente busca a alguien con la vista en una lista de treinta.
             */
            name: `${student.user.lastName}, ${student.user.firstName}`,
            context: student.memberships[0]?.group.code ?? null,
          },
        ]),
      );
    },
  },
};

/** Los nombres de áreas y niveles son textos localizados o cadenas sueltas. */
function localizedOrNull(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const text = value as Record<string, unknown>;
    const first = text['es'] ?? text['de'] ?? text['en'];
    return typeof first === 'string' ? first : null;
  }
  return null;
}

/**
 * Matriz de competencias por materia, grupo o estudiante.
 *
 * El alcance sale del filtro compartido, igual que en el resto del módulo: un
 * docente no ve el desglose por estudiante de un curso que no es suyo aunque
 * escriba el identificador a mano.
 */
export async function getKmkBreakdown(
  actor: StatisticsActor,
  dimension: BreakdownDimension,
  filters: StatisticsFilters,
): Promise<KmkBreakdown> {
  const spec = DIMENSIONS[dimension];
  const where = buildAnswerFilter(actor, filters);

  /*
   * Se excluyen las respuestas sin valor en la columna de agrupación. Existen
   * de verdad: una evaluación sin materia asignada, o la capacitación docente,
   * que no pertenece a ningún estudiante. Agruparlas produciría una fila
   * «null» que nadie sabe interpretar.
   */
  const scoped: Prisma.AttemptAnswerWhereInput = {
    AND: [where, { [spec.column]: { not: null } } as Prisma.AttemptAnswerWhereInput],
  };

  const [grouped, correct, competencies] = await Promise.all([
    prisma.attemptAnswer.groupBy({
      by: [spec.column, 'kmkCompetencyId'],
      where: scoped,
      _sum: { pointsEarned: true, pointsPossible: true },
      _count: { _all: true },
    }),
    prisma.attemptAnswer.groupBy({
      by: [spec.column, 'kmkCompetencyId'],
      where: { AND: [scoped, { isCorrect: true }] },
      _count: { _all: true },
    }),
    prisma.kmkCompetency.findMany({
      where: { active: true },
      orderBy: { position: 'asc' },
      select: { id: true, code: true, name: true, color: true },
    }),
  ]);

  const correctByKey = new Map(
    correct.map((row) => [`${row[spec.column]}|${row.kmkCompetencyId}`, row._count._all]),
  );

  const accumulated = accumulate(grouped, spec.column, correctByKey);
  const ordered = [...accumulated.values()].sort((a, b) => b.answerCount - a.answerCount);
  const visible = ordered.slice(0, ROW_LIMIT);

  const labels = await spec.describe(visible.map((entry) => entry.id));

  const rows: BreakdownRow[] = visible
    .map((entry) => {
      const label = labels.get(entry.id);
      // Una entidad borrada mientras se miraba el informe: se omite en lugar
      // de pintar una fila sin nombre.
      if (!label) return null;

      const percentage = toPercentage(entry.earned, entry.possible);
      return {
        ...label,
        answerCount: entry.answerCount,
        percentage,
        level: resolveLevel(percentage),
        cells: [...entry.cells.values()]
          .map((cell) => ({
            competencyId: cell.competencyId,
            percentage: toPercentage(cell.earned, cell.possible),
            answerCount: cell.answerCount,
            correctCount: cell.correctCount,
            correctRate:
              cell.answerCount > 0 ? toPercentage(cell.correctCount, cell.answerCount) : 0,
            level: resolveLevel(toPercentage(cell.earned, cell.possible)),
          }))
          .sort((a, b) => competencyOrder(competencies, a) - competencyOrder(competencies, b)),
      } satisfies BreakdownRow;
    })
    .filter((row): row is BreakdownRow => row !== null);

  return {
    dimension,
    competencies: competencies.map((competency) => ({
      id: competency.id,
      code: competency.code,
      name: competency.name as LocalizedText,
      color: competency.color,
    })),
    rows,
    coverage: { measured: rows.length, total: ordered.length },
    totalAnswers: ordered.reduce((sum, entry) => sum + entry.answerCount, 0),
    truncated: ordered.length > visible.length,
  };
}

function competencyOrder(
  competencies: Array<{ id: string }>,
  cell: { competencyId: string },
): number {
  const index = competencies.findIndex((competency) => competency.id === cell.competencyId);
  return index === -1 ? competencies.length : index;
}

interface Accumulator {
  id: string;
  earned: number;
  possible: number;
  answerCount: number;
  cells: Map<
    string,
    {
      competencyId: string;
      earned: number;
      possible: number;
      answerCount: number;
      correctCount: number;
    }
  >;
}

/** Pliega las filas del `GROUP BY` en una entrada por entidad. */
function accumulate(
  grouped: Array<Record<string, unknown> & { kmkCompetencyId: string }>,
  column: DimensionSpec['column'],
  correctByKey: Map<string, number>,
): Map<string, Accumulator> {
  const result = new Map<string, Accumulator>();

  for (const row of grouped) {
    const id = row[column];
    if (typeof id !== 'string') continue;

    const sums = row['_sum'] as { pointsEarned: unknown; pointsPossible: unknown };
    const count = (row['_count'] as { _all: number })._all;
    const earned = Number(sums.pointsEarned ?? 0);
    const possible = Number(sums.pointsPossible ?? 0);

    const entry = result.get(id) ?? {
      id,
      earned: 0,
      possible: 0,
      answerCount: 0,
      cells: new Map(),
    };
    entry.earned += earned;
    entry.possible += possible;
    entry.answerCount += count;

    entry.cells.set(row.kmkCompetencyId, {
      competencyId: row.kmkCompetencyId,
      earned,
      possible,
      answerCount: count,
      correctCount: correctByKey.get(`${id}|${row.kmkCompetencyId}`) ?? 0,
    });

    result.set(id, entry);
  }

  return result;
}
