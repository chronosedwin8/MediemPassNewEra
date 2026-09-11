import { RECIPIENT_STATUS, toPercentage } from '@medienpass/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.js';
import { getKmkReport, type CompetencyStatistics } from './statistics.service.js';
import {
  COUNTED_ATTEMPT_STATUSES,
  buildAttemptFilter,
  type StatisticsActor,
  type StatisticsFilters,
} from './filters.js';

/**
 * Panel del estudiante.
 *
 * Responde a lo que un estudiante se pregunta sobre sí mismo: cuánto llevo
 * hecho, cuánto me falta, qué nota media tengo, cuánto tiempo me lleva esto y
 * cómo voy respecto a mi curso.
 *
 * Todo sale de aquí en una sola llamada. El panel anterior sumaba y promediaba
 * en el navegador a partir de la lista de asignaciones, y eso tenía dos
 * problemas: la media del panel podía no coincidir con la de estadísticas —dos
 * cifras distintas del mismo dato, que es justo lo que este módulo existe para
 * evitar— y solo podía contar lo que la lista traía.
 */

export interface StudentStanding {
  groupId: string;
  groupCode: string;
  /** Miembros activos del grupo, hayan respondido o no. */
  groupSize: number;
  /** Cuántos compañeros tienen al menos un resultado. Es la base del puesto. */
  rankedStudents: number;
  /** Puesto, empezando en 1. Los empates comparten puesto. */
  position: number;
  studentAverage: number;
  groupAverage: number;
  /** Porcentaje de compañeros que quedan por debajo o igual. */
  percentile: number;
}

export interface StudentPanel {
  assignments: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    /** Vencidas sin entregar. Se cuentan aparte: ya no se pueden recuperar. */
    expired: number;
    completionRate: number;
  };
  attempts: {
    submitted: number;
    averagePercentage: number;
    /** Nota media en la escala del colegio, donde 1,0 es lo mejor. */
    averageGrade: number | null;
    passRate: number;
    pendingReview: number;
  };
  time: {
    /** Segundos dedicados a responder evaluaciones. No es tiempo de conexión. */
    totalSeconds: number;
    averageSecondsPerAttempt: number | null;
    /** Intentos con duración registrada; el resto no entra en la media. */
    measuredAttempts: number;
  };
  /** Nulo cuando no está en ningún grupo o nadie del grupo tiene resultados. */
  standing: StudentStanding | null;
  competencies: CompetencyStatistics[];
  recent: Array<{
    attemptId: string;
    title: string;
    percentage: number;
    gradeValue: number | null;
    passed: boolean;
    submittedAt: Date | null;
    durationSeconds: number | null;
  }>;
}

/**
 * Estado de las asignaciones.
 *
 * Se cuentan destinatarios y no intentos: es lo que el estudiante entiende por
 * «me falta». Una asignación sin empezar no tiene ningún intento, así que
 * contando intentos sería invisible, que es precisamente lo contrario de lo
 * que hace falta ver.
 */
async function countAssignments(userId: string): Promise<StudentPanel['assignments']> {
  const grouped = await prisma.assignmentRecipient.groupBy({
    by: ['status'],
    where: { userId },
    _count: { _all: true },
  });

  const byStatus = new Map(grouped.map((row) => [row.status, row._count._all]));
  const completed = byStatus.get(RECIPIENT_STATUS.COMPLETED) ?? 0;
  const inProgress = byStatus.get(RECIPIENT_STATUS.IN_PROGRESS) ?? 0;
  const notStarted = byStatus.get(RECIPIENT_STATUS.PENDING) ?? 0;
  const expired = byStatus.get(RECIPIENT_STATUS.EXPIRED) ?? 0;

  /*
   * Las canceladas quedan fuera del total. Una evaluación que el docente
   * retiró no es una tarea pendiente del estudiante, y contarla solo serviría
   * para bajarle el porcentaje por algo que no hizo nadie.
   */
  const total = completed + inProgress + notStarted + expired;

  return {
    total,
    completed,
    inProgress,
    notStarted,
    expired,
    completionRate: total > 0 ? toPercentage(completed, total) : 0,
  };
}

/** Tiempo dedicado a responder, que es lo único que la plataforma cronometra. */
async function measureTime(
  where: Prisma.AssessmentAttemptWhereInput,
): Promise<StudentPanel['time']> {
  const measured = await prisma.assessmentAttempt.aggregate({
    where: { AND: [where, { durationSeconds: { not: null } }] },
    _sum: { durationSeconds: true },
    _avg: { durationSeconds: true },
    _count: { _all: true },
  });

  const count = measured._count._all;

  return {
    totalSeconds: measured._sum.durationSeconds ?? 0,
    averageSecondsPerAttempt:
      count > 0 ? Math.round(Number(measured._avg.durationSeconds ?? 0)) : null,
    measuredAttempts: count,
  };
}

/**
 * Puesto dentro del grupo.
 *
 * Se calcula sobre la media de cada compañero, no sobre una sola evaluación:
 * el puesto de una tarde no dice nada. Solo entran quienes tienen al menos un
 * resultado, porque comparar a quien ha hecho ocho evaluaciones con quien no
 * ha hecho ninguna no es una comparación.
 *
 * Lo que se devuelve es el puesto de **este** estudiante y la media del grupo.
 * Nunca los nombres ni las notas de los demás: esto es un dato para orientarse,
 * no un tablón de clasificación, y son menores.
 */
