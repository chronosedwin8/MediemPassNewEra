import type { RequestHandler } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { AppError } from '../shared/errors/app-error.js';
import type { ValidationIssue } from '@medienpass/shared';

/**
 * Validación de la petición con Zod.
 *
 * Nada llega a un controlador sin haber pasado por aquí. El objeto validado
 * **reemplaza** al original, de modo que el controlador trabaja con datos ya
 * convertidos —números que son números, fechas que son fechas— y no con las
 * cadenas que llegaron por la red.
 *
 * La especificación es explícita: no se confía en los datos que envía el
 * frontend. Eso incluye `params`, `query`, cuerpo y cabeceras.
 */

interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function toIssues(error: z.ZodError, source: string): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: [source, ...issue.path.map(String)].join('.'),
    rule: issue.code,
    message: issue.message,
  }));
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    const issues: ValidationIssue[] = [];

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) Object.assign(req.params, result.data);
      else issues.push(...toIssues(result.error, 'params'));
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      // `req.query` es de solo lectura en Express 5 y un getter en 4:
      // se guarda aparte en lugar de reasignarlo.
      if (result.success)
        Object.defineProperty(req, 'validatedQuery', { value: result.data, writable: true });
      else issues.push(...toIssues(result.error, 'query'));
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) req.body = result.data;
      else issues.push(...toIssues(result.error, 'body'));
    }

    if (issues.length > 0) {
      next(AppError.validation(issues));
      return;
    }

    next();
  };
}

/** Lee la consulta ya validada con su tipo. */
export function getQuery<T>(req: { validatedQuery?: unknown }): T {
  return req.validatedQuery as T;
}

// --- Esquemas reutilizables --------------------------------------------------

export const uuidParam = (name = 'id'): ZodTypeAny =>
  z.object({ [name]: z.string().uuid(`${name} debe ser un UUID`) });

/**
 * Paginación común a todos los listados. Ningún endpoint devuelve una
 * colección sin límite: el tope de 100 es deliberado.
 */
export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().trim().max(50).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().max(200).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuery>;
