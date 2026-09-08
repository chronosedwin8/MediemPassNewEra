import type { RequestHandler } from 'express';
import { ERROR_CODE, ROLE, hasAnyPermission, hasPermission, type Permission, type Role } from '@medienpass/shared';
import { AppError } from '../shared/errors/app-error.js';

/**
 * Control de acceso basado en roles y permisos.
 *
 * Hay dos preguntas distintas y este archivo solo responde la primera:
 *
 *  1. **¿Puede hacer esto?** — es el permiso. Se responde aquí, en el
 *     middleware, antes de tocar la base de datos.
 *  2. **¿Sobre qué filas?** — es el alcance. Se responde en el servicio, que
 *     es el único que sabe si la evaluación pertenece a ese docente o si el
 *     grupo está entre los suyos.
 *
 * Confundirlas produce el error clásico de dar por segura la autorización
 * porque "el middleware ya lo comprobó", cuando el middleware solo sabe que
 * el usuario puede editar *alguna* evaluación, no *esa*.
 */

/** Exige todos los permisos indicados. */
export function requirePermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(AppError.unauthorized(ERROR_CODE.UNAUTHENTICATED));
      return;
    }
    if (!hasPermission(req.auth.permissions, permissions)) {
      next(
        AppError.forbidden(ERROR_CODE.INSUFFICIENT_PERMISSIONS, {
          required: permissions,
        }),
      );
      return;
    }
    next();
  };
}

/** Exige al menos uno de los permisos indicados. */
export function requireAnyPermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(AppError.unauthorized(ERROR_CODE.UNAUTHENTICATED));
      return;
    }
    if (!hasAnyPermission(req.auth.permissions, permissions)) {
      next(AppError.forbidden(ERROR_CODE.INSUFFICIENT_PERMISSIONS, { requiredAnyOf: permissions }));
      return;
    }
    next();
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(AppError.unauthorized(ERROR_CODE.UNAUTHENTICATED));
      return;
    }
    if (!roles.some((role) => req.auth!.roles.includes(role))) {
      next(AppError.forbidden(ERROR_CODE.FORBIDDEN, { requiredRoles: roles }));
      return;
    }
    next();
  };
}

export function isAdmin(auth: { roles: Role[] }): boolean {
  return auth.roles.includes(ROLE.ADMIN);
}

/**
 * Guarda de propiedad, para usar dentro de un servicio.
 *
 * Un administrador la atraviesa; cualquier otro debe ser el dueño del recurso.
 * Se lanza `NOT_RESOURCE_OWNER` y no `NOT_FOUND` porque el usuario sí puede
 * saber que el recurso existe: llegó a él desde un listado propio.
 */
export function assertOwnership(
  auth: { userId: string; roles: Role[] },
  ownerId: string,
  details?: Record<string, unknown>,
): void {
  if (isAdmin(auth)) return;
  if (auth.userId !== ownerId) {
    throw AppError.forbidden(ERROR_CODE.NOT_RESOURCE_OWNER, details);
  }
}

/**
 * Guarda de alcance: el recurso debe estar dentro del conjunto que el usuario
 * puede ver (sus grupos, sus materias, sus estudiantes).
 */
export function assertInScope(
  auth: { roles: Role[] },
  isInScope: boolean,
  details?: Record<string, unknown>,
): void {
  if (isAdmin(auth)) return;
  if (!isInScope) {
    throw AppError.forbidden(ERROR_CODE.OUT_OF_SCOPE, details);
  }
}
