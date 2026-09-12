import {
  ATTEMPT_STATUS,
  AUDIT_ACTION,
  CLOSED_ATTEMPT_STATUSES,
  ERROR_CODE,
  QUESTION_TYPE,
  RECIPIENT_STATUS,
  SETTING_KEY,
  gradeFromPoints,
  safeParseAnswer,
  toPercentage,
  type Answer,
  type AssessmentAudience,
  type AttemptStatus,
  type LocalizedText,
  type QuestionType,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { createLogger } from '../../shared/logger.js';
import { recordAudit } from '../audit/audit.service.js';
import { getActiveScale, getScaleById } from '../settings/scales.service.js';
import { getSetting } from '../settings/settings.service.js';
import { resolvePeriodAt } from '../academic/calendar.service.js';
import { gradeAnswer } from '../assessments/grading/registry.js';
import { sanitizeRichText } from '../../shared/security/sanitize.js';

const log = createLogger('engine');

/**
 * Motor de evaluación.
 *
 * Desacoplado de Express y de Vue: recibe identificadores y devuelve datos.
 * Sirve por igual a evaluaciones de estudiantes, de docentes y de capacitación,
 * porque opera sobre `userId` y no sobre un perfil concreto.
 *
 * Dos principios que atraviesan todo el archivo:
 *
 *  1. **El servidor es la autoridad sobre el tiempo.** El temporizador del
 *     navegador es información para el estudiante, nunca la fuente de verdad.
 *  2. **Las respuestas correctas no salen del servidor** mientras el intento
 *     está en curso. Enviarlas y ocultarlas en el cliente sería regalarlas a
 *     quien abra las herramientas de desarrollo.
 */

// --- Vistas expuestas --------------------------------------------------------

export interface AssignedAssessment {
  assignmentId: string;
  recipientId: string;
  assessmentId: string;
  title: string;
  description: string | null;
  versionId: string;
  audience: string;
  questionCount: number;
  totalPoints: number;
  timeLimitMinutes: number | null;
  startAt: Date;
  endAt: Date | null;
  attemptsAllowed: number;
  attemptsUsed: number;
  status: string;
  /** Intento sin terminar que el estudiante puede retomar. */
  resumableAttemptId: string | null;
  bestPercentage: number | null;
}

/** Pregunta tal como la ve quien responde: sin pistas sobre la solución. */
export interface QuestionForStudent {
  id: string;
  type: QuestionType;
  statement: string;
  instructions: string | null;
  points: number;
  position: number;
  mediaUrl: string | null;
  payload: unknown;
  /** Si esta pregunta admite adjuntar evidencia, y si la exige. */
  allowsEvidence: boolean;
  requiresEvidence: boolean;
  maxEvidenceFiles: number;
  competency: { id: string; code: string; name: LocalizedText; color: string };
}

export interface AttemptView {
  id: string;
  status: AttemptStatus;
  attemptNumber: number;
  startedAt: Date;
  deadlineAt: Date | null;
  /** Segundos restantes según el reloj del servidor. */
  remainingSeconds: number | null;
  /**
   * Si se puede guardar y continuar en otro momento.
   *
   * Va unido al cronómetro y no es un ajuste aparte: una evaluación con tiempo
   * se resuelve de una sentada por definición —el plazo corre desde que se
   * abre, esté el estudiante delante o no—, y ofrecer ahí un botón de «sigo
   * luego» sería prometer algo que el reloj no va a respetar.
   *
   * Sin tiempo, en cambio, lo escrito espera indefinidamente: las respuestas
   * ya se guardan solas y el intento sigue abierto hasta que se entrega o
   * cierra la asignación.
   */
  canSaveForLater: boolean;
  assessment: {
    id: string;
    versionId: string;
    title: string;
    instructions: string | null;
    questionCount: number;
    totalPoints: number;
  };
  questions: QuestionForStudent[];
  answers: Array<{ questionId: string; response: unknown; answeredAt: Date }>;
}

export interface AttemptResult {
  attemptId: string;
  status: AttemptStatus;
  pointsEarned: number;
  pointsPossible: number;
  percentage: number;
  passed: boolean;
  passingPercentage: number;
  grade: { value: number; label: LocalizedText | null } | null;
  stars: { filled: number; total: number } | null;
  requiresManualGrading: boolean;
  submittedAt: Date | null;
  durationSeconds: number | null;
  /**
   * Si este intento da derecho a diploma y se puede descargar ya.
   *
   * Lo decide el servidor y no la pantalla: las condiciones —que la evaluación
   * emita diplomas, que esté aprobada, que no quede nada por corregir y que
   * alguna competencia se haya consolidado— son las mismas que aplica el
   * generador, y calcularlas dos veces las haría divergir.
   */
  certificateAvailable: boolean;
  competencyBreakdown: Array<{
    competencyId: string;
    code: string;
    name: LocalizedText;
    color: string;
    pointsEarned: number;
    pointsPossible: number;
    percentage: number;
    questionCount: number;
  }>;
  /** Solo si la versión lo permite. */
  feedback: Array<{
    questionId: string;
    statement: string;
    isCorrect: boolean | null;
    pointsEarned: number;
    pointsPossible: number;
    feedback: string | null;
    explanation: string | null;
    teacherFeedback: string | null;
    correctAnswer: unknown;
  }> | null;
}

// --- Poda del contenido ------------------------------------------------------

/**
 * Elimina del contenido de la pregunta todo lo que revele la solución.
 *
 * Es lo primero que hay que revisar cuando se añade un tipo de pregunta: si
 * su contenido guarda la respuesta en un campo nuevo y aquí no se poda, el
 * estudiante puede leerla en la respuesta de la API.
 *
 * Se exporta para que la previsualización del docente use **esta** función y
 * no una copia. Una previsualización que decide por su cuenta qué ocultar deja
 * de decir la verdad en cuanto una de las dos cambia, y entonces sirve para lo
 * contrario de lo que existe: para dar por bueno lo que el estudiante verá.
 */
/* eslint-disable-next-line complexity -- switch exhaustivo sobre los dieciséis
   tipos de pregunta: partirlo perdería la garantía de que TypeScript avise
   cuando se añada uno nuevo y nadie lo contemple aquí, que es justo el fallo
   que filtraría respuestas correctas al estudiante. */
export function stripSolution(type: QuestionType, payload: unknown): unknown {
  const data = payload as Record<string, unknown>;

  switch (type) {
    case QUESTION_TYPE.SINGLE_CHOICE:
    case QUESTION_TYPE.MULTIPLE_CHOICE: {
      const options = (data['options'] as Array<Record<string, unknown>>) ?? [];
      return {
        ...data,
        options: options.map(({ correct: _correct, feedback: _feedback, ...rest }) => rest),
      };
    }

    case QUESTION_TYPE.IMAGE_CHOICE: {
      const options = (data['options'] as Array<Record<string, unknown>>) ?? [];
      return { ...data, options: options.map(({ correct: _correct, ...rest }) => rest) };
    }

    case QUESTION_TYPE.HOTSPOT: {
      const regions = (data['regions'] as Array<Record<string, unknown>>) ?? [];
      return { ...data, regions: regions.map(({ correct: _correct, ...rest }) => rest) };
    }

    case QUESTION_TYPE.TRUE_FALSE: {
      const { correct: _correct, ...rest } = data;
      return rest;
    }

    case QUESTION_TYPE.SHORT_ANSWER: {
      const { acceptedAnswers: _accepted, ...rest } = data;
      return rest;
    }

    case QUESTION_TYPE.FILL_BLANK: {
      const blanks = (data['blanks'] as Array<Record<string, unknown>>) ?? [];
      return {
        ...data,
        blanks: blanks.map(({ acceptedAnswers: _accepted, ...rest }) => rest),
      };
    }

    case QUESTION_TYPE.MATCHING: {
      // Se retiran los pares correctos; las dos columnas sí se necesitan.
      const { pairs: _pairs, ...rest } = data;
      return rest;
    }

    case QUESTION_TYPE.GROUPING: {
      const items = (data['items'] as Array<Record<string, unknown>>) ?? [];
      return { ...data, items: items.map(({ groupId: _groupId, ...rest }) => rest) };
    }

    case QUESTION_TYPE.ORDERING:
    case QUESTION_TYPE.TIMELINE: {
      const items = (data['items'] as Array<Record<string, unknown>>) ?? [];
      // También se baraja: presentarlos en su orden correcto sería absurdo.
      const stripped = items.map(
        ({ correctPosition: _position, dateLabel: _label, ...rest }) => rest,
      );
      return { ...data, items: shuffle(stripped) };
    }

    case QUESTION_TYPE.OPEN_TEXT:
    case QUESTION_TYPE.LONG_ANSWER: {
      const { rubric: _rubric, ...rest } = data;
      return rest;
    }

    /*
     * Las respuestas grabadas no esconden nada: el enunciado es la consigna y
     * el límite de duración lo necesita el navegador para cortar la grabación.
     * Se enumeran igualmente para que el `switch` siga siendo exhaustivo y el
     * compilador avise si algún día llevan solución.
     */
    case QUESTION_TYPE.SELFIE:
    case QUESTION_TYPE.VIDEO_RESPONSE:
    case QUESTION_TYPE.AUDIO_RESPONSE:
      return data;
  }
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

// --- Disponibilidad ----------------------------------------------------------

export async function listAssignedAssessments(userId: string): Promise<AssignedAssessment[]> {
  const recipients = await prisma.assignmentRecipient.findMany({
    where: {
      userId,
      status: { not: RECIPIENT_STATUS.CANCELLED },
      assignment: { status: { not: 'CANCELLED' } },
    },
    include: {
      assignment: {
        include: {
          version: {
            select: {
              id: true,
              questionCount: true,
              totalPoints: true,
              timeLimitMinutes: true,
              description: true,
              assessment: { select: { id: true, title: true, audience: true } },
            },
          },
        },
      },
      attempts: {
        where: { status: ATTEMPT_STATUS.IN_PROGRESS },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { assignment: { startAt: 'desc' } },
  });

  const now = new Date();

  return recipients.map((recipient) => {
    const { assignment } = recipient;
    const version = assignment.version;

    const window =
      now < assignment.startAt
        ? 'SCHEDULED'
        : assignment.endAt && now > assignment.endAt
          ? 'CLOSED'
          : 'OPEN';

    return {
      assignmentId: assignment.id,
      recipientId: recipient.id,
      assessmentId: version.assessment.id,
      title: version.assessment.title,
      description: version.description,
      versionId: version.id,
      audience: version.assessment.audience,
      questionCount: version.questionCount,
      totalPoints: Number(version.totalPoints),
      timeLimitMinutes: assignment.timeLimitMinutes ?? version.timeLimitMinutes,
      startAt: assignment.startAt,
      endAt: assignment.endAt,
      attemptsAllowed: assignment.attemptsAllowed,
      attemptsUsed: recipient.attemptsUsed,
      status: recipient.status === RECIPIENT_STATUS.COMPLETED ? 'COMPLETED' : window,
      resumableAttemptId: recipient.attempts[0]?.id ?? null,
      bestPercentage: recipient.bestPercentage ? Number(recipient.bestPercentage) : null,
    };
  });
}

/** Comprueba que el usuario puede empezar ahora mismo. */
async function assertCanStart(recipientId: string, userId: string) {
  const recipient = await prisma.assignmentRecipient.findFirst({
    where: { id: recipientId, userId },
    include: {
      assignment: { include: { version: { select: { id: true, timeLimitMinutes: true } } } },
      attempts: { where: { status: ATTEMPT_STATUS.IN_PROGRESS }, select: { id: true } },
    },
  });

  if (!recipient) throw AppError.notFound(ERROR_CODE.ASSIGNMENT_NOT_FOUND, { recipientId });

  const { assignment } = recipient;
  const now = new Date();

  if (assignment.status === 'CANCELLED' || recipient.status === RECIPIENT_STATUS.CANCELLED) {
    throw AppError.conflict(ERROR_CODE.ASSIGNMENT_CLOSED, 'The assignment was cancelled');
  }
  if (now < assignment.startAt) {
    throw AppError.conflict(
      ERROR_CODE.ASSIGNMENT_NOT_OPEN_YET,
      'The assignment has not opened yet',
      {
        startAt: assignment.startAt,
      },
    );
  }
  if (assignment.endAt && now > assignment.endAt) {
    throw AppError.conflict(ERROR_CODE.ASSIGNMENT_CLOSED, 'The assignment is closed', {
      endAt: assignment.endAt,
    });
  }
  if (recipient.attemptsUsed >= assignment.attemptsAllowed) {
    throw AppError.conflict(ERROR_CODE.ATTEMPT_LIMIT_REACHED, 'No attempts left', {
      allowed: assignment.attemptsAllowed,
      used: recipient.attemptsUsed,
    });
  }

  return recipient;
}

/**
 * Inicia un intento.
 *
 * Si ya hay uno en curso lo devuelve en lugar de crear otro: recargar la
 * página o abrir una segunda pestaña no debe consumir un intento ni duplicar
 * el registro.
 */
export async function startAttempt(userId: string, recipientId: string): Promise<AttemptView> {
  // El intento en curso se busca ANTES de comprobar el límite de intentos.
  // Al revés, quien recargue la página después de iniciar su único intento
  // quedaría bloqueado fuera de su propio examen a medio hacer.
  const inProgress = await prisma.assessmentAttempt.findFirst({
    where: { assignmentRecipientId: recipientId, userId, status: ATTEMPT_STATUS.IN_PROGRESS },
    select: { id: true },
  });
  if (inProgress) return getAttempt(userId, inProgress.id);

  const recipient = await assertCanStart(recipientId, userId);

  const { assignment } = recipient;
  const timeLimit = assignment.timeLimitMinutes ?? assignment.version.timeLimitMinutes;
  const startedAt = new Date();

  // El plazo se calcula y se persiste aquí, en el servidor. El cliente solo lo
  // muestra; nunca lo decide.
  const deadlineAt =
    timeLimit && timeLimit > 0 ? new Date(startedAt.getTime() + timeLimit * 60_000) : null;

  // Si la asignación cierra antes de que se agote el tiempo, manda el cierre.
  const effectiveDeadline =
    deadlineAt && assignment.endAt
      ? new Date(Math.min(deadlineAt.getTime(), assignment.endAt.getTime()))
      : (deadlineAt ?? assignment.endAt);

  const attempt = await prisma.$transaction(async (tx) => {
    const created = await tx.assessmentAttempt.create({
      data: {
        assignmentRecipientId: recipientId,
        assessmentVersionId: assignment.assessmentVersionId,
        userId,
        attemptNumber: recipient.attemptsUsed + 1,
        status: ATTEMPT_STATUS.IN_PROGRESS,
        startedAt,
        deadlineAt: effectiveDeadline,
      },
    });

    await tx.assignmentRecipient.update({
      where: { id: recipientId },
      data: {
        attemptsUsed: { increment: 1 },
        status: RECIPIENT_STATUS.IN_PROGRESS,
        lastActivityAt: startedAt,
      },
    });

    return created;
  });

  await recordAudit({
    userId,
    action: AUDIT_ACTION.START_ATTEMPT,
    entityType: 'assessment_attempt',
    entityId: attempt.id,
  });

  return getAttempt(userId, attempt.id);
}

export async function getAttempt(userId: string, attemptId: string): Promise<AttemptView> {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, userId },
    include: {
      version: {
        include: {
          assessment: { select: { id: true, title: true } },
          questions: {
            orderBy: { position: 'asc' },
            include: {
              kmkCompetency: { select: { id: true, code: true, name: true, color: true } },
            },
          },
        },
      },
      answers: { select: { questionId: true, response: true, answeredAt: true } },
    },
  });

  if (!attempt) throw AppError.notFound(ERROR_CODE.ATTEMPT_NOT_FOUND, { attemptId });

  const now = Date.now();
  const remainingSeconds = attempt.deadlineAt
    ? Math.max(0, Math.floor((attempt.deadlineAt.getTime() - now) / 1000))
    : null;

  const questions: QuestionForStudent[] = attempt.version.questions.map((question) => ({
    id: question.id,
    type: question.type as QuestionType,
    statement: question.statement,
    instructions: question.instructions,
    points: Number(question.points),
    position: question.position,
    mediaUrl: question.mediaUrl,
    allowsEvidence: question.allowsEvidence,
    requiresEvidence: question.requiresEvidence,
    maxEvidenceFiles: question.maxEvidenceFiles,
    // Aquí es donde se garantiza que las soluciones no viajan.
    payload: stripSolution(question.type as QuestionType, question.payload),
    competency: {
      id: question.kmkCompetency.id,
      code: question.kmkCompetency.code,
      name: question.kmkCompetency.name as LocalizedText,
      color: question.kmkCompetency.color,
    },
  }));

  return {
    id: attempt.id,
    status: attempt.status as AttemptStatus,
    attemptNumber: attempt.attemptNumber,
    startedAt: attempt.startedAt,
    deadlineAt: attempt.deadlineAt,
    remainingSeconds,
    // Se deriva del plazo y no de un ajuste propio: así no puede existir una
    // evaluación cronometrada que además diga que se puede continuar después.
    canSaveForLater: attempt.deadlineAt === null,
    assessment: {
      id: attempt.version.assessment.id,
      versionId: attempt.version.id,
      title: attempt.version.name,
      instructions: attempt.version.instructions,
      questionCount: attempt.version.questionCount,
      totalPoints: Number(attempt.version.totalPoints),
    },
    questions: attempt.version.shuffleQuestions ? shuffle(questions) : questions,
    answers: attempt.answers.map((answer) => ({
      questionId: answer.questionId,
      response: answer.response,
      answeredAt: answer.answeredAt,
    })),
  };
}

/**
 * Comprueba que el intento admite escritura.
 *
 * El margen de gracia absorbe la latencia del último segundo: sería injusto
 * descartar una respuesta enviada a tiempo que tardó dos segundos en llegar.
 */
async function assertWritable(attemptId: string, userId: string) {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, userId },
    select: {
      id: true,
      status: true,
      deadlineAt: true,
      assessmentVersionId: true,
      startedAt: true,
    },
  });

  if (!attempt) throw AppError.notFound(ERROR_CODE.ATTEMPT_NOT_FOUND, { attemptId });

  if (CLOSED_ATTEMPT_STATUSES.includes(attempt.status as AttemptStatus)) {
    throw AppError.conflict(ERROR_CODE.ATTEMPT_ALREADY_SUBMITTED, 'The attempt is already closed', {
      status: attempt.status,
    });
  }

  if (attempt.deadlineAt) {
    const graceSeconds = await getSetting(SETTING_KEY.ASSESSMENT_SUBMIT_GRACE_SECONDS);
    const limit = attempt.deadlineAt.getTime() + graceSeconds * 1000;

    if (Date.now() > limit) {
      // Vencido: se cierra de forma perezosa en lugar de dejarlo abierto para
      // siempre esperando a un barrido programado.
      await finalizeExpiredAttempt(attempt.id);
      throw AppError.conflict(ERROR_CODE.TIME_LIMIT_EXCEEDED, 'The time limit has passed', {
        deadlineAt: attempt.deadlineAt,
      });
    }
  }

  return attempt;
}

