import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  ASSESSMENT_AUDIENCE,
  ASSIGNMENT_TARGET_TYPE,
  DEFAULT_STUDENT_SCALE_BANDS,
  QUESTION_TYPE,
  SCALE_KIND,
} from '@medienpass/shared';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import {
  TEST_PASSWORD,
  createAdmin,
  createStudent,
  createTeacher,
  seedRolesAndPermissions,
  type TestUser,
} from '../helpers/factories.js';

/**
 * Estadísticas y planes de evaluación.
 *
 * Las cifras se comprueban contra datos sembrados de resultado conocido: si
 * dos estudiantes aciertan la competencia 1 y fallan la 5, el informe debe
 * decir exactamente 100 % y 0 %, no «aproximadamente».
 *
 * La otra cosa que se verifica es el alcance: un docente no ve las cifras de
 * los grupos de otro, por mucho que pida el filtro.
 */

const app = createApp();
const trilingual = (value: string) => ({ es: value, de: value, en: value });

async function tokenFor(username: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ identifier: username, password: TEST_PASSWORD });
  return response.body.data.accessToken as string;
}

interface Fixture {
  teacher: TestUser;
  teacherToken: string;
  adminToken: string;
  students: Array<{ user: TestUser; token: string; profileId: string }>;
  groupId: string;
  subjectId: string;
  areaId: string;
  gradeLevelId: string;
  academicYearId: string;
  periodId: string;
  competencyIds: string[];
}

async function buildFixture(): Promise<Fixture> {
  const teacher = await createTeacher({ username: 'docente.stats' });
  await createAdmin({ username: 'admin.stats' });

  const level = await prisma.educationLevel.create({
    data: { code: 'SEC', name: trilingual('Secundaria'), position: 0 },
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
      name: 'Año 2026-2027',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2027-06-24'),
      isCurrent: true,
    },
  });
  const period = await prisma.academicPeriod.create({
    data: {
      academicYearId: year.id,
      name: 'Periodo 1',
      position: 0,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2027-06-24'),
      weight: 40,
    },
  });

  const area = await prisma.academicArea.create({
    data: { code: 'TEC', name: trilingual('Tecnología') },
  });
  const subject = await prisma.subject.create({
    data: { code: 'INF', name: trilingual('Informática'), areaId: area.id },
  });

  const group = await prisma.group.create({
    data: {
      code: 'K8A',
      name: 'K8A',
      academicYearId: year.id,
      gradeLevelId: gradeLevel.id,
      subjectId: subject.id,
      homeroomTeacherId: teacher.id,
    },
  });

  const students = [];
  for (const index of [1, 2]) {
    const user = await createStudent({ username: `alumno.stats${index}` });
    const profile = await prisma.student.create({
      data: { userId: user.id, gradeLevelId: gradeLevel.id, enrollmentStatus: 'ACTIVE' },
    });
    await prisma.groupMembership.create({ data: { groupId: group.id, studentId: profile.id } });
    students.push({ user, token: await tokenFor(user.username), profileId: profile.id });
  }

  const competencyIds: string[] = [];
  for (const code of ['1', '5']) {
    const competency = await prisma.kmkCompetency.create({
      data: {
        code,
        name: trilingual(`Competencia ${code}`),
        description: trilingual('Descripción'),
        color: '#2563eb',
        position: Number(code),
      },
    });
    competencyIds.push(competency.id);
  }

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

  return {
    teacher,
    teacherToken: await tokenFor('docente.stats'),
    adminToken: await tokenFor('admin.stats'),
    students,
    groupId: group.id,
    subjectId: subject.id,
    areaId: area.id,
    gradeLevelId: gradeLevel.id,
    academicYearId: year.id,
    periodId: period.id,
    competencyIds,
  };
}

/**
 * Siembra resultados de resultado conocido.
 *
 * Ambos estudiantes aciertan la pregunta de la competencia 1 y fallan la de la
 * competencia 5, de modo que el informe debe dar exactamente 100 % y 0 %.
 */
