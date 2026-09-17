import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  ASSESSMENT_AUDIENCE,
  ASSESSMENT_PURPOSE,
  QUESTION_TYPE,
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

/**
 * Capacitación docente.
 *
 * Lo que más importa comprobar aquí es que **no hay un segundo motor**: la
 * evaluación de un módulo se responde y se califica con exactamente el mismo
 * flujo que la de un estudiante, y con la escala porcentual de docentes.
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
  adminToken: string;
  competencyId: string;
  moduleId: string;
}

async function buildFixture(): Promise<Fixture> {
  await createTeacher({ username: 'docente.capacitacion' });
  await createAdmin({ username: 'admin.capacitacion' });

  const competency = await prisma.kmkCompetency.create({
    data: {
      code: '4',
      name: trilingual('Proteger y actuar de forma segura'),
      description: trilingual('Seguridad digital'),
      color: '#059669',
      position: 4,
    },
  });

  // Escala docente: porcentaje puro, aprueba con 80 %. Es la que debe
  // aplicarse, no la escala alemana de los estudiantes.
  await prisma.gradingScale.create({
    data: {
      code: 'teacher-default',
      version: 1,
      name: trilingual('Porcentaje 0–100'),
      audience: ASSESSMENT_AUDIENCE.TEACHER,
      kind: SCALE_KIND.PERCENTAGE,
      passingPercentage: 80,
      lowerIsBetter: false,
      isActive: true,
    },
  });

  // También la de estudiantes: crear una evaluación exige que exista una
  // escala para su audiencia, porque una evaluación que no se podría
  // calificar no debería llegar a existir.
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

  const adminToken = await tokenFor('admin.capacitacion');

  const module = await request(app)
    .post('/api/training/admin/modules')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      code: 'KMK-M4',
      kmkCompetencyId: competency.id,
      title: trilingual('Proteger y actuar de forma segura'),
      description: trilingual('Módulo de seguridad digital'),
      estimatedMinutes: 45,
    });

  for (const index of [1, 2]) {
    await request(app)
      .post(`/api/training/admin/modules/${module.body.data.id}/contents`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'TEXT', title: trilingual(`Contenido ${index}`), body: trilingual('Texto') });
  }

  /*
   * El módulo nace en borrador y el profesorado solo ve lo publicado, así que
   * la fixture lo publica. No es un rodeo para que pasen las pruebas: es el
   * flujo real, y publicar aquí deja además comprobado que un módulo con
   * material se puede publicar.
   */
  await request(app)
    .post(`/api/training/admin/modules/${module.body.data.id}/publish`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);

  return {
    teacherToken: await tokenFor('docente.capacitacion'),
    adminToken,
    competencyId: competency.id,
    moduleId: module.body.data.id as string,
  };
}

