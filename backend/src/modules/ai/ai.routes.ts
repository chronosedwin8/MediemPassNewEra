import { Router } from 'express';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, ok } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { aiRateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { env } from '../../config/env.js';
import { getAiProvider } from './ai.provider.js';
import { AI_SUPPORTED_TYPES } from './ai.schema.js';
import {
  generateAssessment,
  generateSchema,
  listGenerationRequests,
  suggestGradeForAnswer,
  suggestGradeSchema,
} from './ai.service.js';

export const aiRouter: Router = Router();

aiRouter.use(authenticate);

/** Qué puede generar la IA en esta instalación. Lo consulta el formulario. */
aiRouter.get(
  '/capabilities',
  requirePermission(PERMISSION.AI_GENERATE),
  asyncHandler(async (_req, res) => {
    ok(res, {
      provider: getAiProvider().id,
      configured: getAiProvider().isConfigured(),
      /*
       * Si lo que hay detrás es el simulador.
       *
       * Se declara aparte de `configured` porque son cosas distintas: el
       * simulador está perfectamente configurado y aun así no escribe
       * preguntas sobre el tema pedido, sino relleno con la forma correcta.
       * Sin este dato, la interfaz no puede distinguir «la IA falló» de «no
       * hay IA», y el docente concluye lo primero.
       */
      simulated: getAiProvider().id === 'mock',
      model: env.AI_MODEL,
      supportedQuestionTypes: AI_SUPPORTED_TYPES,
      maxQuestions: env.AI_MAX_QUESTIONS_PER_REQUEST,
      dailyLimit: env.AI_RATE_LIMIT_PER_USER_PER_DAY,
    });
  }),
);

/**
 * Genera una evaluación.
 *
 * Devuelve siempre un **borrador**: la IA no publica. El docente lo revisa,
 * lo edita y lo publica con el mismo flujo que cualquier otra evaluación.
 */
aiRouter.post(
  '/generate',
  aiRateLimit,
  requirePermission(PERMISSION.AI_GENERATE),
  validate({ body: generateSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await generateAssessment(requireAuth(req), req.body));
  }),
);

aiRouter.get(
  '/requests',
  requirePermission(PERMISSION.AI_GENERATE),
  asyncHandler(async (req, res) => {
    ok(res, await listGenerationRequests(requireAuth(req)));
  }),
);

/**
 * Propuesta de corrección para una respuesta escrita.
 *
 * Exige calificar, no generar: es una ayuda a la corrección y quien la usa es
 * quien iba a poner la nota de todos modos.
 */
aiRouter.post(
  '/grade',
  requirePermission(PERMISSION.ATTEMPT_GRADE),
  validate({ body: suggestGradeSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await suggestGradeForAnswer(requireAuth(req), req.body));
  }),
);
