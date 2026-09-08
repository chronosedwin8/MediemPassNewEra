import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  ASSESSMENT_AUDIENCE,
  DEFAULT_STUDENT_SCALE_BANDS,
  ERROR_CODE,
  SCALE_KIND,
} from '@medienpass/shared';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import {
  TEST_PASSWORD,
  createAdmin,
  createTeacher,
  seedRolesAndPermissions,
} from '../helpers/factories.js';

const app = createApp();

async function tokenFor(username: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ identifier: username, password: TEST_PASSWORD });
  return response.body.data.accessToken as string;
}

const trilingual = (value: string) => ({ es: value, de: value, en: value });

/** Estructura mínima que necesitan casi todas las pruebas de este archivo. */
async function seedStructure() {
  const level = await prisma.educationLevel.create({
    data: { code: 'SECUNDARIA', name: trilingual('Secundaria'), position: 0 },
  });
  const gradeLevel = await prisma.gradeLevel.create({
    data: {
      educationLevelId: level.id,
      code: 'K8',
      name: trilingual('KLASSE 8'),
      ordinal: 8,
      position: 0,
    },
  });
  const year = await prisma.academicYear.create({
    data: {
      code: '2026-2027',
      name: 'Año escolar 2026-2027',
      externalId: 6,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2027-06-24'),
      isCurrent: true,
    },
  });
  return { gradeLevel, year };
}

beforeEach(async () => {
  await seedRolesAndPermissions();
});

