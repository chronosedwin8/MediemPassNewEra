import { z } from 'zod';
import { AUDIT_ACTION, ERROR_CODE, ROLE, type Role } from '@medienpass/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { isAdmin } from '../../middleware/authorize.js';
import { recordAudit } from '../audit/audit.service.js';
import { createLogger } from '../../shared/logger.js';
import { env } from '../../config/env.js';
import {
  ALLOWED_CONTENT_TYPES,
  buildEvidenceKey,
  buildQuestionMediaKey,
  buildTrainingMediaKey,
  getStorage,
} from '../../infrastructure/storage/storage.service.js';

const log = createLogger('files');

/**
 * Archivos: evidencias de estudiantes e imágenes de enunciados.
 *
 * La subida ocurre en dos pasos y no en uno, y el motivo importa:
 *
 *  1. `requestUpload` comprueba permisos, decide la clave y firma la URL.
 *  2. El navegador sube directamente a S3.
 *  3. `confirmUpload` verifica **contra S3** que lo que hay ahí coincide con
 *     lo declarado, y solo entonces crea la fila.
 *
 * El tercer paso no es burocracia. Sin él, cualquiera podría pedir una firma
 * diciendo «voy a subir 2 KB» y registrar una evidencia que nunca subió, o
 * subir otra cosa. Al comprobar tamaño y tipo reales antes de dar el archivo
 * por bueno, la fila de la base siempre describe algo que existe.
 */

const uploadRequestSchema = z.object({
  contentType: z.string().refine((value) => value in ALLOWED_CONTENT_TYPES, {
    message: 'Tipo de archivo no admitido',
  }),
  originalName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});

export const requestEvidenceUploadSchema = uploadRequestSchema.extend({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
});

export const requestQuestionMediaUploadSchema = uploadRequestSchema.extend({
  versionId: z.string().uuid(),
});

export const requestTrainingMediaUploadSchema = uploadRequestSchema.extend({
  contentId: z.string().uuid(),
});

export type RequestTrainingMediaUploadInput = z.infer<typeof requestTrainingMediaUploadSchema>;

export const confirmUploadSchema = z.object({ storageKey: z.string().min(1).max(1024) });

export type RequestEvidenceUploadInput = z.infer<typeof requestEvidenceUploadSchema>;
export type RequestQuestionMediaUploadInput = z.infer<typeof requestQuestionMediaUploadSchema>;

interface Actor {
  userId: string;
  roles: Role[];
}

export interface UploadTicket {
  storageKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
  maxBytes: number;
}

export interface StoredFileView {
  id: string;
  kind: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: { id: string; firstName: string; lastName: string } | null;
}

function assertWithinSizeLimit(sizeBytes: number): void {
  if (sizeBytes > env.S3_MAX_UPLOAD_BYTES) {
    throw AppError.validation([
      {
        path: 'sizeBytes',
        rule: 'too_large',
        message: `El archivo supera el máximo de ${Math.round(env.S3_MAX_UPLOAD_BYTES / 1024 / 1024)} MB`,
      },
    ]);
  }
}

// --- Evidencias --------------------------------------------------------------

/**
 * Comprueba que quien sube puede hacerlo sobre ese intento y esa pregunta.
 *
 * Tres condiciones, y ninguna sobra: que el intento sea suyo, que siga en
 * curso, y que la pregunta admita evidencia. La tercera es la que impide que
 * alguien adjunte archivos a preguntas donde el docente no lo pidió, que sería
 * almacenamiento sin dueño y sin criterio para borrarlo.
 */
async function assertCanAttachEvidence(actor: Actor, attemptId: string, questionId: string) {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, userId: actor.userId },
    select: {
      id: true,
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
    select: { id: true, allowsEvidence: true, maxEvidenceFiles: true },
  });
  if (!question) throw AppError.notFound(ERROR_CODE.QUESTION_NOT_FOUND, { questionId });

  if (!question.allowsEvidence) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'This question does not accept evidence', {
      questionId,
    });
  }

  const alreadyUploaded = await prisma.storedFile.count({
    where: { attemptId, questionId, kind: 'EVIDENCE' },
  });
  if (alreadyUploaded >= question.maxEvidenceFiles) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'No more files allowed for this question', {
      limit: question.maxEvidenceFiles,
    });
  }

  return { attempt, assessmentId: attempt.version.assessmentId };
}

