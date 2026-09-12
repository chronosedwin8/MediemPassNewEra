import { z } from 'zod';
import {
  ERROR_CODE,
  MEDIA_CONTENT_TYPES,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_SECONDS,
  QUESTION_TYPE,
  isMediaResponseType,
  type QuestionType,
  type Role,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { createLogger } from '../../shared/logger.js';
import { env } from '../../config/env.js';
import { buildResponseMediaKey, getStorage } from '../../infrastructure/storage/storage.service.js';

const log = createLogger('response-media');

/**
 * Subida de la grabación que responde una pregunta.
 *
 * Reutiliza el mismo camino de tres pasos que las evidencias —firmar, subir a
 * S3, confirmar contra lo que hay de verdad en el bucket— pero no reutiliza
 * sus reglas, y la diferencia es de fondo: una evidencia es opcional y
 * acompaña a una respuesta escrita, mientras que esto **es** la respuesta. Por
 * eso no se comprueba `allowsEvidence` sino el tipo de la pregunta, y por eso
 * solo puede haber un archivo: volver a grabar sustituye, no acumula.
 *
 * Los límites de duración y tamaño salen del paquete compartido, los mismos
 * que el navegador usa para configurar la grabación. Aquí se vuelven a
 * comprobar porque el cliente es de quien responde: el cronómetro que corta a
 * los tres minutos es una comodidad, no una garantía.
 */

export const requestResponseMediaSchema = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
  contentType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  /** Lo que el navegador dice haber grabado. Nulo en una foto. */
  durationSeconds: z.number().int().min(0).max(3600).nullable().default(null),
});

export const confirmResponseMediaSchema = requestResponseMediaSchema.extend({
  storageKey: z.string().min(1).max(1024),
});

export type RequestResponseMediaInput = z.infer<typeof requestResponseMediaSchema>;
export type ConfirmResponseMediaInput = z.infer<typeof confirmResponseMediaSchema>;

interface Actor {
  userId: string;
  roles: Role[];
}

export interface ResponseMediaView {
  fileId: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number | null;
}

interface MediaContext {
  assessmentId: string;
  questionType: QuestionType;
}

/**
 * Comprueba que esta persona puede grabar aquí y ahora.
 *
 * El intento tiene que ser suyo y estar abierto, y la pregunta tiene que ser
 * de las que se responden grabando. Lo último importa más de lo que parece:
 * sin esa comprobación, el mismo endpoint serviría para adjuntar un vídeo a
 * cualquier pregunta saltándose el límite de evidencias.
 */
async function assertCanRecord(
  actor: Actor,
  attemptId: string,
  questionId: string,
): Promise<MediaContext> {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, userId: actor.userId },
    select: {
      status: true,
      assessmentVersionId: true,
      version: { select: { assessmentId: true } },
    },
  });

  if (!attempt) throw AppError.notFound(ERROR_CODE.ATTEMPT_NOT_FOUND, { attemptId });

  if (attempt.status !== 'IN_PROGRESS') {
    throw AppError.conflict(
      ERROR_CODE.ATTEMPT_ALREADY_SUBMITTED,
      'The attempt is no longer open for changes',
      { status: attempt.status },
    );
  }

  const question = await prisma.question.findFirst({
    where: { id: questionId, assessmentVersionId: attempt.assessmentVersionId },
    select: { type: true },
  });
  if (!question) throw AppError.notFound(ERROR_CODE.QUESTION_NOT_FOUND, { questionId });

  const type = question.type as QuestionType;
  if (!isMediaResponseType(type)) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'This question is not answered with a recording', {
      questionId,
    });
  }

  return { assessmentId: attempt.version.assessmentId, questionType: type };
}

/** Formato, tamaño y duración, contra los límites del tipo de pregunta. */
function assertWithinLimits(
  type: QuestionType,
  input: { contentType: string; sizeBytes: number; durationSeconds: number | null },
): void {
  const allowed = MEDIA_CONTENT_TYPES[type] ?? [];

  /*
   * El navegador añade parámetros al tipo: `video/webm;codecs=vp8,opus`. Se
   * compara solo la parte que identifica el formato; exigir la cadena entera
   * dejaría fuera a un navegador por anunciar su códec.
   */
  const baseType = input.contentType.split(';')[0]!.trim().toLowerCase();
  if (!allowed.includes(baseType)) {
    throw AppError.validation([
      {
        path: 'contentType',
        rule: 'unsupported_type',
        message: `Formato no admitido para este tipo de pregunta: ${baseType}`,
      },
    ]);
  }

  const maxBytes = MEDIA_MAX_BYTES[type] ?? env.S3_MAX_UPLOAD_BYTES;
  if (input.sizeBytes > maxBytes) {
    throw AppError.validation([
      {
        path: 'sizeBytes',
        rule: 'too_large',
        message: `La grabación supera el máximo de ${Math.round(maxBytes / (1024 * 1024))} MB`,
      },
    ]);
  }

  const maxSeconds = MEDIA_MAX_SECONDS[type];
  if (maxSeconds !== undefined && input.durationSeconds !== null) {
    // Se da un margen de dos segundos: el corte del navegador nunca cae en el
    // milisegundo exacto y rechazar un vídeo de 181 segundos sería mezquino.
    if (input.durationSeconds > maxSeconds + 2) {
      throw AppError.validation([
        {
          path: 'durationSeconds',
          rule: 'too_long',
          message: `La grabación supera el máximo de ${maxSeconds} segundos`,
        },
      ]);
    }
  }
}

