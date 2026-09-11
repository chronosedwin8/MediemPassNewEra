import { ERROR_CODE, PERMISSION, hasAnyPermission, hasPermission } from '@medienpass/shared';
import type { AuthContext } from '../../types/express.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';

/**
 * Quién puede descargar un diploma.
 *
 * Tres casos y ninguno más:
 *
 *  - El propio estudiante, que es de quien habla el documento.
 *  - La administración, que puede necesitar reimprimirlo o comprobarlo.
 *  - El docente responsable: quien escribió la evaluación o quien es titular
 *    del grupo al que se asignó. Un docente cualquiera no, aunque tenga
 *    permiso de ver resultados dentro de su alcance: un diploma lleva el
 *    nombre de un menor y lo imprime quien lo firma.
 *
 * La comprobación es sobre el intento concreto, no sobre el rol: el permiso
 * dice qué clase de cosas puede hacer alguien, y esto decide si **este**
 * documento es suyo.
 */
export async function assertCanDownloadCertificate(
  auth: AuthContext,
  attemptId: string,
): Promise<void> {
  if (hasPermission(auth.permissions, [PERMISSION.RESULT_READ_ALL])) return;

  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      userId: true,
      version: { select: { assessment: { select: { createdById: true } } } },
      recipient: {
        select: { assignment: { select: { group: { select: { homeroomTeacherId: true } } } } },
      },
    },
  });

  if (!attempt) throw AppError.notFound(ERROR_CODE.ATTEMPT_NOT_FOUND, { attemptId });

  if (attempt.userId === auth.userId) return;

  const canReadOthers = hasAnyPermission(auth.permissions, [
    PERMISSION.RESULT_READ_SCOPED,
    PERMISSION.RESULT_READ_ALL,
  ]);

  const isResponsible =
    attempt.version.assessment.createdById === auth.userId ||
    attempt.recipient.assignment.group?.homeroomTeacherId === auth.userId;

  if (canReadOthers && isResponsible) return;

  /*
   * Se responde «no existe» y no «no puedes». Con un 403, quien prueba
   * identificadores al azar aprende cuáles corresponden a un intento real y
   * cuáles no, y eso ya es información sobre el alumnado del colegio.
   */
  throw AppError.notFound(ERROR_CODE.ATTEMPT_NOT_FOUND, { attemptId });
}
