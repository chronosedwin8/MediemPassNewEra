import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, created, noContent, ok, paginated } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { getQuery, paginationQuery, uuidParam, validate } from '../../middleware/validate.js';
import type { PaginationQuery } from '../../middleware/validate.js';
import {
  addMembers,
  createGroup,
  createGroupSchema,
  deleteGroup,
  getGroup,
  listGroups,
  listMembers,
  membershipSchema,
  removeMember,
  updateGroup,
  updateGroupSchema,
} from './groups.service.js';

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
