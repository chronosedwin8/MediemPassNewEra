import { Router } from 'express';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler } from '../../shared/http/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { uuidParam, validate } from '../../middleware/validate.js';
import {
  createUserSchema,
  listUsersQuery,
  resetPasswordSchema,
  setRolesSchema,
  updateUserSchema,
} from './users.dto.js';
import {
  createUserController,
  deleteUserController,
  getUserController,
  listUsersController,
  resetPasswordController,
  setRolesController,
  updateUserController,
} from './users.controller.js';

export const usersRouter: Router = Router();

// Todo el módulo exige sesión. Cada ruta declara además su permiso: el
// permiso concede la capacidad, y el servicio resuelve el alcance.
usersRouter.use(authenticate);

usersRouter.get(
  '/',
  requirePermission(PERMISSION.USER_READ),
  validate({ query: listUsersQuery }),
  asyncHandler(listUsersController),
);

usersRouter.post(
  '/',
  requirePermission(PERMISSION.USER_CREATE),
  validate({ body: createUserSchema }),
  asyncHandler(createUserController),
);

usersRouter.get(
  '/:id',
  requirePermission(PERMISSION.USER_READ),
  validate({ params: uuidParam() }),
  asyncHandler(getUserController),
);

usersRouter.patch(
  '/:id',
  requirePermission(PERMISSION.USER_UPDATE),
  validate({ params: uuidParam(), body: updateUserSchema }),
  asyncHandler(updateUserController),
);

usersRouter.put(
  '/:id/roles',
  requirePermission(PERMISSION.USER_MANAGE_ROLES),
  validate({ params: uuidParam(), body: setRolesSchema }),
  asyncHandler(setRolesController),
);

usersRouter.post(
  '/:id/reset-password',
  requirePermission(PERMISSION.USER_RESET_PASSWORD),
  validate({ params: uuidParam(), body: resetPasswordSchema }),
  asyncHandler(resetPasswordController),
);

usersRouter.delete(
  '/:id',
  requirePermission(PERMISSION.USER_DELETE),
  validate({ params: uuidParam() }),
  asyncHandler(deleteUserController),
);