/**
 * Guarda una respuesta. Es el autoguardado.
 *
 * Idempotente: reenviar la misma respuesta no cambia nada ni consume intentos.
 * Se valida contra el esquema del tipo antes de guardar, porque la
 * especificación es explícita en no confiar en lo que envía el frontend.
 */
export async function saveAnswer(
  userId: string,
  attemptId: string,
  questionId: string,
  response: unknown,
): Promise<{ saved: true; answeredAt: Date }> {
  const attempt = await assertWritable(attemptId, userId);

  const question = await prisma.question.findFirst({
    where: { id: questionId, assessmentVersionId: attempt.assessmentVersionId },
    select: { id: true, type: true },
  });
  if (!question) throw AppError.notFound(ERROR_CODE.QUESTION_NOT_FOUND, { questionId });

  const parsed = safeParseAnswer(question.type as QuestionType, response);
  if (!parsed.success) {
    throw new AppError(
      ERROR_CODE.ANSWER_FORMAT_INVALID,
      'The answer does not match the question type',
      {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          rule: issue.code,
          message: issue.message,
        })),
      },
    );
  }

  /*
   * Las respuestas abiertas admiten formato, así que se limpian aquí.
   *
   * El estudiante escribe HTML y lo va a leer su docente: si no se saneara,
   * bastaría con que alguien pegara un `<script>` en una respuesta para
   * ejecutarlo en la sesión de quien la corrige. Se hace en el motor y no en
   * el cliente porque el cliente se puede saltar.
   */
  const stored = sanitizeAnswerText(parsed.data);

  const answeredAt = new Date();

  await prisma.attemptAnswer.upsert({
    where: { attemptId_questionId: { attemptId, questionId } },
    create: {
      attemptId,
      questionId,
      response: stored as object,
      answeredAt,
      questionType: question.type,
      // Las copias para analítica se rellenan al calificar, no ahora: guardar
      // una respuesta no es todavía un dato estadístico.
      kmkCompetencyId: (
        await prisma.question.findUniqueOrThrow({
          where: { id: questionId },
          select: { kmkCompetencyId: true },
        })
      ).kmkCompetencyId,
    },
    update: { response: stored as object, answeredAt },
  });

  await prisma.assignmentRecipient.updateMany({
    where: { attempts: { some: { id: attemptId } } },
    data: { lastActivityAt: answeredAt },
  });

  return { saved: true, answeredAt };
}

