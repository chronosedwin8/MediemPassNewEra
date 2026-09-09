import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ERROR_CODE, ROLE } from '@medienpass/shared';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import {
  TEST_PASSWORD,
  createAdmin,
  createStudent,
  createTeacher,
  seedRolesAndPermissions,
} from '../helpers/factories.js';

/**
 * Control de acceso.
 *
 * Se verifica sobre el módulo de usuarios porque es donde los tres roles
 * tienen capacidades claramente distintas: el administrador puede todo, el
 * docente puede leer estudiantes pero no gestionar cuentas, y el estudiante
 * no tiene nada que hacer aquí.
 */

const app = createApp();

async function tokenFor(username: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ identifier: username, password: TEST_PASSWORD });
  return response.body.data.accessToken as string;
}

beforeEach(async () => {
  await seedRolesAndPermissions();
});

describe('permisos sobre /api/users', () => {
  it('el administrador lista usuarios', async () => {
    await createAdmin({ username: 'admin.rbac' });
    await createTeacher({ username: 'docente.uno' });
    await createStudent({ username: 'alumno.uno' });

    const response = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${await tokenFor('admin.rbac')}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(response.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 3 });
  });

  it('el docente no puede listar usuarios: carece de user:read', async () => {
    await createTeacher({ username: 'docente.rbac' });

    const response = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${await tokenFor('docente.rbac')}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODE.INSUFFICIENT_PERMISSIONS);
    expect(response.body.error.details.required).toContain('user:read');
  });

  it('el estudiante no puede crear usuarios', async () => {
    await createStudent({ username: 'alumno.rbac' });

    const response = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${await tokenFor('alumno.rbac')}`)
      .send({
        username: 'intruso',
        firstName: 'Intento',
        lastName: 'Fallido',
        roles: [ROLE.ADMIN],
      });

    expect(response.status).toBe(403);
  });

  it('sin token, la respuesta es 401 y no 403', async () => {
    const response = await request(app).get('/api/users');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe(ERROR_CODE.UNAUTHENTICATED);
  });
});

describe('gestión de usuarios por el administrador', () => {
  it('crea un usuario con contraseña y queda activo', async () => {
    await createAdmin({ username: 'admin.crea' });

    const response = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${await tokenFor('admin.crea')}`)
      .send({
        username: 'nuevo.docente',
        email: 'nuevo.docente@colegioaleman.edu.co',
        firstName: 'Nuevo',
        lastName: 'Docente',
        roles: [ROLE.TEACHER],
        password: 'ClaveInicial1',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('ACTIVE');
    expect(response.body.data.roles).toEqual([ROLE.TEACHER]);
  });

  it('crea sin contraseña una cuenta pendiente de activación', async () => {
    await createAdmin({ username: 'admin.sso' });

    const response = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${await tokenFor('admin.sso')}`)
      .send({
        username: 'alumno.sso',
        email: 'alumno.sso@colegioaleman.edu.co',
        firstName: 'Alumno',
        lastName: 'Federado',
        roles: [ROLE.STUDENT],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('PENDING_ACTIVATION');
  });

  it('permite crear un estudiante sin correo', async () => {
    await createAdmin({ username: 'admin.sincorreo' });

    // Caso real: 20 estudiantes de la matrícula no tienen correo alguno.
    const response = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${await tokenFor('admin.sincorreo')}`)
      .send({
        username: 'alumno.sin.correo',
        email: null,
        firstName: 'Sin',
        lastName: 'Correo',
        roles: [ROLE.STUDENT],
        password: 'ClaveInicial1',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.email).toBeNull();
  });

  it('rechaza un nombre de usuario repetido con 409', async () => {
    await createAdmin({ username: 'admin.duplicado' });
    await createTeacher({ username: 'ya.existe' });

    const response = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${await tokenFor('admin.duplicado')}`)
      .send({
        username: 'ya.existe',
        firstName: 'Otro',
        lastName: 'Usuario',
        roles: [ROLE.TEACHER],
        password: 'ClaveInicial1',
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ERROR_CODE.DUPLICATE_RESOURCE);
  });

  it('suspender una cuenta revoca sus sesiones de inmediato', async () => {
    await createAdmin({ username: 'admin.suspende' });
    const teacher = await createTeacher({ username: 'a.suspender' });
    await tokenFor('a.suspender');

    expect(
      await prisma.refreshToken.count({ where: { userId: teacher.id, revokedAt: null } }),
    ).toBe(1);

    const response = await request(app)
      .patch(`/api/users/${teacher.id}`)
      .set('Authorization', `Bearer ${await tokenFor('admin.suspende')}`)
      .send({ status: 'SUSPENDED' });

    expect(response.status).toBe(200);
    expect(
      await prisma.refreshToken.count({ where: { userId: teacher.id, revokedAt: null } }),
    ).toBe(0);
  });

  it('el borrado es lógico y libera los identificadores únicos', async () => {
    await createAdmin({ username: 'admin.borra' });
    const teacher = await createTeacher({
      username: 'a.borrar',
      email: 'a.borrar@colegioaleman.edu.co',
    });

    const response = await request(app)
      .delete(`/api/users/${teacher.id}`)
      .set('Authorization', `Bearer ${await tokenFor('admin.borra')}`);

    expect(response.status).toBe(204);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: teacher.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.email).toBeNull();
    expect(row.username).not.toBe('a.borrar');

    // El correo liberado puede reutilizarse en una cuenta nueva.
    const reuse = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${await tokenFor('admin.borra')}`)
      .send({
        username: 'a.borrar',
        email: 'a.borrar@colegioaleman.edu.co',
        firstName: 'Reutilizado',
        lastName: 'Correo',
        roles: [ROLE.TEACHER],
        password: 'ClaveInicial1',
      });

    expect(reuse.status).toBe(201);
  });

  it('un administrador no puede eliminarse a sí mismo', async () => {
    const admin = await createAdmin({ username: 'admin.suicida' });

    const response = await request(app)
      .delete(`/api/users/${admin.id}`)
      .set('Authorization', `Bearer ${await tokenFor('admin.suicida')}`);

    expect(response.status).toBe(409);
  });

  it('el restablecimiento de contraseña obliga a cambiarla y revoca sesiones', async () => {
    await createAdmin({ username: 'admin.reset' });
    const teacher = await createTeacher({ username: 'a.resetear' });
    await tokenFor('a.resetear');

    const response = await request(app)
      .post(`/api/users/${teacher.id}/reset-password`)
      .set('Authorization', `Bearer ${await tokenFor('admin.reset')}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data.temporaryPassword).toBeTypeOf('string');

    const row = await prisma.user.findUniqueOrThrow({ where: { id: teacher.id } });
    expect(row.mustChangePassword).toBe(true);
    expect(
      await prisma.refreshToken.count({ where: { userId: teacher.id, revokedAt: null } }),
    ).toBe(0);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'a.resetear', password: response.body.data.temporaryPassword });
    expect(login.status).toBe(200);
  });

  it('devuelve 404 con código propio ante un usuario inexistente', async () => {
    await createAdmin({ username: 'admin.404' });

    const response = await request(app)
      .get('/api/users/00000000-0000-7000-8000-000000000000')
      .set('Authorization', `Bearer ${await tokenFor('admin.404')}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(ERROR_CODE.USER_NOT_FOUND);
  });

  it('rechaza un identificador que no es UUID antes de tocar la base', async () => {
    await createAdmin({ username: 'admin.uuid' });

    const response = await request(app)
      .get('/api/users/no-es-un-uuid')
      .set('Authorization', `Bearer ${await tokenFor('admin.uuid')}`);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe(ERROR_CODE.VALIDATION_ERROR);
  });
});

