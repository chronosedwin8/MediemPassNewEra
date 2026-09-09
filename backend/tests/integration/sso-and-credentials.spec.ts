import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ERROR_CODE, IDENTITY_PROVIDER, USER_STATUS } from '@medienpass/shared';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import {
  setSsoProvider,
  type SsoHandshake,
  type SsoProfile,
  type SsoProvider,
} from '../../src/modules/auth/sso.service.js';
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
  createStudent,
  createTeacher,
  seedRolesAndPermissions,
} from '../helpers/factories.js';

/**
 * Los dos caminos de acceso conviviendo.
 *
 * La plataforma admite entrar con correo y contraseña o con la cuenta del
 * colegio, y ambas cosas identifican a **la misma persona**: no son dos
 * cuentas. Estas pruebas comprueban justamente eso, además de la emisión de
 * credenciales, que es lo que permite que un estudiante recién sincronizado
 * pueda entrar sin depender del SSO.
 */

const app = createApp();
const trilingual = (value: string) => ({ es: value, de: value, en: value });

/** Proveedor de identidad controlado: nunca se llama a Entra ID. */
class StubSsoProvider implements SsoProvider {
  readonly id = IDENTITY_PROVIDER.ENTRA_ID;

  profile: SsoProfile = {
    provider: IDENTITY_PROVIDER.ENTRA_ID,
    subject: 'oid-de-prueba',
    email: 'alumna.sso@colegioaleman.edu.co',
    name: 'Alumna SSO',
  };

  lastHandshake: SsoHandshake | null = null;
  failOnExchange = false;

  isConfigured(): boolean {
    return true;
  }

  async createHandshake(): Promise<SsoHandshake> {
    this.lastHandshake = {
      authorizationUrl: 'https://login.microsoftonline.test/authorize?mock=1',
      state: 'estado-de-prueba',
      nonce: 'nonce-de-prueba',
      codeVerifier: 'verificador-de-prueba',
    };
    return this.lastHandshake;
  }

  async exchangeCode(): Promise<SsoProfile> {
    if (this.failOnExchange) throw new Error('el canje falló');
    return this.profile;
  }
}

/** Phidias controlado, para la prueba de sincronización con credenciales. */
class StubPhidiasService implements PhidiasService {
  sections: NormalizedSection[] = [];

  getStatus(): PhidiasStatus {
    return {
      mode: 'mock',
      configured: true,
      circuit: { open: false, failures: 0, retryInMs: 0 },
      knownBrokenEndpoints: [],
    };
  }

  async resolveCurrentAcademicYear(): Promise<AcademicYearRef> {
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
    return { sections: structuredClone(this.sections), discarded: 0 };
  }
  async invalidateCache(): Promise<void> {}
}

let sso: StubSsoProvider;
let phidias: StubPhidiasService;

/** Recorre el flujo OIDC completo con el proveedor controlado. */
async function completeSsoFlow(): Promise<request.Response> {
  const start = await request(app).get('/api/auth/sso/entra/start');
  const cookies = start.headers['set-cookie'] as unknown as string[];
  const ssoCookie = cookies.find((cookie) => cookie.startsWith('mp_sso='))!.split(';')[0]!;

  return request(app)
    .get('/api/auth/sso/entra/callback')
    .query({ code: 'codigo-de-prueba', state: sso.lastHandshake!.state })
    .set('Cookie', [ssoCookie]);
}

beforeEach(async () => {
  await seedRolesAndPermissions();
  sso = new StubSsoProvider();
  phidias = new StubPhidiasService();
  setSsoProvider(sso);
  setPhidiasService(phidias);
});

afterEach(() => {
  setSsoProvider(null);
  setPhidiasService(null);
});

describe('acceso con correo y contraseña', () => {
  it('un estudiante entra con su correo institucional', async () => {
    await createStudent({
      username: 'sofia.restrepo',
      email: 'sofia.restrepo@colegioaleman.edu.co',
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'sofia.restrepo@colegioaleman.edu.co', password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.user.roles).toEqual(['STUDENT']);
  });

  it('el correo no distingue mayúsculas ni espacios sobrantes', async () => {
    await createStudent({ username: 'mateo.vargas', email: 'mateo.vargas@colegioaleman.edu.co' });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ identifier: '  Mateo.Vargas@ColegioAleman.edu.co  ', password: TEST_PASSWORD });

    expect(response.status).toBe(200);
  });

  it('el nombre de usuario sigue sirviendo, para quien no tiene correo', async () => {
    // En la matrícula real hay veinte estudiantes sin correo alguno.
    await createStudent({ username: 'sin.correo', email: null });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'sin.correo', password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBeNull();
  });
});

