import type { ApiErrorBody, PaginationMeta } from '@medienpass/shared';
import { translateError } from '@/app/i18n';

/**
 * Cliente HTTP único.
 *
 * Toda llamada a la API pasa por aquí. Concentrarlas permite tres cosas que
 * de otro modo habría que repetir en cada pantalla: adjuntar el token, renovar
 * la sesión de forma transparente cuando caduca, y convertir cualquier fallo
 * en un error con mensaje ya traducido.
 *
 * El token de acceso vive **en memoria**, no en `localStorage`: si un script
 * ajeno llegara a ejecutarse en la página, no podría leerlo. La sesión
 * persiste entre recargas gracias a la cookie de refresco, que es `httpOnly`
 * y por tanto invisible para JavaScript.
 */

const BASE_URL = '/api';

let accessToken: string | null = null;
let csrfToken: string | null = null;

/** Se invoca cuando la sesión se pierde definitivamente. */
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/** Nombre de la cookie CSRF que emite el servidor, legible a propósito. */
const CSRF_COOKIE = 'mp_csrf';

/**
 * Token CSRF vigente.
 *
 * En memoria mientras dura la página y, si no lo hay, leído de la cookie. Esa
 * segunda parte no es un adorno: al recargar se pierde la memoria pero no la
 * cookie, y la primera petición tras una recarga es justo la renovación de
 * sesión. Sin la cabecera, el servidor la rechaza —hace bien, es su defensa
 * antifalsificación— y el usuario aparece desconectado cada vez que pulsa F5
 * o abre un enlace de la plataforma en otra pestaña.
 *
 * El servidor emite esta cookie sin `httpOnly` exactamente para esto: el
 * patrón de doble envío exige que el cliente pueda leerla y reenviarla.
 */