describe('paginación y filtros', () => {
  it('respeta el tamaño de página y devuelve metadatos coherentes', async () => {
    await createAdmin({ username: 'admin.pagina' });
    for (let index = 0; index < 12; index += 1) {
      await createStudent({ username: `alumno.p${index}` });
    }

    const response = await request(app)
      .get('/api/users?page=2&pageSize=5')
      .set('Authorization', `Bearer ${await tokenFor('admin.pagina')}`);

    expect(response.body.data).toHaveLength(5);
    expect(response.body.meta).toMatchObject({ page: 2, pageSize: 5, total: 13, totalPages: 3 });
  });

  it('impide pedir páginas desmedidas', async () => {
    await createAdmin({ username: 'admin.limite' });

    const response = await request(app)
      .get('/api/users?pageSize=5000')
      .set('Authorization', `Bearer ${await tokenFor('admin.limite')}`);

    expect(response.status).toBe(422);
  });

  it('filtra por rol', async () => {
    await createAdmin({ username: 'admin.filtra' });
    await createTeacher({ username: 'docente.filtrado' });
    await createStudent({ username: 'alumno.filtrado' });

    const response = await request(app)
      .get(`/api/users?role=${ROLE.STUDENT}`)
      .set('Authorization', `Bearer ${await tokenFor('admin.filtra')}`);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].username).toBe('alumno.filtrado');
  });
});