async function seedResults(fixture: Fixture): Promise<{ assessmentId: string; versionId: string }> {
  const assessment = await request(app)
    .post('/api/assessments')
    .set('Authorization', `Bearer ${fixture.teacherToken}`)
    .send({ title: 'Evaluación de estadísticas', subjectId: fixture.subjectId });

  const versionId = assessment.body.data.versionId as string;
  const questionIds: string[] = [];

  for (const [index, competencyId] of fixture.competencyIds.entries()) {
    const question = await request(app)
      .post(`/api/assessments/versions/${versionId}/questions`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({
        type: QUESTION_TYPE.SINGLE_CHOICE,
        statement: `Pregunta ${index + 1}`,
        points: 5,
        kmkCompetencyId: competencyId,
        payload: {
          kind: QUESTION_TYPE.SINGLE_CHOICE,
          options: [
            { id: 'a', text: 'Mal', correct: false },
            { id: 'b', text: 'Bien', correct: true },
          ],
        },
      });
    questionIds.push(question.body.data.id);
  }

  await request(app)
    .post(`/api/assessments/versions/${versionId}/publish`)
    .set('Authorization', `Bearer ${fixture.teacherToken}`);

  await request(app)
    .post('/api/assignments')
    .set('Authorization', `Bearer ${fixture.teacherToken}`)
    .send({
      assessmentVersionId: versionId,
      targetType: ASSIGNMENT_TARGET_TYPE.GROUP,
      groupId: fixture.groupId,
      startAt: new Date(Date.now() - 60_000).toISOString(),
      attemptsAllowed: 1,
    });

  for (const student of fixture.students) {
    const assigned = await request(app)
      .get('/api/attempts/assigned')
      .set('Authorization', `Bearer ${student.token}`);

    const attempt = await request(app)
      .post('/api/attempts')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ recipientId: assigned.body.data[0].recipientId });

    // Acierta la primera (competencia 1), falla la segunda (competencia 5).
    await request(app)
      .put(`/api/attempts/${attempt.body.data.id}/answers/${questionIds[0]}`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' } });
    await request(app)
      .put(`/api/attempts/${attempt.body.data.id}/answers/${questionIds[1]}`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'a' } });

    await request(app)
      .post(`/api/attempts/${attempt.body.data.id}/submit`)
      .set('Authorization', `Bearer ${student.token}`);
  }

  return { assessmentId: assessment.body.data.assessmentId, versionId };
}

let fixture: Fixture;

beforeEach(async () => {
  await seedRolesAndPermissions();
  fixture = await buildFixture();
});

describe('informe por competencia KMK', () => {
  it('calcula el desempeño exacto de cada competencia', async () => {
    await seedResults(fixture);

    const response = await request(app)
      .get('/api/statistics/kmk')
      .set('Authorization', `Bearer ${fixture.adminToken}`);

    expect(response.status).toBe(200);

    const byCode = new Map(
      response.body.data.competencies.map((entry: { code: string }) => [entry.code, entry]),
    );

    expect(byCode.get('1')).toMatchObject({ percentage: 100, correctRate: 100, level: 'AVANZADO' });
    expect(byCode.get('5')).toMatchObject({ percentage: 0, correctRate: 0, level: 'INICIAL' });
  });

  it('identifica la fortaleza y la debilidad', async () => {
    await seedResults(fixture);

    const response = await request(app)
      .get('/api/statistics/kmk')
      .set('Authorization', `Bearer ${fixture.adminToken}`);

    expect(response.body.data.strongest.code).toBe('1');
    expect(response.body.data.weakest.code).toBe('5');
  });

  it('incluye las competencias sin datos, con cero', async () => {
    // Que falte información es en sí una información: una competencia que
    // nadie ha evaluado debe verse, no desaparecer del informe.
    await prisma.kmkCompetency.create({
      data: {
        code: '3',
        name: trilingual('Competencia 3'),
        description: trilingual('Sin evaluar'),
        color: '#000000',
        position: 3,
      },
    });
    await seedResults(fixture);

    const response = await request(app)
      .get('/api/statistics/kmk')
      .set('Authorization', `Bearer ${fixture.adminToken}`);

    const unmeasured = response.body.data.competencies.find(
      (entry: { code: string }) => entry.code === '3',
    );
    expect(unmeasured).toMatchObject({ percentage: 0, answerCount: 0 });

    // Pero no se declara «la más débil»: nadie la ha medido.
    expect(response.body.data.weakest.code).toBe('5');
  });

  it('devuelve la evolución temporal agrupada por mes', async () => {
    await seedResults(fixture);

    const response = await request(app)
      .get('/api/statistics/kmk')
      .set('Authorization', `Bearer ${fixture.adminToken}`);

    expect(response.body.data.trend.length).toBeGreaterThan(0);
    expect(response.body.data.trend[0].period).toMatch(/^\d{4}-\d{2}$/);
  });

  it('filtra por competencia sin alterar el cálculo', async () => {
    await seedResults(fixture);

    const response = await request(app)
      .get(`/api/statistics/kmk?competencyId=${fixture.competencyIds[0]}`)
      .set('Authorization', `Bearer ${fixture.adminToken}`);

    const measured = response.body.data.competencies.filter(
      (entry: { answerCount: number }) => entry.answerCount > 0,
    );
    expect(measured).toHaveLength(1);
    expect(measured[0].code).toBe('1');
    expect(measured[0].percentage).toBe(100);
  });

  it('los mismos filtros dan la misma cifra en dos consultas distintas', async () => {
    await seedResults(fixture);

    const filters = `?subjectId=${fixture.subjectId}&groupId=${fixture.groupId}`;

    const [kmk, group] = await Promise.all([
      request(app)
        .get(`/api/statistics/kmk${filters}`)
        .set('Authorization', `Bearer ${fixture.adminToken}`),
      request(app)
        .get(`/api/statistics/groups/${fixture.groupId}${filters}`)
        .set('Authorization', `Bearer ${fixture.adminToken}`),
    ]);

    // Es la razón de tener los filtros centralizados: dos pantallas no pueden
    // discrepar sobre el mismo dato.
    const kmkFirst = kmk.body.data.competencies.find((e: { code: string }) => e.code === '1');
    const groupFirst = group.body.data.competencies.find((e: { code: string }) => e.code === '1');
    expect(groupFirst.percentage).toBe(kmkFirst.percentage);
  });
});

