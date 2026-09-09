import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, ok } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import {
  listPermissionCatalog,
  listRoles,
  resetRolePermissions,
  updateRolePermissions,
  updateRolePermissionsSchema,
} from './roles.service.js';

export const rolesRouter: Router = Router();

rolesRouter.use(authenticate);

const uuidParam = z.object({ id: z.string().uuid() });

/**
 * El catálogo completo de permisos, agrupado por recurso.
 *
 * Lo consume el panel de administración para pintar las casillas. Va aparte de
 * la lista de roles porque no cambia nunca en tiempo de ejecución: el catálogo
 * es de código, lo editable es qué rol tiene cuáles.
 */
rolesRouter.get(
  '/permissions',
  requirePermission(PERMISSION.USER_MANAGE_ROLES),
  asyncHandler(async (_req, res) => {
    ok(res, listPermissionCatalog());
  }),
);

rolesRouter.get(
  '/',
  requirePermission(PERMISSION.USER_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    ok(res, await listRoles(requireAuth(req).language));
  }),
);

rolesRouter.put(
  '/:id/permissions',
  requirePermission(PERMISSION.USER_MANAGE_ROLES),
  validate({ params: uuidParam, body: updateRolePermissionsSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await updateRolePermissions(requireAuth(req), req.params['id']!, req.body));
  }),
);

/** Devuelve el rol a los permisos que define el código. */
rolesRouter.post(
  '/:id/reset',
  requirePermission(PERMISSION.USER_MANAGE_ROLES),
  validate({ params: uuidParam }),
  asyncHandler(async (req, res) => {
    ok(res, await resetRolePermissions(requireAuth(req), req.params['id']!));
  }),
);
