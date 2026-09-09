import type { PrismaClient } from '@prisma/client';
import {
  ASSESSMENT_VERSION_STATUS,
  ASSIGNMENT_TARGET_TYPE,
  QUESTION_TYPE,
  ROLE,
  type Answer,
  type QuestionType,
} from '@medienpass/shared';
import { publishVersion } from '../../src/modules/assessments/assessments.service.js';
import { createAssignment } from '../../src/modules/assignments/assignments.service.js';
import {
  saveAnswer,
  startAttempt,
  submitAttempt,
} from '../../src/modules/attempts/assessment-engine.js';

/**
 * Actividad de demostración: evaluaciones publicadas, asignadas y resueltas.
 *
 * Sin esto, la semilla deja un sistema correcto pero mudo: las evaluaciones
 * existen en borrador, ningún estudiante tiene nada que hacer y todos los
 * paneles muestran cero. Quien abre la aplicación por primera vez no puede
 * distinguir eso de que esté rota.
 *
 * La decisión importante es **cómo** se generan los intentos: no se escriben
 * filas a mano, se llama al mismo motor que usa un estudiante real —iniciar,
 * responder, finalizar—. Fabricar los intentos con `createMany` sería más
 * rápido, pero produciría datos que el sistema nunca produciría: notas
 * calculadas de otra forma, columnas desnormalizadas a medias, estrellas que
 * no corresponden a la escala. Datos de demostración que mienten sobre el
 * comportamiento del sistema son peores que no tener datos.
 *
 * Como efecto secundario útil, cada ejecución de la semilla es una prueba de
 * humo del motor completo.
 */

/** Proporción de acierto por estudiante, para que las gráficas no sean planas. */
const PERFORMANCE_PROFILES = [0.95, 0.85, 0.8, 0.7, 0.65, 0.55, 0.45, 0.3] as const;

/**
 * Elige la respuesta a una pregunta según si toca acertar o fallar.
 *
 * Se lee la solución del propio contenido de la pregunta, que es lo que hace
 * que esto siga funcionando si mañana cambian las preguntas de la semilla.
 */
function buildAnswer(
  type: QuestionType,
  payload: Record<string, unknown>,
  correct: boolean,
): Answer | null {
  const options = (payload.options as Array<{ id: string; correct?: boolean }> | undefined) ?? [];

  switch (type) {
    case QUESTION_TYPE.SINGLE_CHOICE: {
      const right = options.find((option) => option.correct);
      const wrong = options.find((option) => !option.correct);
      const chosen = correct ? right : (wrong ?? right);
      return chosen ? { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: chosen.id } : null;
    }

    case QUESTION_TYPE.MULTIPLE_CHOICE: {
      const right = options.filter((option) => option.correct).map((option) => option.id);
      if (right.length === 0) return null;
      // Al fallar se deja una sola correcta: es el error realista, no una
      // respuesta vacía.
      return {
        kind: QUESTION_TYPE.MULTIPLE_CHOICE,
        optionIds: correct ? right : right.slice(0, 1),
      };
    }

    case QUESTION_TYPE.TRUE_FALSE: {
      const expected = payload.correct;
      if (typeof expected !== 'boolean') return null;
      return { kind: QUESTION_TYPE.TRUE_FALSE, value: correct ? expected : !expected };
    }

    case QUESTION_TYPE.SHORT_ANSWER: {
      const accepted = (payload.acceptedAnswers as string[] | undefined) ?? [];
      const first = accepted[0];
      if (!first) return null;
      return { kind: QUESTION_TYPE.SHORT_ANSWER, text: correct ? first : 'No lo recuerdo' };
    }

    case QUESTION_TYPE.ORDERING: {
      const items =
        (payload.items as Array<{ id: string; correctPosition: number }> | undefined) ?? [];
      if (items.length < 2) return null;
      const ordered = [...items]
        .sort((a, b) => a.correctPosition - b.correctPosition)
        .map((i) => i.id);
      if (correct) return { kind: QUESTION_TYPE.ORDERING, order: ordered };
      // Se intercambian los dos primeros: falla, pero de forma plausible.
      const [first, second, ...rest] = ordered;
      return { kind: QUESTION_TYPE.ORDERING, order: [second!, first!, ...rest] };
    }

    case QUESTION_TYPE.FILL_BLANK: {
      const blanks =
        (payload.blanks as Array<{ id: string; acceptedAnswers: string[] }> | undefined) ?? [];
      if (blanks.length === 0) return null;
      return {
        kind: QUESTION_TYPE.FILL_BLANK,
        blanks: blanks.map((blank) => ({
          id: blank.id,
          text: correct ? (blank.acceptedAnswers[0] ?? '') : 'no sé',
        })),
      };
    }

    case QUESTION_TYPE.MATCHING: {
      const pairs = (payload.pairs as Array<{ leftId: string; rightId: string }> | undefined) ?? [];
      if (pairs.length < 2) return null;
      if (correct) return { kind: QUESTION_TYPE.MATCHING, pairs };
      // Se cruzan las dos primeras parejas: error parcial, que es lo que
      // ejercita la puntuación parcial de este tipo.
      const [a, b, ...rest] = pairs;
      return {
        kind: QUESTION_TYPE.MATCHING,
        pairs: [
          { leftId: a!.leftId, rightId: b!.rightId },
          { leftId: b!.leftId, rightId: a!.rightId },
          ...rest,
        ],
      };
    }

    case QUESTION_TYPE.GROUPING: {
      const items = (payload.items as Array<{ id: string; groupId: string }> | undefined) ?? [];
      const groups = (payload.groups as Array<{ id: string }> | undefined) ?? [];
      if (items.length === 0 || groups.length < 2) return null;
      return {
        kind: QUESTION_TYPE.GROUPING,
        assignments: items.map((item, index) => ({
          itemId: item.id,
          // Al fallar, el primer elemento va al grupo equivocado y el resto no.
          groupId:
            correct || index > 0
              ? item.groupId
              : (groups.find((group) => group.id !== item.groupId)?.id ?? item.groupId),
        })),
      };
    }

    case QUESTION_TYPE.OPEN_TEXT:
    case QUESTION_TYPE.LONG_ANSWER:
      // Quedan pendientes de corrección: es justamente el estado que la
      // bandeja del docente necesita mostrar.
      return {
        kind: type,
        text: 'Uso buscadores académicos y contrasto al menos dos fuentes antes de dar algo por cierto.',
      } as Answer;

    default:
      // El resto de tipos no aparece en las evaluaciones de demostración.
      return null;
  }
}