describe('alcance de las estadísticas', () => {
  it('un docente no ve los datos de los grupos de otro', async () => {
    await seedResults(fixture);

    await createTeacher({ username: 'docente.ajeno.stats' });
    const otherToken = await tokenFor('docente.ajeno.stats');

    const response = await request(app)
      .get('/api/statistics/kmk')
      .set('Authorization', `Bearer ${otherToken}`);

    // Pedir no es poder: el alcance se impone aunque no se filtre.
    expect(response.body.data.totalAnswers).toBe(0);
  });

  it('el docente titular sí ve los de su grupo', async () => {
    await seedResults(fixture);

    const response = await request(app)
      .get('/api/statistics/kmk')
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    expect(response.body.data.totalAnswers).toBeGreaterThan(0);
  });

  it('un estudiante solo ve lo suyo', async () => {
    await seedResults(fixture);

    const response = await request(app)
      .get('/api/statistics/kmk')
      .set('Authorization', `Bearer ${fixture.students[0]!.token}`);

    // Dos estudiantes respondieron dos preguntas cada uno; este ve solo dos.
    expect(response.body.data.totalAnswers).toBe(2);
  });

  it('un estudiante no consulta el progreso de otro cambiando la URL', async () => {
    await seedResults(fixture);

    const response = await request(app)
      .get(`/api/statistics/students/${fixture.students[1]!.user.id}`)
      .set('Authorization', `Bearer ${fixture.students[0]!.token}`);

    // Se ignora el identificador pedido y se devuelve el suyo.
    expect(response.status).toBe(200);
    expect(response.body.data.attempts).toBe(1);
  });
});

