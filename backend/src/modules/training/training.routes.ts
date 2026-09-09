import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, created, noContent, ok } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { uuidParam, validate } from '../../middleware/validate.js';
import {
  addContent,
  createContentSchema,
  createModule,
  createModuleSchema,
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
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    const recipientId = await startModuleAssessment(requireAuth(req), req.params['id']!);
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

// --- Administración del contenido -------------------------------------------

trainingRouter.post(
  '/modules',
  requirePermission(PERMISSION.TRAINING_MANAGE),
  validate({ body: createModuleSchema }),
  asyncHandler(async (req, res) => {
    created(res, await createModule(req.body));
  }),
);

trainingRouter.post(
  '/modules/:id/contents',
  requirePermission(PERMISSION.TRAINING_MANAGE),
  validate({ params: uuidParam(), body: createContentSchema }),
  asyncHandler(async (req, res) => {
    created(res, await addContent(req.params['id']!, req.body));
  }),
);

trainingRouter.put(
  '/modules/:id/assessment',
  requirePermission(PERMISSION.TRAINING_MANAGE),
  validate({
    params: uuidParam(),
    body: z.object({ assessmentId: z.string().uuid() }),
  }),
  asyncHandler(async (req, res) => {
    const { assessmentId } = req.body as { assessmentId: string };
    ok(res, await linkAssessment(req.params['id']!, assessmentId));
  }),
);
