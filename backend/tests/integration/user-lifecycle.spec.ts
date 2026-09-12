import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ERROR_CODE, ROLE, USER_STATUS } from '@medienpass/shared';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import {
  TEST_PASSWORD,
  createAdmin,
  createTeacher,
  createUser,
  seedRolesAndPermissions,
} from '../helpers/factories.js';

/**
 * Dar de baja cuentas, y las dos formas de hacerlo mal.
 *
 * Lo que se comprueba no es que el borrado funcione —eso es una línea— sino
 * las dos cosas que lo hacen seguro de usar en un colegio:
 *
 *  1. Que no destruye el historial. Las evaluaciones que esa persona corrigió
 *     siguen teniendo autor, porque si no la analítica de un curso entero se
 *     queda coja cuando se va un docente en mitad del año.
 *  2. Que nadie puede dejar la plataforma sin administradores. Recuperarse de
 *     eso exige entrar a la base de datos, y en un colegio eso significa
 *     llamar a alguien un domingo.
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

describe('dar de baja una cuenta', () => {
  it('retira el acceso y libera el usuario y el correo', async () => {
    const admin = await createAdmin({ username: 'admin.baja' });
    const docente = await createTeacher({ username: 'docente.baja' });

    const response = await request(app)
      .delete(`/api/users/${docente.id}`)
      .set('Authorization', `Bearer ${await tokenFor(admin.username)}`);

    // 204: la baja no devuelve cuerpo, no hay nada que contar.
    expect(response.status).toBe(204);

    const fila = await prisma.user.findUniqueOrThrow({ where: { id: docente.id } });

    // La fila sigue ahí: es lo que sostiene el historial académico.
    expect(fila.deletedAt).not.toBeNull();
    expect(fila.status).toBe(USER_STATUS.INACTIVE);

    // Y el nombre de usuario queda libre para reasignarse.
    expect(fila.username).not.toBe('docente.baja');
    expect(fila.email).toBeNull();
  });

  it('cierra las sesiones abiertas de quien se da de baja', async () => {
    const admin = await createAdmin({ username: 'admin.sesiones' });
    const docente = await createTeacher({ username: 'docente.sesiones' });

    // Iniciar sesión deja un refresh token vivo; si no se revoca, la persona
    // sigue entrando durante días con la pestaña que ya tenía abierta.
    await tokenFor(docente.username);

    await request(app)
      .delete(`/api/users/${docente.id}`)
      .set('Authorization', `Bearer ${await tokenFor(admin.username)}`);

    const vivos = await prisma.refreshToken.count({
      where: { userId: docente.id, revokedAt: null },
    });
    expect(vivos).toBe(0);
  });

  it('no deja que alguien se dé de baja a sí mismo', async () => {
    const admin = await createAdmin({ username: 'admin.solo' });

    const response = await request(app)
      .delete(`/api/users/${admin.id}`)
      .set('Authorization', `Bearer ${await tokenFor(admin.username)}`);

    expect(response.status).toBe(409);

    const fila = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(fila.deletedAt).toBeNull();
  });

  it('un docente no puede dar de baja a nadie', async () => {
    const docente = await createTeacher({ username: 'docente.curioso' });
    const otro = await createTeacher({ username: 'docente.otro' });

    const response = await request(app)
      .delete(`/api/users/${otro.id}`)
      .set('Authorization', `Bearer ${await tokenFor(docente.username)}`);

    expect(response.status).toBe(403);
  });
});

describe('siempre queda alguien que pueda administrar', () => {
  it('no permite quitarle el rol al único administrador', async () => {
    const admin = await createAdmin({ username: 'admin.unico' });

    const response = await request(app)
      .put(`/api/users/${admin.id}/roles`)
      .set('Authorization', `Bearer ${await tokenFor(admin.username)}`)
      .send({ roles: [ROLE.TEACHER] });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ERROR_CODE.LAST_ADMIN);
  });

  it('lo permite en cuanto hay un segundo administrador', async () => {
    const primero = await createAdmin({ username: 'admin.primero' });
    await createAdmin({ username: 'admin.segundo' });

    const response = await request(app)
      .put(`/api/users/${primero.id}/roles`)
      .set('Authorization', `Bearer ${await tokenFor('admin.segundo')}`)
      .send({ roles: [ROLE.TEACHER] });

    expect(response.status).toBe(200);
    expect(response.body.data.roles).toEqual([ROLE.TEACHER]);
  });
});

describe('quien tiene el rol docente tiene su ficha', () => {
  it('crear una cuenta docente crea también su ficha', async () => {
    const admin = await createAdmin({ username: 'admin.ficha' });

    const response = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${await tokenFor(admin.username)}`)
      .send({
        username: 'docente.nuevo',
        email: 'docente.nuevo@colegioaleman.edu.co',
        firstName: 'Laura',
        lastName: 'Medina',
        roles: [ROLE.TEACHER],
        password: 'ContrasenaLarga1',
      });

    expect(response.status).toBe(201);

    /*
     * Sin esta fila la cuenta entra y no sirve para nada: no aparece en el
     * listado de docentes, no se le pueden asignar materias y no puede ser
     * director de curso. Es el estado roto que el arreglo persigue.
     */
    const ficha = await prisma.teacher.findUnique({
      where: { userId: response.body.data.id },
    });
    expect(ficha).not.toBeNull();
  });

  it('ganar el rol docente después también crea la ficha', async () => {
    const admin = await createAdmin({ username: 'admin.ascenso' });
    const persona = await createUser({ username: 'sin.rol.aun' });

    const response = await request(app)
      .put(`/api/users/${persona.id}/roles`)
      .set('Authorization', `Bearer ${await tokenFor(admin.username)}`)
      .send({ roles: [ROLE.TEACHER] });

    expect(response.status).toBe(200);
    expect(await prisma.teacher.findUnique({ where: { userId: persona.id } })).not.toBeNull();
  });
});