/** Crea y publica la evaluación del módulo, con audiencia docente. */
async function createModuleAssessment(fixture: Fixture): Promise<string> {
  const assessment = await request(app)
    .post('/api/assessments')
    .set('Authorization', `Bearer ${fixture.teacherToken}`)
    .send({
      title: 'Evaluación KMK 4',
      audience: ASSESSMENT_AUDIENCE.TEACHER,
      purpose: ASSESSMENT_PURPOSE.TRAINING,
    });

  const versionId = assessment.body.data.versionId as string;

  // Dos preguntas de 5 puntos: acertar una da 50 %, las dos dan 100 %.
  for (const index of [1, 2]) {
    await request(app)
      .post(`/api/assessments/versions/${versionId}/questions`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({
        type: QUESTION_TYPE.SINGLE_CHOICE,
        statement: `Pregunta ${index}`,
        points: 5,
        kmkCompetencyId: fixture.competencyId,
        payload: {
          kind: QUESTION_TYPE.SINGLE_CHOICE,
          options: [
            { id: 'a', text: 'Mal', correct: false },
            { id: 'b', text: 'Bien', correct: true },
          ],
        },
      });
  }

  await request(app)
    .post(`/api/assessments/versions/${versionId}/publish`)
    .set('Authorization', `Bearer ${fixture.teacherToken}`);

  await request(app)
    .put(`/api/training/admin/modules/${fixture.moduleId}/assessment`)
    .set('Authorization', `Bearer ${fixture.adminToken}`)
    .send({ assessmentId: assessment.body.data.assessmentId });

  return assessment.body.data.assessmentId as string;
}

let fixture: Fixture;

beforeEach(async () => {
  await seedRolesAndPermissions();
  fixture = await buildFixture();
});

describe('módulos de capacitación', () => {
  it('el docente ve los módulos con su progreso', async () => {
    const response = await request(app)
      .get('/api/training/modules')
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      code: 'KMK-M4',
      contentCount: 2,
      progress: { status: 'NOT_STARTED', contentsSeen: 0 },
    });
    expect(response.body.data[0].competency.code).toBe('4');
  });

  it('registra el avance y completa el módulo al ver todo el material', async () => {
    const halfway = await request(app)
      .put(`/api/training/modules/${fixture.moduleId}/progress`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ contentsSeen: 1 });
    expect(halfway.status).toBe(204);

    let list = await request(app)
      .get('/api/training/modules')
      .set('Authorization', `Bearer ${fixture.teacherToken}`);
    expect(list.body.data[0].progress.status).toBe('IN_PROGRESS');

    await request(app)
      .put(`/api/training/modules/${fixture.moduleId}/progress`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ contentsSeen: 2 });

    list = await request(app)
      .get('/api/training/modules')
      .set('Authorization', `Bearer ${fixture.teacherToken}`);
    expect(list.body.data[0].progress.status).toBe('COMPLETED');
    expect(list.body.data[0].progress.completedAt).not.toBeNull();
  });

  it('acota el avance al número real de contenidos', async () => {
    await request(app)
      .put(`/api/training/modules/${fixture.moduleId}/progress`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ contentsSeen: 99 });

    const list = await request(app)
      .get('/api/training/modules')
      .set('Authorization', `Bearer ${fixture.teacherToken}`);
    expect(list.body.data[0].progress.contentsSeen).toBe(2);
  });

  it('un docente escribe su propia capacitación', async () => {
    const response = await request(app)
      .post('/api/training/admin/modules')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({
        code: 'KMK-M9',
        kmkCompetencyId: fixture.competencyId,
        title: trilingual('La mía'),
        description: trilingual('Escrita por un docente'),
      });

    expect(response.status).toBe(201);
  });

  it('pero no toca la de otra persona', async () => {
    const ajena = await request(app)
      .post('/api/training/admin/modules')
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({
        code: 'KMK-M10',
        kmkCompetencyId: fixture.competencyId,
        title: trilingual('De coordinación'),
        description: trilingual('No es suya'),
      });
    expect(ajena.status).toBe(201);

    /*
     * Una capacitación publicada es la palabra del colegio sobre cómo se
     * hacen las cosas: se abre la redacción al docente para lo suyo, no para
     * reescribir lo de los demás.
     */
    const intento = await request(app)
      .patch(`/api/training/admin/modules/${ajena.body.data.id}`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ title: trilingual('Secuestrada') });

    expect(intento.status).toBe(403);
  });

  it('una capacitación dirigida a otros no le aparece', async () => {
    const otro = await createTeacher({ username: 'docente.ajeno.capacitacion' });

    const dirigida = await request(app)
      .put(`/api/training/admin/modules/${fixture.moduleId}/audience`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({ mode: 'SELECTED', userIds: [otro.id] });
    expect(dirigida.status).toBe(200);

    /*
     * El porcentaje de cumplimiento es el número por el que se decide si la
     * formación funciona; contarle a cada docente formaciones que no le tocan
     * lo vuelve ruido.
     */
    const lista = await request(app)
      .get('/api/training/modules')
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    expect(lista.status).toBe(200);
    expect(lista.body.data).toHaveLength(0);

    const suya = await request(app)
      .get('/api/training/modules')
      .set('Authorization', `Bearer ${await tokenFor(otro.username)}`);
    expect(suya.body.data).toHaveLength(1);
  });
});

