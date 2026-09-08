import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { PaginationMeta } from '@medienpass/shared';

/**
 * Utilidades de respuesta HTTP.
 *
 * Todas las respuestas de la API pasan por aquí, de modo que la envoltura
 * `{ success, data }` es estructuralmente imposible de olvidar.
 */

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

export function created<T>(res: Response, data: T): void {
  ok(res, data, 201);
}

export function noContent(res: Response): void {
  res.status(204).end();
}

export function paginated<T>(res: Response, items: T[], meta: PaginationMeta): void {
  res.status(200).json({ success: true, data: items, meta });
}

/**
 * Envuelve un manejador asíncrono para que sus rechazos lleguen al middleware
 * de errores.
 *
 * Express 4 no propaga las promesas rechazadas por sí solo: sin esto, un
 * `await` que falle dentro de un controlador dejaría la petición colgada
 * hasta el tiempo de espera del cliente, sin registro ni respuesta.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/** Calcula los metadatos de paginación a partir del total. */
export function buildPaginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}
