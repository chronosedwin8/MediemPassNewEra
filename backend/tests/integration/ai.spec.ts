import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  ASSESSMENT_AUDIENCE,
  ASSESSMENT_VERSION_STATUS,
  ERROR_CODE,
  MEDIA_MAX_SECONDS,
  QUESTION_TYPE,
  SCALE_KIND,
} from '@medienpass/shared';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { MockAiProvider, setAiProvider } from '../../src/modules/ai/ai.provider.js';
import {
  TEST_PASSWORD,
  createStudent,
  createTeacher,
  seedRolesAndPermissions,
} from '../helpers/factories.js';

/**
 * Generación de evaluaciones con IA.
 *
 * Ninguna prueba llama al modelo real: sería lenta, gastaría cuota y daría un
 * resultado distinto en cada ejecución, lo que haría imposible afirmar nada.
 *
 * Lo que más importa comprobar es que **la IA no publica**, y que una
 * respuesta que no supera la validación no deja nada creado.
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
  teacherToken: string;
  subjectId: string;
  competencyIds: string[];
}

let provider: MockAiProvider;
let fixture: Fixture;

async function buildFixture(): Promise<Fixture> {
  await createTeacher({ username: 'docente.ia' });

  const area = await prisma.academicArea.create({
    data: { code: 'MAT', name: trilingual('Matemáticas') },
  });
  const subject = await prisma.subject.create({
    data: { code: 'MAT-GEN', name: trilingual('Matemáticas'), areaId: area.id },
  });

  const competencyIds: string[] = [];
  for (const code of ['1', '5']) {
    const competency = await prisma.kmkCompetency.create({
      data: {
        code,
        name: trilingual(`Competencia ${code}`),
        description: trilingual('Descripción de la competencia'),
        color: '#2563eb',
        position: Number(code),
      },
    });
    competencyIds.push(competency.id);
  }

  await prisma.gradingScale.create({
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

  // La configuración se siembra: el servicio comprueba que la IA esté activa.
  await prisma.systemSetting.createMany({
    data: [
      { key: 'ai.enabled', value: true },
      { key: 'ai.max_questions_per_request', value: 30 },
    ],
  });

  return {
    teacherToken: await tokenFor('docente.ia'),
    subjectId: subject.id,
    competencyIds,
  };
}

const baseRequest = () => ({
  subjectId: fixture.subjectId,
  topic: 'Funciones lineales',
  questionCount: 4,
  competencyIds: fixture.competencyIds,
  questionTypes: [QUESTION_TYPE.SINGLE_CHOICE, QUESTION_TYPE.TRUE_FALSE],
});

beforeEach(async () => {
  await seedRolesAndPermissions();
  provider = new MockAiProvider();
  setAiProvider(provider);
  fixture = await buildFixture();
});

afterEach(() => {
  setAiProvider(null);
});

describe('generación', () => {
  it('produce un borrador editable con sus preguntas', async () => {
    const response = await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send(baseRequest());

    expect(response.status).toBe(200);
    expect(response.body.data.questionsCreated).toBe(4);

    const version = await prisma.assessmentVersion.findUniqueOrThrow({
      where: { id: response.body.data.versionId },
      include: { questions: { orderBy: { position: 'asc' } } },
    });

    expect(version.questions).toHaveLength(4);
    // Cada pregunta queda asociada a una competencia: sin eso no habría
    // analítica y la evaluación no se podría publicar.
    expect(version.questions.every((question) => question.kmkCompetencyId)).toBe(true);
  });

  it('la IA nunca publica: el resultado es siempre un borrador', async () => {
    const response = await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send(baseRequest());

    const version = await prisma.assessmentVersion.findUniqueOrThrow({
      where: { id: response.body.data.versionId },
    });

    expect(version.status).toBe(ASSESSMENT_VERSION_STATUS.DRAFT);
    expect(version.publishedAt).toBeNull();

    // Y no queda ninguna versión publicada en toda la base por esta vía.
    expect(
      await prisma.assessmentVersion.count({
        where: { status: ASSESSMENT_VERSION_STATUS.PUBLISHED },
      }),
    ).toBe(0);
  });

  it('el docente puede editar lo generado antes de publicar', async () => {
    const generated = await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send(baseRequest());

    const questions = await prisma.question.findMany({
      where: { assessmentVersionId: generated.body.data.versionId },
      orderBy: { position: 'asc' },
    });

    const edited = await request(app)
      .patch(`/api/assessments/questions/${questions[0]!.id}`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ statement: 'Enunciado corregido por el docente', points: 5 });

    expect(edited.status).toBe(200);
    expect(edited.body.data.statement).toBe('Enunciado corregido por el docente');
  });

  it('el borrador se publica con el mismo flujo que cualquier otro', async () => {
    const generated = await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send(baseRequest());

    const published = await request(app)
      .post(`/api/assessments/versions/${generated.body.data.versionId}/publish`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe(ASSESSMENT_VERSION_STATUS.PUBLISHED);
  });

  it('registra la generación con su trazabilidad', async () => {
    await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send(baseRequest());

    const requests = await prisma.aiGenerationRequest.findMany();
    expect(requests).toHaveLength(1);
    expect(requests[0]!.status).toBe('APPLIED');
    expect(requests[0]!.rawResponse).not.toBeNull();
    expect(requests[0]!.assessmentVersionId).not.toBeNull();

    const audit = await prisma.auditLog.findMany({ where: { action: 'GENERATE_AI_ASSESSMENT' } });
    expect(audit).toHaveLength(1);
  });
});

describe('tipos que se responden grabando', () => {
  /** Una respuesta del modelo con un único tipo de pregunta. */
  function respond(question: Record<string, unknown>): string {
    return JSON.stringify({
      assessment: {
        title: 'Evaluación con captura',
        description: 'Descripción',
        instructions: 'Instrucciones',
        difficulty: 'INTERMEDIATE',
        language: 'es',
      },
      questions: [
        {
          points: 3,
          difficulty: 'INTERMEDIATE',
          competencyCode: '1',
          feedbackCorrect: 'La grabación muestra lo que se pedía.',
          feedbackIncorrect: 'Vuelve a grabar mostrando el proceso completo.',
          ...question,
        },
      ],
    });
  }

  it('genera un vídeo con su tope de duración y su indicación', async () => {
    provider.nextResponse = respond({
      type: QUESTION_TYPE.VIDEO_RESPONSE,
      statement: 'Explica en vídeo cómo resolviste el sistema de ecuaciones',
      guidance: 'Debe verse el papel con el procedimiento mientras explicas cada paso.',
    });

    const response = await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ ...baseRequest(), questionCount: 1 });

    expect(response.status).toBe(200);

    const question = await prisma.question.findFirstOrThrow({
      where: { assessmentVersionId: response.body.data.versionId },
    });

    expect(question.type).toBe(QUESTION_TYPE.VIDEO_RESPONSE);
    // El tope viene del tipo, no del modelo: es un límite de almacenamiento y
    // de atención de quien corrige, no una preferencia que se pueda negociar.
    expect(question.payload).toMatchObject({
      kind: QUESTION_TYPE.VIDEO_RESPONSE,
      maxSeconds: MEDIA_MAX_SECONDS[QUESTION_TYPE.VIDEO_RESPONSE],
      guidance: 'Debe verse el papel con el procedimiento mientras explicas cada paso.',
    });
  });

  it('rechaza una grabación sin decir qué debe verse', async () => {
    /*
     * «Grábate hablando del tema» cumple el contrato y no es evaluable: quien
     * responde no sabe a qué apuntar y quien corrige no tiene con qué
     * comparar. Es exactamente lo que esta capa debe detener.
     */
    provider.nextResponse = respond({
      type: QUESTION_TYPE.AUDIO_RESPONSE,
      statement: 'Graba una nota de voz sobre el tema visto en clase',
      guidance: 'Habla.',
    });

    const response = await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ ...baseRequest(), questionCount: 1 });

    expect(response.status).toBe(422);
    expect(response.body.error.details.issues[0].rule).toBe('MISSING_GUIDANCE');
    expect(await prisma.assessment.count()).toBe(0);
  });

  it('genera un objetivo SMART con la rúbrica a la vista', async () => {
    provider.nextResponse = respond({
      type: QUESTION_TYPE.SMART_GOAL,
      statement: 'Formula tu objetivo SMART para mejorar en resolución de ecuaciones',
    });

    const response = await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ ...baseRequest(), questionCount: 1 });

    expect(response.status).toBe(200);

    const question = await prisma.question.findFirstOrThrow({
      where: { assessmentVersionId: response.body.data.versionId },
    });

    // La rúbrica se enseña: es lo que se está evaluando, y esconderla
    // convertiría el ejercicio en adivinar.
    expect(question.payload).toMatchObject({ kind: QUESTION_TYPE.SMART_GOAL, showRubric: true });
  });
});

