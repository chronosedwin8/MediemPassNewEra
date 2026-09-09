import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, created, ok } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { uuidParam, validate } from '../../middleware/validate.js';
import {
  getAttempt,
  getResult,
  gradeAnswerManually,
  listAssignedAssessments,
  saveAnswer,
  startAttempt,
  submitAttempt,
} from './assessment-engine.js';

export const attemptsRouter: Router = Router();

attemptsRouter.use(authenticate);

/** Lo que el usuario actual tiene asignado, con su estado. */
attemptsRouter.get(
  '/assigned',
  requirePermission(PERMISSION.ATTEMPT_TAKE),
  asyncHandler(async (req, res) => {
    ok(res, await listAssignedAssessments(requireAuth(req).userId));
  }),
);

attemptsRouter.post(
  '/',
  requirePermission(PERMISSION.ATTEMPT_TAKE),
  validate({ body: z.object({ recipientId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const { recipientId } = req.body as { recipientId: string };
    created(res, await startAttempt(requireAuth(req).userId, recipientId));
  }),
);

// Devuelve el intento sin las respuestas correctas: se podan en el servidor.
attemptsRouter.get(
  '/:id',
  requirePermission(PERMISSION.ATTEMPT_TAKE),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await getAttempt(requireAuth(req).userId, req.params['id']!));
  }),
);

/**
 * Autoguardado. Idempotente: reenviar la misma respuesta no cambia nada.
 * Se usa PUT precisamente por eso.
 */
attemptsRouter.put(
  '/:id/answers/:questionId',
  requirePermission(PERMISSION.ATTEMPT_TAKE),
  validate({
    params: z.object({ id: z.string().uuid(), questionId: z.string().uuid() }),
    body: z.object({ response: z.unknown() }),
  }),
  asyncHandler(async (req, res) => {
    const { response } = req.body as { response: unknown };
    ok(
      res,
      await saveAnswer(
        requireAuth(req).userId,
        req.params['id']!,
        req.params['questionId']!,
        response,
      ),
    );
  }),
);

attemptsRouter.post(
  '/:id/submit',
  requirePermission(PERMISSION.ATTEMPT_TAKE),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await submitAttempt(requireAuth(req).userId, req.params['id']!));
  }),
);

attemptsRouter.get(
  '/:id/result',
  requirePermission(PERMISSION.RESULT_READ_OWN),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await getResult(requireAuth(req).userId, req.params['id']!));
  }),
);

/** Calificación manual de una respuesta abierta por el docente. */
attemptsRouter.post(
  '/:id/answers/:questionId/grade',
  requirePermission(PERMISSION.ATTEMPT_GRADE),
  validate({
    params: z.object({ id: z.string().uuid(), questionId: z.string().uuid() }),
    body: z.object({
      points: z.number().min(0).max(100),
      feedback: z.string().trim().max(2000).nullable().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { points, feedback } = req.body as { points: number; feedback?: string | null };
    ok(
      res,
      await gradeAnswerManually(
        requireAuth(req).userId,
        req.params['id']!,
        req.params['questionId']!,
        points,
        feedback ?? null,
      ),
    );
  }),
);
