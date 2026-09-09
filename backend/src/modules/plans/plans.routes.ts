import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, created, noContent, ok, paginated } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { getQuery, paginationQuery, uuidParam, validate } from '../../middleware/validate.js';
import type { PaginationQuery } from '../../middleware/validate.js';
import {
  addPlanItem,
  createPlan,
  createPlanItemSchema,
  createPlanSchema,
  deletePlan,
  duplicatePlan,
  getPlan,
  getPlanCompliance,
  listPlans,
  removePlanItem,
} from './plans.service.js';

export const plansRouter: Router = Router();

plansRouter.use(authenticate);

const listQuery = paginationQuery.extend({ academicYearId: z.string().uuid().optional() });

plansRouter.get(
  '/',
  requirePermission(PERMISSION.PLAN_READ),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const result = await listPlans(requireAuth(req), getQuery<PaginationQuery>(req));
    paginated(res, result.items, result.meta);
  }),
);

plansRouter.post(
  '/',
  requirePermission(PERMISSION.PLAN_MANAGE),
  validate({ body: createPlanSchema }),
  asyncHandler(async (req, res) => {
    created(res, await createPlan(requireAuth(req), req.body));
  }),
);

plansRouter.get(
  '/:id',
  requirePermission(PERMISSION.PLAN_READ),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await getPlan(requireAuth(req), req.params['id']!));
  }),
);

// Mide lo planificado contra lo que de verdad ocurrió.
plansRouter.get(
  '/:id/compliance',
  requirePermission(PERMISSION.PLAN_READ),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await getPlanCompliance(requireAuth(req), req.params['id']!));
  }),
);

plansRouter.post(
  '/:id/items',
  requirePermission(PERMISSION.PLAN_MANAGE),
  validate({ params: uuidParam(), body: createPlanItemSchema }),
  asyncHandler(async (req, res) => {
    created(res, await addPlanItem(requireAuth(req), req.params['id']!, req.body));
  }),
);

plansRouter.delete(
  '/items/:itemId',
  requirePermission(PERMISSION.PLAN_MANAGE),
  validate({ params: uuidParam('itemId') }),
  asyncHandler(async (req, res) => {
    ok(res, await removePlanItem(requireAuth(req), req.params['itemId']!));
  }),
);

// Preparar el curso siguiente a partir del anterior.
plansRouter.post(
  '/:id/duplicate',
  requirePermission(PERMISSION.PLAN_MANAGE),
  validate({
    params: uuidParam(),
    body: z.object({ targetAcademicYearId: z.string().uuid() }),
  }),
  asyncHandler(async (req, res) => {
    const { targetAcademicYearId } = req.body as { targetAcademicYearId: string };
    created(res, await duplicatePlan(requireAuth(req), req.params['id']!, targetAcademicYearId));
  }),
);

plansRouter.delete(
  '/:id',
  requirePermission(PERMISSION.PLAN_MANAGE),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    await deletePlan(requireAuth(req), req.params['id']!);
    noContent(res);
  }),
);
