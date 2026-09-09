import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, created, noContent, ok } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { getQuery, uuidParam, validate } from '../../middleware/validate.js';
import {
  confirmEvidenceUpload,
  confirmQuestionMediaUpload,
  confirmTrainingMediaUpload,
  createDownloadUrl,
  deleteFile,
  getStorageUsage,
  listEvidenceForAttempt,
  previewPurge,
  purgeFiles,
  requestEvidenceUpload,
  requestEvidenceUploadSchema,
  requestQuestionMediaUpload,
  requestQuestionMediaUploadSchema,
  requestTrainingMediaUpload,
  requestTrainingMediaUploadSchema,
} from './files.service.js';

export const filesRouter: Router = Router();

filesRouter.use(authenticate);

const withKey = z.object({ storageKey: z.string().min(1).max(1024) });

// --- Evidencias --------------------------------------------------------------

/**
 * Paso 1: pedir permiso para subir.
 *
 * Devuelve una URL firmada de corta duración. El archivo no pasa por aquí; lo
 * sube el navegador directamente a S3, que es lo que evita que treinta
 * evidencias simultáneas durante un examen ocupen la memoria del servidor.
 */
filesRouter.post(
  '/evidence/upload-url',
  requirePermission(PERMISSION.ATTEMPT_TAKE),
  validate({ body: requestEvidenceUploadSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await requestEvidenceUpload(requireAuth(req), req.body));
  }),
);

/** Paso 2: confirmar. Se comprueba contra S3 antes de registrar nada. */
filesRouter.post(
  '/evidence/confirm',
  requirePermission(PERMISSION.ATTEMPT_TAKE),
  validate({ body: requestEvidenceUploadSchema.merge(withKey) }),
  asyncHandler(async (req, res) => {
    created(res, await confirmEvidenceUpload(requireAuth(req), req.body));
  }),
);

filesRouter.get(
  '/evidence/:attemptId',
  validate({
    params: z.object({ attemptId: z.string().uuid() }),
    query: z.object({ questionId: z.string().uuid().optional() }),
  }),
  asyncHandler(async (req, res) => {
    const { questionId } = getQuery<{ questionId?: string }>(req);
    ok(res, await listEvidenceForAttempt(requireAuth(req), req.params['attemptId']!, questionId));
  }),
);

// --- Imágenes de enunciado ---------------------------------------------------

filesRouter.post(
  '/question-media/upload-url',
  requirePermission(PERMISSION.ASSESSMENT_UPDATE),
  validate({ body: requestQuestionMediaUploadSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await requestQuestionMediaUpload(requireAuth(req), req.body));
  }),
);

filesRouter.post(
  '/question-media/confirm',
  requirePermission(PERMISSION.ASSESSMENT_UPDATE),
  validate({ body: requestQuestionMediaUploadSchema.merge(withKey) }),
  asyncHandler(async (req, res) => {
    created(res, await confirmQuestionMediaUpload(requireAuth(req), req.body));
  }),
);

// --- Material de capacitación ------------------------------------------------

/**
 * Imágenes, vídeos y adjuntos del material formativo.
 *
 * Mismo procedimiento en tres pasos que el resto: el archivo no pasa por el
 * servidor y se comprueba contra el almacenamiento antes de registrarlo.
 */
filesRouter.post(
  '/training-media/upload-url',
  requirePermission(PERMISSION.TRAINING_MANAGE),
  validate({ body: requestTrainingMediaUploadSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await requestTrainingMediaUpload(req.body));
  }),
);

filesRouter.post(
  '/training-media/confirm',
  requirePermission(PERMISSION.TRAINING_MANAGE),
  validate({ body: requestTrainingMediaUploadSchema.merge(withKey) }),
  asyncHandler(async (req, res) => {
    created(res, await confirmTrainingMediaUpload(requireAuth(req), req.body));
  }),
);

// --- Acceso y borrado individual ---------------------------------------------

/**
 * URL de descarga temporal.
 *
 * Se devuelve la URL en lugar de redirigir para que el cliente decida qué hacer
 * con ella, y caduca en minutos: una URL de descarga que dura horas es un
 * enlace público con retraso.
 */
filesRouter.get(
  '/:id/download-url',
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, { url: await createDownloadUrl(requireAuth(req), req.params['id']!) });
  }),
);

filesRouter.delete(
  '/:id',
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    await deleteFile(requireAuth(req), req.params['id']!);
    noContent(res);
  }),
);

// --- Administración ----------------------------------------------------------

/** Qué hay guardado y cuánto ocupa, por tipo y por año. */
filesRouter.get(
  '/usage',
  requirePermission(PERMISSION.SETTINGS_MANAGE),
  asyncHandler(async (_req, res) => {
    ok(res, await getStorageUsage());
  }),
);

const purgeScopeSchema = z.object({
  assessmentId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  kind: z.enum(['EVIDENCE', 'QUESTION_MEDIA', 'TRAINING_MEDIA']).optional(),
  before: z.coerce.date().optional(),
});

filesRouter.post(
  '/purge/preview',
  requirePermission(PERMISSION.SETTINGS_MANAGE),
  validate({ body: purgeScopeSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await previewPurge(req.body));
  }),
);

/**
 * Borrado en bloque.
 *
 * `confirm` obligatorio y con el número exacto de archivos que se van a
 * eliminar: obliga a mirar la previsualización antes, y si entre una cosa y
 * otra alguien subió algo, el número deja de cuadrar y la operación se detiene
 * en lugar de borrar de más.
 */
filesRouter.post(
  '/purge',
  requirePermission(PERMISSION.SETTINGS_MANAGE),
  validate({
    body: purgeScopeSchema.extend({
      expectedFiles: z.number().int().min(0),
      reason: z.string().trim().min(3).max(200),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { expectedFiles, reason, ...scope } = req.body as {
      expectedFiles: number;
      reason: string;
    } & Record<string, unknown>;

    const preview = await previewPurge(scope);
    if (preview.files !== expectedFiles) {
      ok(res, { applied: false, expected: expectedFiles, actual: preview.files });
      return;
    }

    ok(res, { applied: true, ...(await purgeFiles(requireAuth(req), scope, reason)) });
  }),
);