describe('emisión de credenciales a estudiantes', () => {
  async function adminToken(): Promise<string> {
    await createAdmin({ username: 'admin.credenciales' });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'admin.credenciales', password: TEST_PASSWORD });
    return response.body.data.accessToken as string;
  }

  it('genera una contraseña distinta por estudiante y la devuelve una vez', async () => {
    const token = await adminToken();

    const created = [];
    for (const index of [1, 2, 3]) {
      const response = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          username: `alumno.cred${index}`,
          email: `alumno.cred${index}@colegioaleman.edu.co`,
          firstName: `Alumno${index}`,
          lastName: 'Credencial',
        });
      created.push(response.body.data.id);
    }

    const response = await request(app)
      .post('/api/students/credentials')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentIds: created });

    expect(response.status).toBe(200);
    expect(response.body.data.issued).toHaveLength(3);

    const passwords = response.body.data.issued.map((entry: { password: string }) => entry.password);
    expect(new Set(passwords).size).toBe(3);

    // Y la contraseña emitida funciona de verdad.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'alumno.cred1@colegioaleman.edu.co', password: passwords[0] });
    expect(login.status).toBe(200);
    expect(login.body.data.user.mustChangePassword).toBe(true);
  });

  it('permite una contraseña compartida para toda una entrega', async () => {
    const token = await adminToken();

    await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'alumno.compartida',
        email: 'alumno.compartida@colegioaleman.edu.co',
        firstName: 'Alumno',
        lastName: 'Compartida',
      });

    const response = await request(app)
      .post('/api/students/credentials')
      .set('Authorization', `Bearer ${token}`)
      .send({ onlyWithoutCredentials: true, password: 'ClaveInicial2026' });

    expect(response.body.data.issued.length).toBeGreaterThanOrEqual(1);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'alumno.compartida@colegioaleman.edu.co', password: 'ClaveInicial2026' });
    expect(login.status).toBe(200);
  });

  it('activa la cuenta que estaba pendiente por no tener contraseña', async () => {
    const token = await adminToken();

    const student = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'alumno.pendiente',
        email: 'alumno.pendiente@colegioaleman.edu.co',
        firstName: 'Alumno',
        lastName: 'Pendiente',
      });

    expect(student.body.data.status).toBe(USER_STATUS.PENDING_ACTIVATION);

    await request(app)
      .post('/api/students/credentials')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentIds: [student.body.data.id] });

    const row = await prisma.student.findUniqueOrThrow({
      where: { id: student.body.data.id },
      include: { user: true },
    });
    expect(row.user.status).toBe(USER_STATUS.ACTIVE);
  });

  it('un docente no puede emitir credenciales', async () => {
    await createTeacher({ username: 'docente.credenciales' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'docente.credenciales', password: TEST_PASSWORD });

    const response = await request(app)
      .post('/api/students/credentials')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ onlyWithoutCredentials: true });

    expect(response.status).toBe(403);
  });

  it('la contraseña emitida nunca aparece en la auditoría', async () => {
    const token = await adminToken();

    await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'alumno.auditoria',
        email: 'alumno.auditoria@colegioaleman.edu.co',
        firstName: 'Alumno',
        lastName: 'Auditoría',
      });

    await request(app)
      .post('/api/students/credentials')
      .set('Authorization', `Bearer ${token}`)
      .send({ onlyWithoutCredentials: true, password: 'ClaveSecreta2026' });

    const entries = await prisma.auditLog.findMany();
    expect(JSON.stringify(entries)).not.toContain('ClaveSecreta2026');
  });
});