describe('validación de la respuesta del modelo', () => {
  it('rechaza una respuesta que no es JSON y no crea nada', async () => {
    provider.nextResponse = 'Claro, aquí tienes tu evaluación: primero...';

    const response = await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send(baseRequest());

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe(ERROR_CODE.AI_RESPONSE_INVALID);

    expect(await prisma.assessment.count()).toBe(0);
    expect(await prisma.assessmentVersion.count()).toBe(0);
  });

  it('rechaza una estructura que no cumple el contrato', async () => {
    provider.nextResponse = JSON.stringify({ preguntas: ['algo'] });

    const response = await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send(baseRequest());

    expect(response.status).toBe(422);
    expect(await prisma.assessment.count()).toBe(0);
  });

  it('rechaza una pregunta de respuesta única sin ninguna correcta', async () => {
    // El JSON es impecable y la pregunta es inservible: por eso la validación
    // no puede quedarse en la forma.
    provider.nextResponse = JSON.stringify({
      assessment: {
        title: 'Evaluación con fallo semántico',
        description: 'Descripción',
        instructions: 'Instrucciones',
        difficulty: 'INTERMEDIATE',
        language: 'es',
      },
      questions: [
        {
          type: QUESTION_TYPE.SINGLE_CHOICE,
          statement: 'Una pregunta sin respuesta correcta posible',
          points: 2,
          difficulty: 'INTERMEDIATE',
          competencyCode: '1',
          feedbackCorrect: 'Correcto porque sí.',
          feedbackIncorrect: 'Revisa el tema.',
          options: [
            { text: 'Opción A', correct: false },
            { text: 'Opción B', correct: false },
          ],
        },
      ],
    });

    const response = await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send(baseRequest());

    expect(response.status).toBe(422);
    expect(response.body.error.details.issues[0].rule).toBe('WRONG_CORRECT_COUNT');
    expect(await prisma.assessment.count()).toBe(0);
  });

  it('rechaza una competencia que no existe en el marco', async () => {
    provider.nextResponse = JSON.stringify({
      assessment: {
        title: 'Con competencia inventada',
        description: 'Descripción',
        instructions: 'Instrucciones',
        difficulty: 'INTERMEDIATE',
        language: 'es',
      },
      questions: [
        {
          type: QUESTION_TYPE.TRUE_FALSE,
          statement: 'Un enunciado cualquiera para la prueba',
          points: 1,
          difficulty: 'BASIC',
          competencyCode: '99',
          feedbackCorrect: 'Correcto, porque el enunciado es cierto.',
          feedbackIncorrect: 'Repasa el tema.',
          correctBoolean: true,
        },
      ],
    });

    const response = await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send(baseRequest());

    expect(response.status).toBe(422);
    expect(response.body.error.details.issues[0].rule).toBe('UNKNOWN_COMPETENCY');
  });

  it('conserva la respuesta rechazada para poder auditarla', async () => {
    provider.nextResponse = 'esto no es json';

    await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send(baseRequest());

    // Es lo que permite mejorar el prompt en lugar de adivinar.
    const rejected = await prisma.aiGenerationRequest.findFirstOrThrow();
    expect(rejected.status).toBe('REJECTED');
    expect(JSON.stringify(rejected.rawResponse)).toContain('esto no es json');
    expect(rejected.validationErrors).not.toBeNull();
  });
});

