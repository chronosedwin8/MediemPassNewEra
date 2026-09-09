import { ROLE, richTextToPlain, toPercentage } from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { isAdmin } from '../../middleware/authorize.js';
import { buildAnswerFilter, buildAttemptFilter } from './filters.js';
import type { StatisticsActor, StatisticsFilters } from './filters.js';

/**
 * Cómo le fue a cada grupo en una evaluación concreta.
 *
 * Es la pregunta que un docente se hace de verdad después de aplicar algo:
 * «¿cómo fue en 10A frente a 10B?» y «¿qué pregunta falló todo el mundo?». El
 * panel general responde a «cómo va el colegio», que es otra cosa y no sirve
 * para decidir qué repasar mañana.
 *
 * Se cuenta sobre **todas** las versiones de la evaluación. Separar por versión
 * daría cifras más puras y respondería a una pregunta que nadie hace: para
 * quien enseña, «la evaluación de fuentes digitales» es una sola cosa aunque
 * por el camino se haya corregido una errata.
 */

export interface AssessmentGroupResult {
  groupId: string;
  code: string;
  /** A cuántos se les asignó, que no es lo mismo que cuántos hay en el grupo. */
  assigned: number;
  submitted: number;
  pendingReview: number;
  inProgress: number;
  notStarted: number;
  averagePercentage: number;
  passRate: number;
  /** Distribución por banda de la escala: la forma del curso, no solo su media. */
  bands: Array<{ label: string; count: number }>;
}

export interface HardQuestion {
  questionId: string;
  /**
   * Versión a la que pertenece.
   *
   * Sin este dato, dos versiones de la misma pregunta aparecen como «#1 al
   * 83 %» y «#1 al 100 %», y cualquiera lo lee como un error de cálculo en
   * lugar de como lo que es: la corrección funcionó.
   */
  versionNumber: number;
  position: number;
  statement: string;
  competencyCode: string;
  correctRate: number;
  answered: number;
}

export interface AssessmentReport {
  assessmentId: string;
  title: string;
  versions: Array<{ id: string; versionNumber: number; status: string }>;
  totals: { assigned: number; submitted: number; averagePercentage: number; passRate: number };
  groups: AssessmentGroupResult[];
  /** Preguntas ordenadas por la dificultad observada, no por la declarada. */
  hardestQuestions: HardQuestion[];
}

interface RecipientRow {
  userId: string;
  assignment: { groupId: string | null; group: { id: string; code: string } | null };
}

interface AttemptRow {
  userId: string;
  status: string;
  percentage: unknown;
  passed: boolean;
  gradeLabel: unknown;
  recipient: { assignment: { groupId: string | null } };
}

function labelOf(gradeLabel: unknown): string {
  const label = gradeLabel as Record<string, string> | null;
  return label?.['es'] ?? label?.['de'] ?? label?.['en'] ?? '—';
}

/** El alcance del docente, aplicado también al recuento de destinatarios. */
function recipientScope(actor: StatisticsActor) {
  if (isAdmin(actor) || !actor.roles.includes(ROLE.TEACHER)) return {};
  return {
    OR: [
      { assignment: { group: { homeroomTeacherId: actor.userId } } },
      { assignment: { version: { assessment: { createdById: actor.userId } } } },
    ],
  };
}

