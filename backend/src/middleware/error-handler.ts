import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ERROR_CODE, ERROR_HTTP_STATUS, type ApiErrorBody, type ValidationIssue } from '@medienpass/shared';
import { AppError } from '../shared/errors/app-error.js';
import { createLogger } from '../shared/logger.js';
import { isProduction } from '../config/env.js';

const log = createLogger('errors');

/**
 * Manejo centralizado de errores.
 *
 * Traduce cualquier fallo —de dominio, de validación, de base de datos o
 * inesperado— a la misma envoltura de error con un código estable. Dos reglas
 * que no se negocian:
 *
 *  1. Un error inesperado nunca revela su detalle interno al cliente en
 *     producción. Se registra completo y se responde con `INTERNAL_ERROR`.
 *  2. El cliente recibe siempre un `requestId` con el que el operador puede
 *     localizar la traza exacta en los registros.
 */

function zodToIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    rule: issue.code,
    message: issue.message,
  }));
}

/**
 * Traduce los errores conocidos de Prisma.
 * Sin esto, una violación de unicidad llegaría al cliente como un 500, cuando
 * en realidad es un 409 perfectamente descriptible.
 */
function fromPrisma(error: Prisma.PrismaClientKnownRequestError): AppError {
  switch (error.code) {
    case 'P2002': {
      const target = error.meta?.['target'];
      const fields = Array.isArray(target) ? target.join(', ') : String(target ?? 'campo');
      return new AppError(ERROR_CODE.DUPLICATE_RESOURCE, `Unique constraint failed on ${fields}`, {
        details: { fields },
      });
    }
    case 'P2003':
      return new AppError(ERROR_CODE.CONFLICT, 'Foreign key constraint failed', {
        details: { field: error.meta?.['field_name'] },
      });
    case 'P2025':
      return new AppError(ERROR_CODE.NOT_FOUND, 'Record not found');
    default:
      return AppError.internal(`Database error ${error.code}`, error);
  }
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return AppError.validation(zodToIssues(error));
  if (error instanceof Prisma.PrismaClientKnownRequestError) return fromPrisma(error);
  if (error instanceof Prisma.PrismaClientValidationError) {
    return AppError.internal('Invalid database query', error);
  }
  if (error instanceof Error) return AppError.internal(error.message, error);
  return AppError.internal('Unknown error', error);
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const appError = toAppError(error);
  const requestId = res.locals['requestId'] as string | undefined;

  const context = {
    requestId,
    method: req.method,
    path: req.originalUrl,
    code: appError.code,
    status: appError.status,
    userId: req.auth?.userId,
  };

  // Los 5xx son defectos o caídas externas: merecen traza completa.
  // Los 4xx son comportamiento previsto del dominio y solo se anotan.
  if (appError.status >= 500) {
    log.error({ ...context, err: appError, cause: appError.cause }, appError.message);
  } else {
    log.warn(context, appError.message);
  }

  const body: ApiErrorBody = {
    code: appError.code,
    message: isProduction && appError.status >= 500 ? 'Internal server error' : appError.message,
    ...(appError.details ? { details: appError.details } : {}),
    ...(appError.issues ? { issues: appError.issues } : {}),
    ...(requestId ? { requestId } : {}),
  };

  res.status(appError.status).json({ success: false, error: body });
};

/** Cualquier ruta no registrada responde 404 con la misma envoltura. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(ERROR_HTTP_STATUS[ERROR_CODE.NOT_FOUND]).json({
    success: false,
    error: {
      code: ERROR_CODE.NOT_FOUND,
      message: `Route ${req.method} ${req.originalUrl} not found`,
      requestId: res.locals['requestId'],
    },
  });
};
