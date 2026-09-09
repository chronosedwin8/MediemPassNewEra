import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  ASSESSMENT_AUDIENCE,
  ASSIGNMENT_TARGET_TYPE,
  ATTEMPT_STATUS,
  DEFAULT_STUDENT_SCALE_BANDS,
  ERROR_CODE,
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
 * Motor de evaluación de extremo a extremo.
 *
 * La prueba que más importa de este archivo es la de integridad histórica:
 * publicar, responder, editar creando una versión nueva y comprobar que el
 * resultado antiguo no cambia. Es la garantía sobre la que se sostiene la
 * credibilidad académica de la plataforma.
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
  student: TestUser;
  studentToken: string;
  studentProfileId: string;
  groupId: string;
  subjectId: string;
  competencyIds: string[];
}

async function buildFixture(): Promise<Fixture> {
  const teacher = await createTeacher({ username: 'docente.motor' });
  const student = await createStudent({ username: 'alumno.motor' });

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
  await prisma.academicPeriod.create({
    data: {
      academicYearId: year.id,
      name: 'Periodo 1',
      position: 0,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-12-14'),
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

  const studentProfile = await prisma.student.create({
    data: { userId: student.id, gradeLevelId: gradeLevel.id, enrollmentStatus: 'ACTIVE' },
  });
  await prisma.groupMembership.create({
    data: { groupId: group.id, studentId: studentProfile.id },
  });

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

  // Escala alemana: es la que convierte el porcentaje en nota y estrellas.
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
    teacherToken: await tokenFor('docente.motor'),
    student,
    studentToken: await tokenFor('alumno.motor'),
    studentProfileId: studentProfile.id,
    groupId: group.id,
    subjectId: subject.id,
    competencyIds,
  };
}

/** Crea una evaluación con dos preguntas de opción única, 5 y 5 puntos. */
async function createPublishedAssessment(
  fixture: Fixture,
  options: { timeLimitMinutes?: number | null } = {},
): Promise<{ assessmentId: string; versionId: string; questionIds: string[] }> {
  const assessment = await request(app)
    .post('/api/assessments')
    .set('Authorization', `Bearer ${fixture.teacherToken}`)
    .send({
      title: 'Búsqueda de información digital',
      description: 'Evaluación de prueba',
      subjectId: fixture.subjectId,
      timeLimitMinutes: options.timeLimitMinutes ?? null,
    });

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
        feedbackCorrect: 'Correcto.',
        feedbackIncorrect: 'Revisa el tema.',
        payload: {
          kind: QUESTION_TYPE.SINGLE_CHOICE,
          options: [
            { id: 'a', text: 'Opción incorrecta', correct: false },
            { id: 'b', text: 'Opción correcta', correct: true },
          ],
        },
      });
    expect(question.status).toBe(201);
    questionIds.push(question.body.data.id);
  }

  const published = await request(app)
    .post(`/api/assessments/versions/${versionId}/publish`)
    .set('Authorization', `Bearer ${fixture.teacherToken}`);
  expect(published.status).toBe(200);

  return { assessmentId: assessment.body.data.assessmentId, versionId, questionIds };
}

