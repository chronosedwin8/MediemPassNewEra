import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, created, noContent, ok, paginated } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { getQuery, paginationQuery, uuidParam, validate } from '../../middleware/validate.js';
import type { PaginationQuery } from '../../middleware/validate.js';
import {
  addMembers,
  createGroup,
  createGroupSchema,
  deleteGroup,
  getGroup,
  listGroupCatalog,
  listGroups,
  assertGroupAccess,
  listMembers,
  membershipSchema,
  removeMember,
  setTeachingStaff,
  teachingStaffSchema,
  updateGroup,
  updateGroupSchema,
} from './groups.service.js';
import { resetGroupPasswords, resetGroupPasswordsSchema } from './group-passwords.service.js';

export const groupsRouter: Router = Router();

groupsRouter.use(authenticate);

const listQuery = paginationQuery.extend({
  academicYearId: z.string().uuid().optional(),
  gradeLevelId: z.string().uuid().optional(),
});

groupsRouter.get(
  '/',
  requirePermission(PERMISSION.GROUP_READ),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const result = await listGroups(
      auth,
      getQuery<PaginationQuery & { academicYearId?: string; gradeLevelId?: string }>(req),
    );
    paginated(res, result.items, result.meta);
  }),
);

groupsRouter.post(
  '/',
  requirePermission(PERMISSION.GROUP_CREATE),
  validate({ body: createGroupSchema }),
  asyncHandler(async (req, res) => {
    created(res, await createGroup(requireAuth(req), req.body));
  }),
);

/** Grupos del año sin datos personales, para filtrar al armar un grupo mixto. */
groupsRouter.get(
  '/catalog',
  requirePermission(PERMISSION.GROUP_READ),
  asyncHandler(async (_req, res) => {
    ok(res, await listGroupCatalog());
  }),
);

groupsRouter.get(
  '/:id',
  requirePermission(PERMISSION.GROUP_READ),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await getGroup(requireAuth(req), req.params['id']!));
  }),
);

groupsRouter.patch(
  '/:id',
  requirePermission(PERMISSION.GROUP_UPDATE),
  validate({ params: uuidParam(), body: updateGroupSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await updateGroup(requireAuth(req), req.params['id']!, req.body));
  }),
);

groupsRouter.delete(
  '/:id',
  requirePermission(PERMISSION.GROUP_DELETE),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    await deleteGroup(requireAuth(req), req.params['id']!);
    noContent(res);
  }),
);

// --- Miembros ----------------------------------------------------------------

groupsRouter.get(
  '/:id/members',
  requirePermission(PERMISSION.GROUP_READ),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await listMembers(requireAuth(req), req.params['id']!));
  }),
);

groupsRouter.post(
  '/:id/members',
  requirePermission(PERMISSION.GROUP_MANAGE_MEMBERS),
  validate({ params: uuidParam(), body: membershipSchema }),
  asyncHandler(async (req, res) => {
    const { studentIds } = req.body as { studentIds: string[] };
    ok(res, await addMembers(requireAuth(req), req.params['id']!, studentIds));
  }),
);

/**
 * Restablece la contraseña de todos los estudiantes del grupo.
 *
 * Solo administración: es la operación más ancha de la plataforma y devuelve
 * credenciales en claro. Las contraseñas viajan una única vez en la respuesta
 * y no quedan en ningún registro; quien la lanza tiene que copiarlas antes de
 * cerrar la pantalla.
 */
/** Quién da clase aquí. Es lo que decide qué grupos ve cada docente. */
groupsRouter.put(
  '/:id/teachers',
  requirePermission(PERMISSION.GROUP_UPDATE),
  validate({ params: uuidParam(), body: teachingStaffSchema }),
  asyncHandler(async (req, res) => {
    await setTeachingStaff(requireAuth(req), req.params['id']!, req.body);
    noContent(res);
  }),
);

/*
 * Contraseñas de un grupo entero.
 *
 * Antes exigía `user:reset_password`, que alcanza cualquier cuenta y es de
 * administración, así que un docente no podía ayudar a su propio curso el día
 * que medio grupo olvidó la contraseña. Ahora basta `student:reset_password`,
 * y el alcance lo pone `assertGroupAccess`: solo los grupos propios.
 */
groupsRouter.post(
  '/:id/reset-student-passwords',
  requireAnyPermission(PERMISSION.USER_RESET_PASSWORD, PERMISSION.STUDENT_RESET_PASSWORD),
  validate({ params: uuidParam(), body: resetGroupPasswordsSchema }),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    await assertGroupAccess(auth, req.params['id']!);
    ok(res, await resetGroupPasswords(auth.userId, req.params['id']!, req.body));
  }),
);

groupsRouter.delete(
  '/:id/members/:studentId',
  requirePermission(PERMISSION.GROUP_MANAGE_MEMBERS),
  validate({
    params: z.object({ id: z.string().uuid(), studentId: z.string().uuid() }),
  }),
  asyncHandler(async (req, res) => {
    await removeMember(requireAuth(req), req.params['id']!, req.params['studentId']!);
    noContent(res);
  }),
);
