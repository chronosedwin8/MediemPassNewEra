import type { CookieOptions, Request, Response } from 'express';
import { ERROR_CODE } from '@medienpass/shared';
import { env, isProduction } from '../../config/env.js';
import { AppError } from '../../shared/errors/app-error.js';
import { noContent, ok } from '../../shared/http/response.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { createCsrfToken, safeCompare } from './token.service.js';
import { getSsoProvider, isSsoEnabled } from './sso.service.js';
import {
  changeOwnPassword,
  getCurrentUser,
  login,
  logout,
  loginWithSso,
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

// --- Inicio de sesión federado -----------------------------------------------

const SSO_COOKIE = 'mp_sso';

/** Contexto del flujo OIDC entre la ida al proveedor y la vuelta. */
interface SsoHandshakeCookie {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirect: string;
}

function ssoCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    // `lax` y no `strict`: el proveedor devuelve al usuario mediante una
    // navegación desde otro sitio, y con `strict` el navegador no enviaría la
    // cookie y el flujo no podría completarse nunca.
    sameSite: 'lax',
    secure: isProduction,
    path: '/api/auth/sso',
    maxAge: 10 * 60 * 1000,
    signed: true,
  };
}

function redirectUriFor(req: Request): string {
  const provider = getSsoProvider();
  return env.ENTRA_REDIRECT_URI ?? `${req.protocol}://${req.get('host')}/api/auth/sso/${provider.id.toLowerCase()}/callback`;
}

/** Indica si el SSO está disponible. Público: la pantalla de acceso lo necesita. */
export function ssoStatusController(_req: Request, res: Response): void {
  ok(res, {
    enabled: isSsoEnabled(),
    provider: isSsoEnabled() ? getSsoProvider().id : null,
    allowedDomains: env.SSO_ALLOWED_DOMAINS,
  });
}

export async function ssoStartController(req: Request, res: Response): Promise<void> {
  if (!isSsoEnabled()) {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'SSO is not enabled');
  }

  const redirectUri = redirectUriFor(req);
  const handshake = await getSsoProvider().createHandshake(redirectUri);

  const requested = typeof req.query['redirect'] === 'string' ? req.query['redirect'] : '/';

  const cookie: SsoHandshakeCookie = {
    state: handshake.state,
    nonce: handshake.nonce,
    codeVerifier: handshake.codeVerifier,
    // Solo se acepta una ruta interna: sin esta comprobación, el parámetro
    // sería un redirector abierto hacia cualquier sitio.
    redirect: requested.startsWith('/') && !requested.startsWith('//') ? requested : '/',
  };

  res.cookie(SSO_COOKIE, JSON.stringify(cookie), ssoCookieOptions());
  res.redirect(handshake.authorizationUrl);
}

/**
 * Retorno del proveedor.
 *
 * No devuelve ningún token en la URL: fija la cookie de refresco y redirige a
 * la aplicación, que ya sabe canjearla al arrancar. Un token en la barra de
 * direcciones acaba en el historial, en los registros del servidor y en la
 * cabecera `Referer` de la primera imagen que cargue la página.
 */
export async function ssoCallbackController(req: Request, res: Response): Promise<void> {
  const raw = req.signedCookies?.[SSO_COOKIE] as string | undefined;
  res.clearCookie(SSO_COOKIE, { path: '/api/auth/sso' });

  const failureUrl = (code: string): string =>
    `${env.APP_URL}/login?ssoError=${encodeURIComponent(code)}`;

  if (!raw) {
    res.redirect(failureUrl(ERROR_CODE.SSO_STATE_MISMATCH));
    return;
  }

  const handshake = JSON.parse(raw) as SsoHandshakeCookie;
  const code = typeof req.query['code'] === 'string' ? req.query['code'] : null;
  const state = typeof req.query['state'] === 'string' ? req.query['state'] : null;

  // El estado ata la respuesta a la petición que la originó: es lo que impide
  // que alguien induzca a un usuario a completar un flujo que no empezó él.
  if (!code || !state || !safeCompare(state, handshake.state)) {
    res.redirect(failureUrl(ERROR_CODE.SSO_STATE_MISMATCH));
    return;
  }

  try {
    const profile = await getSsoProvider().exchangeCode({
      code,
      codeVerifier: handshake.codeVerifier,
      nonce: handshake.nonce,
      redirectUri: redirectUriFor(req),
    });

    const result = await loginWithSso(profile, metadataFrom(req));
    const csrfToken = createCsrfToken();

    res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions(result.refreshExpiresAt));
    res.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions(result.refreshExpiresAt));
    res.redirect(`${env.APP_URL}${handshake.redirect}`);
  } catch (error) {
    const failureCode =
      error instanceof AppError ? error.code : ERROR_CODE.INTERNAL_ERROR;
    res.redirect(failureUrl(failureCode));
  }
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
