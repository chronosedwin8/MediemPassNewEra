import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, created, noContent, ok } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { uuidParam, validate } from '../../middleware/validate.js';
import {
  addContent,
  audienceSchema,
  contentSchema,
  createModule,
  createModuleSchema,
  deleteContent,
  deleteModule,
  getModuleForEditing,
  listAllModules,
  publishModule,
  reorderContents,
  reorderSchema,
  setAudience,
  unpublishModule,
  updateContent,
  updateModule,
  updateModuleSchema,
} from './training-admin.service.js';
import {
  getModule,
  getTrainingSummary,
  linkAssessment,
  listModules,
  recordProgress,
  startModuleAssessment,
} from './training.service.js';

export const trainingRouter: Router = Router();

trainingRouter.use(authenticate);

trainingRouter.get(
  '/modules',
  requirePermission(PERMISSION.TRAINING_PARTICIPATE),
  asyncHandler(async (req, res) => {
    ok(res, await listModules(requireAuth(req)));
  }),
);

trainingRouter.get(
  '/modules/:id',
  requirePermission(PERMISSION.TRAINING_PARTICIPATE),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await getModule(requireAuth(req), req.params['id']!));
  }),
);

// Avance por el material del módulo.
trainingRouter.put(
  '/modules/:id/progress',
  requirePermission(PERMISSION.TRAINING_PARTICIPATE),
  validate({
    params: uuidParam(),
    body: z.object({ contentsSeen: z.number().int().min(0).max(200) }),
  }),
  asyncHandler(async (req, res) => {
    const { contentsSeen } = req.body as { contentsSeen: number };
    await recordProgress(requireAuth(req), req.params['id']!, contentsSeen);
    noContent(res);
  }),
);

/**
 * Prepara la evaluación del módulo y devuelve el destinatario, que es lo que
 * el motor común necesita para iniciar un intento. A partir de ahí el flujo es
 * idéntico al de un estudiante.
 */
trainingRouter.post(
  '/modules/:id/assessment',
  requirePermission(PERMISSION.TRAINING_PARTICIPATE),
  validate({
    params: uuidParam(),
    body: z.object({ assessmentId: z.string().uuid().optional() }).default({}),
  }),
  asyncHandler(async (req, res) => {
    const { assessmentId } = req.body as { assessmentId?: string };
    const recipientId = await startModuleAssessment(
      requireAuth(req),
      req.params['id']!,
      assessmentId,
    );
    ok(res, { recipientId });
  }),
);

trainingRouter.get(
  '/summary/:userId?',
  requirePermission(PERMISSION.TRAINING_PARTICIPATE),
  asyncHandler(async (req, res) => {
    ok(res, await getTrainingSummary(requireAuth(req), req.params['userId']));
  }),
);

// --- Redacción del material --------------------------------------------------

/**
 * Todos los módulos, incluidos los borradores.
 *
 * Va aparte de `/modules` porque responde a otra pregunta: aquel devuelve lo
 * publicado y con el avance de quien pregunta; este devuelve lo que hay
 * escrito, con su estado. Mezclarlos obligaría a que el listado del docente
 * cargara datos que no le sirven y a filtrar en el cliente lo que no debe ver.
 */
trainingRouter.get(
  '/admin/modules',
  requireAnyPermission(PERMISSION.TRAINING_MANAGE, PERMISSION.TRAINING_CREATE),
  asyncHandler(async (req, res) => {
    ok(res, await listAllModules(requireAuth(req)));
  }),
);

trainingRouter.get(
  '/admin/modules/:id',
  requireAnyPermission(PERMISSION.TRAINING_MANAGE, PERMISSION.TRAINING_CREATE),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await getModuleForEditing(requireAuth(req), req.params['id']!));
  }),
);

trainingRouter.post(
  '/admin/modules',
  requireAnyPermission(PERMISSION.TRAINING_MANAGE, PERMISSION.TRAINING_CREATE),
  validate({ body: createModuleSchema }),
  asyncHandler(async (req, res) => {
    created(res, await createModule(requireAuth(req), req.body));
  }),
);