/**
 * Impide finalizar mientras falte evidencia obligatoria.
 *
 * Se comprueba al enviar y no al responder porque el estudiante debe poder
 * recorrer la evaluación en el orden que quiera y dejar los adjuntos para el
 * final. Lo que no puede es dar por terminado algo incompleto y descubrir
 * después que no cuenta.
 *
 * El error nombra las preguntas concretas: «falta evidencia» a secas obligaría
 * a repasar veinte preguntas para encontrar cuál.
 */
async function assertEvidenceComplete(
  attemptId: string,
  questions: Array<{ id: string; position: number; requiresEvidence?: boolean }>,
): Promise<void> {
  const required = questions.filter((question) => question.requiresEvidence);
  if (required.length === 0) return;

  const uploaded = await prisma.storedFile.groupBy({
    by: ['questionId'],
    where: { attemptId, kind: 'EVIDENCE', questionId: { in: required.map((q) => q.id) } },
    _count: true,
  });

  const withFiles = new Set(uploaded.map((row) => row.questionId));
  const missing = required.filter((question) => !withFiles.has(question.id));

  if (missing.length > 0) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'Some questions still require evidence', {
      questions: missing.map((question) => ({ id: question.id, position: question.position + 1 })),
    });
  }
}

/**
 * Limpia el HTML de las respuestas que admiten formato.
 *
 * Solo toca los tipos con texto libre. El resto —opciones, parejas, huecos— son
 * identificadores validados contra el contenido de la pregunta y no llevan
 * nada que un navegador pueda interpretar.
 */
