import { ASSESSMENT_VERSION_STATUS, toPercentage } from '@medienpass/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.js';
import { getTrainingSummary, type TrainingSummary } from '../training/training.service.js';
import { getKmkReport, type CompetencyStatistics } from './statistics.service.js';
import { buildAttemptFilter, type StatisticsActor, type StatisticsFilters } from './filters.js';

/**
 * Panel del docente.
 *
 * Tiene dos mitades que responden a dos preguntas distintas, y por eso no se
 * mezclan en una sola lista de cifras:
 *
 *  - **Lo que enseña**: qué ha creado, a cuánta gente ha llegado, cuánto queda
 *    sin entregar y qué le falta por corregir.
 *  - **Lo que aprende**: su propia capacitación KMK, que es la evaluación del
 *    docente y se mide con los mismos módulos que cualquier otro.
 *
 * La distinción importa porque la segunda mitad es sobre él y la primera no:
 * que un curso vaya flojo puede decir muchas cosas, y casi ninguna es un
 * juicio sobre quien lo enseña. El panel las presenta separadas para que nadie
 * lea la media de un grupo como si fuera la nota del docente.
 */

export interface TeacherPanel {
  authoring: {
    assessmentsCreated: number;
    published: number;
    drafts: number;
    questionsWritten: number;
    /** Competencias KMK distintas que sus preguntas llegan a ejercitar. */
    competenciesCovered: number;
    competenciesTotal: number;
  };
  delivery: {
    assignmentsIssued: number;
    studentsReached: number;
    attemptsReceived: number;
    /** Destinatarios que nunca empezaron. Es lo que más conviene mirar. */
    notStarted: number;
    completionRate: number;
  };
  grading: {
    pendingReview: number;
    /** Días que lleva esperando lo más antiguo sin corregir. */
    oldestPendingDays: number | null;
    answersGraded: number;
  };
  outcomes: {
    averagePercentage: number;
    passRate: number;
    byGroup: Array<{
      groupId: string;
      code: string;
      attempts: number;
      averagePercentage: number;
    }>;
  };
  /** Desempeño de su alumnado por competencia, no el suyo propio. */
  competencies: CompetencyStatistics[];
  /** Su propia capacitación: la evaluación del docente. */
  training: TrainingSummary & { averageAssessmentPercentage: number | null };
}

/** Lo que ha escrito: evaluaciones, preguntas y competencias que toca. */
async function measureAuthoring(teacherUserId: string): Promise<TeacherPanel['authoring']> {
  const [created, published, questions, competencies, total] = await Promise.all([
    prisma.assessment.count({ where: { createdById: teacherUserId, deletedAt: null } }),
    prisma.assessmentVersion.count({
      where: {
        status: ASSESSMENT_VERSION_STATUS.PUBLISHED,
        assessment: { createdById: teacherUserId, deletedAt: null },
      },
    }),
    prisma.question.count({
      where: { version: { assessment: { createdById: teacherUserId, deletedAt: null } } },
    }),
    prisma.question.findMany({
      where: { version: { assessment: { createdById: teacherUserId, deletedAt: null } } },
      distinct: ['kmkCompetencyId'],
      select: { kmkCompetencyId: true },
    }),
    prisma.kmkCompetency.count({ where: { active: true } }),
  ]);

  return {
    assessmentsCreated: created,
    published,
    // Una evaluación puede tener varias versiones publicadas; lo que interesa
    // aquí es cuántas quedan sin publicar, no restar versiones de evaluaciones.
    drafts: Math.max(created - published, 0),
    questionsWritten: questions,
    competenciesCovered: competencies.length,
    competenciesTotal: total,
  };
}

/** Lo que ha repartido y qué parte llegó a hacerse. */
async function measureDelivery(teacherUserId: string): Promise<TeacherPanel['delivery']> {
  const recipientWhere: Prisma.AssignmentRecipientWhereInput = {
    assignment: { assignedById: teacherUserId },
  };

  const [assignments, recipients, completed, notStarted, students] = await Promise.all([
    prisma.assignment.count({ where: { assignedById: teacherUserId } }),
    prisma.assignmentRecipient.count({ where: recipientWhere }),
    prisma.assignmentRecipient.count({ where: { AND: [recipientWhere, { status: 'COMPLETED' }] } }),
    prisma.assignmentRecipient.count({ where: { AND: [recipientWhere, { status: 'PENDING' }] } }),
    prisma.assignmentRecipient.findMany({
      where: recipientWhere,
      distinct: ['userId'],
      select: { userId: true },
    }),
  ]);

  return {
    assignmentsIssued: assignments,
    studentsReached: students.length,
    attemptsReceived: completed,
    notStarted,
    completionRate: recipients > 0 ? toPercentage(completed, recipients) : 0,
  };
}

