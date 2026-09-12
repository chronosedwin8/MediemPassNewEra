import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AUDIT_ACTION, ERROR_CODE, USER_STATUS } from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { hashPassword } from '../../shared/security/password.js';
import { recordAudit } from '../audit/audit.service.js';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('group-passwords');

/**
 * Restablecer la contraseña de todo un grupo.
 *
 * Existe porque el curso empieza con treinta cuentas que nadie ha estrenado y
 * hacerlo de una en una es media mañana. Es una operación con alcance ancho, y
 * eso obliga a tres cosas:
 *
 *  1. **Las contraseñas se devuelven una sola vez y no se guardan.** Lo que
 *     queda en la base es el hash; ni la respuesta ni la auditoría dejan
 *     rastro del texto. Si quien lo lanzó cierra la pestaña sin copiarlas,
 *     hay que volver a lanzarlo.
 *  2. **Se obliga a cambiarla al entrar.** Una contraseña que ha pasado por
 *     una lista impresa o se ha dictado en clase no es un secreto, así que
 *     solo sirve para el primer acceso.
 *  3. **Se cierran las sesiones abiertas.** Cambiar la contraseña sin revocar
 *     los refrescos dejaría dentro a quien ya estuviera dentro, que es
 *     justamente lo que se quiere cortar si el motivo del cambio es que
 *     alguien entró donde no debía.
 */

export const resetGroupPasswordsSchema = z
  .object({
    /**
     * `individual` genera una distinta por estudiante; `shared` usa la misma
     * para todo el grupo. La segunda es cómoda para dictar en clase y tiene
     * un coste que la interfaz advierte: hasta que cada uno la cambie,
     * cualquiera del grupo puede entrar como cualquier otro.
     */
    mode: z.enum(['individual', 'shared']),
    password: z.string().min(10).max(128).optional(),
  })
  .refine((input) => input.mode !== 'shared' || Boolean(input.password), {
    message: 'Con contraseña compartida hay que indicar cuál',
    path: ['password'],
  });

export type ResetGroupPasswordsInput = z.infer<typeof resetGroupPasswordsSchema>;

export interface IssuedCredential {
  userId: string;
  username: string;
  fullName: string;
  /** Código institucional del estudiante, si lo tiene. */
  code: string | null;
  /** Texto en claro. Se devuelve una vez y no se guarda en ningún sitio. */
  password: string;
}

export interface ResetGroupPasswordsResult {
  groupId: string;
  groupCode: string;
  mode: ResetGroupPasswordsInput['mode'];
  issued: IssuedCredential[];
}

/**
 * Contraseña temporal legible.
 *
 * Se dicta en voz alta o se imprime en un listado, así que se evita el
 * alfabeto completo: sin `l`, `I`, `1`, `O` ni `0`, que son los que producen
 * la llamada de «no me deja entrar» diez minutos después.
 */
const READABLE = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generatePassword(): string {
  const bytes = randomBytes(12);
  let password = '';
  for (const byte of bytes) password += READABLE[byte % READABLE.length];
  return password;
}

export async function resetGroupPasswords(
  actorId: string,
  groupId: string,
  input: ResetGroupPasswordsInput,
): Promise<ResetGroupPasswordsResult> {
  const group = await prisma.group.findFirst({
    where: { id: groupId, deletedAt: null },
    select: { id: true, code: true },
  });
  if (!group) throw AppError.notFound(ERROR_CODE.GROUP_NOT_FOUND, { groupId });

  const members = await prisma.groupMembership.findMany({
    where: { groupId, active: true },
    select: {
      student: {
        select: {
          code: true,
          user: { select: { id: true, username: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { student: { user: { lastName: 'asc' } } },
  });

  if (members.length === 0) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'The group has no active students', { groupId });
  }

  const issued: IssuedCredential[] = [];

  for (const member of members) {
    const { user, code } = { user: member.student.user, code: member.student.code };
    const password = input.mode === 'shared' ? input.password! : generatePassword();

    /*
     * Uno a uno y no en una transacción única. Con treinta estudiantes el
     * hash de Argon2 es lo caro, y encerrarlos en una transacción la
     * mantendría abierta varios segundos bloqueando la tabla de usuarios. Si
     * algo falla a mitad, lo ya hecho vale: el resultado dice exactamente a
     * quién se le cambió.
     */
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        passwordUpdatedAt: new Date(),
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        status: USER_STATUS.ACTIVE,
      },
    });

    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    issued.push({
      userId: user.id,
      username: user.username,
      fullName: `${user.lastName}, ${user.firstName}`,
      code,
      password,
    });
  }

  /*
   * La auditoría registra que ocurrió, a cuántos y en qué modo. Nunca las
   * contraseñas: el registro lo lee gente que no tiene por qué poder entrar
   * como los estudiantes del 10.º B.
   */
  await recordAudit({
    userId: actorId,
    action: AUDIT_ACTION.UPDATE_USER,
    entityType: 'group',
    entityId: groupId,
    metadata: { groupPasswordReset: true, mode: input.mode, students: issued.length },
  });

  log.warn(
    { groupId, groupCode: group.code, mode: input.mode, students: issued.length },
    'contraseñas de grupo restablecidas',
  );

  return { groupId: group.id, groupCode: group.code, mode: input.mode, issued };
}