function sanitizeAnswerText(answer: Answer): Answer {
  if (answer.kind === QUESTION_TYPE.OPEN_TEXT || answer.kind === QUESTION_TYPE.LONG_ANSWER) {
    return { ...answer, text: sanitizeRichText(answer.text, 'response') };
  }
  return answer;
}

// --- Calificación ------------------------------------------------------------

/** Contexto analítico que se congela en cada respuesta al calificar. */
async function resolveAnalyticsContext(attemptId: string) {
  const attempt = await prisma.assessmentAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: {
      startedAt: true,
      user: { select: { student: { select: { id: true } } } },
      recipient: {
        select: {
          assignment: {
            select: {
              groupId: true,
              version: { select: { assessment: { select: { subjectId: true } } } },
            },
          },
        },
      },
    },
  });

  return {
    subjectId: attempt.recipient.assignment.version.assessment.subjectId,
    groupId: attempt.recipient.assignment.groupId,
    academicPeriodId: await resolvePeriodAt(attempt.startedAt),
    /*
     * Nulo cuando quien responde no es estudiante: el profesorado resuelve las
     * evaluaciones de su propia capacitación con el mismo motor, y esas
     * respuestas no deben aparecer en el desglose por alumno.
     */
    studentId: attempt.user.student?.id ?? null,
  };
}

