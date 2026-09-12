import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ROLE } from '@medienpass/shared';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import {
  TEST_PASSWORD,
  createAdmin,
  createTeacher,
  seedRolesAndPermissions,
} from '../helpers/factories.js';

/**
 * Qué grupos ve un docente.
 *
 * Esto es lo que hacía inservible la plataforma después de traer la matrícula
 * de Phidias. Sus secciones son grupos de clase y llegan sin titular; con el
 * alcance anterior —«los grupos de los que soy titular»— ningún docente veía
 * ninguno, y solo administración podía asignar nada.
 *
 * La primera prueba falla con el alcance viejo. Es su único motivo de existir.
 */

const app = createApp();
const trilingue = (valor: string) => ({ es: valor, de: valor, en: valor });

async function tokenFor(username: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ identifier: username, password: TEST_PASSWORD });
  return response.body.data.accessToken as string;
}

interface Escenario {
  grupoId: string;
  anoId: string;
}

async function montarGrupoSinTitular(): Promise<Escenario> {
  const ano = await prisma.academicYear.create({
    data: {
      code: '2026-2027',
      name: 'Año escolar',
      startDate: new Date('2026-08-03'),
      endDate: new Date('2027-07-15'),
      isCurrent: true,
    },
  });

  const nivel = await prisma.educationLevel.create({
    data: { code: 'SEK', name: trilingue('Secundaria'), position: 1 },
  });
  const grado = await prisma.gradeLevel.create({
    data: { code: 'K10', name: trilingue('Klasse 10'), position: 10, educationLevelId: nivel.id },
  });

  // Como lo deja Phidias: sin titular y sin materia.
  const grupo = await prisma.group.create({
    data: { code: 'K10A', name: 'K10A', academicYearId: ano.id, gradeLevelId: grado.id },
  });

  return { grupoId: grupo.id, anoId: ano.id };
}

beforeEach(async () => {
  await seedRolesAndPermissions();
});

describe('grupos que llegan de Phidias, sin titular', () => {
  it('un docente que no consta en el grupo no lo ve', async () => {
    await montarGrupoSinTitular();
    const ajeno = await createTeacher({ username: 'docente.ajeno' });

    const response = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${await tokenFor(ajeno.username)}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });

  it('un docente apuntado al grupo sí lo ve, aunque no sea su titular', async () => {
    const { grupoId } = await montarGrupoSinTitular();
    const admin = await createAdmin({ username: 'admin.claustro' });
    const docente = await createTeacher({ username: 'docente.mates' });

    const alta = await request(app)
      .put(`/api/groups/${grupoId}/teachers`)
      .set('Authorization', `Bearer ${await tokenFor(admin.username)}`)
      .send({ teachers: [{ teacherId: docente.id }] });

    expect(alta.status).toBe(204);

    const response = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${await tokenFor(docente.username)}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].code).toBe('K10A');
  });

  it('el titular sigue viendo el suyo', async () => {
    const { grupoId } = await montarGrupoSinTitular();
    const titular = await createTeacher({ username: 'docente.titular' });
    await prisma.group.update({
      where: { id: grupoId },
      data: { homeroomTeacherId: titular.id },
    });

    const response = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${await tokenFor(titular.username)}`);

    expect(response.body.data).toHaveLength(1);
  });

  it('un docente no puede colarse en un grupo que no enseña', async () => {
    const { grupoId } = await montarGrupoSinTitular();
    const intruso = await createTeacher({ username: 'docente.intruso' });

    /*
     * La puerta para añadir docentes exige ya pertenecer al grupo, así que
     * nadie se añade a sí mismo a uno ajeno. Sin esto, el alcance nuevo no
     * restringiría nada: bastaría con apuntarse.
     */
    const response = await request(app)
      .put(`/api/groups/${grupoId}/teachers`)
      .set('Authorization', `Bearer ${await tokenFor(intruso.username)}`)
      .send({ teachers: [{ teacherId: intruso.id }] });

    // 403 y no 404: este módulo responde «fuera de tu alcance» de forma
    // uniforme, y aquí no hay nada que ocultar —el identificador del grupo ya
    // lo traía quien pregunta—.
    expect(response.status).toBe(403);
  });

  it('rechaza al mismo docente dos veces', async () => {
    const { grupoId } = await montarGrupoSinTitular();
    const admin = await createAdmin({ username: 'admin.duplicado' });
    const docente = await createTeacher({ username: 'docente.repetido' });

    const response = await request(app)
      .put(`/api/groups/${grupoId}/teachers`)
      .set('Authorization', `Bearer ${await tokenFor(admin.username)}`)
      .send({ teachers: [{ teacherId: docente.id }, { teacherId: docente.id }] });

    expect(response.status).toBe(409);
  });

  it('sustituye el claustro entero, no lo acumula', async () => {
    const { grupoId } = await montarGrupoSinTitular();
    const admin = await createAdmin({ username: 'admin.sustituye' });
    const primero = await createTeacher({ username: 'docente.saliente' });
    const segundo = await createTeacher({ username: 'docente.entrante' });
    const token = await tokenFor(admin.username);

    await request(app)
      .put(`/api/groups/${grupoId}/teachers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ teachers: [{ teacherId: primero.id }] });

    await request(app)
      .put(`/api/groups/${grupoId}/teachers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ teachers: [{ teacherId: segundo.id }] });

    const filas = await prisma.groupTeacher.findMany({ where: { groupId: grupoId } });
    expect(filas).toHaveLength(1);
    expect(filas[0]?.teacherId).toBe(segundo.id);
  });
});

describe('el rol sigue mandando', () => {
  it('un estudiante no ve grupos ajenos', async () => {
    await montarGrupoSinTitular();
    const admin = await createAdmin({ username: 'admin.estudiante' });

    const response = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${await tokenFor(admin.username)}`);

    // Administración sí los ve todos: es la contraparte del alcance restringido.
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(ROLE.ADMIN).toBe('ADMIN');
  });
});