async function resolveStanding(
  studentUserId: string,
  filters: StatisticsFilters,
): Promise<StudentStanding | null> {
  const membership = await prisma.groupMembership.findFirst({
    where: {
      active: true,
      student: { userId: studentUserId },
      group: { deletedAt: null, ...(filters.groupId ? { id: filters.groupId } : {}) },
    },
    orderBy: { joinedAt: 'desc' },
    select: {
      group: {
        select: {
          id: true,
          code: true,
          _count: { select: { memberships: { where: { active: true } } } },
          memberships: {
            where: { active: true },
            select: { student: { select: { userId: true } } },
          },
        },
      },
    },
  });

  if (!membership) return null;

  const group = membership.group;
  const memberUserIds = group.memberships.map((entry) => entry.student.userId);

  /*
   * Una media por compañero en una sola consulta agrupada. Se mide sobre los
   * intentos del grupo entero, no solo los de este estudiante, porque el puesto
   * es por definición una comparación.
   */
  const averages = await prisma.assessmentAttempt.groupBy({
    by: ['userId'],
    where: {
      userId: { in: memberUserIds },
      status: { in: [...COUNTED_ATTEMPT_STATUSES] },
    },
    _avg: { percentage: true },
  });

  const scored = averages
    .map((row) => ({ userId: row.userId, average: Number(row._avg.percentage ?? 0) }))
    .sort((a, b) => b.average - a.average);

  const mine = scored.find((entry) => entry.userId === studentUserId);
  if (!mine || scored.length === 0) return null;

  // Los empates comparten puesto: dos estudiantes con la misma media no están
  // uno por delante del otro por el orden en que la base los devolvió.
  const position = scored.filter((entry) => entry.average > mine.average).length + 1;
  const notAbove = scored.filter((entry) => entry.average <= mine.average).length;
  const groupTotal = scored.reduce((sum, entry) => sum + entry.average, 0);

  return {
    groupId: group.id,
    groupCode: group.code,
    groupSize: group._count.memberships,
    rankedStudents: scored.length,
    position,
    studentAverage: Math.round(mine.average * 100) / 100,
    groupAverage: Math.round((groupTotal / scored.length) * 100) / 100,
    percentile: toPercentage(notAbove, scored.length),
  };
}

export async function getStudentPanel(
  actor: StatisticsActor,
  studentUserId: string,
  filters: StatisticsFilters,
): Promise<StudentPanel> {
  const where: Prisma.AssessmentAttemptWhereInput = {
    AND: [buildAttemptFilter(actor, filters), { userId: studentUserId }],
  };

  /*
   * El desglose por competencia se filtra por el identificador del **perfil**
   * de estudiante, no por el del usuario: es la columna que `attempt_answers`
   * lleva desnormalizada. Puede no existir —una cuenta sin matrícula todavía—,
   * y entonces el informe sale vacío en lugar de salir con los datos de todo
   * el colegio, que es lo que pasaría si el filtro se quedara sin valor.
   */
  const profile = await prisma.student.findUnique({
    where: { userId: studentUserId },
    select: { id: true },
  });

  const [assignments, aggregate, grades, passed, pendingReview, time, standing, kmk, recent] =
    await Promise.all([
      countAssignments(studentUserId),
      prisma.assessmentAttempt.aggregate({
        where,
        _avg: { percentage: true },
        _count: { _all: true },
      }),
      // La nota media se calcula solo sobre los intentos que tienen nota: los
      // que están por corregir todavía no la tienen y arrastrarían la media.
      prisma.assessmentAttempt.aggregate({
        where: { AND: [where, { gradeValue: { not: null } }] },
        _avg: { gradeValue: true },
      }),
      prisma.assessmentAttempt.count({ where: { AND: [where, { passed: true }] } }),
      prisma.assessmentAttempt.count({ where: { AND: [where, { requiresManualGrading: true }] } }),
      measureTime(where),
      resolveStanding(studentUserId, filters),
      profile
        ? getKmkReport(actor, { ...filters, studentId: profile.id })
        : Promise.resolve({ competencies: [] as CompetencyStatistics[] }),
      prisma.assessmentAttempt.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          percentage: true,
          gradeValue: true,
          passed: true,
          submittedAt: true,
          durationSeconds: true,
          version: { select: { name: true } },
        },
      }),
    ]);

  const submitted = aggregate._count._all;
  const averageGrade = grades._avg.gradeValue;

  return {
    assignments,
    attempts: {
      submitted,
      averagePercentage: Math.round(Number(aggregate._avg.percentage ?? 0) * 100) / 100,
      averageGrade: averageGrade === null ? null : Math.round(Number(averageGrade) * 100) / 100,
      passRate: submitted > 0 ? toPercentage(passed, submitted) : 0,
      pendingReview,
    },
    time,
    standing,
    competencies: kmk.competencies,
    recent: recent.map((attempt) => ({
      attemptId: attempt.id,
      title: attempt.version.name,
      percentage: Number(attempt.percentage),
      gradeValue: attempt.gradeValue === null ? null : Number(attempt.gradeValue),
      passed: attempt.passed,
      submittedAt: attempt.submittedAt,
      durationSeconds: attempt.durationSeconds,
    })),
  };
}