/**
 * Califica todas las preguntas de la versión.
 *
 * Se recorren las **preguntas**, no las respuestas: una pregunta sin contestar
 * también puntúa —con cero— y debe dejar su fila para que aparezca en el
 * desglose por competencia.
 */
function gradeAllQuestions(
  questions: Array<{
    id: string;
    type: string;
    points: unknown;
    payload: unknown;
    kmkCompetencyId: string;
    kmkSubcompetencyId: string | null;
  }>,
  answersByQuestion: Map<string, { response: unknown }>,
  analytics: {
    subjectId: string | null;
    groupId: string | null;
    academicPeriodId: string | null;
    studentId: string | null;
  },
): {
  pointsEarned: number;
  pointsPossible: number;
  requiresManualGrading: boolean;
  updates: Array<{ questionId: string; data: Record<string, unknown> }>;
} {
  let pointsEarned = 0;
  let pointsPossible = 0;
  let requiresManualGrading = false;
  const updates: Array<{ questionId: string; data: Record<string, unknown> }> = [];

  for (const question of questions) {
    const points = Number(question.points);
    pointsPossible += points;

    const outcome = gradeAnswer(
      question.type as QuestionType,
      question.payload,
      answersByQuestion.get(question.id)?.response ?? null,
      points,
    );

    pointsEarned += outcome.pointsEarned;
    if (outcome.requiresManualGrading) requiresManualGrading = true;

    updates.push({
      questionId: question.id,
      data: {
        isCorrect: outcome.isCorrect,
        pointsEarned: outcome.pointsEarned,
        pointsPossible: points,
        autoGraded: !outcome.requiresManualGrading,
        requiresManualGrading: outcome.requiresManualGrading,
        questionType: question.type,
        kmkCompetencyId: question.kmkCompetencyId,
        kmkSubcompetencyId: question.kmkSubcompetencyId,
        // Copias para analítica: se fijan aquí y no se recalculan nunca.
        subjectId: analytics.subjectId,
        groupId: analytics.groupId,
        academicPeriodId: analytics.academicPeriodId,
        studentId: analytics.studentId,
      },
    });
  }

  return { pointsEarned, pointsPossible, requiresManualGrading, updates };
}

/**
 * Escribe el resultado del envío.
 *
 * Todo en una transacción: dejar las respuestas calificadas pero el intento
 * sin cerrar, o al revés, produciría una nota irreproducible.
 */