async function assignToGroup(fixture: Fixture, versionId: string, attemptsAllowed = 1) {
  const response = await request(app)
    .post('/api/assignments')
    .set('Authorization', `Bearer ${fixture.teacherToken}`)
    .send({
      assessmentVersionId: versionId,
      targetType: ASSIGNMENT_TARGET_TYPE.GROUP,
      groupId: fixture.groupId,
      startAt: new Date(Date.now() - 60_000).toISOString(),
      attemptsAllowed,
    });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function startAttempt(fixture: Fixture) {
  const assigned = await request(app)
    .get('/api/attempts/assigned')
    .set('Authorization', `Bearer ${fixture.studentToken}`);

  const recipientId = assigned.body.data[0].recipientId as string;

  const attempt = await request(app)
    .post('/api/attempts')
    .set('Authorization', `Bearer ${fixture.studentToken}`)
    .send({ recipientId });

  return { attempt, recipientId };
}

let fixture: Fixture;

beforeEach(async () => {
  await seedRolesAndPermissions();
  fixture = await buildFixture();
});

describe('ciclo de vida de una evaluación', () => {
  it('crear, añadir preguntas, publicar y asignar', async () => {
    const { versionId } = await createPublishedAssessment(fixture);

    const version = await prisma.assessmentVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(version.status).toBe('PUBLISHED');
    // Puntos y número de preguntas se materializan al publicar.
    expect(Number(version.totalPoints)).toBe(10);
    expect(version.questionCount).toBe(2);

    const assignmentId = await assignToGroup(fixture, versionId);
    const recipients = await prisma.assignmentRecipient.findMany({ where: { assignmentId } });
    expect(recipients).toHaveLength(1);
  });

  it('no permite publicar sin preguntas', async () => {
    const assessment = await request(app)
      .post('/api/assessments')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ title: 'Evaluación vacía' });

    const response = await request(app)
      .post(`/api/assessments/versions/${assessment.body.data.versionId}/publish`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ERROR_CODE.ASSESSMENT_HAS_NO_QUESTIONS);
  });

  it('rechaza modificar una versión publicada', async () => {
    const { versionId } = await createPublishedAssessment(fixture);

    const response = await request(app)
      .patch(`/api/assessments/versions/${versionId}`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ name: 'Nombre cambiado' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ERROR_CODE.VERSION_IMMUTABLE);
  });

  it('rechaza una pregunta cuyo contenido no cumple su tipo', async () => {
    const assessment = await request(app)
      .post('/api/assessments')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ title: 'Con pregunta inválida' });

    const response = await request(app)
      .post(`/api/assessments/versions/${assessment.body.data.versionId}/questions`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({
        type: QUESTION_TYPE.SINGLE_CHOICE,
        statement: 'Sin respuesta correcta',
        points: 2,
        kmkCompetencyId: fixture.competencyIds[0],
        payload: {
          kind: QUESTION_TYPE.SINGLE_CHOICE,
          options: [
            { id: 'a', text: 'Una', correct: false },
            { id: 'b', text: 'Otra', correct: false },
          ],
        },
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe(ERROR_CODE.QUESTION_PAYLOAD_INVALID);
  });

  it('no permite asignar un borrador', async () => {
    const assessment = await request(app)
      .post('/api/assessments')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ title: 'Borrador' });

    const response = await request(app)
      .post('/api/assignments')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({
        assessmentVersionId: assessment.body.data.versionId,
        targetType: ASSIGNMENT_TARGET_TYPE.GROUP,
        groupId: fixture.groupId,
        startAt: new Date().toISOString(),
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ERROR_CODE.ASSESSMENT_NOT_PUBLISHED);
  });

  it('un docente no puede editar la evaluación de otro', async () => {
    const { versionId } = await createPublishedAssessment(fixture);
    await createTeacher({ username: 'docente.intruso' });

    const response = await request(app)
      .post(`/api/assessments/${versionId}/versions`)
      .set('Authorization', `Bearer ${await tokenFor('docente.intruso')}`);

    expect([403, 404]).toContain(response.status);
  });
});

