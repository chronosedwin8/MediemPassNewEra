import { ERROR_CODE } from '@medienpass/shared';
import type { ZodTypeAny, output } from 'zod';
import { env } from '../../../config/env.js';
import { ExternalServiceError } from '../../../shared/errors/app-error.js';
import { cache } from '../../../shared/cache/cache.service.js';
import { createLogger } from '../../../shared/logger.js';

const log = createLogger('phidias:client');

/**
 * Cliente HTTP de Phidias.
 *
 * Todo lo que tiene que ver con la red vive aquí: tiempo de espera,
 * reintentos, cortacircuitos, caché y traducción de estados HTTP a errores del
 * dominio. El servicio de arriba se ocupa del significado; este archivo, de
 * que la llamada llegue o falle de forma predecible.
 *
 * El token **nunca** sale de este archivo: no se registra, no se devuelve y no
 * aparece en ningún mensaje de error.
 */

interface CircuitState {
  failures: number;
  openedAt: number | null;
}

/**
 * Cortacircuitos.
 *
 * Cuando Phidias está caído, seguir llamándolo solo consigue que cada petición
 * de nuestros usuarios espere treinta segundos antes de fallar. Tras cinco
 * fallos consecutivos el circuito se abre durante un minuto y las llamadas
 * fallan de inmediato, con un código que el frontend puede explicar.
 */
const FAILURE_THRESHOLD = 5;
const OPEN_DURATION_MS = 60_000;

const circuit: CircuitState = { failures: 0, openedAt: null };

export function circuitStatus(): { open: boolean; failures: number; retryInMs: number } {
  const open = circuit.openedAt !== null && Date.now() - circuit.openedAt < OPEN_DURATION_MS;
  return {
    open,
    failures: circuit.failures,
    retryInMs: open ? OPEN_DURATION_MS - (Date.now() - circuit.openedAt!) : 0,
  };
}

function recordSuccess(): void {
  circuit.failures = 0;
  circuit.openedAt = null;
}

function recordFailure(): void {
  circuit.failures += 1;
  if (circuit.failures >= FAILURE_THRESHOLD) {
    circuit.openedAt = Date.now();
    log.error({ failures: circuit.failures }, 'cortacircuitos abierto');
  }
}

/** Traduce el estado HTTP a un error con código propio y significado claro. */
function toDomainError(status: number, path: string): ExternalServiceError {
  const details = { path, status };

  if (status === 401 || status === 403) {
    return new ExternalServiceError(
      'phidias',
      ERROR_CODE.PHIDIAS_UNAUTHORIZED,
      `Phidias rejected the request with ${status}. The token may have expired or lack permissions.`,
      { details },
    );
  }
  if (status === 404) {
    return new ExternalServiceError('phidias', ERROR_CODE.EXTERNAL_SERVICE_ERROR, 'Endpoint not found', {
      details,
    });
  }
  if (status === 429) {
    return new ExternalServiceError('phidias', ERROR_CODE.RATE_LIMIT_EXCEEDED, 'Phidias rate limit', {
      details,
    });
  }
  if (status >= 500) {
    return new ExternalServiceError(
      'phidias',
      ERROR_CODE.EXTERNAL_SERVICE_UNAVAILABLE,
      `Phidias returned ${status}`,
      { details },
    );
  }
  return new ExternalServiceError('phidias', ERROR_CODE.EXTERNAL_SERVICE_ERROR, `HTTP ${status}`, {
    details,
  });
}

/** Solo se reintenta lo que puede resolverse solo. Un 401 no mejora insistiendo. */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface RequestOptions {
  /** Segundos de caché. 0 desactiva. Por defecto, el valor del entorno. */
  cacheTtlSeconds?: number;
  /** Fuerza la llamada aunque haya respuesta cacheada. */
  skipCache?: boolean;
}

/*
 * El bucle de reintentos concentra a propósito toda la política de fallo:
 * qué se reintenta, cuánto se espera, cuándo se abre el cortacircuitos y cómo
 * se traduce cada estado. Repartirlo en funciones sueltas obligaría a seguir
 * el flujo de control saltando entre ellas, que es peor de leer y más fácil de
 * romper. Se acepta la complejidad a cambio de que la política esté completa
 * y a la vista en un solo sitio.
 */
