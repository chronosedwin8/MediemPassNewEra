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
} from './auth.controller.js';

export const authRouter: Router = Router();

// El límite estricto cubre login y cambio de contraseña, que son las dos
// rutas donde probar repetidamente tiene sentido para un atacante.
authRouter.post(
  '/login',
  authRateLimit,
  validate({ body: loginSchema }),
  asyncHandler(loginController),
);

authRouter.post('/refresh', asyncHandler(refreshController));
authRouter.post('/logout', asyncHandler(logoutController));
authRouter.get('/me', authenticate, asyncHandler(meController));

authRouter.post(
  '/change-password',
  authRateLimit,
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(changePasswordController),
);