describe('resúmenes', () => {
  it('el resumen general refleja los intentos y la tasa de aprobación', async () => {
    await seedResults(fixture);

    const response = await request(app)
      .get('/api/statistics/overview')
      .set('Authorization', `Bearer ${fixture.adminToken}`);

    expect(response.body.data.attempts).toBe(2);
    // Ambos sacaron 50 %, por debajo del 70 % necesario.
    expect(response.body.data.averagePercentage).toBe(50);
    expect(response.body.data.passRate).toBe(0);
    expect(response.body.data.activeStudents).toBe(2);
  });

  it('el resumen docente cuenta lo que ha creado y a quién ha evaluado', async () => {
    await seedResults(fixture);

    const response = await request(app)
      .get('/api/statistics/teachers')
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    expect(response.body.data).toMatchObject({
      assessmentsCreated: 1,
      publishedAssessments: 1,
      assignmentsIssued: 1,
      studentsAssessed: 2,
    });
  });

  it('el progreso del estudiante incluye sus últimos resultados', async () => {
    await seedResults(fixture);

    const response = await request(app)
      .get('/api/statistics/students')
      .set('Authorization', `Bearer ${fixture.students[0]!.token}`);

    expect(response.body.data.attempts).toBe(1);
    expect(response.body.data.averagePercentage).toBe(50);
    expect(response.body.data.recent[0]).toMatchObject({ percentage: 50, gradeValue: 5 });
  });

  it('las estadísticas de grupo agregan a sus miembros', async () => {
    await seedResults(fixture);

    const response = await request(app)
      .get(`/api/statistics/groups/${fixture.groupId}`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    expect(response.body.data).toMatchObject({
      code: 'K8A',
      studentCount: 2,
      attempts: 2,
      averagePercentage: 50,
    });
  });
});

describe('planes de evaluación', () => {
  async function createPlan(): Promise<string> {
    const response = await request(app)
      .post('/api/evaluation-plans')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({
        name: 'Plan de 8° Informática',
        academicYearId: fixture.academicYearId,
        subjectId: fixture.subjectId,
        gradeLevelId: fixture.gradeLevelId,
      });
    expect(response.status).toBe(201);
    return response.body.data.id as string;
  }

  it('crea un plan con ítems por periodo y competencia', async () => {
    const planId = await createPlan();

    const response = await request(app)
      .post(`/api/evaluation-plans/${planId}/items`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({
        academicPeriodId: fixture.periodId,
        title: 'Diagnóstico de búsqueda de información',
        kmkCompetencyId: fixture.competencyIds[0],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].kmkCompetency.code).toBe('1');
  });

  it('rechaza un periodo que no pertenece al año del plan', async () => {
    const planId = await createPlan();

    const otherYear = await prisma.academicYear.create({
      data: {
        code: '2027-2028',
        name: 'Año siguiente',
        startDate: new Date('2027-08-01'),
        endDate: new Date('2028-06-24'),
      },
    });
    const foreignPeriod = await prisma.academicPeriod.create({
      data: {
        academicYearId: otherYear.id,
        name: 'Periodo ajeno',
        position: 0,
        startDate: new Date('2027-08-01'),
        endDate: new Date('2028-06-24'),
      },
    });

    const response = await request(app)
      .post(`/api/evaluation-plans/${planId}/items`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ academicPeriodId: foreignPeriod.id, title: 'No debería entrar' });

    expect(response.status).toBe(409);
  });

  it('mide el cumplimiento contra lo que de verdad ocurrió', async () => {
    const { assessmentId } = await seedResults(fixture);
    const planId = await createPlan();

    await request(app)
      .post(`/api/evaluation-plans/${planId}/items`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({
        academicPeriodId: fixture.periodId,
        title: 'Evaluación realizada',
        assessmentId,
      });

    await request(app)
      .post(`/api/evaluation-plans/${planId}/items`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ academicPeriodId: fixture.periodId, title: 'Todavía sin evaluación' });

    const response = await request(app)
      .get(`/api/evaluation-plans/${planId}/compliance`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.requiredItems).toBe(2);
    expect(response.body.data.completedItems).toBe(1);
    expect(response.body.data.overallCompletion).toBe(50);

    const done = response.body.data.items.find(
      (item: { title: string }) => item.title === 'Evaluación realizada',
    );
    expect(done).toMatchObject({ status: 'COMPLETED', recipients: 2, completed: 2 });

    const pendingItem = response.body.data.items.find(
      (item: { title: string }) => item.title === 'Todavía sin evaluación',
    );
    expect(pendingItem.status).toBe('NOT_PLANNED');
  });

  it('duplica el plan al curso siguiente reasignando los periodos', async () => {
    const planId = await createPlan();
    await request(app)
      .post(`/api/evaluation-plans/${planId}/items`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({
        academicPeriodId: fixture.periodId,
        title: 'Diagnóstico inicial',
        kmkCompetencyId: fixture.competencyIds[0],
      });

    const nextYear = await prisma.academicYear.create({
      data: {
        code: '2027-2028',
        name: 'Año 2027-2028',
        startDate: new Date('2027-08-01'),
        endDate: new Date('2028-06-24'),
      },
    });
    await prisma.academicPeriod.create({
      data: {
        academicYearId: nextYear.id,
        name: 'Periodo 1',
        position: 0,
        startDate: new Date('2027-08-01'),
        endDate: new Date('2028-06-24'),
      },
    });

    const response = await request(app)
      .post(`/api/evaluation-plans/${planId}/duplicate`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ targetAcademicYearId: nextYear.id });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toContain('2027-2028');
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].academicPeriod.name).toBe('Periodo 1');
    // La competencia se conserva; la evaluación no, porque era del curso anterior.
    expect(response.body.data.items[0].kmkCompetency.code).toBe('1');
    expect(response.body.data.items[0].assessment).toBeNull();
  });

  it('un docente no ve el plan de otro', async () => {
    const planId = await createPlan();
    await createTeacher({ username: 'docente.plan.ajeno' });

    const response = await request(app)
      .get(`/api/evaluation-plans/${planId}`)
      .set('Authorization', `Bearer ${await tokenFor('docente.plan.ajeno')}`);

    expect(response.status).toBe(403);
  });
});