/* eslint-disable-next-line complexity */
async function requestRaw(path: string, query?: Record<string, string | number | undefined>): Promise<unknown> {
  if (!env.PHIDIAS_TOKEN) {
    throw new ExternalServiceError(
      'phidias',
      ERROR_CODE.PHIDIAS_UNAUTHORIZED,
      'PHIDIAS_TOKEN is not configured',
    );
  }

  const status = circuitStatus();
  if (status.open) {
    throw new ExternalServiceError(
      'phidias',
      ERROR_CODE.EXTERNAL_SERVICE_UNAVAILABLE,
      'Phidias circuit breaker is open',
      { details: { retryInMs: status.retryInMs } },
    );
  }

  const url = new URL(`${env.PHIDIAS_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= env.PHIDIAS_RETRIES; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.PHIDIAS_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${env.PHIDIAS_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      const elapsedMs = Date.now() - startedAt;

      if (!response.ok) {
        // Se registra la ruta, nunca la cabecera de autorización.
        log.warn({ path, status: response.status, elapsedMs, attempt }, 'respuesta no correcta');
        if (isRetryable(response.status) && attempt < env.PHIDIAS_RETRIES) {
          await sleep(2 ** attempt * 500);
          continue;
        }
        recordFailure();
        throw toDomainError(response.status, path);
      }

      recordSuccess();
      log.debug({ path, elapsedMs, attempt }, 'respuesta correcta');
      return await response.json();
    } catch (error) {
      lastError = error;

      if (error instanceof ExternalServiceError) throw error;

      const aborted = error instanceof Error && error.name === 'AbortError';
      log.warn(
        { path, attempt, aborted, error: error instanceof Error ? error.message : 'desconocido' },
        'fallo de red',
      );

      if (attempt < env.PHIDIAS_RETRIES) {
        await sleep(2 ** attempt * 500);
        continue;
      }

      recordFailure();
      throw new ExternalServiceError(
        'phidias',
        aborted ? ERROR_CODE.EXTERNAL_SERVICE_TIMEOUT : ERROR_CODE.EXTERNAL_SERVICE_ERROR,
        aborted ? `Phidias timed out after ${env.PHIDIAS_TIMEOUT_MS} ms` : 'Network failure',
        { details: { path }, cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new ExternalServiceError('phidias', ERROR_CODE.EXTERNAL_SERVICE_ERROR, 'Exhausted retries', {
    details: { path },
    cause: lastError,
  });
}

/**
 * Petición validada y cacheada.
 *
 * La validación ocurre **después** de la caché para que un cambio de esquema
 * no obligue a vaciarla, y **antes** de devolver nada al dominio: ningún dato
 * sin validar entra al sistema.
 */
export async function phidiasGet<S extends ZodTypeAny>(
  path: string,
  schema: S,
  query?: Record<string, string | number | undefined>,
  options: RequestOptions = {},
): Promise<output<S>> {
  const ttl = options.cacheTtlSeconds ?? env.PHIDIAS_CACHE_TTL_SECONDS;
  const cacheKey = `phidias:${path}:${JSON.stringify(query ?? {})}`;

  const raw =
    ttl > 0 && !options.skipCache
      ? await cache.remember(cacheKey, ttl, () => requestRaw(path, query))
      : await requestRaw(path, query);

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    log.error(
      { path, issues: parsed.error.issues.slice(0, 5) },
      'la respuesta de Phidias no cumple el contrato esperado',
    );
    throw new ExternalServiceError(
      'phidias',
      ERROR_CODE.EXTERNAL_SERVICE_ERROR,
      'Phidias response did not match the expected contract',
      { details: { path, issues: parsed.error.issues.slice(0, 5) } },
    );
  }

  return parsed.data;
}

export async function invalidatePhidiasCache(): Promise<void> {
  await cache.deleteByPrefix('phidias:');
}