describe('realización de una evaluación', () => {
  it('recorre el flujo completo y calcula nota y estrellas', async () => {
    const { versionId, questionIds } = await createPublishedAssessment(fixture);
    await assignToGroup(fixture, versionId);

    const { attempt } = await startAttempt(fixture);
    expect(attempt.status).toBe(201);
    expect(attempt.body.data.questions).toHaveLength(2);

    // Ambas correctas → 100 % → nota 1.0 → cinco estrellas.
    for (const questionId of questionIds) {
      const saved = await request(app)
        .put(`/api/attempts/${attempt.body.data.id}/answers/${questionId}`)
        .set('Authorization', `Bearer ${fixture.studentToken}`)
        .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' } });
      expect(saved.status).toBe(200);
    }

    const result = await request(app)
      .post(`/api/attempts/${attempt.body.data.id}/submit`)
      .set('Authorization', `Bearer ${fixture.studentToken}`);

    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({
      pointsEarned: 10,
      pointsPossible: 10,
      percentage: 100,
      passed: true,
      status: ATTEMPT_STATUS.GRADED,
    });
    expect(result.body.data.grade.value).toBe(1);
    expect(result.body.data.stars).toEqual({ filled: 5, total: 5 });
  });

  it('la nota media produce la banda correcta de la escala alemana', async () => {
    const { versionId, questionIds } = await createPublishedAssessment(fixture);
    await assignToGroup(fixture, versionId);
    const { attempt } = await startAttempt(fixture);

    // Una correcta de dos → 50 % → nota 5.0 → una estrella → no aprueba.
    await request(app)
      .put(`/api/attempts/${attempt.body.data.id}/answers/${questionIds[0]}`)
      .set('Authorization', `Bearer ${fixture.studentToken}`)
      .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' } });
    await request(app)
      .put(`/api/attempts/${attempt.body.data.id}/answers/${questionIds[1]}`)
      .set('Authorization', `Bearer ${fixture.studentToken}`)
      .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'a' } });

    const result = await request(app)
      .post(`/api/attempts/${attempt.body.data.id}/submit`)
      .set('Authorization', `Bearer ${fixture.studentToken}`);

    expect(result.body.data.percentage).toBe(50);
    expect(result.body.data.grade.value).toBe(5);
    expect(result.body.data.stars).toEqual({ filled: 1, total: 5 });
    expect(result.body.data.passed).toBe(false);
  });

  it('nunca envía la respuesta correcta durante el intento', async () => {
    const { versionId } = await createPublishedAssessment(fixture);
    await assignToGroup(fixture, versionId);
    const { attempt } = await startAttempt(fixture);

    // Enviarla y ocultarla en el cliente sería regalarla a quien abra las
    // herramientas de desarrollo. Se comprueba la propiedad, no la subcadena:
    // el enunciado de una opción puede contener legítimamente la palabra.
    for (const question of attempt.body.data.questions) {
      for (const option of question.payload.options) {
        expect(option).not.toHaveProperty('correct');
      }
    }
  });

  it('recupera el intento tras recargar sin perder respuestas', async () => {
    const { versionId, questionIds } = await createPublishedAssessment(fixture);
    await assignToGroup(fixture, versionId);
    const { attempt } = await startAttempt(fixture);

    await request(app)
      .put(`/api/attempts/${attempt.body.data.id}/answers/${questionIds[0]}`)
      .set('Authorization', `Bearer ${fixture.studentToken}`)
      .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' } });

    const reloaded = await request(app)
      .get(`/api/attempts/${attempt.body.data.id}`)
      .set('Authorization', `Bearer ${fixture.studentToken}`);

    expect(reloaded.body.data.answers).toHaveLength(1);
    expect(reloaded.body.data.answers[0].response.optionId).toBe('b');
  });

  it('reiniciar no consume un intento: devuelve el que está en curso', async () => {
    const { versionId } = await createPublishedAssessment(fixture);
    await assignToGroup(fixture, versionId);

    const first = await startAttempt(fixture);
    const second = await request(app)
      .post('/api/attempts')
      .set('Authorization', `Bearer ${fixture.studentToken}`)
      .send({ recipientId: first.recipientId });

    expect(second.body.data.id).toBe(first.attempt.body.data.id);
    expect(await prisma.assessmentAttempt.count()).toBe(1);
  });

  it('el autoguardado es idempotente', async () => {
    const { versionId, questionIds } = await createPublishedAssessment(fixture);
    await assignToGroup(fixture, versionId);
    const { attempt } = await startAttempt(fixture);

    for (let i = 0; i < 3; i += 1) {
      await request(app)
        .put(`/api/attempts/${attempt.body.data.id}/answers/${questionIds[0]}`)
        .set('Authorization', `Bearer ${fixture.studentToken}`)
        .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' } });
    }

    expect(await prisma.attemptAnswer.count({ where: { attemptId: attempt.body.data.id } })).toBe(
      1,
    );
  });

  it('rechaza una respuesta con forma ajena al tipo de pregunta', async () => {
    const { versionId, questionIds } = await createPublishedAssessment(fixture);
    await assignToGroup(fixture, versionId);
    const { attempt } = await startAttempt(fixture);

    const response = await request(app)
      .put(`/api/attempts/${attempt.body.data.id}/answers/${questionIds[0]}`)
      .set('Authorization', `Bearer ${fixture.studentToken}`)
      .send({ response: { kind: QUESTION_TYPE.TRUE_FALSE, value: true } });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe(ERROR_CODE.ANSWER_FORMAT_INVALID);
  });

  it('no permite entregar dos veces', async () => {
    const { versionId } = await createPublishedAssessment(fixture);
    await assignToGroup(fixture, versionId);
    const { attempt } = await startAttempt(fixture);

    await request(app)
      .post(`/api/attempts/${attempt.body.data.id}/submit`)
      .set('Authorization', `Bearer ${fixture.studentToken}`);

    const second = await request(app)
      .post(`/api/attempts/${attempt.body.data.id}/submit`)
      .set('Authorization', `Bearer ${fixture.studentToken}`);

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe(ERROR_CODE.ATTEMPT_ALREADY_SUBMITTED);
  });

  it('agotados los intentos, no se puede empezar otro', async () => {
    const { versionId } = await createPublishedAssessment(fixture);
    await assignToGroup(fixture, versionId, 1);

    const { attempt, recipientId } = await startAttempt(fixture);
    await request(app)
      .post(`/api/attempts/${attempt.body.data.id}/submit`)
      .set('Authorization', `Bearer ${fixture.studentToken}`);

    const second = await request(app)
      .post('/api/attempts')
      .set('Authorization', `Bearer ${fixture.studentToken}`)
      .send({ recipientId });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe(ERROR_CODE.ATTEMPT_LIMIT_REACHED);
  });

  it('un estudiante no puede abrir el intento de otro', async () => {
    const { versionId } = await createPublishedAssessment(fixture);
    await assignToGroup(fixture, versionId);
    const { attempt } = await startAttempt(fixture);

    await createStudent({ username: 'alumno.ajeno' });

    const response = await request(app)
      .get(`/api/attempts/${attempt.body.data.id}`)
      .set('Authorization', `Bearer ${await tokenFor('alumno.ajeno')}`);

    expect(response.status).toBe(404);
  });

  it('el servidor rechaza responder fuera de plazo', async () => {
    const { versionId, questionIds } = await createPublishedAssessment(fixture, {
      timeLimitMinutes: 30,
    });
    await assignToGroup(fixture, versionId);
    const { attempt } = await startAttempt(fixture);

    // Se retrasa el plazo directamente en la base: el reloj del cliente es
    // irrelevante, la autoridad es el servidor.
    await prisma.assessmentAttempt.update({
      where: { id: attempt.body.data.id },
      data: { deadlineAt: new Date(Date.now() - 10 * 60_000) },
    });

    const response = await request(app)
      .put(`/api/attempts/${attempt.body.data.id}/answers/${questionIds[0]}`)
      .set('Authorization', `Bearer ${fixture.studentToken}`)
      .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' } });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ERROR_CODE.TIME_LIMIT_EXCEEDED);

    // Y el intento queda cerrado, no colgado indefinidamente.
    const closed = await prisma.assessmentAttempt.findUniqueOrThrow({
      where: { id: attempt.body.data.id },
    });
    expect(closed.status).not.toBe(ATTEMPT_STATUS.IN_PROGRESS);
  });

  it('calcula el plazo en el servidor al iniciar', async () => {
    const { versionId } = await createPublishedAssessment(fixture, { timeLimitMinutes: 45 });
    await assignToGroup(fixture, versionId);
    const { attempt } = await startAttempt(fixture);

    expect(attempt.body.data.deadlineAt).toBeTypeOf('string');
    expect(attempt.body.data.remainingSeconds).toBeGreaterThan(44 * 60);
    expect(attempt.body.data.remainingSeconds).toBeLessThanOrEqual(45 * 60);
  });
});

