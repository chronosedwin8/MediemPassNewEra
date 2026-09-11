import {
  ATTEMPT_STATUS,
  ERROR_CODE,
  localize,
  toPercentage,
  type Language,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { resolveLevel } from '../statistics/levels.js';

/**
 * Diploma de competencias KMK.
 *
 * Certifica lo que la evaluación demostró y nada más. Eso obliga a dos
 * decisiones que condicionan todo el módulo:
 *
 *  1. **Solo se listan las competencias realmente logradas.** Una competencia
 *     en la que se sacó un 20 % no se imprime como lograda porque el intento
 *     estuviera aprobado en conjunto: el diploma dice «logró estas
 *     competencias» y sería falso. El corte es el mismo que usa la estadística
 *     —consolidado o avanzado— para que un diploma y un informe no se
 *     contradigan.
 *  2. **Nunca se emite sobre una nota provisional.** Si queda una respuesta
 *     abierta por corregir, la nota puede cambiar, y un diploma emitido sobre
 *     una cifra que luego baja es un documento que hay que retirar.
 */

export interface CertificateData {
  student: { fullName: string; code: string | null };
  assessment: { title: string; subject: string | null };
  result: {
    percentage: number;
    gradeValue: number | null;
    gradeLabel: string | null;
    submittedAt: Date;
  };
  /** Competencias que el intento demostró, con su porcentaje. */
  achieved: Array<{ code: string; name: string; percentage: number }>;
  /** Medidas pero no alcanzadas. Se cuentan, no se listan como logradas. */
  notAchievedCount: number;
  /** Referencia del documento, para poder localizarlo después. */
  serial: string;
  issuedAt: Date;
  language: Language;
}

/** Un intento certifica una competencia cuando la consolidó de verdad. */
const ACHIEVED_LEVELS = new Set(['CONSOLIDADO', 'AVANZADO']);

/**
 * Reúne lo que va impreso en el diploma.
 *
 * Separado de la generación del PDF a propósito: así las reglas de quién tiene
 * derecho a un diploma y qué dice se pueden probar sin abrir un binario.
 */
/**
 * Comprueba que este intento da derecho a diploma.
 *
 * Separado del armado del documento para que las condiciones se lean de
 * corrido y en un solo sitio: son la parte que decide si existe un diploma, y
 * repartidas entre el resto del código serían fáciles de ablandar sin querer.
 */
function assertEarned(attempt: {
  status: string;
  passed: boolean;
  requiresManualGrading: boolean;
  version: { certificateEnabled: boolean };
}): void {
  if (!attempt.version.certificateEnabled) {
    throw new AppError(
      ERROR_CODE.CERTIFICATE_NOT_ENABLED,
      'This assessment does not issue certificates',
      { status: 409 },
    );
  }

  if (attempt.status !== ATTEMPT_STATUS.GRADED || attempt.requiresManualGrading) {
    throw new AppError(ERROR_CODE.CERTIFICATE_NOT_READY, 'The attempt is not fully graded', {
      status: 409,
    });
  }

  if (!attempt.passed) {
    throw new AppError(ERROR_CODE.CERTIFICATE_NOT_EARNED, 'The attempt did not pass', {
      status: 409,
    });
  }
}

/** Reparte el resultado del intento entre las competencias que midió. */
async function evaluateCompetencies(
  attemptId: string,
  language: Language,
): Promise<Array<{ code: string; name: string; percentage: number }>> {
  const byCompetency = await prisma.attemptAnswer.groupBy({
    by: ['kmkCompetencyId'],
    where: { attemptId },
    _sum: { pointsEarned: true, pointsPossible: true },
  });

  const competencies = await prisma.kmkCompetency.findMany({
    where: { id: { in: byCompetency.map((row) => row.kmkCompetencyId) } },
    orderBy: { position: 'asc' },
    select: { id: true, code: true, name: true },
  });

  const percentageById = new Map(
    byCompetency.map((row) => [
      row.kmkCompetencyId,
      toPercentage(Number(row._sum.pointsEarned ?? 0), Number(row._sum.pointsPossible ?? 0)),
    ]),
  );

  return competencies.map((competency) => ({
    code: competency.code,
    name: localize(competency.name as never, language),
    percentage: percentageById.get(competency.id) ?? 0,
  }));
}

/**
 * Referencia impresa en el documento.
 *
 * El identificador del intento en mayúsculas y por bloques de cuatro. No es un
 * código secreto: sirve para que quien tenga el papel delante pueda pedir que
 * se localice el intento exacto que lo originó.
 */
function buildSerial(attemptId: string): string {
  return attemptId
    .replace(/-/g, '')
    .slice(0, 16)
    .toUpperCase()
    .replace(/(.{4})/g, '$1-')
    .replace(/-$/, '');
}

export async function buildCertificateData(
  attemptId: string,
  language: Language,
): Promise<CertificateData> {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      status: true,
      passed: true,
      percentage: true,
      gradeValue: true,
      gradeLabel: true,
      submittedAt: true,
      requiresManualGrading: true,
      user: { select: { firstName: true, lastName: true, student: { select: { code: true } } } },
      version: {
        select: {
          name: true,
          certificateEnabled: true,
          assessment: { select: { subject: { select: { name: true } } } },
        },
      },
    },
  });

  if (!attempt) throw AppError.notFound(ERROR_CODE.ATTEMPT_NOT_FOUND);

  assertEarned(attempt);

  const evaluated = await evaluateCompetencies(attemptId, language);
  const achieved = evaluated.filter((entry) => ACHIEVED_LEVELS.has(resolveLevel(entry.percentage)));

  if (achieved.length === 0) {
    /*
     * Aprobó el conjunto pero no consolidó ninguna competencia por separado.
     * Es posible —una nota de aprobado raspado repartida por igual— y emitir
     * un diploma sin nada que certificar sería un papel que afirma nada.
     */
    throw new AppError(ERROR_CODE.CERTIFICATE_NOT_EARNED, 'No competency reached the threshold', {
      status: 409,
    });
  }

  const submittedAt = attempt.submittedAt ?? new Date();

  return {
    student: {
      fullName: `${attempt.user.firstName} ${attempt.user.lastName}`.trim(),
      code: attempt.user.student?.code ?? null,
    },
    assessment: {
      title: attempt.version.name,
      subject: attempt.version.assessment.subject
        ? localize(attempt.version.assessment.subject.name as never, language)
        : null,
    },
    result: {
      percentage: Number(attempt.percentage),
      gradeValue: attempt.gradeValue === null ? null : Number(attempt.gradeValue),
      gradeLabel: attempt.gradeLabel ? localize(attempt.gradeLabel as never, language) : null,
      submittedAt,
    },
    achieved,
    notAchievedCount: evaluated.length - achieved.length,
    serial: buildSerial(attempt.id),
    issuedAt: new Date(),
    language,
  };
}
