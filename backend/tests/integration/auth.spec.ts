import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { SignJWT } from 'jose';
import { AUDIT_ACTION, ERROR_CODE, PERMISSION, ROLE } from '@medienpass/shared';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { env } from '../../src/config/env.js';
import {
  TEST_PASSWORD,
  createAdmin,
  createStudent,
  createTeacher,
  createUser,
  seedRolesAndPermissions,
} from '../helpers/factories.js';

const app = createApp();

/** Extrae una cookie concreta de la cabecera `set-cookie`. */
function readCookie(response: request.Response, name: string): string | undefined {
  const header = response.headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return match?.split(';')[0];
}

async function login(identifier: string, password = TEST_PASSWORD): Promise<request.Response> {
  return request(app).post('/api/auth/login').send({ identifier, password });
}

beforeEach(async () => {
  await seedRolesAndPermissions();
});

describe('POST /api/auth/login', () => {
  it('devuelve token de acceso, usuario y permisos con credenciales correctas', async () => {
    const teacher = await createTeacher({ username: 'docente.prueba' });

    const response = await login('docente.prueba');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toBeTypeOf('string');
    expect(response.body.data.user.id).toBe(teacher.id);
    expect(response.body.data.user.roles).toEqual([ROLE.TEACHER]);
    expect(response.body.data.user.permissions).toContain(PERMISSION.ASSESSMENT_CREATE);
    expect(response.body.data.user.permissions).not.toContain(PERMISSION.SETTINGS_MANAGE);
  });

  it('no expone el hash de la contraseña en la respuesta', async () => {
    await createTeacher({ username: 'sin.hash' });
    const response = await login('sin.hash');
    expect(JSON.stringify(response.body)).not.toContain('argon2');
    expect(response.body.data.user.passwordHash).toBeUndefined();
  });

  it('acepta el correo como identificador', async () => {
    await createStudent({ username: 'ana.lopez', email: 'ana.lopez@colegioaleman.edu.co' });
    const response = await login('ana.lopez@colegioaleman.edu.co');
    expect(response.status).toBe(200);
  });

  it('fija la cookie de refresco como httpOnly y con SameSite estricto', async () => {
    await createTeacher({ username: 'cookie.test' });
    const response = await login('cookie.test');

    const header = response.headers['set-cookie'];
    const cookies = Array.isArray(header) ? header : [header];
    const refresh = cookies.find((cookie: string) => cookie.startsWith('mp_refresh='));

    expect(refresh).toBeDefined();
    expect(refresh).toContain('HttpOnly');
    expect(refresh).toContain('SameSite=Strict');
  });

  it('rechaza una contraseña incorrecta sin revelar si la cuenta existe', async () => {
    await createTeacher({ username: 'existe' });

    const wrongPassword = await login('existe', 'ContrasenaMala1');
    const unknownUser = await login('no.existe', 'ContrasenaMala1');

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    // El mismo código en ambos casos: distinguirlos permitiría enumerar cuentas.
    expect(wrongPassword.body.error.code).toBe(ERROR_CODE.INVALID_CREDENTIALS);
    expect(unknownUser.body.error.code).toBe(ERROR_CODE.INVALID_CREDENTIALS);
  });

  it('bloquea la cuenta tras cinco intentos fallidos consecutivos', async () => {
    await createTeacher({ username: 'bloqueable' });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await login('bloqueable', 'ContrasenaMala1');
    }

    // Incluso con la contraseña correcta, la cuenta está bloqueada.
    const response = await login('bloqueable');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe(ERROR_CODE.ACCOUNT_LOCKED);
  });

  it('rechaza una cuenta pendiente de activación con su propio código', async () => {
    await createUser({ username: 'pendiente', status: 'PENDING_ACTIVATION', role: ROLE.STUDENT });
    const response = await login('pendiente');
    expect(response.body.error.code).toBe(ERROR_CODE.ACCOUNT_NOT_ACTIVATED);
  });

  it('rechaza una cuenta suspendida', async () => {
    await createUser({ username: 'suspendido', status: 'SUSPENDED', role: ROLE.STUDENT });
    const response = await login('suspendido');
    expect(response.body.error.code).toBe(ERROR_CODE.ACCOUNT_SUSPENDED);
  });

  it('devuelve 422 con el detalle del campo cuando el cuerpo es inválido', async () => {
    const response = await request(app).post('/api/auth/login').send({ identifier: '' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe(ERROR_CODE.VALIDATION_ERROR);
    expect(response.body.error.issues.map((issue: { path: string }) => issue.path)).toContain(
      'body.password',
    );
  });

  it('registra en auditoría tanto el acceso correcto como el fallido', async () => {
    await createTeacher({ username: 'auditado' });
    await login('auditado');
    await login('auditado', 'ContrasenaMala1');

    const actions = await prisma.auditLog.findMany({ select: { action: true } });
    const codes = actions.map((entry) => entry.action);

    expect(codes).toContain(AUDIT_ACTION.LOGIN);
    expect(codes).toContain(AUDIT_ACTION.LOGIN_FAILED);
  });

  it('no guarda la contraseña en los metadatos de auditoría', async () => {
    await createTeacher({ username: 'sin.filtracion' });
    await login('sin.filtracion', 'ContrasenaMala1');

    const entries = await prisma.auditLog.findMany();
    expect(JSON.stringify(entries)).not.toContain('ContrasenaMala1');
  });
});

describe('GET /api/auth/me', () => {
  it('devuelve el usuario autenticado', async () => {
    const admin = await createAdmin({ username: 'admin.prueba' });
    const { body } = await login('admin.prueba');

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.data.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(admin.id);
    expect(response.body.data.roles).toEqual([ROLE.ADMIN]);
  });

  it('rechaza la petición sin token', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe(ERROR_CODE.UNAUTHENTICATED);
  });

  it('rechaza un token manipulado', async () => {
    const { body } = await login((await createTeacher({ username: 'manipulado' })).username);
    const tampered = `${body.data.accessToken.slice(0, -6)}abcdef`;

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tampered}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe(ERROR_CODE.TOKEN_INVALID);
  });

  it('distingue un token expirado de uno inválido', async () => {
    const user = await createTeacher({ username: 'expirado' });
    const expiredToken = await new SignJWT({
      username: user.username,
      roles: [],
      permissions: [],
      sid: 'x',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer('medienpass')
      .setAudience('medienpass-api')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(env.JWT_SECRET));

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    // El cliente necesita esta distinción: ante TOKEN_EXPIRED debe refrescar,
    // no pedir credenciales de nuevo.
    expect(response.body.error.code).toBe(ERROR_CODE.TOKEN_EXPIRED);
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const user = await createTeacher({ username: 'otro.secreto' });
    const foreignToken = await new SignJWT({
      username: user.username,
      roles: [ROLE.ADMIN],
      permissions: [],
      sid: 'x',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer('medienpass')
      .setAudience('medienpass-api')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('un-secreto-completamente-distinto-de-48-bytes-largo'));

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${foreignToken}`);

    expect(response.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rota el refresco y emite un token de acceso nuevo', async () => {
    await createTeacher({ username: 'refrescable' });
    const first = await login('refrescable');

    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [readCookie(first, 'mp_refresh')!, readCookie(first, 'mp_csrf')!])
      .set('x-csrf-token', first.body.data.csrfToken);

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeTypeOf('string');
    // La cookie debe cambiar: si se reutilizara, no sería rotación.
    expect(readCookie(response, 'mp_refresh')).not.toBe(readCookie(first, 'mp_refresh'));
  });

  it('exige el token CSRF', async () => {
    await createTeacher({ username: 'sin.csrf' });
    const first = await login('sin.csrf');

    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [readCookie(first, 'mp_refresh')!]);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODE.CSRF_TOKEN_INVALID);
  });

  it('detecta la reutilización de un refresco y revoca la cadena completa', async () => {
    await createTeacher({ username: 'robado' });
    const first = await login('robado');
    const oldCookie = readCookie(first, 'mp_refresh')!;
    const csrfCookie = readCookie(first, 'mp_csrf')!;

    const rotated = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [oldCookie, csrfCookie])
      .set('x-csrf-token', first.body.data.csrfToken);
    expect(rotated.status).toBe(200);

    // Alguien intenta usar el refresco antiguo: señal de robo.
    const reuse = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [oldCookie, csrfCookie])
      .set('x-csrf-token', first.body.data.csrfToken);

    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe(ERROR_CODE.REFRESH_TOKEN_REUSED);

    // Y el token que sí era legítimo también queda revocado. Se envían la
    // cookie y la cabecera CSRF emitidas en la rotación, para que el rechazo
    // provenga de la revocación y no de un desajuste de CSRF.
    const afterRevocation = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [readCookie(rotated, 'mp_refresh')!, readCookie(rotated, 'mp_csrf')!])
      .set('x-csrf-token', rotated.body.data.csrfToken);

    expect(afterRevocation.status).toBe(401);
  });
});

describe('POST /api/auth/change-password', () => {
  it('cambia la contraseña y revoca todas las sesiones abiertas', async () => {
    const user = await createTeacher({ username: 'cambia.clave' });
    const session = await login('cambia.clave');

    const response = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.body.data.accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'NuevaClave456' });

    expect(response.status).toBe(204);

    const active = await prisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(active).toBe(0);

    expect((await login('cambia.clave', 'NuevaClave456')).status).toBe(200);
    expect((await login('cambia.clave', TEST_PASSWORD)).status).toBe(401);
  });

  it('rechaza el cambio si la contraseña actual no coincide', async () => {
    await createTeacher({ username: 'clave.mala' });
    const session = await login('clave.mala');

    const response = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.body.data.accessToken}`)
      .send({ currentPassword: 'NoEsLaMia1', newPassword: 'NuevaClave456' });

    expect(response.status).toBe(401);
  });

  it('exige una contraseña que cumpla la política', async () => {
    await createTeacher({ username: 'clave.debil' });
    const session = await login('clave.debil');

    const response = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.body.data.accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'corta' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe(ERROR_CODE.VALIDATION_ERROR);
  });
});

describe('POST /api/auth/logout', () => {
  it('revoca la sesión', async () => {
    const user = await createTeacher({ username: 'cierra.sesion' });
    const session = await login('cierra.sesion');

    const response = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [readCookie(session, 'mp_refresh')!]);

    expect(response.status).toBe(204);
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(
      0,
    );
  });
});

describe('respuestas y cabeceras generales', () => {
  it('incluye un identificador de petición en errores y respuestas', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['x-request-id']).toBeTypeOf('string');
  });

  it('responde 404 con la envoltura estándar en rutas inexistentes', async () => {
    const response = await request(app).get('/api/no-existe');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, error: { code: ERROR_CODE.NOT_FOUND } });
  });

  it('no revela la tecnología del servidor', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