async function persistSubmission(params: {
  attemptId: string;
  recipientId: string;
  previousBest: number;
  updates: Array<{ questionId: string; data: Record<string, unknown> }>;
  answersByQuestion: Map<string, { response: unknown }>;
  submittedAt: Date;
  durationSeconds: number;
  totals: { pointsEarned: number; pointsPossible: number };
  scaleId: string;
  passingPercentage: number;
  grade: ReturnType<typeof gradeFromPoints>;
  requiresManualGrading: boolean;
}): Promise<void> {
  const status = params.requiresManualGrading
    ? ATTEMPT_STATUS.PENDING_REVIEW
    : ATTEMPT_STATUS.GRADED;

  await prisma.$transaction(async (tx) => {
    for (const update of params.updates) {
      await tx.attemptAnswer.upsert({
        where: {
          attemptId_questionId: { attemptId: params.attemptId, questionId: update.questionId },
        },
        create: {
          attemptId: params.attemptId,
          questionId: update.questionId,
          response: params.answersByQuestion.get(update.questionId)?.response ?? undefined,
          ...(update.data as object),
        } as never,
        update: update.data as never,
      });
    }

    await tx.assessmentAttempt.update({
      where: { id: params.attemptId },
      data: {
        status,
        submittedAt: params.submittedAt,
        gradedAt: params.requiresManualGrading ? null : params.submittedAt,
        durationSeconds: params.durationSeconds,
        pointsEarned: params.totals.pointsEarned,
        pointsPossible: params.totals.pointsPossible,
        percentage: params.grade.percentage,
        gradingScaleId: params.scaleId,
        gradeValue: params.grade.band?.value ?? null,
        gradeLabel: params.grade.band
          ? {
              es: params.grade.band.label,
              de: params.grade.band.label,
              en: params.grade.band.label,
            }
          : undefined,
        passingPercentage: params.passingPercentage,
        passed: params.grade.passed,
        starsFilled: params.grade.stars?.filled ?? null,
        starsTotal: params.grade.stars?.total ?? null,
        requiresManualGrading: params.requiresManualGrading,
      },
    });

    await tx.assignmentRecipient.update({
      where: { id: params.recipientId },
      data: {
        status: RECIPIENT_STATUS.COMPLETED,
        completedAt: params.submittedAt,
        lastActivityAt: params.submittedAt,
        bestPercentage: Math.max(params.previousBest, params.grade.percentage),
      },
    });
  });
}

/**
 * Califica y cierra el intento.
 *
 * Todo lo que la nota necesita para seguir significando lo mismo dentro de dos
 * años queda escrito en la fila: los puntos, el porcentaje, la escala usada, el
 * umbral aplicado y las estrellas. Nada se recalcula después.
 */
export async function submitAttempt(userId: string, attemptId: string): Promise<AttemptResult> {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, userId },
    include: {
      version: {
        include: {
          assessment: { select: { audience: true } },
          questions: {
            select: {
              id: true,
              type: true,
              points: true,
              payload: true,
              position: true,
              requiresEvidence: true,
              kmkCompetencyId: true,
              kmkSubcompetencyId: true,
            },
          },
        },
      },
      answers: true,
      recipient: { select: { id: true, bestPercentage: true } },
    },
  });

  if (!attempt) throw AppError.notFound(ERROR_CODE.ATTEMPT_NOT_FOUND, { attemptId });

  if (CLOSED_ATTEMPT_STATUSES.includes(attempt.status as AttemptStatus)) {
    throw AppError.conflict(ERROR_CODE.ATTEMPT_ALREADY_SUBMITTED, 'The attempt is already closed');
  }

  await assertEvidenceComplete(attemptId, attempt.version.questions);

  const submittedAt = new Date();
  const analytics = await resolveAnalyticsContext(attemptId);
  const answersByQuestion = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));

  const { pointsEarned, pointsPossible, requiresManualGrading, updates } = gradeAllQuestions(
    attempt.version.questions,
    answersByQuestion,
    analytics,
  );

  const scale = attempt.version.gradingScaleId
    ? await getScaleById(attempt.version.gradingScaleId)
    : await getActiveScale(attempt.version.assessment.audience as AssessmentAudience);

  // El umbral de la versión gana sobre el de la escala: permite endurecer una
  // evaluación concreta sin tocar la configuración global.
  const passingPercentage = attempt.version.passingPercentage
    ? Number(attempt.version.passingPercentage)
    : scale.passingPercentage;

  const grade = gradeFromPoints(pointsEarned, pointsPossible, { ...scale, passingPercentage });
  const durationSeconds = Math.floor((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000);

  await persistSubmission({
    attemptId,
    recipientId: attempt.recipient.id,
    previousBest: Number(attempt.recipient.bestPercentage ?? 0),
    updates,
    answersByQuestion,
    submittedAt,
    durationSeconds,
    totals: { pointsEarned, pointsPossible },
    scaleId: scale.id,
    passingPercentage,
    grade,
    requiresManualGrading,
  });

  await recordAudit({
    userId,
    action: AUDIT_ACTION.COMPLETE_ASSESSMENT,
    entityType: 'assessment_attempt',
    entityId: attemptId,
    metadata: { percentage: grade.percentage, passed: grade.passed, requiresManualGrading },
  });

  log.info(
    { attemptId, percentage: grade.percentage, grade: grade.band?.value, passed: grade.passed },
    'intento calificado',
  );

  return getResult(userId, attemptId);
}

/**
 * Cierra un intento vencido sin envío explícito.
 *
 * Se califica con lo que hubiera respondido: dejarlo abierto para siempre o
 * descartarlo entero serían las dos alternativas, y ambas perjudican al
 * estudiante sin motivo.
 */
export async function finalizeExpiredAttempt(attemptId: string): Promise<void> {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    select: { id: true, userId: true, status: true },
  });
  if (!attempt || attempt.status !== ATTEMPT_STATUS.IN_PROGRESS) return;

  try {
    await submitAttempt(attempt.userId, attemptId);
    await prisma.assessmentAttempt.update({
      where: { id: attemptId },
      data: { status: ATTEMPT_STATUS.EXPIRED },
    });
  } catch (error) {
    log.error({ err: error, attemptId }, 'no se pudo cerrar un intento vencido');
  }
}

