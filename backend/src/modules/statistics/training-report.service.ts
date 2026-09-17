import { ASSESSMENT_AUDIENCE, TRAINING_AUDIENCE_MODE, toPercentage } from '@medienpass/shared';
import type { LocalizedText } from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { buildAttemptFilter, type StatisticsActor, type StatisticsFilters } from './filters.js';

/**
 * Dos preguntas que la dirección hace siempre, y que no tenían respuesta.
 *
 * La primera es cuánto claustro ha hecho cada capacitación. El resumen que ya
 * existía respondía por una persona —«cómo voy yo»—, y para saber cómo va el
 * colegio había que abrirlo docente a docente.
 *
 * La segunda es cuántos estudiantes aprobaron cada evaluación. El informe por
 * competencia dice en qué se falla, que es otra cosa: un curso puede ir bien
 * en todas las competencias y aun así tener media clase suspendida, porque
 * aprobar depende del conjunto y no de cada parte.
 *
 * Las dos se calculan agregando en la base y no trayendo filas: con mil
 * doscientos matriculados, contar en memoria significa mover el año entero a
 * la aplicación cada vez que alguien abre el panel.
 */

export interface ModuleCompletion {
  moduleId: string;
  code: string;
  title: LocalizedText;
  competency: { code: string; name: LocalizedText };
  /** A cuánta gente le toca: el claustro entero, o los elegidos. */
  targeted: number;
  started: number;
  completed: number;
  /** Cuántos aprobaron su evaluación, cuando el módulo tiene una. */
  certified: number;
  completionRate: number;
}

export interface TrainingCompletionReport {
  teacherCount: number;
  modules: ModuleCompletion[];
  /** Porcentaje medio de cumplimiento sobre todos los módulos publicados. */
  overallRate: number;
  /** Quién va al día y quién no, para poder hablar con alguien en concreto. */
  teachers: Array<{
    userId: string;
    firstName: string;
    lastName: string;
    targeted: number;
    completed: number;
    completionRate: number;
  }>;
}

const STAFF_ROLES = ['TEACHER', 'COORDINATOR'];

/**
 * El claustro que cuenta para el porcentaje.
 *
 * Docentes y coordinación, sin cuentas dadas de baja. Se excluye a
 * administración: una cuenta técnica que nunca va a hacer la formación
 * hundiría el porcentaje sin que eso signifique nada.
 */
async function listStaff() {
  return prisma.user.findMany({
    where: {
      deletedAt: null,
      status: { not: 'INACTIVE' },
      roles: { some: { role: { code: { in: STAFF_ROLES } } } },
    },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
}

export async function getTrainingCompletion(): Promise<TrainingCompletionReport> {
  const [staff, modules] = await Promise.all([
    listStaff(),
    prisma.trainingModule.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        code: true,
        title: true,
        assessmentId: true,
        audienceMode: true,
        kmkCompetency: { select: { code: true, name: true } },
        audience: { select: { userId: true } },
        progress: { select: { userId: true, status: true } },
      },
    }),
  ]);

  const staffIds = new Set(staff.map((persona) => persona.id));
  const aprobados = await passedByModule(modules);

  const porPersona = new Map(staff.map((persona) => [persona.id, { targeted: 0, completed: 0 }]));

  const filas = modules.map((module) => {
    // A quién le toca: el claustro entero, o los nombrados que sigan activos.
    const destinatarios =
      module.audienceMode === TRAINING_AUDIENCE_MODE.ALL
        ? [...staffIds]
        : module.audience.map((fila) => fila.userId).filter((id) => staffIds.has(id));

    const destino = new Set(destinatarios);
    const avance = module.progress.filter((fila) => destino.has(fila.userId));
    const completados = avance.filter((fila) => fila.status === 'COMPLETED');

    for (const userId of destinatarios) {
      const cuenta = porPersona.get(userId);
      if (cuenta) cuenta.targeted += 1;
    }
    for (const fila of completados) {
      const cuenta = porPersona.get(fila.userId);
      if (cuenta) cuenta.completed += 1;
    }

    return {
      moduleId: module.id,
      code: module.code,
      title: module.title as LocalizedText,
      competency: {
        code: module.kmkCompetency.code,
        name: module.kmkCompetency.name as LocalizedText,
      },
      targeted: destinatarios.length,
      started: avance.filter((fila) => fila.status !== 'NOT_STARTED').length,
      completed: completados.length,
      certified: (aprobados.get(module.id) ?? new Set<string>()).size,
      completionRate:
        destinatarios.length > 0 ? toPercentage(completados.length, destinatarios.length) : 0,
    };
  });

  const conDestino = filas.filter((fila) => fila.targeted > 0);
  const totalDestinos = conDestino.reduce((suma, fila) => suma + fila.targeted, 0);
  const totalHechos = conDestino.reduce((suma, fila) => suma + fila.completed, 0);

  return {
    teacherCount: staff.length,
    modules: filas,
    overallRate: totalDestinos > 0 ? toPercentage(totalHechos, totalDestinos) : 0,
    teachers: staff.map((persona) => {
      const cuenta = porPersona.get(persona.id) ?? { targeted: 0, completed: 0 };
      return {
        userId: persona.id,
        firstName: persona.firstName,
        lastName: persona.lastName,
        targeted: cuenta.targeted,
        completed: cuenta.completed,
        completionRate:
          cuenta.targeted > 0 ? toPercentage(cuenta.completed, cuenta.targeted) : 0,
      };
    }),
  };
}

