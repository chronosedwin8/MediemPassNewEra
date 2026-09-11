import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, created, ok } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { uuidParam, validate } from '../../middleware/validate.js';
import { buildCertificateData } from '../certificates/certificate.service.js';
import { renderCertificate } from '../certificates/certificate.pdf.js';
import { assertCanDownloadCertificate } from '../certificates/certificate.access.js';
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

/**
 * Diploma de competencias KMK en PDF.
 *
 * Se compone al vuelo desde el intento. No se guarda: un PDF archivado sería
 * una copia que puede quedar obsoleta si la nota cambia tras una reclamación,
 * y este documento debe seguir diciendo la verdad el día que se enseñe.
 *
 * El permiso es el de leer el resultado propio; el servicio comprueba además
 * que el intento sea de quien lo pide. Al profesorado y a la administración se
 * les permite descargarlo porque son quienes lo imprimen y lo firman.
 */
attemptsRouter.get(
  '/:id/certificate',
  requireAnyPermission(
    PERMISSION.RESULT_READ_OWN,
    PERMISSION.RESULT_READ_SCOPED,
    PERMISSION.RESULT_READ_ALL,
  ),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const attemptId = req.params['id']!;

    await assertCanDownloadCertificate(auth, attemptId);

    const data = await buildCertificateData(attemptId, auth.language);
    const pdf = await renderCertificate(data);

    /*
     * `attachment` y no `inline`: el diploma se guarda y se imprime, no se
     * ojea. El nombre lleva el apellido y la referencia para que treinta
     * descargas de una clase no acaben siendo treinta «documento.pdf».
     */
    const filename = `diploma-${data.student.fullName.replace(/[^\p{L}\p{N}]+/gu, '-')}-${data.serial}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
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
