import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, created, noContent, ok, paginated } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { getQuery, paginationQuery, uuidParam, validate } from '../../middleware/validate.js';
import type { PaginationQuery } from '../../middleware/validate.js';
import {
  cancelAssignment,
  createAssignment,
  createAssignmentSchema,
  listAssignments,
  listRecipients,
  syncGroupRecipients,
} from './assignments.service.js';

export const assignmentsRouter: Router = Router();

assignmentsRouter.use(authenticate);

const listQuery = paginationQuery.extend({
  groupId: z.string().uuid().optional(),
  assessmentId: z.string().uuid().optional(),
});

assignmentsRouter.get(
  '/',
  requirePermission(PERMISSION.ASSESSMENT_ASSIGN),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const result = await listAssignments(requireAuth(req), getQuery<PaginationQuery>(req));
    paginated(res, result.items, result.meta);
  }),
);

assignmentsRouter.post(
  '/',
  requirePermission(PERMISSION.ASSESSMENT_ASSIGN),
  validate({ body: createAssignmentSchema }),
  asyncHandler(async (req, res) => {
    created(res, await createAssignment(requireAuth(req), req.body));
  }),
);

// Seguimiento individual: quién terminó, quién va por dónde.
assignmentsRouter.get(
  '/:id/recipients',
  requirePermission(PERMISSION.ASSESSMENT_ASSIGN),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await listRecipients(requireAuth(req), req.params['id']!));
  }),
);

// Incorpora a quien entró al grupo después de asignar.
assignmentsRouter.post(
  '/:id/sync-recipients',
  requirePermission(PERMISSION.ASSESSMENT_ASSIGN),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await syncGroupRecipients(requireAuth(req), req.params['id']!));
  }),
);

assignmentsRouter.delete(
  '/:id',
  requirePermission(PERMISSION.ASSESSMENT_ASSIGN),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    await cancelAssignment(requireAuth(req), req.params['id']!);
    noContent(res);
  }),
);