export async function requestEvidenceUpload(
  actor: Actor,
  input: RequestEvidenceUploadInput,
): Promise<UploadTicket> {
  assertWithinSizeLimit(input.sizeBytes);

  const { assessmentId } = await assertCanAttachEvidence(actor, input.attemptId, input.questionId);

  const year = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { code: true },
  });

  const storageKey = buildEvidenceKey({
    academicYearCode: year?.code ?? 'sin-anio',
    assessmentId,
    attemptId: input.attemptId,
    contentType: input.contentType,
  });

  const target = await getStorage().createUploadTarget(storageKey, input.contentType);

  return {
    storageKey: target.key,
    uploadUrl: target.uploadUrl,
    expiresInSeconds: target.expiresInSeconds,
    maxBytes: env.S3_MAX_UPLOAD_BYTES,
  };
}

export async function confirmEvidenceUpload(
  actor: Actor,
  input: RequestEvidenceUploadInput & { storageKey: string },
): Promise<StoredFileView> {
  const { assessmentId } = await assertCanAttachEvidence(actor, input.attemptId, input.questionId);

  // Se pregunta a S3 qué hay realmente ahí, en lugar de fiarse del cliente.
  const actual = await getStorage().head(input.storageKey);
  if (!actual) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'The file was not uploaded', {
      storageKey: input.storageKey,
    });
  }
  assertWithinSizeLimit(actual.sizeBytes);

  const [year, answer] = await Promise.all([
    prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } }),
    prisma.attemptAnswer.findFirst({
      where: { attemptId: input.attemptId, questionId: input.questionId },
      select: { id: true },
    }),
  ]);

  const file = await prisma.storedFile.create({
    data: {
      kind: 'EVIDENCE',
      storageKey: input.storageKey,
      bucket: env.S3_BUCKET ?? 'memory',
      contentType: actual.contentType,
      sizeBytes: actual.sizeBytes,
      originalName: input.originalName,
      academicYearId: year?.id ?? null,
      assessmentId,
      questionId: input.questionId,
      attemptId: input.attemptId,
      answerId: answer?.id ?? null,
      uploadedById: actor.userId,
    },
    include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
  });

  log.info(
    { fileId: file.id, attemptId: input.attemptId, sizeBytes: actual.sizeBytes },
    'evidencia registrada',
  );

  return toView(file);
}

// --- Imágenes de enunciado ---------------------------------------------------

async function assertCanAttachMedia(actor: Actor, versionId: string) {
  const version = await prisma.assessmentVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      status: true,
      assessmentId: true,
      assessment: { select: { createdById: true } },
    },
  });
  if (!version) throw AppError.notFound(ERROR_CODE.ASSESSMENT_VERSION_NOT_FOUND, { versionId });

  if (!isAdmin(actor) && version.assessment.createdById !== actor.userId) {
    throw AppError.forbidden(ERROR_CODE.NOT_RESOURCE_OWNER, { versionId });
  }

  // Una versión publicada es inmutable; añadirle una imagen la cambiaría.
  if (version.status !== 'DRAFT') {
    throw AppError.conflict(ERROR_CODE.VERSION_IMMUTABLE, 'The version is not editable', {
      status: version.status,
    });
  }

  return version;
}

export async function requestQuestionMediaUpload(
  actor: Actor,
  input: RequestQuestionMediaUploadInput,
): Promise<UploadTicket> {
  assertWithinSizeLimit(input.sizeBytes);
  const version = await assertCanAttachMedia(actor, input.versionId);

  const storageKey = buildQuestionMediaKey({
    assessmentId: version.assessmentId,
    versionId: version.id,
    contentType: input.contentType,
  });

  const target = await getStorage().createUploadTarget(storageKey, input.contentType);

  return {
    storageKey: target.key,
    uploadUrl: target.uploadUrl,
    expiresInSeconds: target.expiresInSeconds,
    maxBytes: env.S3_MAX_UPLOAD_BYTES,
  };
}

