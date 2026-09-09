import { toPercentage, type LocalizedText } from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import {
  buildAnswerFilter,
  buildAttemptFilter,
  type StatisticsActor,
  type StatisticsFilters,
} from './filters.js';

/**
 * Estadísticas.
 *
 * Toda la analítica por competencia se apoya en las copias que la calificación
 * dejó en `attempt_answers`: competencia, materia, grupo y periodo. Eso
 * convierte cada consulta en un `GROUP BY` sobre una tabla indexada, en lugar
 * de un recorrido `intento → versión → pregunta` que no aguantaría los cien mil
 * intentos del objetivo de escala.
 *
 * Ningún cálculo se hace en el frontend. Aquí salen las cifras y allí se
 * pintan, de modo que dos pantallas no puedan discrepar sobre el mismo dato.
 */

export interface CompetencyStatistics {
  competencyId: string;
  code: string;
  name: LocalizedText;
  color: string;
  /** Porcentaje medio obtenido en las preguntas de esta competencia. */
  percentage: number;
  pointsEarned: number;
  pointsPossible: number;
  /** Preguntas respondidas, no preguntas existentes. */
  answerCount: number;
  /** Cuántas se resolvieron por completo bien. */
  correctCount: number;
  correctRate: number;
  /** Nivel alcanzado, derivado del porcentaje. */
  level: 'INICIAL' | 'EN_DESARROLLO' | 'CONSOLIDADO' | 'AVANZADO';
}

export interface CompetencyTrendPoint {
  period: string;
  competencyId: string;
  code: string;
  percentage: number;
  answerCount: number;
}

export interface KmkReport {
  competencies: CompetencyStatistics[];
  trend: CompetencyTrendPoint[];
  /** Competencia con mejor resultado, si hay datos suficientes. */
  strongest: CompetencyStatistics | null;
  weakest: CompetencyStatistics | null;
  totalAnswers: number;
}

/**
 * Nivel alcanzado en una competencia.
 *
 * Los cortes se eligen para que digan algo pedagógicamente: por debajo del
 * 50 % la competencia no está adquirida, y por encima del 90 % lo está con
 * solvencia. No se reutiliza la escala de calificación porque una nota es un
 * juicio sobre una evaluación concreta y esto es una tendencia acumulada.
 */
function resolveLevel(percentage: number): CompetencyStatistics['level'] {
  if (percentage >= 90) return 'AVANZADO';
  if (percentage >= 70) return 'CONSOLIDADO';
  if (percentage >= 50) return 'EN_DESARROLLO';
  return 'INICIAL';
}

/**
 * Desempeño por competencia KMK.
 *
 * Es la consulta central de la plataforma: la que responde «¿en qué es fuerte
 * y en qué flojea este estudiante, este grupo o este colegio?».
 */
export async function getKmkReport(
  actor: StatisticsActor,
  filters: StatisticsFilters,
): Promise<KmkReport> {
  const where = buildAnswerFilter(actor, filters);

  const [grouped, correctByCompetency, competencies] = await Promise.all([
    prisma.attemptAnswer.groupBy({
      by: ['kmkCompetencyId'],
      where,
      _sum: { pointsEarned: true, pointsPossible: true },
      _count: { _all: true },
    }),
    prisma.attemptAnswer.groupBy({
      by: ['kmkCompetencyId'],
      where: { AND: [where, { isCorrect: true }] },
      _count: { _all: true },
    }),
    prisma.kmkCompetency.findMany({
      where: { active: true },
      orderBy: { position: 'asc' },
      select: { id: true, code: true, name: true, color: true },
    }),
  ]);

  const sums = new Map(grouped.map((row) => [row.kmkCompetencyId, row]));
  const correct = new Map(correctByCompetency.map((row) => [row.kmkCompetencyId, row._count._all]));

  // Se recorre el catálogo de competencias y no el resultado del `GROUP BY`:
  // una competencia sin datos debe aparecer con cero, no desaparecer del
  // informe. Que falte información es en sí una información.
  const result: CompetencyStatistics[] = competencies.map((competency) => {
    const row = sums.get(competency.id);
    const earned = Number(row?._sum.pointsEarned ?? 0);
    const possible = Number(row?._sum.pointsPossible ?? 0);
    const answerCount = row?._count._all ?? 0;
    const correctCount = correct.get(competency.id) ?? 0;
    const percentage = toPercentage(earned, possible);

    return {
      competencyId: competency.id,
      code: competency.code,
      name: competency.name as LocalizedText,
      color: competency.color,
      percentage,
      pointsEarned: earned,
      pointsPossible: possible,
      answerCount,
      correctCount,
      correctRate: answerCount > 0 ? toPercentage(correctCount, answerCount) : 0,
      level: resolveLevel(percentage),
    };
  });

  // Fortaleza y debilidad se calculan solo entre las competencias que se han
  // medido de verdad: declarar «más débil» una que nadie ha evaluado sería
  // engañoso, y es justo la que aparecería con 0 %.
  const measured = result.filter((entry) => entry.answerCount > 0);
  const sorted = [...measured].sort((a, b) => b.percentage - a.percentage);

  return {
    competencies: result,
    trend: await getCompetencyTrend(actor, filters),
    strongest: sorted[0] ?? null,
    weakest: sorted.length > 1 ? (sorted[sorted.length - 1] ?? null) : null,
    totalAnswers: measured.reduce((sum, entry) => sum + entry.answerCount, 0),
  };
}