describe('recorrido de administración: área → materia → docente → grupo → estudiantes', () => {
  it('completa el flujo de extremo a extremo', async () => {
    await createAdmin({ username: 'admin.flujo' });
    const token = await tokenFor('admin.flujo');
    const { gradeLevel, year } = await seedStructure();

    // 1. Área
    const area = await request(app)
      .post('/api/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'TEC', name: trilingual('Tecnología'), color: '#7c3aed' });
    expect(area.status).toBe(201);

    // 2. Materia dentro del área
    const subject = await request(app)
      .post('/api/subjects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'INF', name: trilingual('Informática'), areaId: area.body.data.id });
    expect(subject.status).toBe(201);
    expect(subject.body.data.area.code).toBe('TEC');

    // 3. Docente con área y materia
    const teacher = await request(app)
      .post('/api/teachers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'nuevo.profe',
        email: 'nuevo.profe@colegioaleman.edu.co',
        firstName: 'Stefan',
        lastName: 'Brandt',
        password: 'ClaveInicial1',
        areaIds: [area.body.data.id],
        subjectIds: [subject.body.data.id],
      });
    expect(teacher.status).toBe(201);
    expect(teacher.body.data.areas[0].code).toBe('TEC');
    expect(teacher.body.data.areas[0].isPrimary).toBe(true);
    expect(teacher.body.data.subjects[0].code).toBe('INF');

    // El docente puede iniciar sesión de inmediato.
    const teacherLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'nuevo.profe', password: 'ClaveInicial1' });
    expect(teacherLogin.status).toBe(200);

    // 4. Grupo
    const group = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'K8A',
        academicYearId: year.id,
        gradeLevelId: gradeLevel.id,
        subjectId: subject.body.data.id,
        homeroomTeacherId: teacher.body.data.userId,
      });
    expect(group.status).toBe(201);

    // 5. Estudiantes, uno de ellos sin correo
    const students = [];
    for (const [index, hasEmail] of [true, true, false].entries()) {
      const student = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          username: `alumno.flujo${index}`,
          email: hasEmail ? `alumno.flujo${index}@colegioaleman.edu.co` : null,
          firstName: `Alumno${index}`,
          lastName: 'Prueba',
          gradeLevelId: gradeLevel.id,
          password: 'ClaveInicial1',
        });
      expect(student.status).toBe(201);
      students.push(student.body.data.id);
    }

    // 6. Inscripción en el grupo
    const members = await request(app)
      .post(`/api/groups/${group.body.data.id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentIds: students });
    expect(members.status).toBe(200);
    expect(members.body.data).toMatchObject({ added: 3, reactivated: 0, alreadyPresent: 0 });

    const list = await request(app)
      .get(`/api/groups/${group.body.data.id}/members`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.data).toHaveLength(3);
    expect(list.body.data.filter((m: { email: string | null }) => m.email === null)).toHaveLength(1);
  });
});

describe('alcance del docente sobre sus grupos', () => {
  it('un docente solo ve los grupos de los que es titular', async () => {
    await createAdmin({ username: 'admin.alcance' });
    const owner = await createTeacher({ username: 'docente.propietario' });
    const other = await createTeacher({ username: 'docente.ajeno' });
    const { gradeLevel, year } = await seedStructure();

    await prisma.group.createMany({
      data: [
        {
          code: 'K8A',
          name: 'K8A',
          academicYearId: year.id,
          gradeLevelId: gradeLevel.id,
          homeroomTeacherId: owner.id,
        },
        {
          code: 'K8B',
          name: 'K8B',
          academicYearId: year.id,
          gradeLevelId: gradeLevel.id,
          homeroomTeacherId: other.id,
        },
      ],
    });

    const ownerView = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${await tokenFor('docente.propietario')}`);
    expect(ownerView.body.data).toHaveLength(1);
    expect(ownerView.body.data[0].code).toBe('K8A');

    // El administrador los ve todos.
    const adminView = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${await tokenFor('admin.alcance')}`);
    expect(adminView.body.data).toHaveLength(2);
  });

  it('un docente no puede leer un grupo ajeno', async () => {
    await createTeacher({ username: 'docente.curioso' });
    const other = await createTeacher({ username: 'docente.duenio' });
    const { gradeLevel, year } = await seedStructure();

    const group = await prisma.group.create({
      data: {
        code: 'K8B',
        name: 'K8B',
        academicYearId: year.id,
        gradeLevelId: gradeLevel.id,
        homeroomTeacherId: other.id,
      },
    });

    const response = await request(app)
      .get(`/api/groups/${group.id}`)
      .set('Authorization', `Bearer ${await tokenFor('docente.curioso')}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODE.OUT_OF_SCOPE);
  });

  it('un docente que crea un grupo queda como titular', async () => {
    const teacher = await createTeacher({ username: 'docente.crea' });
    const { gradeLevel, year } = await seedStructure();

    const response = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${await tokenFor('docente.crea')}`)
      .send({ code: 'K8C', academicYearId: year.id, gradeLevelId: gradeLevel.id });

    expect(response.status).toBe(201);
    expect(response.body.data.homeroomTeacher.id).toBe(teacher.id);
  });

  it('un docente no puede reasignar el titular de un grupo', async () => {
    const teacher = await createTeacher({ username: 'docente.reasigna' });
    const other = await createTeacher({ username: 'docente.otro' });
    const { gradeLevel, year } = await seedStructure();

    const group = await prisma.group.create({
      data: {
        code: 'K8D',
        name: 'K8D',
        academicYearId: year.id,
        gradeLevelId: gradeLevel.id,
        homeroomTeacherId: teacher.id,
      },
    });

    const response = await request(app)
      .patch(`/api/groups/${group.id}`)
      .set('Authorization', `Bearer ${await tokenFor('docente.reasigna')}`)
      .send({ homeroomTeacherId: other.id });

    expect(response.status).toBe(403);
  });
});

describe('inscripción en grupos', () => {
  it('añadir dos veces al mismo estudiante es idempotente', async () => {
    await createAdmin({ username: 'admin.idem' });
    const token = await tokenFor('admin.idem');
    const { gradeLevel, year } = await seedStructure();

    const group = await prisma.group.create({
      data: { code: 'K8A', name: 'K8A', academicYearId: year.id, gradeLevelId: gradeLevel.id },
    });

    const student = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'alumno.idem',
        firstName: 'Idem',
        lastName: 'Potente',
        password: 'ClaveInicial1',
      });

    const first = await request(app)
      .post(`/api/groups/${group.id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentIds: [student.body.data.id] });
    expect(first.body.data.added).toBe(1);

    const second = await request(app)
      .post(`/api/groups/${group.id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentIds: [student.body.data.id] });
    expect(second.body.data).toMatchObject({ added: 0, alreadyPresent: 1 });

    expect(await prisma.groupMembership.count({ where: { groupId: group.id } })).toBe(1);
  });

  it('retirar a un estudiante conserva la fila y la marca inactiva', async () => {
    await createAdmin({ username: 'admin.retira' });
    const token = await tokenFor('admin.retira');
    const { gradeLevel, year } = await seedStructure();

    const group = await prisma.group.create({
      data: { code: 'K8A', name: 'K8A', academicYearId: year.id, gradeLevelId: gradeLevel.id },
    });
    const student = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'alumno.retirado',
        firstName: 'Se',
        lastName: 'Retira',
        password: 'ClaveInicial1',
      });

    await request(app)
      .post(`/api/groups/${group.id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentIds: [student.body.data.id] });

    const response = await request(app)
      .delete(`/api/groups/${group.id}/members/${student.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(204);

    const membership = await prisma.groupMembership.findFirstOrThrow({
      where: { groupId: group.id, studentId: student.body.data.id },
    });
    expect(membership.active).toBe(false);
    expect(membership.leftAt).not.toBeNull();
  });
});

describe('integridad del catálogo', () => {
  it('no permite borrar un área con materias activas', async () => {
    await createAdmin({ username: 'admin.integridad' });
    const token = await tokenFor('admin.integridad');

    const area = await request(app)
      .post('/api/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'MAT', name: trilingual('Matemáticas') });

    await request(app)
      .post('/api/subjects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'MAT-GEN', name: trilingual('Matemáticas'), areaId: area.body.data.id });

    const response = await request(app)
      .delete(`/api/areas/${area.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.error.details.subjects).toBe(1);
  });

  it('rechaza un código de área repetido', async () => {
    await createAdmin({ username: 'admin.repetido' });
    const token = await tokenFor('admin.repetido');

    await request(app)
      .post('/api/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'LENG', name: trilingual('Lenguas') });

    const duplicate = await request(app)
      .post('/api/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'LENG', name: trilingual('Otra cosa') });

    expect(duplicate.status).toBe(409);
  });
});