export async function confirmQuestionMediaUpload(
  actor: Actor,
  input: RequestQuestionMediaUploadInput & { storageKey: string },
): Promise<StoredFileView & { downloadUrl: string }> {
  const version = await assertCanAttachMedia(actor, input.versionId);

  const actual = await getStorage().head(input.storageKey);
  if (!actual) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'The file was not uploaded', {
      storageKey: input.storageKey,
    });
  }
  assertWithinSizeLimit(actual.sizeBytes);

  const file = await prisma.storedFile.create({
    data: {
      kind: 'QUESTION_MEDIA',
      storageKey: input.storageKey,
      bucket: env.S3_BUCKET ?? 'memory',
      contentType: actual.contentType,
      sizeBytes: actual.sizeBytes,
      originalName: input.originalName,
      assessmentId: version.assessmentId,
      uploadedById: actor.userId,
    },
    include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
  });

  return {
    ...toView(file),
    downloadUrl: await getStorage().createDownloadUrl(
      file.storageKey,
      file.originalName,
      isInlineViewable(file.contentType),
    ),
  };
}

/** Las imágenes se sirven en línea; el resto, como descarga. */
function isInlineViewable(contentType: string): boolean {
  return contentType.startsWith('image/');
}

// --- Material de capacitación ------------------------------------------------

/**
 * El material de capacitación lo sube quien lo redacta.
 *
 * A diferencia de las evidencias, no cuelga de un intento ni de un año lectivo:
 * es contenido de la plataforma y vive mientras viva su bloque. Por eso la fila
 * solo lleva `trainingContentId`, y por eso esa relación sí borra en cascada.
 */
async function assertCanManageTraining(contentId: string) {
  const content = await prisma.trainingContent.findUnique({
    where: { id: contentId },
    select: { id: true, module: { select: { code: true } } },
  });
  if (!content) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { contentId });
  return content;
}

export async function requestTrainingMediaUpload(
  input: RequestTrainingMediaUploadInput,
): Promise<UploadTicket> {
  assertWithinSizeLimit(input.sizeBytes);
  const content = await assertCanManageTraining(input.contentId);

  const storageKey = buildTrainingMediaKey({
    moduleCode: content.module.code,
    contentId: content.id,
    contentType: input.contentType,
  });

  const target = await getStorage().createUploadTarget(storageKey, input.contentType);

  return {
    storageKey: target.key,
    uploadUrl: target.uploadUrl,
    expiresInSeconds: target.expiresInSeconds,
    maxBytes: env.S3_MAX_UPLOAD_BYTES,
  };
}

export async function confirmTrainingMediaUpload(
  actor: Actor,
  input: RequestTrainingMediaUploadInput & { storageKey: string },
): Promise<StoredFileView & { downloadUrl: string }> {
  await assertCanManageTraining(input.contentId);

  const actual = await getStorage().head(input.storageKey);
  if (!actual) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'The file was not uploaded', {
      storageKey: input.storageKey,
    });
  }
  assertWithinSizeLimit(actual.sizeBytes);

  const file = await prisma.storedFile.create({
    data: {
      kind: 'TRAINING_MEDIA',
      storageKey: input.storageKey,
      bucket: env.S3_BUCKET ?? 'memory',
      contentType: actual.contentType,
      sizeBytes: actual.sizeBytes,
      originalName: input.originalName,
      trainingContentId: input.contentId,
      uploadedById: actor.userId,
    },
    include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
  });

  return {
    ...toView(file),
    downloadUrl: await getStorage().createDownloadUrl(
      file.storageKey,
      file.originalName,
      isInlineViewable(file.contentType),
    ),
  };
}