trainingRouter.patch(
  '/admin/modules/:id',
  requireAnyPermission(PERMISSION.TRAINING_MANAGE, PERMISSION.TRAINING_CREATE),
  validate({ params: uuidParam(), body: updateModuleSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await updateModule(requireAuth(req), req.params['id']!, req.body));
  }),
);

/** Publicar es un acto explícito: un módulo nunca se publica solo. */
trainingRouter.post(
  '/admin/modules/:id/publish',
  requireAnyPermission(PERMISSION.TRAINING_MANAGE, PERMISSION.TRAINING_CREATE),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await publishModule(requireAuth(req), req.params['id']!));
  }),
);

trainingRouter.post(
  '/admin/modules/:id/unpublish',
  requireAnyPermission(PERMISSION.TRAINING_MANAGE, PERMISSION.TRAINING_CREATE),
  validate({
    params: uuidParam(),
    body: z.object({ archive: z.boolean().default(false) }),
  }),
  asyncHandler(async (req, res) => {
    const { archive } = req.body as { archive: boolean };
    ok(res, await unpublishModule(requireAuth(req), req.params['id']!, archive));
  }),
);

trainingRouter.delete(
  '/admin/modules/:id',
  requireAnyPermission(PERMISSION.TRAINING_MANAGE, PERMISSION.TRAINING_CREATE),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    await deleteModule(requireAuth(req), req.params['id']!);
    noContent(res);
  }),
);

// --- Bloques de contenido ----------------------------------------------------

trainingRouter.post(
  '/admin/modules/:id/contents',
  requireAnyPermission(PERMISSION.TRAINING_MANAGE, PERMISSION.TRAINING_CREATE),
  validate({ params: uuidParam(), body: contentSchema }),
  asyncHandler(async (req, res) => {
    created(res, await addContent(requireAuth(req), req.params['id']!, req.body));
  }),
);

trainingRouter.put(
  '/admin/modules/:id/contents/order',
  requireAnyPermission(PERMISSION.TRAINING_MANAGE, PERMISSION.TRAINING_CREATE),
  validate({ params: uuidParam(), body: reorderSchema }),
  asyncHandler(async (req, res) => {
    const { ids } = req.body as { ids: string[] };
    await reorderContents(requireAuth(req), req.params['id']!, ids);
    noContent(res);
  }),
);

trainingRouter.patch(
  '/admin/contents/:id',
  requireAnyPermission(PERMISSION.TRAINING_MANAGE, PERMISSION.TRAINING_CREATE),
  validate({ params: uuidParam(), body: contentSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await updateContent(requireAuth(req), req.params['id']!, req.body));
  }),
);

trainingRouter.delete(
  '/admin/contents/:id',
  requireAnyPermission(PERMISSION.TRAINING_MANAGE, PERMISSION.TRAINING_CREATE),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    await deleteContent(requireAuth(req), req.params['id']!);
    noContent(res);
  }),
);

/** A qué docentes se les aplica esta capacitación. */
trainingRouter.put(
  '/admin/modules/:id/audience',
  requireAnyPermission(PERMISSION.TRAINING_MANAGE, PERMISSION.TRAINING_CREATE),
  validate({ params: uuidParam(), body: audienceSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await setAudience(requireAuth(req), req.params['id']!, req.body));
  }),
);

trainingRouter.put(
  '/admin/modules/:id/assessment',
  requireAnyPermission(PERMISSION.TRAINING_MANAGE, PERMISSION.TRAINING_CREATE),
  validate({
    params: uuidParam(),
    body: z.object({ assessmentId: z.string().uuid() }),
  }),
  asyncHandler(async (req, res) => {
    const { assessmentId } = req.body as { assessmentId: string };
    ok(res, await linkAssessment(requireAuth(req), req.params['id']!, assessmentId));
  }),
);