describe('desglose por competencia KMK', () => {
  it('reparte el resultado entre las competencias medidas', async () => {
    const { versionId, questionIds } = await createPublishedAssessment(fixture);
    await assignToGroup(fixture, versionId);
    const { attempt } = await startAttempt(fixture);

    // Acierta la de la competencia 1, falla la de la competencia 5.
    await request(app)
      .put(`/api/attempts/${attempt.body.data.id}/answers/${questionIds[0]}`)
      .set('Authorization', `Bearer ${fixture.studentToken}`)
      .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' } });
    await request(app)
      .put(`/api/attempts/${attempt.body.data.id}/answers/${questionIds[1]}`)
      .set('Authorization', `Bearer ${fixture.studentToken}`)
      .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'a' } });

    const result = await request(app)
      .post(`/api/attempts/${attempt.body.data.id}/submit`)
      .set('Authorization', `Bearer ${fixture.studentToken}`);

    const breakdown = result.body.data.competencyBreakdown as Array<{
      code: string;
      percentage: number;
    }>;

    expect(breakdown).toHaveLength(2);
    expect(breakdown.find((entry) => entry.code === '1')?.percentage).toBe(100);
    expect(breakdown.find((entry) => entry.code === '5')?.percentage).toBe(0);
  });

  it('desnormaliza la competencia y el periodo en cada respuesta', async () => {
    const { versionId, questionIds } = await createPublishedAssessment(fixture);
    await assignToGroup(fixture, versionId);
    const { attempt } = await startAttempt(fixture);

    await request(app)
      .put(`/api/attempts/${attempt.body.data.id}/answers/${questionIds[0]}`)
      .set('Authorization', `Bearer ${fixture.studentToken}`)
      .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' } });
    await request(app)
      .post(`/api/attempts/${attempt.body.data.id}/submit`)
      .set('Authorization', `Bearer ${fixture.studentToken}`);

    // Es lo que hace que la analítica sea un GROUP BY sobre una sola tabla.
    const answers = await prisma.attemptAnswer.findMany({
      where: { attemptId: attempt.body.data.id },
    });
    expect(answers).toHaveLength(2);
    for (const answer of answers) {
      expect(answer.kmkCompetencyId).toBeTypeOf('string');
      expect(answer.subjectId).toBe(fixture.subjectId);
      expect(answer.groupId).toBe(fixture.groupId);
      expect(answer.academicPeriodId).toBeTypeOf('string');
    }
  });
});