describe('sincronización con contraseña inicial', () => {
  async function seedStructure() {
    const level = await prisma.educationLevel.create({
      data: { code: 'SEC', name: trilingual('Secundaria'), position: 0 },
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
        name: 'Año 2026-2027',
        externalId: 6,
        startDate: new Date('2026-08-01'),
        endDate: new Date('2027-06-24'),
        isCurrent: true,
      },
    });
  }

  it('el estudiante sincronizado entra con su correo desde el primer momento', async () => {
    await seedStructure();
    await createAdmin({ username: 'admin.sync.cred' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'admin.sync.cred', password: TEST_PASSWORD });

    phidias.sections = [
      {
        externalId: 501,
        code: 'K8A',
        levelName: 'SECUNDARIA',
        courseName: 'KLASSE 8',
        students: [
          {
            externalId: 7001,
            firstName: 'Nueva',
            lastName: 'Alumna',
            username: 'nueva.alumna',
            email: 'nueva.alumna@colegioaleman.edu.co',
            code: '7001',
            language: 'es',
            enrollmentStatus: 'ACTIVE',
            rawEnrollmentStatus: 'activo',
          },
        ],
      },
    ];

    const sync = await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ initialPassword: 'ClaveDeCurso2026' });

    expect(sync.body.data.studentsCreated).toBe(1);

    const studentLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'nueva.alumna@colegioaleman.edu.co', password: 'ClaveDeCurso2026' });

    expect(studentLogin.status).toBe(200);
    expect(studentLogin.body.data.user.mustChangePassword).toBe(true);
  });

  it('sin contraseña inicial la cuenta queda pendiente y solo entra por SSO', async () => {
    await seedStructure();
    await createAdmin({ username: 'admin.sync.sin' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'admin.sync.sin', password: TEST_PASSWORD });

    phidias.sections = [
      {
        externalId: 502,
        code: 'K8A',
        levelName: 'SECUNDARIA',
        courseName: 'KLASSE 8',
        students: [
          {
            externalId: 7002,
            firstName: 'Sin',
            lastName: 'Clave',
            username: 'sin.clave',
            email: 'sin.clave@colegioaleman.edu.co',
            code: '7002',
            language: 'es',
            enrollmentStatus: 'ACTIVE',
            rawEnrollmentStatus: 'activo',
          },
        ],
      },
    ];

    await request(app)
      .post('/api/integrations/phidias/sync/students')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({});

    const attempt = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'sin.clave@colegioaleman.edu.co', password: 'loquesea1234' });

    expect(attempt.status).toBe(401);
    expect(attempt.body.error.code).toBe(ERROR_CODE.INVALID_CREDENTIALS);
  });
});

