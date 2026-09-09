import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, http, onSessionExpired, setAccessToken, setCsrfToken } from '@/services/http';

/**
 * El cliente HTTP.
 *
 * Se prueba aquí porque concentra tres decisiones de seguridad que no se ven
 * desde ninguna pantalla y que, si se rompieran, lo harían en silencio: que el
 * token viaje en la cabecera y no en el almacenamiento del navegador, que una
 * sesión caducada se renueve **una sola vez** aunque caduquen seis peticiones
 * a la vez, y que un error del servidor llegue traducido a la interfaz.
 */

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Los encabezados de una llamada concreta, normalizados. */
function headersOf(call: FetchArgs): Record<string, string> {
  return Object.fromEntries(new Headers(call[1]?.headers).entries());
}

const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setAccessToken(null);
  setCsrfToken(null);
  onSessionExpired(() => {});
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('petición básica', () => {
  it('desenvuelve el sobre `data` de la respuesta', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: 'abc' } }));

    await expect(http.get<{ id: string }>('/assessments/abc')).resolves.toEqual({ id: 'abc' });
  });

  it('adjunta el token de acceso como Bearer', async () => {
    setAccessToken('token-en-memoria');
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: null }));

    await http.get('/auth/me');

    expect(headersOf(fetchMock.mock.calls[0]!).authorization).toBe('Bearer token-en-memoria');
  });

  /**
   * La razón de que el token viva en memoria: un script inyectado en la página
   * podría leer `localStorage`, pero no una variable de módulo. Si alguien
   * «arreglara» la persistencia guardándolo, esta prueba lo detendría.
   */
  it('no deja el token en ningún almacenamiento del navegador', async () => {
    setAccessToken('token-en-memoria');
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: null }));

    await http.get('/auth/me');

    const stored = [
      ...Object.values({ ...localStorage }),
      ...Object.values({ ...sessionStorage }),
    ].join('|');
    expect(stored).not.toContain('token-en-memoria');
  });

  it('envía las cookies, que es donde vive el refresco', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: null }));

    await http.get('/auth/me');

    expect(fetchMock.mock.calls[0]![1]?.credentials).toBe('include');
  });

  it('omite del query los parámetros vacíos', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], meta: {} }));

    await http.get('/assessments', { subjectId: 'x', groupId: '', periodId: undefined });

    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('subjectId=x');
    expect(url).not.toContain('groupId');
    expect(url).not.toContain('periodId');
  });

  it('devuelve indefinido ante un 204 sin cuerpo', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(http.delete('/assessments/abc')).resolves.toBeUndefined();
  });
});

describe('errores', () => {
  it('convierte el código del servidor en un mensaje traducido', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'ATTEMPT_LIMIT_REACHED' } }, 409),
    );

    const error = await http.post('/attempts').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('ATTEMPT_LIMIT_REACHED');
    expect((error as ApiError).status).toBe(409);
    // El mensaje ya viene traducido; no es la clave ni el código crudo.
    expect((error as ApiError).message).not.toContain('ATTEMPT_LIMIT_REACHED');
    expect((error as ApiError).message.length).toBeGreaterThan(0);
  });

  it('sobrevive a un error sin cuerpo JSON, como el de un proxy', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }));

    const error = (await http.get('/kmk').catch((caught: unknown) => caught)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('INTERNAL_ERROR');
  });

  it('traduce un fallo de red en un ApiError, no en una excepción cruda', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const error = (await http.get('/kmk').catch((caught: unknown) => caught)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
  });

  it('propaga la cancelación sin disfrazarla de error de red', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));

    const error = await http.get('/kmk').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DOMException);
  });

  it('localiza el error de un campo concreto para pintarlo junto al input', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            issues: [{ path: 'body.title', rule: 'too_small', message: 'Falta el título' }],
          },
        },
        422,
      ),
    );

    const error = (await http.post('/assessments', {}).catch((c: unknown) => c)) as ApiError;

    expect(error.fieldError('title')).toBe('Falta el título');
    expect(error.fieldError('description')).toBeUndefined();
  });
});

describe('renovación de sesión', () => {
  it('renueva y repite la petición una sola vez', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'TOKEN_EXPIRED' } }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ data: { accessToken: 'nuevo', csrfToken: 'csrf-nuevo' } }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'abc' } }));

    await expect(http.get('/assessments/abc')).resolves.toEqual({ id: 'abc' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]![0])).toContain('/auth/refresh');
    // Y la repetición ya lleva el token nuevo.
    expect(headersOf(fetchMock.mock.calls[2]!).authorization).toBe('Bearer nuevo');
  });

  /**
   * El motivo de agrupar la renovación no es ahorrar llamadas: es que el
   * backend detecta el robo de refresh tokens por reutilización, y seis
   * rotaciones simultáneas parecerían exactamente eso. Sin esta agrupación,
   * cargar un panel con varias peticiones cerraría la sesión del usuario.
   */
  it('agrupa varias caducidades simultáneas en una única renovación', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        return jsonResponse({ data: { accessToken: 'nuevo', csrfToken: 'csrf-nuevo' } });
      }
      // La primera vez que se pide cada recurso, caducado; después, bien.
      const already = fetchMock.mock.calls.filter((call) => String(call[0]) === url).length;
      return already > 1
        ? jsonResponse({ data: url })
        : jsonResponse({ error: { code: 'TOKEN_EXPIRED' } }, 401);
    });

    await Promise.all([http.get('/a'), http.get('/b'), http.get('/c')]);

    const refreshes = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/auth/refresh'),
    );
    expect(refreshes).toHaveLength(1);
  });

  it('manda el token CSRF al renovar', async () => {
    setCsrfToken('csrf-actual');
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'TOKEN_EXPIRED' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ data: { accessToken: 'n', csrfToken: 'c' } }))
      .mockResolvedValueOnce(jsonResponse({ data: null }));

    await http.get('/auth/me');

    expect(headersOf(fetchMock.mock.calls[1]!)['x-csrf-token']).toBe('csrf-actual');
  });

  it('avisa de sesión perdida cuando la renovación falla, sin reintentar en bucle', async () => {
    const sessionLost = vi.fn();
    onSessionExpired(sessionLost);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'TOKEN_EXPIRED' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'TOKEN_EXPIRED' } }, 401));

    await expect(http.get('/auth/me')).rejects.toBeInstanceOf(ApiError);

    expect(sessionLost).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no intenta renovar en las propias rutas de autenticación', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'INVALID_CREDENTIALS' } }, 401));

    await expect(
      http.post('/auth/login', { identifier: 'a', password: 'b' }, { skipRefresh: true }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    // Una contraseña equivocada no debe disparar una renovación: eso mostraría
    // «sesión caducada» a alguien que simplemente se equivocó al teclear.
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('listados paginados', () => {
  it('separa los elementos de los metadatos', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: 'a' }], meta: { page: 1, pageSize: 20, total: 1 } }),
    );

    const result = await http.list<{ id: string }>('/assessments');

    expect(result.items).toEqual([{ id: 'a' }]);
    expect(result.meta.total).toBe(1);
  });

  it('también renueva la sesión', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'TOKEN_EXPIRED' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ data: { accessToken: 'n', csrfToken: 'c' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }));

    await expect(http.list('/assessments')).resolves.toMatchObject({ items: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