describe('escalas de calificación versionadas', () => {
  async function seedStudentScale() {
    const scale = await prisma.gradingScale.create({
      data: {
        code: 'student-default',
        version: 1,
        name: trilingual('Escala alemana'),
        audience: ASSESSMENT_AUDIENCE.STUDENT,
        kind: SCALE_KIND.BANDED,
        passingPercentage: 70,
        lowerIsBetter: true,
        isActive: true,
      },
    });
    await prisma.gradingScaleBand.createMany({
      data: DEFAULT_STUDENT_SCALE_BANDS.map((band) => ({
        scaleId: scale.id,
        position: band.position,
        value: band.value,
        minPercentage: band.minPercentage,
        label: trilingual(band.label),
        color: band.color,
      })),
    });
    return scale;
  }

  it('editar la escala crea una versión nueva y desactiva la anterior', async () => {
    await createAdmin({ username: 'admin.escala' });
    const token = await tokenFor('admin.escala');
    const original = await seedStudentScale();

    const response = await request(app)
      .put('/api/settings/scales/student-default')
      .set('Authorization', `Bearer ${token}`)
      .send({
        passingPercentage: 75,
        bands: DEFAULT_STUDENT_SCALE_BANDS.map((band) => ({
          position: band.position,
          value: band.value,
          minPercentage: band.position === 0 ? 92 : band.minPercentage,
          label: trilingual(band.label),
          color: band.color,
        })),
      });

    expect(response.status).toBe(200);
    expect(response.body.data.version).toBe(2);
    expect(response.body.data.passingPercentage).toBe(75);

    // La versión 1 sigue existiendo, desactivada: los resultados históricos
    // la referencian y deben poder resolverla.
    const previous = await prisma.gradingScale.findUniqueOrThrow({ where: { id: original.id } });
    expect(previous.isActive).toBe(false);
    expect(await prisma.gradingScale.count({ where: { code: 'student-default' } })).toBe(2);
  });

  it('rechaza una escala cuyos umbrales no descienden', async () => {
    await createAdmin({ username: 'admin.mala.escala' });
    await seedStudentScale();

    const response = await request(app)
      .put('/api/settings/scales/student-default')
      .set('Authorization', `Bearer ${await tokenFor('admin.mala.escala')}`)
      .send({
        passingPercentage: 70,
        bands: [
          { position: 0, value: 1, minPercentage: 40, label: trilingual('A'), color: '#000000' },
          { position: 1, value: 2, minPercentage: 80, label: trilingual('B'), color: '#000000' },
          { position: 2, value: 3, minPercentage: 0, label: trilingual('C'), color: '#000000' },
        ],
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ERROR_CODE.SCALE_BANDS_INVALID);
  });

  it('rechaza una escala cuya peor banda no empieza en 0', async () => {
    await createAdmin({ username: 'admin.hueco' });
    await seedStudentScale();

    const response = await request(app)
      .put('/api/settings/scales/student-default')
      .set('Authorization', `Bearer ${await tokenFor('admin.hueco')}`)
      .send({
        passingPercentage: 70,
        bands: [
          { position: 0, value: 1, minPercentage: 90, label: trilingual('A'), color: '#000000' },
          { position: 1, value: 2, minPercentage: 40, label: trilingual('B'), color: '#000000' },
        ],
      });

    expect(response.status).toBe(409);
  });

  it('un docente no puede modificar escalas', async () => {
    await createTeacher({ username: 'docente.escala' });
    await seedStudentScale();

    const response = await request(app)
      .put('/api/settings/scales/student-default')
      .set('Authorization', `Bearer ${await tokenFor('docente.escala')}`)
      .send({ passingPercentage: 10, bands: [] });

    expect(response.status).toBe(403);
  });
});

describe('competencias KMK', () => {
  it('cualquier rol autenticado puede leer el marco', async () => {
    await createTeacher({ username: 'docente.kmk' });

    const competency = await prisma.kmkCompetency.create({
      data: {
        code: '1',
        name: trilingual('Buscar, procesar y archivar'),
        description: trilingual('Descripción'),
        color: '#2563eb',
        position: 0,
      },
    });
    await prisma.kmkSubcompetency.create({
      data: {
        competencyId: competency.id,
        code: '1.1',
        name: trilingual('Buscar y filtrar'),
        position: 0,
      },
    });

    const response = await request(app)
      .get('/api/kmk/competencies')
      .set('Authorization', `Bearer ${await tokenFor('docente.kmk')}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].subcompetencies).toHaveLength(1);
    expect(response.body.data[0].name.de).toBeTypeOf('string');
  });

  it('un docente no puede crear competencias', async () => {
    await createTeacher({ username: 'docente.kmk.crea' });

    const response = await request(app)
      .post('/api/kmk/competencies')
      .set('Authorization', `Bearer ${await tokenFor('docente.kmk.crea')}`)
      .send({
        code: '7',
        name: trilingual('Inventada'),
        description: trilingual('No debería crearse'),
        color: '#000000',
      });

    expect(response.status).toBe(403);
  });
});