/**
 * Quién aprobó la evaluación de cada módulo.
 *
 * Se cuenta por persona y no por intento: la capacitación se puede repetir, y
 * quien aprueba al tercer intento ha aprobado una vez, no tres.
 */
async function passedByModule(
  modules: Array<{ id: string; assessmentId: string | null }>,
): Promise<Map<string, Set<string>>> {
  const conEvaluacion = modules.filter((module) => module.assessmentId !== null);
  if (conEvaluacion.length === 0) return new Map();

  const intentos = await prisma.assessmentAttempt.findMany({
    where: {
      passed: true,
      version: { assessmentId: { in: conEvaluacion.map((module) => module.assessmentId!) } },
    },
    select: { userId: true, version: { select: { assessmentId: true } } },
  });

  const porEvaluacion = new Map<string, Set<string>>();
  for (const intento of intentos) {
    const clave = intento.version.assessmentId;
    if (!porEvaluacion.has(clave)) porEvaluacion.set(clave, new Set());
    porEvaluacion.get(clave)!.add(intento.userId);
  }

  return new Map(
    conEvaluacion.map((module) => [
      module.id,
      porEvaluacion.get(module.assessmentId!) ?? new Set<string>(),
    ]),
  );
}

export interface AssessmentPassRate {
  assessmentId: string;
  title: string;
  subject: string | null;
  period: string | null;
  /** Personas distintas con resultado, no intentos. */
  students: number;
  passed: number;
  passRate: number;
  averagePercentage: number;
}

/**
 * Cuántos aprobaron cada evaluación.
 *
 * Se mide por persona: con dos intentos permitidos, contar intentos haría que
 * quien aprueba a la segunda apareciera como medio aprobado. Vale el mejor
 * resultado de cada uno, que es también el criterio con el que se le pone la
 * nota.
 */
export async function getAssessmentPassRates(
  actor: StatisticsActor,
  filters: StatisticsFilters,
): Promise<AssessmentPassRate[]> {
  const intentos = await prisma.assessmentAttempt.findMany({
    where: buildAttemptFilter(actor, filters),
    select: {
      userId: true,
      passed: true,
      percentage: true,
      version: {
        select: {
          assessment: {
            select: {
              id: true,
              title: true,
              audience: true,
              subject: { select: { code: true } },
              academicPeriod: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  interface Acumulado {
    title: string;
    subject: string | null;
    period: string | null;
    mejorPorPersona: Map<string, { passed: boolean; percentage: number }>;
  }

  const porEvaluacion = new Map<string, Acumulado>();

  for (const intento of intentos) {
    const evaluacion = intento.version.assessment;
    // La capacitación docente tiene su propio informe: mezclarla aquí
    // desplazaría el porcentaje del alumnado sin que se note por qué.
    if (evaluacion.audience !== ASSESSMENT_AUDIENCE.STUDENT) continue;

    if (!porEvaluacion.has(evaluacion.id)) {
      porEvaluacion.set(evaluacion.id, {
        title: evaluacion.title,
        subject: evaluacion.subject?.code ?? null,
        period: evaluacion.academicPeriod?.name ?? null,
        mejorPorPersona: new Map(),
      });
    }

    const acumulado = porEvaluacion.get(evaluacion.id)!;
    const porcentaje = Number(intento.percentage ?? 0);
    const previo = acumulado.mejorPorPersona.get(intento.userId);

    if (!previo || porcentaje > previo.percentage) {
      acumulado.mejorPorPersona.set(intento.userId, {
        passed: intento.passed === true,
        percentage: porcentaje,
      });
    }
  }

  return [...porEvaluacion.entries()]
    .map(([assessmentId, acumulado]) => {
      const resultados = [...acumulado.mejorPorPersona.values()];
      const aprobados = resultados.filter((fila) => fila.passed).length;
      const suma = resultados.reduce((total, fila) => total + fila.percentage, 0);

      return {
        assessmentId,
        title: acumulado.title,
        subject: acumulado.subject,
        period: acumulado.period,
        students: resultados.length,
        passed: aprobados,
        passRate: resultados.length > 0 ? toPercentage(aprobados, resultados.length) : 0,
        averagePercentage:
          resultados.length > 0 ? Math.round((suma / resultados.length) * 100) / 100 : 0,
      };
    })
    .sort((a, b) => a.passRate - b.passRate);
}
