import { Router } from 'express';
import { asyncHandler } from '../../shared/http/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authRateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { changePasswordSchema, loginSchema } from './auth.dto.js';
import {
  changePasswordController,
  loginController,
  logoutController,
  meController,
  refreshController,
  ssoCallbackController,
  ssoStartController,
  ssoStatusController,
} from './auth.controller.js';

export const authRouter: Router = Router();

/*
 * Entrar no se limita por IP, y es deliberado.
 *
 * El colegio entero sale a internet por una sola dirección: mil estudiantes
 * y cien docentes comparten IP. Un cupo por dirección no distingue a un
 * atacante de la clase de séptimo entrando a primera hora, y con diez
 * intentos cada cuarto de hora el centro se quedaba fuera antes del segundo
 * timbre. Nos pasó aquí mismo, con dos personas.
 *
 * Lo que de verdad frena adivinar una contraseña es el bloqueo por cuenta:
 * cinco fallos y esa cuenta queda cerrada quince minutos, sin afectar a
 * nadie más. Está en `auth.service.ts` y es independiente de la IP, que es
 * justo lo que hace falta aquí.
 *
 * El límite general —trescientas peticiones por minuto— sigue aplicando y
 * acota una inundación del endpoint.
 */
authRouter.post('/login', validate({ body: loginSchema }), asyncHandler(loginController));

authRouter.post('/refresh', asyncHandler(refreshController));
authRouter.post('/logout', asyncHandler(logoutController));
authRouter.get('/me', authenticate, asyncHandler(meController));

// Cambiar la contraseña ya exige haber entrado, así que no es una vía para
// adivinar nada. Compartía cupo con el login, y el efecto era absurdo: a
// quien se le obliga a cambiarla al entrar se le agotaba el cupo entrando, y
// la pantalla de cambio le respondía «demasiadas peticiones».
authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(changePasswordController),
);

// --- Inicio de sesión federado ------------------------------------------------
//
// Conviven con las credenciales locales: son dos formas de demostrar la misma
// identidad. El estado del proveedor es público porque la pantalla de acceso
// necesita saber si debe mostrar el botón antes de que nadie se identifique.

authRouter.get('/sso/status', ssoStatusController);

authRouter.get('/sso/entra/start', authRateLimit, asyncHandler(ssoStartController));
authRouter.get('/sso/entra/callback', asyncHandler(ssoCallbackController));
