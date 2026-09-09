import { z } from 'zod';
import { ATTEMPT_STATUS, ROLE, type Role } from '@medienpass/shared';
import type { Prisma } from '@prisma/client';
import { isAdmin } from '../../middleware/authorize.js';

/**
 * Filtros de estadísticas, en un único sitio.
 *
 * La especificación pide expresamente que estén centralizados «para evitar
 * consultas inconsistentes», y la razón es concreta: si el panel del docente y
 * el del administrador construyen su propio `where`, tarde o temprano uno
 * incluye los intentos pendientes de corregir y el otro no, y las dos
 * pantallas muestran cifras distintas del mismo dato. Cuando eso pasa, nadie
 * vuelve a fiarse de ninguna.
 *
 * Todo lo que agrega estadísticas parte de aquí.
 */

export const statisticsFiltersSchema = z.object({
  academicYearId: z.string().uuid().optional(),
  periodId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  gradeLevelId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  competencyId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type StatisticsFilters = z.infer<typeof statisticsFiltersSchema>;

export interface StatisticsActor {
  userId: string;
  roles: Role[];
}

/**
 * Estados de intento que cuentan para la estadística.
 *
 * Se incluyen los pendientes de corrección: la parte automática ya está
 * calificada y excluirlos haría que el promedio de una evaluación con
 * preguntas abiertas apareciera vacío durante días, hasta que el docente
 * terminara de corregir. Se excluyen los intentos en curso y los abandonados,
 * que todavía no son un resultado.
 */
export const COUNTED_ATTEMPT_STATUSES = [
  ATTEMPT_STATUS.GRADED,
  ATTEMPT_STATUS.PENDING_REVIEW,
  ATTEMPT_STATUS.SUBMITTED,
  ATTEMPT_STATUS.EXPIRED,
] as const;

/**
 * Restricción de alcance.
 *
 * Un administrador ve todo. Un docente, lo que ocurre en sus grupos o con las
 * evaluaciones que él creó. Un estudiante, solo lo suyo. Se aplica **siempre**,
 * incluso cuando el usuario pide filtros más amplios: pedir no es poder.
 */
function scopeClause(actor: StatisticsActor): Prisma.AttemptAnswerWhereInput {
  if (isAdmin(actor)) return {};

  if (actor.roles.includes(ROLE.TEACHER)) {
    return {
      OR: [
        { group: { homeroomTeacherId: actor.userId } },
        { attempt: { version: { assessment: { createdById: actor.userId } } } },
      ],
    };
  }

  return { attempt: { userId: actor.userId } };
}

/**
 * Correspondencia entre cada filtro y su condición sobre `attempt_answers`.
 *
 * Como tabla y no como cadena de condicionales: añadir un filtro es añadir una
 * entrada, y de un vistazo se ve cuáles son columnas directas —gracias a la
 * desnormalización— y cuáles exigen un salto de relación.
 */
const ANSWER_FILTER_MAP: Array<{
  key: keyof StatisticsFilters;
  toClause: (value: string) => Prisma.AttemptAnswerWhereInput;
}> = [
  // Columnas desnormalizadas: filtrado directo, sin recorrer relaciones.
  { key: 'subjectId', toClause: (value) => ({ subjectId: value }) },
  { key: 'groupId', toClause: (value) => ({ groupId: value }) },
  { key: 'periodId', toClause: (value) => ({ academicPeriodId: value }) },
  { key: 'competencyId', toClause: (value) => ({ kmkCompetencyId: value }) },

  // Filtros que sí requieren un salto, sobre relaciones ya indexadas.
  { key: 'areaId', toClause: (value) => ({ subject: { areaId: value } }) },
  { key: 'gradeLevelId', toClause: (value) => ({ group: { gradeLevelId: value } }) },
  { key: 'academicYearId', toClause: (value) => ({ group: { academicYearId: value } }) },
  {
    key: 'teacherId',
    toClause: (value) => ({ attempt: { version: { assessment: { createdById: value } } } }),
  },
  { key: 'studentId', toClause: (value) => ({ attempt: { user: { student: { id: value } } } }) },
];

/**
 * Traduce los filtros a una condición sobre `attempt_answers`.
 *
 * Esa tabla lleva desnormalizados competencia, materia, grupo y periodo, de
 * modo que la mayoría de los filtros son columnas directas y no recorridos por
 * varias relaciones.
 */
export function buildAnswerFilter(
  actor: StatisticsActor,
  filters: StatisticsFilters,
): Prisma.AttemptAnswerWhereInput {
  const conditions: Prisma.AttemptAnswerWhereInput[] = [
    scopeClause(actor),
    { attempt: { status: { in: [...COUNTED_ATTEMPT_STATUSES] } } },
  ];

  for (const { key, toClause } of ANSWER_FILTER_MAP) {
    const value = filters[key];
    if (typeof value === 'string' && value) conditions.push(toClause(value));
  }

  if (filters.from || filters.to) {
    conditions.push({
      answeredAt: {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      },
    });
  }

  // Se combinan con AND explícito: repetir la clave `attempt` en un mismo
  // objeto haría que la última sobrescribiera a las anteriores en silencio.
  return { AND: conditions };
}

/** La misma tabla, para lo que se mide por intento y no por respuesta. */
const ATTEMPT_FILTER_MAP: Array<{
  key: keyof StatisticsFilters;
  toClause: (value: string) => Prisma.AssessmentAttemptWhereInput;
}> = [
  { key: 'subjectId', toClause: (value) => ({ version: { assessment: { subjectId: value } } }) },
  { key: 'areaId', toClause: (value) => ({ version: { assessment: { areaId: value } } }) },
  { key: 'teacherId', toClause: (value) => ({ version: { assessment: { createdById: value } } }) },
  { key: 'groupId', toClause: (value) => ({ recipient: { assignment: { groupId: value } } }) },
  {
    key: 'gradeLevelId',
    toClause: (value) => ({ recipient: { assignment: { group: { gradeLevelId: value } } } }),
  },
  {
    key: 'academicYearId',
    toClause: (value) => ({ recipient: { assignment: { group: { academicYearId: value } } } }),
  },
  { key: 'studentId', toClause: (value) => ({ user: { student: { id: value } } }) },
];

/** Alcance sobre intentos. Mismo criterio que el de respuestas. */
function attemptScopeClause(actor: StatisticsActor): Prisma.AssessmentAttemptWhereInput | null {
  if (isAdmin(actor)) return null;

  if (actor.roles.includes(ROLE.TEACHER)) {
    return {
      OR: [
        { recipient: { assignment: { group: { homeroomTeacherId: actor.userId } } } },
        { version: { assessment: { createdById: actor.userId } } },
      ],
    };
  }

  return { userId: actor.userId };
}

/**
 * La condición equivalente sobre intentos, para lo que se mide por intento y
 * no por respuesta: tasa de aprobación, promedio, número de evaluaciones.
 */
export function buildAttemptFilter(
  actor: StatisticsActor,
  filters: StatisticsFilters,
): Prisma.AssessmentAttemptWhereInput {
  const conditions: Prisma.AssessmentAttemptWhereInput[] = [
    { status: { in: [...COUNTED_ATTEMPT_STATUSES] } },
  ];

  const scope = attemptScopeClause(actor);
  if (scope) conditions.push(scope);

  for (const { key, toClause } of ATTEMPT_FILTER_MAP) {
    const value = filters[key];
    if (typeof value === 'string' && value) conditions.push(toClause(value));
  }

  if (filters.from || filters.to) {
    conditions.push({
      submittedAt: {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      },
    });
  }

  return { AND: conditions };
}