describe('respuestas abiertas y calificación manual', () => {
  async function buildWithOpenQuestion() {
    const assessment = await request(app)
      .post('/api/assessments')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ title: 'Con pregunta abierta', subjectId: fixture.subjectId });

    const versionId = assessment.body.data.versionId as string;

    const closed = await request(app)
      .post(`/api/assessments/versions/${versionId}/questions`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({
        type: QUESTION_TYPE.SINGLE_CHOICE,
        statement: 'Cerrada',
        points: 5,
        kmkCompetencyId: fixture.competencyIds[0],
        payload: {
          kind: QUESTION_TYPE.SINGLE_CHOICE,
          options: [
            { id: 'a', text: 'Mal', correct: false },
            { id: 'b', text: 'Bien', correct: true },
          ],
        },
      });

    const open = await request(app)
      .post(`/api/assessments/versions/${versionId}/questions`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({
        type: QUESTION_TYPE.OPEN_TEXT,
        statement: 'Explica con tus palabras…',
        points: 5,
        kmkCompetencyId: fixture.competencyIds[1],
        payload: { kind: QUESTION_TYPE.OPEN_TEXT, minWords: 5 },
      });

    await request(app)
      .post(`/api/assessments/versions/${versionId}/publish`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    await assignToGroup(fixture, versionId);

    return { versionId, closedId: closed.body.data.id, openId: open.body.data.id };
  }

  it('el intento queda pendiente de revisión y el docente lo cierra', async () => {
    const { closedId, openId } = await buildWithOpenQuestion();
    const { attempt } = await startAttempt(fixture);
    const attemptId = attempt.body.data.id as string;

    await request(app)
      .put(`/api/attempts/${attemptId}/answers/${closedId}`)
      .set('Authorization', `Bearer ${fixture.studentToken}`)
      .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' } });
    await request(app)
      .put(`/api/attempts/${attemptId}/answers/${openId}`)
      .set('Authorization', `Bearer ${fixture.studentToken}`)
      .send({
        response: {
          kind: QUESTION_TYPE.OPEN_TEXT,
          text: 'Comprobaría la fuente original y la fecha.',
        },
      });

    const submitted = await request(app)
      .post(`/api/attempts/${attemptId}/submit`)
      .set('Authorization', `Bearer ${fixture.studentToken}`);

    // Con una abierta sin corregir, la nota todavía no es definitiva.
    expect(submitted.body.data.status).toBe(ATTEMPT_STATUS.PENDING_REVIEW);
    expect(submitted.body.data.requiresManualGrading).toBe(true);
    expect(submitted.body.data.pointsEarned).toBe(5);

    const graded = await request(app)
      .post(`/api/attempts/${attemptId}/answers/${openId}/grade`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ points: 4, feedback: 'Buena respuesta, falta mencionar el contraste de fuentes.' });

    expect(graded.status).toBe(200);
    expect(graded.body.data.status).toBe(ATTEMPT_STATUS.GRADED);
    expect(graded.body.data.pointsEarned).toBe(9);
    expect(graded.body.data.percentage).toBe(90);
    expect(graded.body.data.grade.value).toBe(1);
  });

  it('rechaza una puntuación mayor que los puntos de la pregunta', async () => {
    const { openId } = await buildWithOpenQuestion();
    const { attempt } = await startAttempt(fixture);
    const attemptId = attempt.body.data.id as string;

    await request(app)
      .put(`/api/attempts/${attemptId}/answers/${openId}`)
      .set('Authorization', `Bearer ${fixture.studentToken}`)
      .send({ response: { kind: QUESTION_TYPE.OPEN_TEXT, text: 'Una respuesta cualquiera.' } });
    await request(app)
      .post(`/api/attempts/${attemptId}/submit`)
      .set('Authorization', `Bearer ${fixture.studentToken}`);

    const response = await request(app)
      .post(`/api/attempts/${attemptId}/answers/${openId}/grade`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ points: 99 });

    expect(response.status).toBe(422);
  });

  it('un estudiante no puede calificar', async () => {
    const { openId } = await buildWithOpenQuestion();
    const { attempt } = await startAttempt(fixture);

    const response = await request(app)
      .post(`/api/attempts/${attempt.body.data.id}/answers/${openId}/grade`)
      .set('Authorization', `Bearer ${fixture.studentToken}`)
      .send({ points: 5 });

    expect(response.status).toBe(403);
  });
});