function buildGroupResults(
  recipients: RecipientRow[],
  attempts: AttemptRow[],
): AssessmentGroupResult[] {
  const byGroup = new Map<string, { code: string; assigned: Set<string> }>();

  for (const recipient of recipients) {
    const group = recipient.assignment.group;
    if (!group) continue;
    const entry = byGroup.get(group.id) ?? { code: group.code, assigned: new Set<string>() };
    entry.assigned.add(recipient.userId);
    byGroup.set(group.id, entry);
  }

  const attemptsByGroup = new Map<string, AttemptRow[]>();
  for (const attempt of attempts) {
    const groupId = attempt.recipient.assignment.groupId;
    if (!groupId) continue;
    attemptsByGroup.set(groupId, [...(attemptsByGroup.get(groupId) ?? []), attempt]);
  }

  return [...byGroup.entries()]
    .map(([groupId, { code, assigned }]) => {
      const rows = attemptsByGroup.get(groupId) ?? [];
      const submitted = rows.filter((row) => row.status !== 'IN_PROGRESS');

      const bands = new Map<string, number>();
      for (const row of submitted) {
        const label = labelOf(row.gradeLabel);
        bands.set(label, (bands.get(label) ?? 0) + 1);
      }

      const average =
        submitted.length > 0
          ? submitted.reduce((sum, row) => sum + Number(row.percentage), 0) / submitted.length
          : 0;

      return {
        groupId,
        code,
        assigned: assigned.size,
        submitted: submitted.length,
        pendingReview: rows.filter((row) => row.status === 'PENDING_REVIEW').length,
        inProgress: rows.filter((row) => row.status === 'IN_PROGRESS').length,
        // Los que ni siquiera abrieron. Es el número que decide si vale la pena
        // mirar el resto: una media de 40 % con la mitad sin empezar no dice
        // nada sobre la clase.
        notStarted: Math.max(0, assigned.size - rows.length),
        averagePercentage: Math.round(average * 100) / 100,
        passRate:
          submitted.length > 0
            ? toPercentage(submitted.filter((row) => row.passed).length, submitted.length)
            : 0,
        bands: [...bands.entries()].map(([label, count]) => ({ label, count })),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

function summariseTotals(assigned: number, attempts: AttemptRow[]) {
  const submitted = attempts.filter((row) => row.status !== 'IN_PROGRESS');
  const average =
    submitted.length > 0
      ? submitted.reduce((sum, row) => sum + Number(row.percentage), 0) / submitted.length
      : 0;

  return {
    assigned,
    submitted: submitted.length,
    averagePercentage: Math.round(average * 100) / 100,
    passRate:
      submitted.length > 0
        ? toPercentage(submitted.filter((row) => row.passed).length, submitted.length)
        : 0,
  };
}

/**
 * Las preguntas con peor tasa de acierto.
 *
 * La dificultad que declaró quien escribió la pregunta es una intención; esta
 * es la que se observó. Cuando no coinciden, el problema suele estar en el
 * enunciado y no en la clase, y es justo lo que hay que poder ver.
 */
async function findHardestQuestions(
  actor: StatisticsActor,
  assessmentId: string,
  filters: StatisticsFilters,
): Promise<HardQuestion[]> {
  const answerWhere = buildAnswerFilter(actor, filters);

  const rows = await prisma.attemptAnswer.groupBy({
    by: ['questionId'],
    where: { AND: [answerWhere, { attempt: { version: { assessmentId } } }] },
    _count: { _all: true },
    _sum: { pointsEarned: true, pointsPossible: true },
  });

  if (rows.length === 0) return [];

  const questions = await prisma.question.findMany({
    where: { id: { in: rows.map((row) => row.questionId) } },
    select: {
      id: true,
      position: true,
      statement: true,
      version: { select: { versionNumber: true } },
      kmkCompetency: { select: { code: true } },
    },
  });
  const byId = new Map(questions.map((question) => [question.id, question]));

  return rows
    .map((row) => {
      const question = byId.get(row.questionId);
      const earned = Number(row._sum.pointsEarned ?? 0);
      const possible = Number(row._sum.pointsPossible ?? 0);
      return {
        questionId: row.questionId,
        versionNumber: question?.version.versionNumber ?? 1,
        position: (question?.position ?? 0) + 1,
        // Sin etiquetas: en una tabla, un enunciado con formato estorba.
        statement: richTextToPlain(question?.statement ?? ''),
        competencyCode: question?.kmkCompetency.code ?? '—',
        correctRate: possible > 0 ? toPercentage(earned, possible) : 0,
        answered: row._count._all,
      };
    })
    .sort((a, b) => a.correctRate - b.correctRate)
    .slice(0, 10);
}

export async function getAssessmentReport(
  actor: StatisticsActor,
  assessmentId: string,
  filters: StatisticsFilters,
): Promise<AssessmentReport> {
  const assessment = await prisma.assessment.findFirstOrThrow({
    where: { id: assessmentId, deletedAt: null },
    select: {
      id: true,
      title: true,
      versions: {
        orderBy: { versionNumber: 'desc' },
        select: { id: true, versionNumber: true, status: true },
      },
    },
  });

  const ofAssessment = { version: { assessmentId } };

  /*
   * Los destinatarios y los intentos se piden por separado a propósito.
   *
   * Los primeros dicen a cuántos se asignó; los segundos, cuántos respondieron.
   * Sin ambos no se puede distinguir «nadie aprobó» de «nadie lo ha hecho
   * todavía», que para un docente son situaciones opuestas.
   */
  const [recipients, attempts] = await Promise.all([
    prisma.assignmentRecipient.findMany({
      where: { assignment: { version: { assessmentId } }, ...recipientScope(actor) },
      select: {
        userId: true,
        assignment: { select: { groupId: true, group: { select: { id: true, code: true } } } },
      },
    }),
    prisma.assessmentAttempt.findMany({
      where: { AND: [buildAttemptFilter(actor, filters), ofAssessment] },
      select: {
        userId: true,
        status: true,
        percentage: true,
        passed: true,
        gradeLabel: true,
        recipient: { select: { assignment: { select: { groupId: true } } } },
      },
    }),
  ]);

  return {
    assessmentId: assessment.id,
    title: assessment.title,
    versions: assessment.versions,
    totals: summariseTotals(recipients.length, attempts),
    groups: buildGroupResults(recipients, attempts),
    hardestQuestions: await findHardestQuestions(actor, assessmentId, filters),
  };
}