/** Barrido de intentos vencidos, para los que nadie volvió a tocar. */
export async function sweepExpiredAttempts(): Promise<number> {
  const graceSeconds = await getSetting(SETTING_KEY.ASSESSMENT_SUBMIT_GRACE_SECONDS);
  const cutoff = new Date(Date.now() - graceSeconds * 1000);

  const expired = await prisma.assessmentAttempt.findMany({
    where: { status: ATTEMPT_STATUS.IN_PROGRESS, deadlineAt: { lt: cutoff } },
    select: { id: true },
    take: 200,
  });

  for (const attempt of expired) {
    await finalizeExpiredAttempt(attempt.id);
  }

  if (expired.length > 0) log.info({ count: expired.length }, 'intentos vencidos cerrados');
  return expired.length;
}

// --- Resultado ---------------------------------------------------------------

interface AnswerForResult {
  questionId: string;
  isCorrect: boolean | null;
  pointsEarned: unknown;
  pointsPossible: unknown;
  teacherFeedback: string | null;
  question: {
    statement: string;
    payload: unknown;
    feedbackCorrect: string | null;
    feedbackIncorrect: string | null;
    explanation: string | null;
    kmkCompetency: { id: string; code: string; name: unknown; color: string };
  };
}

/**
 * Agrega el resultado por competencia KMK.
 *
 * Es la razón de ser de la plataforma, y sale de las copias que la
 * calificación dejó en cada respuesta: no hace falta volver a la pregunta.
 */
function buildCompetencyBreakdown(
  answers: AnswerForResult[],
): AttemptResult['competencyBreakdown'] {
  const byCompetency = new Map<
    string,
    {
      code: string;
      name: LocalizedText;
      color: string;
      earned: number;
      possible: number;
      count: number;
    }
  >();

  for (const answer of answers) {
    const competency = answer.question.kmkCompetency;
    const entry = byCompetency.get(competency.id) ?? {
      code: competency.code,
      name: competency.name as LocalizedText,
      color: competency.color,
      earned: 0,
      possible: 0,
      count: 0,
    };
    entry.earned += Number(answer.pointsEarned);
    entry.possible += Number(answer.pointsPossible);
    entry.count += 1;
    byCompetency.set(competency.id, entry);
  }

  return [...byCompetency.entries()].map(([competencyId, entry]) => ({
    competencyId,
    code: entry.code,
    name: entry.name,
    color: entry.color,
    pointsEarned: entry.earned,
    pointsPossible: entry.possible,
    percentage: toPercentage(entry.earned, entry.possible),
    questionCount: entry.count,
  }));
}

/**
 * Construye la retroalimentación según lo que la versión permita mostrar.
 *
 * La solución solo viaja si la evaluación lo autoriza, y siempre después de
 * terminar: durante el intento nunca.
 */
function buildFeedback(
  answers: AnswerForResult[],
  showFeedback: boolean,
  showCorrectAnswers: boolean,
): AttemptResult['feedback'] {
  if (!showFeedback) return null;

  return answers.map((answer) => ({
    questionId: answer.questionId,
    statement: answer.question.statement,
    isCorrect: answer.isCorrect,
    pointsEarned: Number(answer.pointsEarned),
    pointsPossible: Number(answer.pointsPossible),
    feedback:
      answer.isCorrect === true
        ? answer.question.feedbackCorrect
        : answer.question.feedbackIncorrect,
    explanation: answer.question.explanation,
    teacherFeedback: answer.teacherFeedback,
    correctAnswer: showCorrectAnswers ? answer.question.payload : null,
  }));
}

/**
 * Umbral a partir del cual una competencia se considera demostrada.
 *
 * El mismo que usa la estadística para hablar de «consolidado». Tenerlo aquí
 * duplicado sería el camino más corto a que un diploma diga que se logró algo
 * que el informe de la misma persona muestra como pendiente.
 */
const CERTIFIABLE_PERCENTAGE = 70;

function isCertificateAvailable(
  enabled: boolean,
  status: AttemptStatus,
  passed: boolean,
  requiresManualGrading: boolean,
  breakdown: AttemptResult['competencyBreakdown'],
): boolean {
  if (!enabled || !passed || requiresManualGrading) return false;
  if (status !== ATTEMPT_STATUS.GRADED) return false;

  // Aprobar el conjunto no basta: tiene que haber algo concreto que certificar.
  return breakdown.some((entry) => entry.percentage >= CERTIFIABLE_PERCENTAGE);
}

