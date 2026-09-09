import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ENROLLMENT_STATUS, ERROR_CODE, EXTERNAL_SOURCE, USER_STATUS } from '@medienpass/shared';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import {
  setPhidiasService,
  type AcademicYearRef,
  type NormalizedPeriod,
  type PhidiasService,
  type PhidiasStatus,
} from '../../src/infrastructure/external/phidias/phidias.service.js';
import type { NormalizedSection } from '../../src/infrastructure/external/phidias/phidias.mapper.js';
import type {
  PhidiasArea,
  PhidiasSubject,
} from '../../src/infrastructure/external/phidias/phidias.schemas.js';
import {
  TEST_PASSWORD,
  createAdmin,
  createTeacher,
  seedRolesAndPermissions,
} from '../helpers/factories.js';

/**
 * Integración con Phidias.
 *
 * Ninguna prueba llama a la API real: se inyecta una implementación
 * controlada de `PhidiasService` para poder provocar a voluntad los casos que
 * importan —un estudiante que desaparece, un correo repetido, un grado
 * desconocido, la API caída— sin depender de la red ni de datos reales.
 */

const app = createApp();

async function tokenFor(username: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ identifier: username, password: TEST_PASSWORD });
  return response.body.data.accessToken as string;
}

const trilingual = (value: string) => ({ es: value, de: value, en: value });

/** Implementación controlable, con la forma exacta de los datos reales. */
class StubPhidiasService implements PhidiasService {
  sections: NormalizedSection[] = [];
  failWith: Error | null = null;

  getStatus(): PhidiasStatus {
    return {
      mode: 'mock',
      configured: true,
      circuit: { open: false, failures: 0, retryInMs: 0 },
      knownBrokenEndpoints: [],
    };
  }

  async resolveCurrentAcademicYear(): Promise<AcademicYearRef> {
    if (this.failWith) throw this.failWith;
    return {
      externalId: 6,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2027-06-24'),
      periodCount: 2,
    };
  }

  async getAcademicAreas(): Promise<PhidiasArea[]> {
    return [];
  }

  async getSubjects(): Promise<PhidiasSubject[]> {
    return [];
  }

  async getPeriods(): Promise<NormalizedPeriod[]> {
    return [];
  }

  async getEnrolledStudents(): Promise<{ sections: NormalizedSection[]; discarded: number }> {
    if (this.failWith) throw this.failWith;
    return { sections: structuredClone(this.sections), discarded: 0 };
  }

  async invalidateCache(): Promise<void> {}
}

let stub: StubPhidiasService;

function student(
  overrides: Partial<NormalizedSection['students'][number]> & { externalId: number },
) {
  return {
    firstName: 'Alumno',
    lastName: 'Prueba',
    username: `alumno${overrides.externalId}`,
    email: `alumno${overrides.externalId}@colegioaleman.edu.co`,
    code: String(overrides.externalId),
    language: 'es' as const,
    enrollmentStatus: ENROLLMENT_STATUS.ACTIVE,
    rawEnrollmentStatus: 'activo',
    ...overrides,
  };
}

function section(code: string, courseName: string, students: NormalizedSection['students']) {
  return {
    externalId: 200 + code.charCodeAt(1),
    code,
    levelName: 'SECUNDARIA',
    courseName,
    students,
  };
}

async function seedPlatformStructure() {
  const level = await prisma.educationLevel.create({
    data: { code: 'SECUNDARIA', name: trilingual('Secundaria'), position: 0 },
  });
  await prisma.gradeLevel.create({
    data: {
      educationLevelId: level.id,
      code: 'K8',
      name: trilingual('KLASSE 8'),
      ordinal: 8,
      position: 0,
    },
  });
  await prisma.academicYear.create({
    data: {
      code: '2026-2027',
      name: 'Año escolar 2026-2027',
      externalId: 6,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2027-06-24'),
      isCurrent: true,
    },
  });
}

beforeEach(async () => {
  await seedRolesAndPermissions();
  await seedPlatformStructure();
  stub = new StubPhidiasService();
  setPhidiasService(stub);
});

afterEach(() => {
  setPhidiasService(null);
});

