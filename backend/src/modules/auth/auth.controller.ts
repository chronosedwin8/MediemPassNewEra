import type { CookieOptions, Request, Response } from 'express';
import { ERROR_CODE } from '@medienpass/shared';
import { env, isProduction } from '../../config/env.js';
import { AppError } from '../../shared/errors/app-error.js';
import { noContent, ok } from '../../shared/http/response.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { createCsrfToken, safeCompare } from './token.service.js';
import {
  changeOwnPassword,
  getCurrentUser,
  login,
  logout,
  refreshSession,
  type LoginResult,
  type RequestMetadata,
} from './auth.service.js';
import type { ChangePasswordInput, LoginInput } from './auth.dto.js';

/**
 * Controlador de autenticación.
 *
 * Solo traduce entre HTTP y el servicio: no contiene reglas de negocio. Lo
 * único propio de esta capa son las cookies, que son un detalle de transporte.
 */

const REFRESH_COOKIE = 'mp_refresh';
const CSRF_COOKIE = 'mp_csrf';

function refreshCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    // `strict` impide que el navegador envíe el refresco desde cualquier sitio
    // de terceros, que es exactamente el vector que se quiere cerrar.
    sameSite: 'strict',
    secure: isProduction,
    path: '/api/auth',
    expires: expiresAt,
    signed: true,
  };
}

/**
 * Cookie CSRF por doble envío: legible por el cliente a propósito, para que
 * pueda reenviarla como cabecera. Su valor no autentica nada por sí solo; lo
 * que demuestra es que quien hace la petición pudo leer la cookie, cosa que
 * un sitio de terceros no puede.
 */
function csrfCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: false,
    sameSite: 'strict',
    secure: isProduction,
    path: '/',
    expires: expiresAt,
  };
}

function metadataFrom(req: Request): RequestMetadata {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}

function sendSession(res: Response, result: LoginResult): void {
  const csrfToken = createCsrfToken();
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions(result.refreshExpiresAt));
  res.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions(result.refreshExpiresAt));

  ok(res, {
    user: result.user,
    accessToken: result.accessToken,
    expiresIn: env.JWT_EXPIRES_IN,
    csrfToken,
  });
}

export async function loginController(req: Request, res: Response): Promise<void> {
  const { identifier, password } = req.body as LoginInput;
  const result = await login(identifier, password, metadataFrom(req));
  sendSession(res, result);
}

/**
 * Refresco. Es la única ruta que se autentica con cookie, así que es la única
 * que necesita protección CSRF.
 */
export async function refreshController(req: Request, res: Response): Promise<void> {
  const token = req.signedCookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) {
    throw AppError.unauthorized(ERROR_CODE.TOKEN_INVALID, 'Missing refresh cookie');
  }

  const cookieCsrf = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const headerCsrf = req.get('x-csrf-token');
  if (!cookieCsrf || !headerCsrf || !safeCompare(cookieCsrf, headerCsrf)) {
    throw AppError.forbidden(ERROR_CODE.CSRF_TOKEN_INVALID);
  }

  const result = await refreshSession(token, metadataFrom(req));
  sendSession(res, result);
}

export async function logoutController(req: Request, res: Response): Promise<void> {
  const token = req.signedCookies?.[REFRESH_COOKIE] as string | undefined;
  await logout(token, metadataFrom(req));
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
  noContent(res);
}

export async function meController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  ok(res, await getCurrentUser(auth.userId));
}

export async function changePasswordController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;
  await changeOwnPassword(auth.userId, currentPassword, newPassword, metadataFrom(req));

  // Cambiar la contraseña revoca todas las sesiones, incluida ésta: se limpian
  // las cookies para que el cliente no intente refrescar con un token muerto.
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
  noContent(res);
}
