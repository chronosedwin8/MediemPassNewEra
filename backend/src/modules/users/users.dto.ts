import { z } from 'zod';
import { LANGUAGE, ROLE, USER_STATUS } from '@medienpass/shared';
import { paginationQuery } from '../../middleware/validate.js';

/**
 * Contratos del módulo de usuarios.
 *
 * `email` es anulable en toda la superficie: en la matrícula real hay
 * estudiantes sin correo, y exigirlo los dejaría fuera del sistema.
 */

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9._-]+$/, 'Solo minúsculas, números, punto, guion y guion bajo');

export const createUserSchema = z.object({
  username: usernameSchema,
  email: z.string().trim().email().max(200).nullable().optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  preferredLanguage: z.enum([LANGUAGE.ES, LANGUAGE.DE, LANGUAGE.EN]).default(LANGUAGE.ES),
  roles: z.array(z.enum([ROLE.ADMIN, ROLE.TEACHER, ROLE.STUDENT])).min(1),
  /**
   * Opcional a propósito: sin contraseña la cuenta nace en
   * `PENDING_ACTIVATION`, que es el camino de quienes entran por SSO.
   */
  password: z.string().min(10).max(128).optional(),
});

export const updateUserSchema = z.object({
  email: z.string().trim().email().max(200).nullable().optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  preferredLanguage: z.enum([LANGUAGE.ES, LANGUAGE.DE, LANGUAGE.EN]).optional(),
  status: z
    .enum([
      USER_STATUS.ACTIVE,
      USER_STATUS.SUSPENDED,
      USER_STATUS.INACTIVE,
      USER_STATUS.PENDING_ACTIVATION,
    ])
    .optional(),
});

export const setRolesSchema = z.object({
  roles: z.array(z.enum([ROLE.ADMIN, ROLE.TEACHER, ROLE.STUDENT])).min(1),
});

export const resetPasswordSchema = z.object({
  /** Si se omite, el servicio genera una temporal y la devuelve una única vez. */
  password: z.string().min(10).max(128).optional(),
});

export const listUsersQuery = paginationQuery.extend({
  role: z.enum([ROLE.ADMIN, ROLE.TEACHER, ROLE.STUDENT]).optional(),
  status: z
    .enum([
      USER_STATUS.ACTIVE,
      USER_STATUS.SUSPENDED,
      USER_STATUS.INACTIVE,
      USER_STATUS.PENDING_ACTIVATION,
    ])
    .optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuery>;