describe('POST /api/integrations/phidias/sync/students', () => {
  it('crea estudiantes, grupo y pertenencias en la primera ejecución', async () => {
    await createAdmin({ username: 'admin.sync' });
    stub.sections = [
      section('K8A', 'KLASSE 8', [student({ externalId: 3001 }), student({ externalId: 3002 })]),
    ];

    const response = await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${await tokenFor('admin.sync')}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      studentsCreated: 2,
      studentsUpdated: 0,
      groupsCreated: 1,
      membershipsAdded: 2,
    });

    const created = await prisma.student.findMany({ include: { user: true } });
    expect(created).toHaveLength(2);
    expect(created[0]!.externalSource).toBe(EXTERNAL_SOURCE.PHIDIAS);
    // Sin credenciales: la cuenta nace pendiente de activación.
    expect(created[0]!.user.status).toBe(USER_STATUS.PENDING_ACTIVATION);
    expect(created[0]!.user.passwordHash).toBeNull();
  });

  it('es idempotente: la segunda ejecución actualiza y no duplica', async () => {
    await createAdmin({ username: 'admin.idem' });
    const token = await tokenFor('admin.idem');
    stub.sections = [section('K8A', 'KLASSE 8', [student({ externalId: 3001 })])];

    await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    const second = await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(second.body.data).toMatchObject({
      studentsCreated: 0,
      studentsUpdated: 1,
      groupsCreated: 0,
      groupsMatched: 1,
      membershipsAdded: 0,
    });
    expect(await prisma.student.count()).toBe(1);
    expect(await prisma.groupMembership.count()).toBe(1);
  });

  it('marca como retirado a quien desaparece, sin borrarlo', async () => {
    await createAdmin({ username: 'admin.retiro' });
    const token = await tokenFor('admin.retiro');

    stub.sections = [
      section('K8A', 'KLASSE 8', [student({ externalId: 3001 }), student({ externalId: 3002 })]),
    ];
    await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    // El segundo estudiante ya no viene en la respuesta.
    stub.sections = [section('K8A', 'KLASSE 8', [student({ externalId: 3001 })])];
    const response = await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.body.data.studentsDeactivated).toBe(1);

    // Sigue existiendo: su historial académico debe sobrevivir.
    expect(await prisma.student.count()).toBe(2);
    const withdrawn = await prisma.student.findFirstOrThrow({ where: { externalId: 3002 } });
    expect(withdrawn.enrollmentStatus).toBe(ENROLLMENT_STATUS.WITHDRAWN);
  });

  it('actualiza el estado de matrícula al cambiar en origen', async () => {
    await createAdmin({ username: 'admin.estado' });
    const token = await tokenFor('admin.estado');

    stub.sections = [section('K8A', 'KLASSE 8', [student({ externalId: 3001 })])];
    await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    stub.sections = [
      section('K8A', 'KLASSE 8', [
        student({
          externalId: 3001,
          enrollmentStatus: ENROLLMENT_STATUS.SUSPENDED,
          rawEnrollmentStatus: 'suspendido',
        }),
      ]),
    ];
    await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    const row = await prisma.student.findFirstOrThrow({ where: { externalId: 3001 } });
    expect(row.enrollmentStatus).toBe(ENROLLMENT_STATUS.SUSPENDED);
    expect(row.rawEnrollmentStatus).toBe('suspendido');
  });

  /**
   * El correo institucional se deriva del código, no del campo de Phidias.
   *
   * Es la razón de ser de la regla: de 1.177 estudiantes matriculados, 20 no
   * tienen correo registrado y 74 usan cuentas personales. Con el campo de
   * Phidias, 94 se quedaban sin poder entrar.
   */
  it('deriva el correo del código aunque Phidias no traiga ninguno', async () => {
    await createAdmin({ username: 'admin.sincorreo' });
    stub.sections = [section('K8A', 'KLASSE 8', [student({ externalId: 3001, email: null })])];

    const response = await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${await tokenFor('admin.sincorreo')}`)
      .send({});

    expect(response.body.data.studentsCreated).toBe(1);
    const created = await prisma.student.findFirstOrThrow({ include: { user: true } });
    expect(created.user.email).toBe('3001@colegioaleman.edu.co');
    // Y el usuario es el mismo correo: pedirle recordar dos cosas distintas
    // es soporte innecesario.
    expect(created.user.username).toBe('3001@colegioaleman.edu.co');
  });

  /** El correo personal que traiga Phidias no manda sobre el institucional. */
  it('ignora el correo personal de Phidias en favor del institucional', async () => {
    await createAdmin({ username: 'admin.personal' });
    stub.sections = [
      section('K8A', 'KLASSE 8', [student({ externalId: 3005, email: 'familia.perez@gmail.com' })]),
    ];

    await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${await tokenFor('admin.personal')}`)
      .send({});

    const created = await prisma.student.findFirstOrThrow({ include: { user: true } });
    expect(created.user.email).toBe('3005@colegioaleman.edu.co');
  });

  it('anota como incidencia un correo repetido y continúa', async () => {
    await createAdmin({ username: 'admin.duplicado' });
    // Caso real: en la matrícula hay un correo compartido por dos personas.
    // Con el correo derivado del código, el choque lo provocan dos
    // estudiantes distintos con el mismo código en la matrícula.
    stub.sections = [
      section('K8A', 'KLASSE 8', [
        student({ externalId: 3001, code: '9999' }),
        student({ externalId: 3002, code: '9999' }),
      ]),
    ];

    const response = await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${await tokenFor('admin.duplicado')}`)
      .send({});

    expect(response.body.data.studentsCreated).toBe(2);
    expect(response.body.data.status).toBe('PARTIAL');
    expect(
      response.body.data.issues.some(
        (i: { reason: string }) => i.reason === 'EMAIL_ALREADY_IN_USE',
      ),
    ).toBe(true);

    const withEmail = await prisma.user.count({
      where: { email: '9999@colegioaleman.edu.co' },
    });
    expect(withEmail).toBe(1);
  });

  it('resuelve el choque de nombre de usuario sin perder al estudiante', async () => {
    await createAdmin({ username: 'admin.usuario' });
    await createTeacher({ username: '3001@colegioaleman.edu.co' });

    stub.sections = [section('K8A', 'KLASSE 8', [student({ externalId: 3001 })])];

    const response = await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${await tokenFor('admin.usuario')}`)
      .send({});

    expect(response.body.data.studentsCreated).toBe(1);
    expect(
      response.body.data.issues.some((i: { reason: string }) => i.reason === 'USERNAME_TAKEN'),
    ).toBe(true);

    const created = await prisma.student.findFirstOrThrow({ include: { user: true } });
    expect(created.user.username).toBe('3001.3001@colegioaleman.edu.co');
  });

  it('anota el grado desconocido como incidencia sin abortar el resto', async () => {
    await createAdmin({ username: 'admin.grado' });
    stub.sections = [
      section('K8A', 'KLASSE 8', [student({ externalId: 3001 })]),
      section('XXX', 'CURSO INEXISTENTE', [student({ externalId: 3002 })]),
    ];

    const response = await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${await tokenFor('admin.grado')}`)
      .send({});

    expect(response.body.data.studentsCreated).toBe(1);
    expect(
      response.body.data.issues.some((i: { reason: string }) => i.reason === 'UNKNOWN_GRADE'),
    ).toBe(true);
  });

  it('la vista previa no escribe nada', async () => {
    await createAdmin({ username: 'admin.previa' });
    stub.sections = [section('K8A', 'KLASSE 8', [student({ externalId: 3001 })])];

    const response = await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${await tokenFor('admin.previa')}`)
      .send({ dryRun: true });

    expect(response.status).toBe(200);
    expect(response.body.data.studentsCreated).toBe(0);
    expect(await prisma.student.count()).toBe(0);
    expect(await prisma.group.count()).toBe(0);
  });

  it('registra la sincronización en el historial y en la auditoría', async () => {
    await createAdmin({ username: 'admin.registro' });
    stub.sections = [section('K8A', 'KLASSE 8', [student({ externalId: 3001 })])];

    await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${await tokenFor('admin.registro')}`)
      .send({});

    const logs = await prisma.phidiasSyncLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.status).toBe('SUCCESS');
    expect(logs[0]!.created).toBe(1);

    const audit = await prisma.auditLog.findMany({ where: { action: 'SYNC_PHIDIAS' } });
    expect(audit).toHaveLength(1);
  });

  it('deja constancia del fallo cuando Phidias no responde', async () => {
    await createAdmin({ username: 'admin.caida' });
    stub.failWith = new Error('Phidias timed out');

    const response = await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${await tokenFor('admin.caida')}`)
      .send({});

    expect(response.status).toBe(500);

    const logs = await prisma.phidiasSyncLog.findMany();
    expect(logs[0]!.status).toBe('FAILED');
    expect(logs[0]!.errorMessage).toContain('timed out');
    // Nada a medias: no se creó ningún estudiante.
    expect(await prisma.student.count()).toBe(0);
  });
});

describe('permisos y confidencialidad de la integración', () => {
  it('un docente no puede lanzar la sincronización', async () => {
    await createTeacher({ username: 'docente.sync' });

    const response = await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${await tokenFor('docente.sync')}`)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODE.INSUFFICIENT_PERMISSIONS);
  });

  it('el estado informa de la configuración pero nunca del token', async () => {
    await createAdmin({ username: 'admin.estado.token' });

    const response = await request(app)
      .get('/api/integrations/phidias/status')
      .set('Authorization', `Bearer ${await tokenFor('admin.estado.token')}`);

    expect(response.status).toBe(200);
    expect(response.body.data.configured).toBe(true);
    // Ni el token ni un fragmento suyo pueden aparecer en la respuesta.
    expect(JSON.stringify(response.body)).not.toMatch(/eyJ|token/i);
  });
});
