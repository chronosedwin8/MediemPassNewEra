import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { ERROR_CODE } from '@medienpass/shared';
import { env, isTest } from '../config/env.js';

/**
 * Límite de peticiones.
 *
 * Tres niveles con motivos distintos: el general protege el servicio, el de
 * autenticación frena la fuerza bruta sobre contraseñas, y el de IA protege
 * el presupuesto, que es un recurso tan agotable como la CPU.
 *
 * Se desactiva en pruebas: una suite que dispara cien peticiones seguidas
 * chocaría con el límite y fallaría por un motivo ajeno a lo que verifica.
 */
function buildLimiter(max: number, windowMs: number, code: string): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    max: isTest ? 0 : max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTest,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: { code, message: 'Too many requests', requestId: res.locals['requestId'] },
      });
    },
  });
}

export const generalRateLimit = buildLimiter(
  env.RATE_LIMIT_MAX,
  env.RATE_LIMIT_WINDOW_MS,
  ERROR_CODE.RATE_LIMIT_EXCEEDED,
);

/** Ventana amplia y cupo corto: lo que desalienta la fuerza bruta. */
export const authRateLimit = buildLimiter(
  env.RATE_LIMIT_AUTH_MAX,
  15 * 60 * 1000,
  ERROR_CODE.RATE_LIMIT_EXCEEDED,
);

export const aiRateLimit = buildLimiter(20, 60 * 60 * 1000, ERROR_CODE.AI_QUOTA_EXCEEDED);
