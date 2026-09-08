import { z } from 'zod';

/**
 * Contratos de entrada del módulo de autenticación.
 *
 * La política de contraseñas se aplica aquí, en un solo sitio, para que sea
 * idéntica en el alta, en el cambio y en el restablecimiento.
 */

export const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(128)
  .refine((value) => /[a-z]/.test(value), 'Debe incluir alguna minúscula')
  .refine((value) => /[A-Z]/.test(value), 'Debe incluir alguna mayúscula')
  .refine((value) => /[0-9]/.test(value), 'Debe incluir algún número');

export const loginSchema = z.object({
  /** Nombre de usuario o correo: parte de la matrícula real no tiene correo. */
  identifier: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'La nueva contraseña debe ser distinta de la actual',
    path: ['newPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