describe('evaluación del módulo con el motor común', () => {
  it('rechaza vincular una evaluación dirigida a estudiantes', async () => {
    // Enlazarla por error la calificaría con la escala 1.0–6.0 y aparecería
    // en las estadísticas del alumnado.
    const studentAssessment = await request(app)
      .post('/api/assessments')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ title: 'Evaluación de estudiantes' });

    const response = await request(app)
      .put(`/api/training/admin/modules/${fixture.moduleId}/assessment`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({ assessmentId: studentAssessment.body.data.assessmentId });

    expect(response.status).toBe(409);
  });

  it('el docente responde su evaluación con el mismo flujo que un estudiante', async () => {
    await createModuleAssessment(fixture);

    const prepared = await request(app)
      .post(`/api/training/modules/${fixture.moduleId}/assessment`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);
    expect(prepared.status).toBe(200);

    const attempt = await request(app)
      .post('/api/attempts')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ recipientId: prepared.body.data.recipientId });

    expect(attempt.status).toBe(201);
    expect(attempt.body.data.questions).toHaveLength(2);

    for (const question of attempt.body.data.questions) {
      await request(app)
        .put(`/api/attempts/${attempt.body.data.id}/answers/${question.id}`)
        .set('Authorization', `Bearer ${fixture.teacherToken}`)
        .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' } });
    }

    const result = await request(app)
      .post(`/api/attempts/${attempt.body.data.id}/submit`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    expect(result.body.data.percentage).toBe(100);
    expect(result.body.data.passed).toBe(true);
    // Escala porcentual: sin nota alemana ni estrellas.
    expect(result.body.data.grade).toBeNull();
    expect(result.body.data.stars).toBeNull();
  });

  it('aplica el umbral del 80 % de los docentes, no el 70 % de los estudiantes', async () => {
    await createModuleAssessment(fixture);

    const prepared = await request(app)
      .post(`/api/training/modules/${fixture.moduleId}/assessment`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    const attempt = await request(app)
      .post('/api/attempts')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ recipientId: prepared.body.data.recipientId });

    // Solo una de dos: 50 %.
    await request(app)
      .put(`/api/attempts/${attempt.body.data.id}/answers/${attempt.body.data.questions[0].id}`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' } });

    const result = await request(app)
      .post(`/api/attempts/${attempt.body.data.id}/submit`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    expect(result.body.data.percentage).toBe(50);
    expect(result.body.data.passingPercentage).toBe(80);
    expect(result.body.data.passed).toBe(false);
  });

  it('no duplica asignaciones al repetir la capacitación', async () => {
    await createModuleAssessment(fixture);

    const first = await request(app)
      .post(`/api/training/modules/${fixture.moduleId}/assessment`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);
    const second = await request(app)
      .post(`/api/training/modules/${fixture.moduleId}/assessment`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    expect(second.body.data.recipientId).toBe(first.body.data.recipientId);
    expect(await prisma.assignment.count()).toBe(1);
  });

  it('el resumen refleja el módulo certificado', async () => {
    await createModuleAssessment(fixture);

    await request(app)
      .put(`/api/training/modules/${fixture.moduleId}/progress`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ contentsSeen: 2 });

    const prepared = await request(app)
      .post(`/api/training/modules/${fixture.moduleId}/assessment`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);
    const attempt = await request(app)
      .post('/api/attempts')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ recipientId: prepared.body.data.recipientId });

    for (const question of attempt.body.data.questions) {
      await request(app)
        .put(`/api/attempts/${attempt.body.data.id}/answers/${question.id}`)
        .set('Authorization', `Bearer ${fixture.teacherToken}`)
        .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' } });
    }
    await request(app)
      .post(`/api/attempts/${attempt.body.data.id}/submit`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    const summary = await request(app)
      .get('/api/training/summary')
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    expect(summary.body.data).toMatchObject({
      totalModules: 1,
      completedModules: 1,
      certifiedModules: 1,
      completionRate: 100,
    });
    expect(summary.body.data.byCompetency[0]).toMatchObject({
      competencyCode: '4',
      assessmentPercentage: 100,
      assessmentPassed: true,
    });
  });

  it('la capacitación docente entra en el informe KMK', async () => {
    await createModuleAssessment(fixture);

    const prepared = await request(app)
      .post(`/api/training/modules/${fixture.moduleId}/assessment`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);
    const attempt = await request(app)
      .post('/api/attempts')
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ recipientId: prepared.body.data.recipientId });

    for (const question of attempt.body.data.questions) {
      await request(app)
        .put(`/api/attempts/${attempt.body.data.id}/answers/${question.id}`)
        .set('Authorization', `Bearer ${fixture.teacherToken}`)
        .send({ response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'b' } });
    }
    await request(app)
      .post(`/api/attempts/${attempt.body.data.id}/submit`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    // Es la ventaja de reutilizar el motor: la analítica por competencia sale
    // sola, sin escribir una segunda estadística para docentes.
    const report = await request(app)
      .get('/api/statistics/kmk')
      .set('Authorization', `Bearer ${fixture.adminToken}`);

    const competency4 = report.body.data.competencies.find(
      (entry: { code: string }) => entry.code === '4',
    );
    expect(competency4.percentage).toBe(100);
    expect(competency4.answerCount).toBe(2);
  });
});

