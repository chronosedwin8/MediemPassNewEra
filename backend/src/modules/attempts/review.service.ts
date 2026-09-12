import {
  ERROR_CODE,
  PERMISSION,
  hasPermission,
  isMediaResponseType,
  type LocalizedText,
  type Permission,
  type QuestionType,
} from '@medienpass/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { getStorage } from '../../infrastructure/storage/storage.service.js';

/**
 * Cola de corrección del docente.
 *
 * Existe porque sin ella la corrección manual no tenía pantalla: el servidor
 * sabía puntuar una respuesta abierta, pero no había forma de encontrarla. Con
 * las preguntas grabadas eso pasaba de incómodo a inservible —un vídeo que
 * nadie puede ver no es una respuesta, es un archivo—, así que la cola llega
 * con ellas y de paso resuelve las redacciones que llevaban meses esperando.
 *
 * El alcance es el mismo que el de la descarga de archivos: se corrige lo de
 * las evaluaciones propias. No es una restricción arbitraria: la grabación de
 * un menor la mira quien la pidió, no cualquiera con permiso de calificar.
 */

interface Actor {
  userId: string;
  permissions: Permission[];
}

export interface PendingAnswer {
  attemptId: string;
  questionId: string;
  answeredAt: Date;
  student: { name: string; code: string | null };
  assessment: { id: string; title: string };
  question: {
    statement: string;
    type: QuestionType;
    pointsPossible: number;
    competency: { code: string; name: LocalizedText } | null;
  };
  /** La respuesta tal cual se guardó. La pantalla decide cómo enseñarla. */
  response: unknown;
  /** URL firmada para ver la grabación, cuando la pregunta es de captura. */
  media: {
    fileId: string;
    contentType: string;
    sizeBytes: number;
    url: string;
  } | null;
}

/** Qué respuestas puede corregir esta persona. */
function scopeClause(actor: Actor): Prisma.AttemptAnswerWhereInput {
  if (hasPermission(actor.permissions, [PERMISSION.RESULT_READ_ALL])) return {};
  return { attempt: { version: { assessment: { createdById: actor.userId } } } };
}

export async function listPendingReview(
  actor: Actor,
  filters: { assessmentId?: string; limit?: number } = {},
): Promise<PendingAnswer[]> {
  const answers = await prisma.attemptAnswer.findMany({
    where: {
      AND: [
        scopeClause(actor),
        { requiresManualGrading: true, gradedAt: null },
        // Solo lo entregado: una respuesta de un examen a medio hacer todavía
        // puede cambiar, y corregirla sería corregir un borrador.
        { attempt: { status: { in: ['SUBMITTED', 'PENDING_REVIEW'] } } },
        ...(filters.assessmentId
          ? [{ attempt: { version: { assessmentId: filters.assessmentId } } }]
          : []),
      ],
    },
    // Lo más antiguo primero: quien lleva más tiempo esperando su nota.
    orderBy: { answeredAt: 'asc' },
    take: Math.min(filters.limit ?? 50, 100),
    select: {
      attemptId: true,
      questionId: true,
      answeredAt: true,
      response: true,
      pointsPossible: true,
      attempt: {
        select: {
          user: {
            select: { firstName: true, lastName: true, student: { select: { code: true } } },
          },
          version: { select: { name: true, assessmentId: true } },
        },
      },
      question: {
        select: {
          statement: true,
          type: true,
          kmkCompetency: { select: { code: true, name: true } },
        },
      },
    },
  });

  return Promise.all(answers.map((answer) => toPendingAnswer(answer)));
}

async function toPendingAnswer(answer: {
  attemptId: string;
  questionId: string;
  answeredAt: Date;
  response: unknown;
  pointsPossible: unknown;
  attempt: {
    user: { firstName: string; lastName: string; student: { code: string | null } | null };
    version: { name: string; assessmentId: string };
  };
  question: {
    statement: string;
    type: string;
    kmkCompetency: { code: string; name: unknown } | null;
  };
}): Promise<PendingAnswer> {
  const type = answer.question.type as QuestionType;

  return {
    attemptId: answer.attemptId,
    questionId: answer.questionId,
    answeredAt: answer.answeredAt,
    student: {
      name: `${answer.attempt.user.lastName}, ${answer.attempt.user.firstName}`,
      code: answer.attempt.user.student?.code ?? null,
    },
    assessment: { id: answer.attempt.version.assessmentId, title: answer.attempt.version.name },
    question: {
      statement: answer.question.statement,
      type,
      pointsPossible: Number(answer.pointsPossible),
      competency: answer.question.kmkCompetency
        ? {
            code: answer.question.kmkCompetency.code,
            name: answer.question.kmkCompetency.name as LocalizedText,
          }
        : null,
    },
    response: answer.response,
    media: isMediaResponseType(type)
      ? await resolveMedia(answer.attemptId, answer.questionId)
      : null,
  };
}

/**
 * La grabación, con una URL de lectura que caduca.
 *
 * Se firma aquí y no se deja que la pantalla la pida archivo por archivo: una
 * cola de treinta vídeos haría treinta peticiones más solo para poder pintar
 * los reproductores.
 */
async function resolveMedia(
  attemptId: string,
  questionId: string,
): Promise<PendingAnswer['media']> {
  const file = await prisma.storedFile.findFirst({
    where: { attemptId, questionId, kind: 'RESPONSE_MEDIA' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, storageKey: true, contentType: true, sizeBytes: true, originalName: true },
  });

  if (!file) return null;

  return {
    fileId: file.id,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    // En línea: un vídeo que hay que descargar para verlo no se revisa, se
    // pospone. Solo se sirven así los formatos de la propia captura.
    url: await getStorage().createDownloadUrl(file.storageKey, file.originalName, true),
  };
}

/**
 * Comprueba que esta persona puede corregir esta respuesta concreta.
 *
 * El permiso de calificar dice que alguien corrige; esto decide **qué**. Sin
 * la comprobación, cualquier docente podía puntuar la respuesta de un examen
 * ajeno con solo conocer dos identificadores.
 */
export async function assertCanGrade(
  actor: Actor,
  attemptId: string,
  questionId: string,
): Promise<void> {
  if (hasPermission(actor.permissions, [PERMISSION.RESULT_READ_ALL])) return;

  const answer = await prisma.attemptAnswer.findFirst({
    where: {
      AND: [{ attemptId, questionId }, scopeClause(actor)],
    },
    select: { id: true },
  });

  if (!answer) throw AppError.notFound(ERROR_CODE.QUESTION_NOT_FOUND, { attemptId, questionId });
}