export async function requestResponseMediaUpload(
  actor: Actor,
  input: RequestResponseMediaInput,
): Promise<{ storageKey: string; uploadUrl: string; expiresInSeconds: number; maxBytes: number }> {
  const { assessmentId, questionType } = await assertCanRecord(
    actor,
    input.attemptId,
    input.questionId,
  );
  assertWithinLimits(questionType, input);

  const year = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { code: true },
  });

  const storageKey = buildResponseMediaKey({
    academicYearCode: year?.code ?? 'sin-anio',
    assessmentId,
    attemptId: input.attemptId,
    questionId: input.questionId,
    contentType: input.contentType,
  });

  const target = await getStorage().createUploadTarget(storageKey, input.contentType);

  return {
    storageKey: target.key,
    uploadUrl: target.uploadUrl,
    expiresInSeconds: target.expiresInSeconds,
    maxBytes: MEDIA_MAX_BYTES[questionType] ?? env.S3_MAX_UPLOAD_BYTES,
  };
}

export async function confirmResponseMediaUpload(
  actor: Actor,
  input: ConfirmResponseMediaInput,
): Promise<ResponseMediaView> {
  const { assessmentId, questionType } = await assertCanRecord(
    actor,
    input.attemptId,
    input.questionId,
  );

  // Lo que hay de verdad en el bucket, no lo que el cliente dijo que subiría.
  const actual = await getStorage().head(input.storageKey);
  if (!actual) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'The recording was not uploaded', {
      storageKey: input.storageKey,
    });
  }

  assertWithinLimits(questionType, {
    contentType: actual.contentType,
    sizeBytes: actual.sizeBytes,
    durationSeconds: input.durationSeconds,
  });

  const [year, answer] = await Promise.all([
    prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } }),
    prisma.attemptAnswer.findFirst({
      where: { attemptId: input.attemptId, questionId: input.questionId },
      select: { id: true },
    }),
  ]);

  const file = await prisma.storedFile.create({
    data: {
      kind: 'RESPONSE_MEDIA',
      storageKey: input.storageKey,
      bucket: env.S3_BUCKET ?? 'memory',
      contentType: actual.contentType,
      sizeBytes: actual.sizeBytes,
      originalName: defaultName(questionType, actual.contentType),
      academicYearId: year?.id ?? null,
      assessmentId,
      questionId: input.questionId,
      attemptId: input.attemptId,
      answerId: answer?.id ?? null,
      uploadedById: actor.userId,
    },
  });

  await discardPreviousTakes(input.attemptId, input.questionId, file.id);

  log.info(
    { fileId: file.id, attemptId: input.attemptId, sizeBytes: actual.sizeBytes, questionType },
    'grabación registrada',
  );

  return {
    fileId: file.id,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    durationSeconds: input.durationSeconds,
  };
}

/**
 * Borra las tomas anteriores de esta pregunta.
 *
 * Volver a grabar sustituye. Sin esto, un estudiante indeciso dejaría cinco
 * vídeos de tres minutos en el bucket de los que solo uno es su respuesta, y
 * los otros cuatro no aparecerían en ninguna pantalla que permita borrarlos.
 *
 * Primero S3 y después la fila, como en todo el módulo: un objeto sin fila se
 * detecta comparando; una fila sin objeto no se detecta nunca.
 */
async function discardPreviousTakes(
  attemptId: string,
  questionId: string,
  keepFileId: string,
): Promise<void> {
  const previous = await prisma.storedFile.findMany({
    where: { attemptId, questionId, kind: 'RESPONSE_MEDIA', id: { not: keepFileId } },
    select: { id: true, storageKey: true },
  });

  if (previous.length === 0) return;

  await getStorage().remove(previous.map((file) => file.storageKey));
  await prisma.storedFile.deleteMany({ where: { id: { in: previous.map((file) => file.id) } } });

  log.info({ attemptId, questionId, discarded: previous.length }, 'tomas anteriores descartadas');
}

/** Nombre con el que se descarga. El original no existe: nadie eligió un archivo. */
function defaultName(type: QuestionType, contentType: string): string {
  const extension = contentType.split(';')[0]!.split('/')[1] ?? 'bin';
  const prefix =
    type === QUESTION_TYPE.SELFIE
      ? 'selfie'
      : type === QUESTION_TYPE.VIDEO_RESPONSE
        ? 'video'
        : 'audio';
  return `${prefix}.${extension}`;
}
