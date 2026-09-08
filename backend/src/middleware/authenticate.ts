import type { RequestHandler } from 'express';
import { ERROR_CODE } from '@medienpass/shared';
import { AppError } from '../shared/errors/app-error.js';
import { verifyAccessToken } from '../modules/auth/token.service.js';

/**
 * Autenticación por token de acceso.
 *
 * El token es autocontenido: trae roles y permisos, de modo que la
 * comprobación de acceso no exige una consulta a la base en cada petición.
 * El precio es que un cambio de permisos tarda hasta quince minutos en
 * propagarse, lo cual es aceptable; cuando no lo sea —una suspensión de
 * cuenta— se revoca la familia de refresco, que sí tiene efecto inmediato.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.get('authorization');

  if (!header?.startsWith('Bearer ')) {
    next(AppError.unauthorized(ERROR_CODE.UNAUTHENTICATED, 'Missing bearer token'));
    return;
  }

  verifyAccessToken(header.slice(7).trim())
    .then((claims) => {
      req.auth = claims;
      next();
    })
    .catch(next);
};

/**
 * Autenticación opcional: adjunta el contexto si hay token válido, pero no
 * rechaza si falta. Útil en endpoints públicos que enriquecen su respuesta
 * cuando saben quién pregunta.
 */
export const authenticateOptional: RequestHandler = (req, _res, next) => {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  verifyAccessToken(header.slice(7).trim())
    .then((claims) => {
      req.auth = claims;
      next();
    })
    .catch(() => next());
};

/** Devuelve el contexto de autenticación o falla: evita comprobar `undefined`. */
export function requireAuth(req: { auth?: NonNullable<Express.Request['auth']> }): NonNullable<
  Express.Request['auth']
> {
  if (!req.auth) throw AppError.unauthorized(ERROR_CODE.UNAUTHENTICATED);
  return req.auth;
}