describe('inicio de sesión federado', () => {
  it('anuncia que el SSO está disponible sin exigir sesión', async () => {
    const response = await request(app).get('/api/auth/sso/status');

    expect(response.status).toBe(200);
    expect(response.body.data.enabled).toBe(true);
    expect(response.body.data.provider).toBe(IDENTITY_PROVIDER.ENTRA_ID);
  });

  it('el inicio del flujo redirige al proveedor y deja el contexto en cookie', async () => {
    const response = await request(app).get('/api/auth/sso/entra/start');

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('login.microsoftonline.test');

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const ssoCookie = cookies.find((cookie) => cookie.startsWith('mp_sso='));
    expect(ssoCookie).toContain('HttpOnly');
    // `lax` y no `strict`: el proveedor devuelve al usuario navegando desde
    // otro sitio, y con `strict` la cookie nunca llegaría de vuelta.
    expect(ssoCookie).toContain('SameSite=Lax');
  });

  it('vincula la identidad con una cuenta existente y abre sesión', async () => {
    const student = await createStudent({
      username: 'alumna.sso',
      email: 'alumna.sso@colegioaleman.edu.co',
    });

    const callback = await completeSsoFlow();

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('http://localhost:5173/');

    // No hay ningún token en la URL: la sesión viaja en la cookie de refresco.
    expect(callback.headers.location).not.toContain('token');
    const cookies = callback.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) => cookie.startsWith('mp_refresh='))).toBe(true);

    const identity = await prisma.userIdentity.findFirstOrThrow({ where: { userId: student.id } });
    expect(identity.provider).toBe(IDENTITY_PROVIDER.ENTRA_ID);
    expect(identity.providerUserId).toBe('oid-de-prueba');
  });

  it('el segundo acceso reconoce la identidad aunque cambie el correo', async () => {
    await createStudent({ username: 'alumna.sso', email: 'alumna.sso@colegioaleman.edu.co' });
    await completeSsoFlow();

    // La persona se casa y le cambian el correo en el tenant; el `oid` no
    // cambia, y por eso sigue siendo la misma cuenta.
    sso.profile = { ...sso.profile, email: 'alumna.nueva@colegioaleman.edu.co' };
    const second = await completeSsoFlow();

    expect(second.status).toBe(302);
    expect(second.headers.location).toBe('http://localhost:5173/');
    expect(await prisma.userIdentity.count()).toBe(1);
  });

  it('activa una cuenta pendiente: entrar por SSO es demostrar la identidad', async () => {
    const student = await createStudent({
      username: 'alumna.pendiente.sso',
      email: 'alumna.sso@colegioaleman.edu.co',
      password: null,
      status: USER_STATUS.PENDING_ACTIVATION,
    });

    const callback = await completeSsoFlow();
    expect(callback.headers.location).toBe('http://localhost:5173/');

    const row = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(row.status).toBe(USER_STATUS.ACTIVE);
  });

  it('rechaza a quien no tiene cuenta en la plataforma', async () => {
    // El censo viene de Phidias: tener cuenta en el tenant no da acceso.
    const callback = await completeSsoFlow();

    expect(callback.headers.location).toContain(ERROR_CODE.SSO_ACCOUNT_NOT_LINKED);
    expect(await prisma.userIdentity.count()).toBe(0);
  });

  it('rechaza un dominio de correo ajeno al colegio', async () => {
    await createStudent({ username: 'alumna.externa', email: 'alguien@gmail.com' });
    sso.profile = { ...sso.profile, email: 'alguien@gmail.com' };

    const callback = await completeSsoFlow();

    expect(callback.headers.location).toContain(ERROR_CODE.SSO_DOMAIN_NOT_ALLOWED);
  });

  it('rechaza un retorno cuyo estado no coincide con el de la ida', async () => {
    await createStudent({ username: 'alumna.sso', email: 'alumna.sso@colegioaleman.edu.co' });

    const start = await request(app).get('/api/auth/sso/entra/start');
    const cookies = start.headers['set-cookie'] as unknown as string[];
    const ssoCookie = cookies.find((cookie) => cookie.startsWith('mp_sso='))!.split(';')[0]!;

    const callback = await request(app)
      .get('/api/auth/sso/entra/callback')
      .query({ code: 'codigo', state: 'estado-que-no-es-el-suyo' })
      .set('Cookie', [ssoCookie]);

    expect(callback.headers.location).toContain(ERROR_CODE.SSO_STATE_MISMATCH);
  });

  it('rechaza un retorno sin el contexto de la ida', async () => {
    const callback = await request(app)
      .get('/api/auth/sso/entra/callback')
      .query({ code: 'codigo', state: 'estado' });

    expect(callback.headers.location).toContain(ERROR_CODE.SSO_STATE_MISMATCH);
  });
});

describe('los dos métodos identifican a la misma persona', () => {
  it('la misma cuenta entra por contraseña y por SSO', async () => {
    const student = await createStudent({
      username: 'alumna.sso',
      email: 'alumna.sso@colegioaleman.edu.co',
    });

    const withPassword = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'alumna.sso@colegioaleman.edu.co', password: TEST_PASSWORD });
    expect(withPassword.body.data.user.id).toBe(student.id);

    await completeSsoFlow();

    // Una sola cuenta, una sola identidad federada vinculada a ella.
    expect(await prisma.user.count({ where: { id: student.id } })).toBe(1);
    expect(await prisma.userIdentity.count({ where: { userId: student.id } })).toBe(1);
  });

  it('la contraseña sigue funcionando después de haber entrado por SSO', async () => {
    await createStudent({ username: 'alumna.sso', email: 'alumna.sso@colegioaleman.edu.co' });

    await completeSsoFlow();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'alumna.sso@colegioaleman.edu.co', password: TEST_PASSWORD });

    expect(response.status).toBe(200);
  });
});