/** Reparte a los estudiantes de un grupo en perfiles de desempeño estables. */
function profileFor(index: number): number {
  return PERFORMANCE_PROFILES[index % PERFORMANCE_PROFILES.length]!;
}

export async function seedDemoActivity(prisma: PrismaClient): Promise<void> {
  /*
   * Se toman borradores y versiones ya publicadas. Reejecutar la semilla no
   * debe ser un no-op silencioso: la primera pasada publica y la segunda
   * encuentra publicado lo que ella misma dejó así.
   */
  const drafts = await prisma.assessmentVersion.findMany({
    where: {
      status: { in: [ASSESSMENT_VERSION_STATUS.DRAFT, ASSESSMENT_VERSION_STATUS.PUBLISHED] },
      assessment: { deletedAt: null },
      assignments: { none: {} },
    },
    include: {
      assessment: {
        select: { id: true, title: true, createdById: true, gradeLevelId: true, audience: true },
      },
      _count: { select: { questions: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (drafts.length === 0) {
    console.warn('  demo: no hay evaluaciones sin asignar; se omite la actividad');
    return;
  }

  let assignmentCount = 0;
  let attemptCount = 0;

  for (const version of drafts) {
    if (version._count.questions === 0) continue;

    const teacherId = version.assessment.createdById;
    const teacher = { userId: teacherId, roles: [ROLE.TEACHER] };

    if (version.status === ASSESSMENT_VERSION_STATUS.DRAFT) {
      await publishVersion(teacher, version.id);
    }

    // El grupo destino es uno del mismo grado que la evaluación: asignarla a
    // un curso que no la va a entender no representa nada real.
    const group = await prisma.group.findFirst({
      where: {
        gradeLevelId: version.assessment.gradeLevelId ?? undefined,
        active: true,
        memberships: { some: { active: true } },
      },
      orderBy: { code: 'asc' },
    });
    if (!group) continue;

    /*
     * El docente tiene que dirigir el curso al que asigna.
     *
     * No es un rodeo para saltarse una comprobación: es que la semilla creaba
     * grupos sin director, y sin director **ningún** docente puede asignar
     * nada, de modo que el sistema quedaba correcto pero inutilizable en
     * cuanto alguien intentaba usarlo. Se nombra al autor de la evaluación
     * director del curso, que además es lo que permite comprobar de verdad
     * las reglas de alcance: cada docente ve lo suyo y no lo de los demás.
     */
    if (group.homeroomTeacherId !== teacherId) {
      await prisma.group.update({
        where: { id: group.id },
        data: { homeroomTeacherId: teacherId },
      });
    }

    const startAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const assignment = await createAssignment(teacher, {
      assessmentVersionId: version.id,
      targetType: ASSIGNMENT_TARGET_TYPE.GROUP,
      groupId: group.id,
      startAt,
      endAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
      attemptsAllowed: 2,
      timeLimitMinutes: null,
    });
    assignmentCount += 1;

    const recipients = await prisma.assignmentRecipient.findMany({
      where: { assignmentId: assignment.id },
      select: { id: true, userId: true },
      orderBy: { id: 'asc' },
    });

    const questions = await prisma.question.findMany({
      where: { assessmentVersionId: version.id },
      select: { id: true, type: true, payload: true },
      orderBy: { position: 'asc' },
    });

    /*
     * Solo responde una parte del grupo. Un curso donde el 100 % ha entregado
     * es tan poco realista como uno donde nadie lo ha hecho, y deja sin
     * probar los estados «pendiente» y «en curso» de las pantallas.
     */
    const answering = recipients.slice(0, Math.ceil(recipients.length * 0.7));

    for (const [index, recipient] of answering.entries()) {
      const accuracy = profileFor(index);

      const attempt = await startAttempt(recipient.userId, recipient.id);

      for (const [position, question] of questions.entries()) {
        // Determinista a propósito: dos ejecuciones de la semilla producen
        // las mismas cifras, y una diferencia en un panel significa un
        // cambio real de comportamiento, no azar.
        const shouldBeCorrect = (position + 1) / questions.length <= accuracy;
        const answer = buildAnswer(
          question.type as QuestionType,
          question.payload as Record<string, unknown>,
          shouldBeCorrect,
        );
        if (answer) await saveAnswer(recipient.userId, attempt.id, question.id, answer);
      }

      // Uno de cada seis se queda a medias: es el estado que hay que poder ver
      // en la pantalla del docente.
      if (index % 6 !== 5) {
        await submitAttempt(recipient.userId, attempt.id);
      }
      attemptCount += 1;
    }
  }

  console.warn(
    `  demo: ${assignmentCount} asignaciones · ${attemptCount} intentos generados con el motor real`,
  );
}