function currentCsrfToken(): string | null {
  if (csrfToken) return csrfToken;

  // Se recorre en lugar de usar una expresión regular: el nombre de la cookie
  // se interpola, y una regular construida con interpolación es justo donde se
  // cuelan los fallos de escapado que nadie ve hasta que algo deja de casar.
  for (const entry of document.cookie.split(';')) {
    const separator = entry.indexOf('=');
    if (separator === -1) continue;

    if (entry.slice(0, separator).trim() === CSRF_COOKIE) {
      const value = entry.slice(separator + 1).trim();
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

export function onSessionExpired(handler: () => void): void {
  onSessionLost = handler;
}

/** Error de API con el código estable del servidor y el mensaje ya traducido. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly issues?: Array<{ path: string; rule: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Mensaje de un campo concreto, para pintarlo junto al input. */
  fieldError(path: string): string | undefined {
    return this.issues?.find((issue) => issue.path.endsWith(path))?.message;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Evita el intento de renovar sesión. Lo usan las propias rutas de auth. */
  skipRefresh?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
}

/**
 * Renovación de sesión.
 *
 * Se guarda la promesa en curso para que varias peticiones que caduquen a la
 * vez compartan una sola renovación. Sin esto, cargar un panel con seis
 * llamadas simultáneas dispararía seis rotaciones de token y el propio
 * mecanismo antirrobo las interpretaría como reutilización.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const token = currentCsrfToken();
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { 'x-csrf-token': token } : {},
      });

      if (!response.ok) return false;

      const payload = (await response.json()) as {
        data: { accessToken: string; csrfToken: string };
      };
      accessToken = payload.data.accessToken;
      csrfToken = payload.data.csrfToken;
      return true;
    } catch {
      return false;
    } finally {
      // Se libera en el siguiente ciclo para que las peticiones que llegaron
      // durante la renovación reutilicen su resultado.
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    }
  })();

  return refreshInFlight;
}

async function parseError(response: Response): Promise<ApiError> {
  let body: { error?: ApiErrorBody } | null = null;
  try {
    body = (await response.json()) as { error?: ApiErrorBody };
  } catch {
    // Respuesta sin cuerpo JSON: un 502 de un proxy, por ejemplo.
  }

  const code = body?.error?.code ?? 'INTERNAL_ERROR';
  return new ApiError(
    code,
    response.status,
    translateError(code, body?.error?.details),
    body?.error?.details,
    body?.error?.issues,
  );
}

/*
 * Concentra la política completa de una petición: cabeceras, red, renovación
 * de sesión y traducción del error. Repartirla obligaría a seguir el flujo
 * saltando entre funciones, que es peor de leer y más fácil de romper.
 */
/* eslint-disable-next-line complexity */
async function execute<T>(path: string, options: RequestOptions, isRetry = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  /*
   * El token CSRF viaja siempre que se tenga.
   *
   * Hoy solo lo exige `/auth/refresh`, que es la única ruta autenticada por
   * cookie, y esa es precisamente la que llama la restauración de sesión al
   * arrancar la aplicación. Poner la cabecera solo en la renovación
   * automática dejaba fuera ese camino: al recargar, la restauración salía sin
   * cabecera, el servidor la rechazaba y el usuario acababa en la pantalla de
   * acceso. Mandarla en todas es inocuo —quien no la comprueba la ignora— y
   * evita que el próximo endpoint que la exija repita el mismo fallo.
   */
  const csrf = currentCsrfToken();
  if (csrf) headers['x-csrf-token'] = csrf;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('NETWORK', 0, translateError('network'));
  }

  // Un token caducado se renueva y la petición se repite una sola vez. Más de
  // una sería un bucle si el problema fuera otro.
  if (response.status === 401 && !isRetry && !options.skipRefresh) {
    const renewed = await refreshSession();
    if (renewed) return execute<T>(path, options, true);

    accessToken = null;
    onSessionLost?.();
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;

  const payload = (await response.json()) as { data: T };
  return payload.data;
}

async function executePaginated<T>(
  path: string,
  options: RequestOptions,
): Promise<{ items: T[]; meta: PaginationMeta }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(buildUrl(path, options.query), {
    method: 'GET',
    headers,
    credentials: 'include',
    signal: options.signal,
  });

  if (response.status === 401 && !options.skipRefresh) {
    const renewed = await refreshSession();
    if (renewed) return executePaginated<T>(path, { ...options, skipRefresh: true });
    accessToken = null;
    onSessionLost?.();
  }

  if (!response.ok) throw await parseError(response);

  const payload = (await response.json()) as { data: T[]; meta: PaginationMeta };
  return { items: payload.data, meta: payload.meta };
}

/**
 * Descarga un archivo que sirve la propia API.
 *
 * No se puede resolver con un enlace: la API se autentica con la cabecera
 * `Authorization`, no con una cookie, así que una navegación directa a la
 * dirección llegaría sin identificar. Se pide con `fetch`, se recoge como
 * blob y quien llama decide qué hacer con él.
 *
 * Se reintenta una vez tras renovar la sesión, igual que el resto: un diploma
 * se descarga justo después de mirar el resultado, que es cuando el token
 * lleva ya un rato.
 */
export async function downloadFile(
  path: string,
  isRetry = false,
): Promise<{ blob: Blob; filename: string | null }> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const csrf = currentCsrfToken();
  if (csrf) headers['x-csrf-token'] = csrf;

  const response = await fetch(buildUrl(path), {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && !isRetry) {
    const renewed = await refreshSession();
    if (renewed) return downloadFile(path, true);

    accessToken = null;
    onSessionLost?.();
  }

  if (!response.ok) throw await parseError(response);

  // El nombre lo pone el servidor; sin él, quien llama pone el suyo.
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);

  return { blob: await response.blob(), filename: match?.[1] ?? null };
}

export const http = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal): Promise<T> =>
    execute<T>(path, { method: 'GET', query, signal }),

  list: <T>(
    path: string,
    query?: RequestOptions['query'],
    signal?: AbortSignal,
  ): Promise<{ items: T[]; meta: PaginationMeta }> => executePaginated<T>(path, { query, signal }),

  post: <T>(path: string, body?: unknown, options?: Partial<RequestOptions>): Promise<T> =>
    execute<T>(path, { method: 'POST', body, ...options }),

  put: <T>(path: string, body?: unknown): Promise<T> => execute<T>(path, { method: 'PUT', body }),

  patch: <T>(path: string, body?: unknown): Promise<T> =>
    execute<T>(path, { method: 'PATCH', body }),

  delete: <T>(path: string): Promise<T> => execute<T>(path, { method: 'DELETE' }),

  download: downloadFile,
};