/**
 * Evolución temporal por competencia, agrupada por mes.
 *
 * Se leen solo las cuatro columnas que hacen falta y se agrupa en memoria.
 * PostgreSQL agruparía por `date_trunc` más rápido, pero eso obligaría a
 * reconstruir en SQL las mismas condiciones que ya expresa el filtro
 * compartido, y duplicar la lógica de filtrado es justo lo que este módulo
 * existe para evitar: bastaría con que una de las dos versiones se quedara
 * atrás para que dos pantallas mostraran cifras distintas.
 *
 * El tope evita que una consulta sin filtros intente traer el histórico
 * completo; se toman las más recientes, que son las que forman la tendencia.
 */
const TREND_ROW_LIMIT = 50_000;

async function getCompetencyTrend(
  actor: StatisticsActor,
  filters: StatisticsFilters,
): Promise<CompetencyTrendPoint[]> {
  const rows = await prisma.attemptAnswer.findMany({
    where: buildAnswerFilter(actor, filters),
    select: {
      answeredAt: true,
      pointsEarned: true,
      pointsPossible: true,
      kmkCompetency: { select: { id: true, code: true } },
    },
    orderBy: { answeredAt: 'desc' },
    take: TREND_ROW_LIMIT,
  });

  const buckets = new Map<
    string,
    {
      period: string;
      competencyId: string;
      code: string;
      earned: number;
      possible: number;
      count: number;
    }
  >();

  for (const row of rows) {
    const period = row.answeredAt.toISOString().slice(0, 7);
    const key = `${period}|${row.kmkCompetency.id}`;

    const bucket = buckets.get(key) ?? {
      period,
      competencyId: row.kmkCompetency.id,
      code: row.kmkCompetency.code,
      earned: 0,
      possible: 0,
      count: 0,
    };

    bucket.earned += Number(row.pointsEarned);
    bucket.possible += Number(row.pointsPossible);
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => ({
      period: bucket.period,
      competencyId: bucket.competencyId,
      code: bucket.code,
      percentage: toPercentage(bucket.earned, bucket.possible),
      answerCount: bucket.count,
    }))
    .sort((a, b) => a.period.localeCompare(b.period) || a.code.localeCompare(b.code));
}

// --- Resúmenes por rol -------------------------------------------------------

export interface OverviewStatistics {
  attempts: number;
  completedAttempts: number;
  pendingReview: number;
  averagePercentage: number;
  passRate: number;
  activeStudents: number;
  activeTeachers: number;
  publishedAssessments: number;
}

export async function getOverview(
  actor: StatisticsActor,
  filters: StatisticsFilters,
): Promise<OverviewStatistics> {
  const where = buildAttemptFilter(actor, filters);

  const [aggregate, passed, pendingReview, students, teachers, assessments] = await Promise.all([
    prisma.assessmentAttempt.aggregate({
      where,
      _avg: { percentage: true },
      _count: { _all: true },
    }),
    prisma.assessmentAttempt.count({ where: { AND: [where, { passed: true }] } }),
    prisma.assessmentAttempt.count({ where: { AND: [where, { requiresManualGrading: true }] } }),
    prisma.student.count({ where: { enrollmentStatus: { in: ['ACTIVE', 'ENROLLED'] } } }),
    prisma.teacher.count({ where: { active: true, user: { deletedAt: null } } }),
    prisma.assessmentVersion.count({ where: { status: 'PUBLISHED' } }),
  ]);

  const total = aggregate._count._all;

  return {
    attempts: total,
    completedAttempts: total,
    pendingReview,
    averagePercentage: Math.round(Number(aggregate._avg.percentage ?? 0) * 100) / 100,
    passRate: total > 0 ? toPercentage(passed, total) : 0,
    activeStudents: students,
    activeTeachers: teachers,
    publishedAssessments: assessments,
  };
}

export interface StudentProgress {
  attempts: number;
  pending: number;
  averagePercentage: number;
  passRate: number;
  /** Últimos resultados, para la línea de progreso. */
  recent: Array<{
    attemptId: string;
    title: string;
    percentage: number;
    gradeValue: number | null;
    passed: boolean;
    submittedAt: Date | null;
  }>;
}