describe('límites y permisos', () => {
  it('respeta el máximo de preguntas configurado', async () => {
    await prisma.systemSetting.update({
      where: { key: 'ai.max_questions_per_request' },
      data: { value: 5 },
    });

    const response = await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ ...baseRequest(), questionCount: 20 });

    expect(response.status).toBe(422);
  });

  it('no genera si la IA está desactivada', async () => {
    await prisma.systemSetting.update({ where: { key: 'ai.enabled' }, data: { value: false } });

    const response = await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send(baseRequest());

    expect(response.status).toBe(400);
  });

  it('exige al menos una competencia', async () => {
    const response = await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ ...baseRequest(), competencyIds: [] });

    expect(response.status).toBe(422);
  });

  it('un estudiante no puede generar evaluaciones', async () => {
    await createStudent({ username: 'alumno.ia' });

    const response = await request(app)
      .post('/api/ai/generate')
      .set('Authorization', `Bearer ${await tokenFor('alumno.ia')}`)
      .send(baseRequest());

    expect(response.status).toBe(403);
  });

  it('anuncia qué tipos de pregunta sabe generar', async () => {
    const response = await request(app)
      .get('/api/ai/capabilities')
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    expect(response.status).toBe(200);
    // No son los trece: un modelo de texto no puede inventar coordenadas de
    // una zona sobre una imagen que no existe.
    expect(response.body.data.supportedQuestionTypes).toContain(QUESTION_TYPE.SINGLE_CHOICE);
    expect(response.body.data.supportedQuestionTypes).toContain(QUESTION_TYPE.VIDEO_RESPONSE);
    expect(response.body.data.supportedQuestionTypes).not.toContain(QUESTION_TYPE.HOTSPOT);

    /*
     * Admitido no es lo mismo que marcado. Pedir grabaciones a un curso entero
     * es una decisión del docente, así que los tipos de captura se ofrecen
     * pero no vienen puestos.
     */
    expect(response.body.data.defaultQuestionTypes).toContain(QUESTION_TYPE.SINGLE_CHOICE);
    expect(response.body.data.defaultQuestionTypes).not.toContain(QUESTION_TYPE.VIDEO_RESPONSE);
  });
});