/** Lo que le falta por corregir y desde cuándo. */
async function measureGrading(teacherUserId: string): Promise<TeacherPanel['grading']> {
  const pendingWhere: Prisma.AttemptAnswerWhereInput = {
    requiresManualGrading: true,
    gradedAt: null,
    attempt: { version: { assessment: { createdById: teacherUserId } } },
  };

  const [pending, oldest, graded] = await Promise.all([
    prisma.attemptAnswer.count({ where: pendingWhere }),
    prisma.attemptAnswer.findFirst({
      where: pendingWhere,
      orderBy: { answeredAt: 'asc' },
      select: { answeredAt: true },
    }),
    prisma.attemptAnswer.count({ where: { gradedById: teacherUserId } }),
  ]);

  /*
   * La antigüedad se cuenta desde que se respondió, no desde que se entregó el
   * intento: es el tiempo que lleva esperando quien escribió esa respuesta, que
   * es de quien se trata.
   */
  const oldestPendingDays = oldest
    ? Math.floor((Date.now() - oldest.answeredAt.getTime()) / 86_400_000)
    : null;

  return { pendingReview: pending, oldestPendingDays, answersGraded: graded };
}

/** Resultados de lo suyo, en conjunto y curso a curso. */
async function measureOutcomes(
  actor: StatisticsActor,
  teacherUserId: string,
  filters: StatisticsFilters,
): Promise<TeacherPanel['outcomes']> {
  const where = buildAttemptFilter(actor, { ...filters, teacherId: teacherUserId });

  const [aggregate, passed, assigned] = await Promise.all([
    prisma.assessmentAttempt.aggregate({
      where,
      _avg: { percentage: true },
      _count: { _all: true },
    }),
    prisma.assessmentAttempt.count({ where: { AND: [where, { passed: true }] } }),
    // Los cursos a los que ha asignado algo, que son los que pueden aparecer.
    prisma.assignment.findMany({
      where: { assignedById: teacherUserId, groupId: { not: null } },
      distinct: ['groupId'],
      select: { group: { select: { id: true, code: true } } },
    }),
  ]);

  const total = aggregate._count._all;

  /*
   * Una consulta por curso, y no una sola agrupada, porque el promedio de una
   * evaluación es el del **intento**: `attempt_answers` permitiría agrupar de
   * golpe, pero promediaría puntos de respuestas y daría más peso a las
   * preguntas que valen más, que es otra cifra distinta de la que se enseña
   * en el resto de la plataforma.
   *
   * El número de consultas lo acota la realidad del caso: son los cursos de un
   * docente, no los del colegio.
   */
  const groups = assigned
    .map((entry) => entry.group)
    .filter((group): group is { id: string; code: string } => group !== null);

  const perGroup = await Promise.all(
    groups.map(async (group) => {
      const scoped = buildAttemptFilter(actor, {
        ...filters,
        teacherId: teacherUserId,
        groupId: group.id,
      });
      const result = await prisma.assessmentAttempt.aggregate({
        where: scoped,
        _avg: { percentage: true },
        _count: { _all: true },
      });
      return {
        groupId: group.id,
        attempts: result._count._all,
        averagePercentage: Math.round(Number(result._avg.percentage ?? 0) * 100) / 100,
      };
    }),
  );

  const codeById = new Map(groups.map((group) => [group.id, group.code]));

  return {
    averagePercentage: Math.round(Number(aggregate._avg.percentage ?? 0) * 100) / 100,
    passRate: total > 0 ? toPercentage(passed, total) : 0,
    byGroup: perGroup
      .filter((entry) => entry.attempts > 0)
      .map((entry) => ({ ...entry, code: codeById.get(entry.groupId) ?? '' }))
      .sort((a, b) => b.attempts - a.attempts),
  };
}

/** Nota media de sus evaluaciones de capacitación, si ha hecho alguna. */
function averageTrainingScore(summary: TrainingSummary): number | null {
  const scored = summary.byCompetency
    .map((entry) => entry.assessmentPercentage)
    .filter((value): value is number => value !== null);

  if (scored.length === 0) return null;

  const total = scored.reduce((sum, value) => sum + value, 0);
  return Math.round((total / scored.length) * 100) / 100;
}

export async function getTeacherPanel(
  actor: StatisticsActor,
  teacherUserId: string,
  filters: StatisticsFilters,
): Promise<TeacherPanel> {
  const [authoring, delivery, grading, outcomes, kmk, training] = await Promise.all([
    measureAuthoring(teacherUserId),
    measureDelivery(teacherUserId),
    measureGrading(teacherUserId),
    measureOutcomes(actor, teacherUserId, filters),
    getKmkReport(actor, { ...filters, teacherId: teacherUserId }),
    getTrainingSummary({ userId: teacherUserId, roles: actor.roles }, teacherUserId),
  ]);

  return {
    authoring,
    delivery,
    grading,
    outcomes,
    competencies: kmk.competencies,
    training: { ...training, averageAssessmentPercentage: averageTrainingScore(training) },
  };
}