export async function getResult(userId: string, attemptId: string): Promise<AttemptResult> {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, userId },
    include: {
      version: {
        select: {
          showCorrectAnswers: true,
          showFeedback: true,
          showResultsImmediately: true,
          certificateEnabled: true,
        },
      },
      answers: {
        include: {
          question: {
            select: {
              id: true,
              statement: true,
              payload: true,
              type: true,
              feedbackCorrect: true,
              feedbackIncorrect: true,
              explanation: true,
              kmkCompetency: { select: { id: true, code: true, name: true, color: true } },
            },
          },
        },
        orderBy: { question: { position: 'asc' } },
      },
    },
  });

  if (!attempt) throw AppError.notFound(ERROR_CODE.ATTEMPT_NOT_FOUND, { attemptId });

  // Desglose por competencia: es la razón de ser de la plataforma y sale de
  // las copias que la calificación dejó en cada respuesta.
  const showFeedback = attempt.version.showFeedback;
  const showCorrect = attempt.version.showCorrectAnswers;
  const breakdown = buildCompetencyBreakdown(attempt.answers as unknown as AnswerForResult[]);

  return {
    attemptId: attempt.id,
    status: attempt.status as AttemptStatus,
    pointsEarned: Number(attempt.pointsEarned),
    pointsPossible: Number(attempt.pointsPossible),
    percentage: Number(attempt.percentage),
    passed: attempt.passed,
    passingPercentage: Number(attempt.passingPercentage ?? 0),
    grade: attempt.gradeValue
      ? { value: Number(attempt.gradeValue), label: (attempt.gradeLabel as LocalizedText) ?? null }
      : null,
    stars:
      attempt.starsFilled !== null && attempt.starsTotal !== null
        ? { filled: attempt.starsFilled, total: attempt.starsTotal }
        : null,
    requiresManualGrading: attempt.requiresManualGrading,
    submittedAt: attempt.submittedAt,
    durationSeconds: attempt.durationSeconds,
    certificateAvailable: isCertificateAvailable(
      attempt.version.certificateEnabled,
      attempt.status as AttemptStatus,
      attempt.passed,
      attempt.requiresManualGrading,
      breakdown,
    ),
    competencyBreakdown: breakdown,
    feedback: buildFeedback(
      attempt.answers as unknown as AnswerForResult[],
      showFeedback,
      showCorrect,
    ),
  };
}

/**
 * Traduce una nota calculada a las columnas del intento.
 *
 * Agrupa aquí las coalescencias para que quien lea el recálculo vea el flujo
 * y no una cascada de operadores.
 */
function gradeToColumns(grade: ReturnType<typeof gradeFromPoints> | null): {
  gradeValue: number | null;
  gradeLabel: LocalizedText | undefined;
  starsFilled: number | null;
  starsTotal: number | null;
} {
  const band = grade ? grade.band : null;
  const stars = grade ? grade.stars : null;

  return {
    gradeValue: band ? band.value : null,
    gradeLabel: band ? { es: band.label, de: band.label, en: band.label } : undefined,
    starsFilled: stars ? stars.filled : null,
    starsTotal: stars ? stars.total : null,
  };
}

/**
 * Recalcula el resultado del intento tras una corrección manual.
 *
 * Usa la escala que el intento tenía **fijada**, no la vigente: una nota debe
 * cerrarse con las mismas reglas con las que se abrió, aunque el
 * administrador haya cambiado la escala entre medias.
 */
async function recalculateAttempt(
  attemptId: string,
  attempt: { gradingScaleId: string | null; passingPercentage: unknown },
): Promise<{ remaining: number }> {
  const [remaining, totals] = await Promise.all([
    prisma.attemptAnswer.count({ where: { attemptId, requiresManualGrading: true } }),
    prisma.attemptAnswer.aggregate({
      where: { attemptId },
      _sum: { pointsEarned: true, pointsPossible: true },
    }),
  ]);

  const earned = Number(totals._sum.pointsEarned ?? 0);
  const possible = Number(totals._sum.pointsPossible ?? 0);

  const scale = attempt.gradingScaleId ? await getScaleById(attempt.gradingScaleId) : null;
  const fallbackPassing = scale ? scale.passingPercentage : 0;
  const passingPercentage = Number(attempt.passingPercentage ?? fallbackPassing);
  const grade = scale ? gradeFromPoints(earned, possible, { ...scale, passingPercentage }) : null;
  const percentage = grade ? grade.percentage : toPercentage(earned, possible);
  const pending = remaining > 0;

  await prisma.assessmentAttempt.update({
    where: { id: attemptId },
    data: {
      pointsEarned: earned,
      pointsPossible: possible,
      percentage,
      passed: grade ? grade.passed : percentage >= passingPercentage,
      ...gradeToColumns(grade),
      requiresManualGrading: pending,
      status: pending ? ATTEMPT_STATUS.PENDING_REVIEW : ATTEMPT_STATUS.GRADED,
      gradedAt: pending ? null : new Date(),
    },
  });

  return { remaining };
}

/**
 * Calificación manual de una respuesta abierta.
 *
 * Al puntuar la última pendiente, el intento se recalcula y pasa a `GRADED`.
 * El recálculo usa la escala que el intento tenía fijada, no la vigente: la
 * nota debe cerrarse con las reglas con las que se abrió.
 */
export async function gradeAnswerManually(
  graderId: string,
  attemptId: string,
  questionId: string,
  points: number,
  feedback: string | null,
): Promise<AttemptResult> {
  const answer = await prisma.attemptAnswer.findUnique({
    where: { attemptId_questionId: { attemptId, questionId } },
    include: {
      attempt: {
        select: { id: true, userId: true, gradingScaleId: true, passingPercentage: true },
      },
    },
  });

  if (!answer) throw AppError.notFound(ERROR_CODE.QUESTION_NOT_FOUND, { attemptId, questionId });

  const possible = Number(answer.pointsPossible);
  if (points < 0 || points > possible) {
    throw AppError.validation([
      { path: 'points', rule: 'out_of_range', message: `Debe estar entre 0 y ${possible}` },
    ]);
  }

  await prisma.attemptAnswer.update({
    where: { id: answer.id },
    data: {
      pointsEarned: points,
      isCorrect: points >= possible,
      requiresManualGrading: false,
      teacherFeedback: feedback,
      gradedById: graderId,
      gradedAt: new Date(),
    },
  });

  const { remaining } = await recalculateAttempt(attemptId, answer.attempt);

  await recordAudit({
    userId: graderId,
    action: AUDIT_ACTION.GRADE_ATTEMPT,
    entityType: 'attempt_answer',
    entityId: answer.id,
    metadata: { attemptId, points, remaining },
  });

  return getResult(answer.attempt.userId, attemptId);
}