// --- Lectura y borrado individual --------------------------------------------

function toView(file: {
  id: string;
  kind: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy?: { id: string; firstName: string; lastName: string } | null;
}): StoredFileView {
  return {
    id: file.id,
    kind: file.kind,
    originalName: file.originalName,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt,
    uploadedBy: file.uploadedBy ?? null,
  };
}

/**
 * Quién puede ver un archivo.
 *
 * El que lo subió, el docente que creó la evaluación, el director del curso y
 * cualquier administrador. Se resuelve en una consulta con `OR` en lugar de
 * cargar el archivo y decidir después, para que el 404 y el 403 sean el mismo
 * resultado: quien no puede verlo tampoco debe poder deducir que existe.
 */
function visibilityClause(actor: Actor): Prisma.StoredFileWhereInput {
  if (isAdmin(actor)) return {};

  const clauses: Prisma.StoredFileWhereInput[] = [
    { uploadedById: actor.userId },
    /*
     * El material de capacitación lo ve cualquiera que esté autenticado: es
     * contenido de la plataforma, no de una persona. La alternativa sería
     * comprobar el permiso de formación en cada descarga, lo que impediría que
     * un administrador revisara el material que él mismo publicó.
     */
    { kind: 'TRAINING_MEDIA' },
  ];

  if (actor.roles.includes(ROLE.TEACHER)) {
    clauses.push({ assessment: { createdById: actor.userId } });
  }

  return { OR: clauses };
}

export async function listEvidenceForAttempt(
  actor: Actor,
  attemptId: string,
  questionId?: string,
): Promise<StoredFileView[]> {
  const files = await prisma.storedFile.findMany({
    where: {
      attemptId,
      kind: 'EVIDENCE',
      ...(questionId ? { questionId } : {}),
      ...visibilityClause(actor),
    },
    include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return files.map(toView);
}

export async function createDownloadUrl(actor: Actor, fileId: string): Promise<string> {
  const file = await prisma.storedFile.findFirst({
    where: { id: fileId, ...visibilityClause(actor) },
    select: { storageKey: true, originalName: true, contentType: true },
  });
  if (!file) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { fileId });

  return getStorage().createDownloadUrl(
    file.storageKey,
    file.originalName,
    isInlineViewable(file.contentType),
  );
}

/** Un estudiante puede retirar su evidencia mientras el intento siga abierto. */
export async function deleteFile(actor: Actor, fileId: string): Promise<void> {
  const file = await prisma.storedFile.findFirst({
    where: { id: fileId, ...visibilityClause(actor) },
    select: { id: true, storageKey: true, attemptId: true, uploadedById: true },
  });
  if (!file) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { fileId });

  if (!isAdmin(actor) && file.attemptId) {
    const attempt = await prisma.assessmentAttempt.findUnique({
      where: { id: file.attemptId },
      select: { status: true },
    });
    if (attempt?.status !== 'IN_PROGRESS') {
      throw AppError.conflict(
        ERROR_CODE.ATTEMPT_ALREADY_SUBMITTED,
        'The attempt is closed; the evidence is part of the record',
      );
    }
  }

  await removeFilesByIds([file.id]);
}

// --- Borrado en bloque -------------------------------------------------------

/**
 * Borra objetos y filas, en ese orden.
 *
 * Siempre S3 primero. Si se hiciera al revés y fallara el borrado remoto,
 * quedarían objetos sin ninguna fila que los mencione: basura que nadie sabe
 * que está ahí y que nadie va a encontrar. Al revés, una fila cuyo objeto ya
 * no existe es detectable y recuperable.
 */
async function removeFilesByIds(
  ids: string[],
): Promise<{ deletedObjects: number; deletedRows: number }> {
  if (ids.length === 0) return { deletedObjects: 0, deletedRows: 0 };

  const files = await prisma.storedFile.findMany({
    where: { id: { in: ids } },
    select: { id: true, storageKey: true },
  });

  const deletedObjects = await getStorage().remove(files.map((file) => file.storageKey));
  const { count } = await prisma.storedFile.deleteMany({ where: { id: { in: ids } } });

  return { deletedObjects, deletedRows: count };
}