describe('integridad histórica', () => {
  it('editar la evaluación después no altera un resultado ya emitido', async () => {
    const { assessmentId, versionId, questionIds } = await createPublishedAssessment(fixture);
    await assignToGroup(fixture, versionId);

    // El estudiante responde bien las dos: 100 %, nota 1.0.
    const { attempt } = await startAttempt(fixture);
    for (const questionId of questionIds) {
      await request(app)
        .put(`/api/attempts/${attempt.body.data.id}/answers/${questionId}`)
        .set('Authorization', `Bearer ${fixture.studentToken}`)
        .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' } });
    }
    const original = await request(app)
      .post(`/api/attempts/${attempt.body.data.id}/submit`)
      .set('Authorization', `Bearer ${fixture.studentToken}`);

    expect(original.body.data.percentage).toBe(100);
    expect(original.body.data.grade.value).toBe(1);

    // El docente decide corregir: se crea la versión 2 y allí invierte cuál
    // es la respuesta correcta y sube los puntos.
    const newVersion = await request(app)
      .post(`/api/assessments/${assessmentId}/versions`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);
    expect(newVersion.status).toBe(201);
    expect(newVersion.body.data.versionNumber).toBe(2);

    const copied = await prisma.question.findMany({
      where: { assessmentVersionId: newVersion.body.data.id },
      orderBy: { position: 'asc' },
    });

    await request(app)
      .patch(`/api/assessments/questions/${copied[0]!.id}`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({
        points: 20,
        payload: {
          kind: QUESTION_TYPE.SINGLE_CHOICE,
          options: [
            { id: 'a', text: 'Ahora esta es la correcta', correct: true },
            { id: 'b', text: 'Y esta ya no', correct: false },
          ],
        },
      });

    // El resultado del estudiante debe ser exactamente el mismo que antes.
    const stored = await request(app)
      .get(`/api/attempts/${attempt.body.data.id}/result`)
      .set('Authorization', `Bearer ${fixture.studentToken}`);

    expect(stored.body.data.percentage).toBe(100);
    expect(stored.body.data.pointsPossible).toBe(10);
    expect(stored.body.data.grade.value).toBe(1);
    expect(stored.body.data.stars).toEqual({ filled: 5, total: 5 });

    // Y el intento sigue apuntando a la versión 1, no a la 2.
    const row = await prisma.assessmentAttempt.findUniqueOrThrow({
      where: { id: attempt.body.data.id },
    });
    expect(row.assessmentVersionId).toBe(versionId);

    // Las preguntas de la versión 1 no se han tocado.
    const originalQuestions = await prisma.question.findMany({
      where: { assessmentVersionId: versionId },
    });
    expect(originalQuestions.every((question) => Number(question.points) === 5)).toBe(true);
  });

  it('cambiar la escala después no reescribe la nota emitida', async () => {
    const { versionId, questionIds } = await createPublishedAssessment(fixture);
    await assignToGroup(fixture, versionId);
    const { attempt } = await startAttempt(fixture);

    for (const questionId of questionIds) {
      await request(app)
        .put(`/api/attempts/${attempt.body.data.id}/answers/${questionId}`)
        .set('Authorization', `Bearer ${fixture.studentToken}`)
        .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' } });
    }
    await request(app)
      .post(`/api/attempts/${attempt.body.data.id}/submit`)
      .set('Authorization', `Bearer ${fixture.studentToken}`);

    // El administrador endurece la escala: ahora el sobresaliente pide 98 %.
    await createAdmin({ username: 'admin.escala.motor' });
    await request(app)
      .put('/api/settings/scales/student-default')
      .set('Authorization', `Bearer ${await tokenFor('admin.escala.motor')}`)
      .send({
        passingPercentage: 90,
        bands: DEFAULT_STUDENT_SCALE_BANDS.map((band) => ({
          position: band.position,
          value: band.value,
          minPercentage: band.position === 0 ? 98 : band.minPercentage,
          label: trilingual(band.label),
          color: band.color,
        })),
      });

    const stored = await request(app)
      .get(`/api/attempts/${attempt.body.data.id}/result`)
      .set('Authorization', `Bearer ${fixture.studentToken}`);

    // La nota conserva su significado original.
    expect(stored.body.data.grade.value).toBe(1);
    expect(stored.body.data.passingPercentage).toBe(70);
    expect(stored.body.data.passed).toBe(true);
  });
});