/**
 * Progreso de un estudiante.
 *
 * `pending` cuenta asignaciones sin terminar, no intentos: es lo que el
 * estudiante entiende por «me falta», y no coincide con los intentos porque
 * una asignación sin empezar no tiene ninguno.
 */
export async function getStudentProgress(
  actor: StatisticsActor,
  userId: string,
  filters: StatisticsFilters,
): Promise<StudentProgress> {
  const where = buildAttemptFilter(actor, { ...filters });

  const [aggregate, passed, pending, recent] = await Promise.all([
    prisma.assessmentAttempt.aggregate({
      where: { AND: [where, { userId }] },
      _avg: { percentage: true },
      _count: { _all: true },
    }),
    prisma.assessmentAttempt.count({ where: { AND: [where, { userId }, { passed: true }] } }),
    prisma.assignmentRecipient.count({
      where: { userId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    }),
    prisma.assessmentAttempt.findMany({
      where: { AND: [where, { userId }] },
      orderBy: { submittedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        percentage: true,
        gradeValue: true,
        passed: true,
        submittedAt: true,
        version: { select: { name: true } },
      },
    }),
  ]);

  const total = aggregate._count._all;

  return {
    attempts: total,
    pending,
    averagePercentage: Math.round(Number(aggregate._avg.percentage ?? 0) * 100) / 100,
    passRate: total > 0 ? toPercentage(passed, total) : 0,
    recent: recent.map((attempt) => ({
      attemptId: attempt.id,
      title: attempt.version.name,
      percentage: Number(attempt.percentage),
      gradeValue: attempt.gradeValue ? Number(attempt.gradeValue) : null,
      passed: attempt.passed,
      submittedAt: attempt.submittedAt,
    })),
  };
}

export interface TeacherOverview {
  assessmentsCreated: number;
  publishedAssessments: number;
  assignmentsIssued: number;
  studentsAssessed: number;
  pendingReview: number;
  averagePercentage: number;
  passRate: number;
}

export async function getTeacherOverview(
  actor: StatisticsActor,
  teacherUserId: string,
  filters: StatisticsFilters,
): Promise<TeacherOverview> {
  const where = buildAttemptFilter(actor, { ...filters, teacherId: teacherUserId });

  const [created, published, assignments, aggregate, passed, pendingReview, distinctStudents] =
    await Promise.all([
      prisma.assessment.count({ where: { createdById: teacherUserId, deletedAt: null } }),
      prisma.assessmentVersion.count({
        where: { status: 'PUBLISHED', assessment: { createdById: teacherUserId } },
      }),
      prisma.assignment.count({ where: { assignedById: teacherUserId } }),
      prisma.assessmentAttempt.aggregate({
        where,
        _avg: { percentage: true },
        _count: { _all: true },
      }),
      prisma.assessmentAttempt.count({ where: { AND: [where, { passed: true }] } }),
      prisma.assessmentAttempt.count({ where: { AND: [where, { requiresManualGrading: true }] } }),
      prisma.assessmentAttempt.findMany({
        where,
        distinct: ['userId'],
        select: { userId: true },
      }),
    ]);

  const total = aggregate._count._all;

  return {
    assessmentsCreated: created,
    publishedAssessments: published,
    assignmentsIssued: assignments,
    studentsAssessed: distinctStudents.length,
    pendingReview,
    averagePercentage: Math.round(Number(aggregate._avg.percentage ?? 0) * 100) / 100,
    passRate: total > 0 ? toPercentage(passed, total) : 0,
  };
}

export interface GroupStatistics {
  groupId: string;
  code: string;
  studentCount: number;
  attempts: number;
  averagePercentage: number;
  passRate: number;
  competencies: CompetencyStatistics[];
}

export async function getGroupStatistics(
  actor: StatisticsActor,
  groupId: string,
  filters: StatisticsFilters,
): Promise<GroupStatistics> {
  const group = await prisma.group.findFirstOrThrow({
    where: { id: groupId, deletedAt: null },
    select: {
      id: true,
      code: true,
      _count: { select: { memberships: { where: { active: true } } } },
    },
  });

  const scoped = { ...filters, groupId };
  const attemptWhere = buildAttemptFilter(actor, scoped);

  const [aggregate, passed, kmk] = await Promise.all([
    prisma.assessmentAttempt.aggregate({
      where: attemptWhere,
      _avg: { percentage: true },
      _count: { _all: true },
    }),
    prisma.assessmentAttempt.count({ where: { AND: [attemptWhere, { passed: true }] } }),
    getKmkReport(actor, scoped),
  ]);

  const total = aggregate._count._all;

  return {
    groupId: group.id,
    code: group.code,
    studentCount: group._count.memberships,
    attempts: total,
    averagePercentage: Math.round(Number(aggregate._avg.percentage ?? 0) * 100) / 100,
    passRate: total > 0 ? toPercentage(passed, total) : 0,
    competencies: kmk.competencies,
  };
}