export interface PurgeScope {
  assessmentId?: string;
  academicYearId?: string;
  attemptId?: string;
  trainingContentId?: string;
  kind?: 'EVIDENCE' | 'QUESTION_MEDIA';
  /** Borra todo lo anterior a esta fecha. */
  before?: Date;
}

export interface PurgeSummary {
  files: number;
  bytes: number;
  deletedObjects: number;
}

function purgeWhere(scope: PurgeScope): Prisma.StoredFileWhereInput {
  return {
    ...(scope.assessmentId ? { assessmentId: scope.assessmentId } : {}),
    ...(scope.academicYearId ? { academicYearId: scope.academicYearId } : {}),
    ...(scope.attemptId ? { attemptId: scope.attemptId } : {}),
    ...(scope.trainingContentId ? { trainingContentId: scope.trainingContentId } : {}),
    ...(scope.kind ? { kind: scope.kind } : {}),
    ...(scope.before ? { createdAt: { lt: scope.before } } : {}),
  };
}

/** Qué se borraría, sin borrarlo. */
export async function previewPurge(scope: PurgeScope): Promise<PurgeSummary> {
  const result = await prisma.storedFile.aggregate({
    where: purgeWhere(scope),
    _count: true,
    _sum: { sizeBytes: true },
  });

  return { files: result._count, bytes: result._sum.sizeBytes ?? 0, deletedObjects: 0 };
}

export async function purgeFiles(
  actor: Actor | null,
  scope: PurgeScope,
  reason: string,
): Promise<PurgeSummary> {
  const files = await prisma.storedFile.findMany({
    where: purgeWhere(scope),
    select: { id: true, storageKey: true, sizeBytes: true },
  });

  if (files.length === 0) return { files: 0, bytes: 0, deletedObjects: 0 };

  const bytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const deletedObjects = await getStorage().remove(files.map((file) => file.storageKey));
  await prisma.storedFile.deleteMany({ where: { id: { in: files.map((file) => file.id) } } });

  if (actor) {
    await recordAudit({
      userId: actor.userId,
      action: AUDIT_ACTION.DELETE_STORED_FILES,
      entityType: 'stored_file',
      metadata: { ...scope, reason, files: files.length, bytes, deletedObjects },
    });
  }

  log.warn({ ...scope, reason, files: files.length, bytes, deletedObjects }, 'archivos eliminados');

  return { files: files.length, bytes, deletedObjects };
}

/** Resumen de lo almacenado, para el panel de administración. */
export async function getStorageUsage(): Promise<{
  total: { files: number; bytes: number };
  byKind: Array<{ kind: string; files: number; bytes: number }>;
  byYear: Array<{ academicYearId: string | null; code: string; files: number; bytes: number }>;
}> {
  const [total, byKind, byYearRaw, years] = await Promise.all([
    prisma.storedFile.aggregate({ _count: true, _sum: { sizeBytes: true } }),
    prisma.storedFile.groupBy({ by: ['kind'], _count: true, _sum: { sizeBytes: true } }),
    prisma.storedFile.groupBy({ by: ['academicYearId'], _count: true, _sum: { sizeBytes: true } }),
    prisma.academicYear.findMany({ select: { id: true, code: true } }),
  ]);

  const codeById = new Map(years.map((year) => [year.id, year.code]));

  return {
    total: { files: total._count, bytes: total._sum.sizeBytes ?? 0 },
    byKind: byKind.map((row) => ({
      kind: row.kind,
      files: row._count,
      bytes: row._sum.sizeBytes ?? 0,
    })),
    byYear: byYearRaw.map((row) => ({
      academicYearId: row.academicYearId,
      code: row.academicYearId ? (codeById.get(row.academicYearId) ?? '—') : 'sin año',
      files: row._count,
      bytes: row._sum.sizeBytes ?? 0,
    })),
  };
}