describe('material que vive en otras plataformas', () => {
  it('incrusta un Genially y rechaza una dirección que no se puede incrustar', async () => {
    const bueno = await request(app)
      .post(`/api/training/admin/modules/${fixture.moduleId}/contents`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({
        type: 'EMBED',
        title: trilingual('Presentación'),
        url: 'https://view.genially.com/abc123',
      });
    expect(bueno.status).toBe(201);

    /*
     * Un incrustado que no se puede incrustar acaba siendo un enlace suelto en
     * mitad del material, y quien lo escribió se entera al verlo publicado.
     */
    const malo = await request(app)
      .post(`/api/training/admin/modules/${fixture.moduleId}/contents`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({
        type: 'EMBED',
        title: trilingual('Sitio cualquiera'),
        url: 'https://sitio-cualquiera.example/algo',
      });
    expect(malo.status).toBe(422);
  });

  it('un bloque de audio exige su dirección', async () => {
    const response = await request(app)
      .post(`/api/training/admin/modules/${fixture.moduleId}/contents`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({ type: 'AUDIO', title: trilingual('Podcast') });

    expect(response.status).toBe(422);
  });

  it('la evaluación se hace desde dentro del material', async () => {
    const assessmentId = await createModuleAssessment(fixture);

    const bloque = await request(app)
      .post(`/api/training/admin/modules/${fixture.moduleId}/contents`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({ type: 'ASSESSMENT', title: trilingual('Compruébalo'), assessmentId });
    expect(bloque.status).toBe(201);

    const inicio = await request(app)
      .post(`/api/training/modules/${fixture.moduleId}/assessment`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ assessmentId });

    expect(inicio.status).toBe(200);
    expect(inicio.body.data.recipientId).toBeTypeOf('string');
  });

  it('no admite dentro una evaluación de estudiantes', async () => {
    // La calificaría con la escala alemana y la metería en las estadísticas
    // del alumnado, que es lo contrario de lo que quería quien la puso ahí.
    const deEstudiantes = await request(app)
      .post('/api/assessments')
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({ title: 'Para el curso', audience: 'STUDENT' });

    const response = await request(app)
      .post(`/api/training/admin/modules/${fixture.moduleId}/contents`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({
        type: 'ASSESSMENT',
        title: trilingual('No vale'),
        assessmentId: deEstudiantes.body.data.assessmentId,
      });

    expect(response.status).toBe(409);
  });

  it('el identificador de una evaluación ajena al módulo no abre un intento', async () => {
    const assessmentId = await createModuleAssessment(fixture);
    // Existe y es de docentes, pero no está en el material de este módulo.

    const response = await request(app)
      .post(`/api/training/modules/${fixture.moduleId}/assessment`)
      .set('Authorization', `Bearer ${fixture.teacherToken}`)
      .send({ assessmentId });

    expect(response.status).toBe(404);
  });
});

describe('cuánto claustro se ha capacitado', () => {
  it('cuenta sobre quien la tiene asignada, no sobre todos', async () => {
    const otro = await createTeacher({ username: 'docente.no.destinatario' });

    await request(app)
      .put(`/api/training/admin/modules/${fixture.moduleId}/audience`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({ mode: 'SELECTED', userIds: [otro.id] });

    // El destinatario recorre el material entero.
    await request(app)
      .put(`/api/training/modules/${fixture.moduleId}/progress`)
      .set('Authorization', `Bearer ${await tokenFor(otro.username)}`)
      .send({ contentsSeen: 2 });

    const informe = await request(app)
      .get('/api/statistics/training/completion')
      .set('Authorization', `Bearer ${fixture.adminToken}`);

    expect(informe.status).toBe(200);
    const modulo = informe.body.data.modules[0];
    /*
     * Una formación dirigida a una persona no puede parecer un fracaso porque
     * los demás no la hicieran: el denominador son sus destinatarios.
     */
    expect(modulo.targeted).toBe(1);
    expect(modulo.completed).toBe(1);
    expect(modulo.completionRate).toBe(100);
  });

  it('un docente no ve el cumplimiento del claustro', async () => {
    const response = await request(app)
      .get('/api/statistics/training/completion')
      .set('Authorization', `Bearer ${fixture.teacherToken}`);

    expect(response.status).toBe(403);
  });
});
