import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, created, noContent, ok, paginated } from '../../shared/http/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { getQuery, paginationQuery, uuidParam, validate } from '../../middleware/validate.js';
import type { PaginationQuery } from '../../middleware/validate.js';
import {
  createArea,
  createAreaSchema,
  createSubject,
  createSubjectSchema,
  deleteArea,
  deleteSubject,
  listAreas,
  listSubjects,
  updateArea,
  updateAreaSchema,
  updateSubject,
  updateSubjectSchema,
} from './catalog.service.js';
import {
  createPeriod,
  createPeriodSchema,
  createYear,
  createYearSchema,
  getCurrentYear,
  listGradeLevels,
  listYears,
} from './calendar.service.js';

/**
 * Rutas del dominio académico.
 *
 * Lectura abierta a cualquier rol con el permiso correspondiente —un docente
 * necesita ver áreas y materias para crear evaluaciones—, escritura reservada
 * a quien tenga el permiso de gestión, que por defecto solo tiene el
 * administrador.
 */

export const areasRouter: Router = Router();
export const subjectsRouter: Router = Router();
export const calendarRouter: Router = Router();

areasRouter.use(authenticate);
subjectsRouter.use(authenticate);
calendarRouter.use(authenticate);

// --- Áreas -------------------------------------------------------------------

areasRouter.get(
  '/',
  requirePermission(PERMISSION.AREA_READ),
  validate({ query: paginationQuery }),
  asyncHandler(async (req, res) => {
    const result = await listAreas(getQuery<PaginationQuery>(req));
    paginated(res, result.items, result.meta);
  }),
);

areasRouter.post(
  '/',
  requirePermission(PERMISSION.AREA_MANAGE),
  validate({ body: createAreaSchema }),
  asyncHandler(async (req, res) => {
    created(res, await createArea(req.body));
  }),
);

areasRouter.patch(
  '/:id',
  requirePermission(PERMISSION.AREA_MANAGE),
  validate({ params: uuidParam(), body: updateAreaSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await updateArea(req.params['id']!, req.body));
  }),
);

areasRouter.delete(
  '/:id',
  requirePermission(PERMISSION.AREA_MANAGE),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    await deleteArea(req.params['id']!);
    noContent(res);
  }),
);

// --- Materias ----------------------------------------------------------------

const listSubjectsQuery = paginationQuery.extend({ areaId: z.string().uuid().optional() });

subjectsRouter.get(
  '/',
  requirePermission(PERMISSION.SUBJECT_READ),
  validate({ query: listSubjectsQuery }),
  asyncHandler(async (req, res) => {
    const result = await listSubjects(getQuery<PaginationQuery & { areaId?: string }>(req));
    paginated(res, result.items, result.meta);
  }),
);

subjectsRouter.post(
  '/',
  requirePermission(PERMISSION.SUBJECT_MANAGE),
  validate({ body: createSubjectSchema }),
  asyncHandler(async (req, res) => {
    created(res, await createSubject(req.body));
  }),
);

subjectsRouter.patch(
  '/:id',
  requirePermission(PERMISSION.SUBJECT_MANAGE),
  validate({ params: uuidParam(), body: updateSubjectSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await updateSubject(req.params['id']!, req.body));
  }),
);

subjectsRouter.delete(
  '/:id',
  requirePermission(PERMISSION.SUBJECT_MANAGE),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    await deleteSubject(req.params['id']!);
    noContent(res);
  }),
);

// --- Calendario --------------------------------------------------------------

calendarRouter.get(
  '/years',
  requirePermission(PERMISSION.ACADEMIC_YEAR_READ),
  asyncHandler(async (_req, res) => {
    ok(res, await listYears());
  }),
);

calendarRouter.get(
  '/years/current',
  requirePermission(PERMISSION.ACADEMIC_YEAR_READ),
  asyncHandler(async (_req, res) => {
    ok(res, await getCurrentYear());
  }),
);

calendarRouter.post(
  '/years',
  requirePermission(PERMISSION.ACADEMIC_YEAR_MANAGE),
  validate({ body: createYearSchema }),
  asyncHandler(async (req, res) => {
    created(res, await createYear(req.body));
  }),
);

calendarRouter.post(
  '/periods',
  requirePermission(PERMISSION.ACADEMIC_YEAR_MANAGE),
  validate({ body: createPeriodSchema }),
  asyncHandler(async (req, res) => {
    created(res, await createPeriod(req.body));
  }),
);

calendarRouter.get(
  '/grade-levels',
  requirePermission(PERMISSION.ACADEMIC_YEAR_READ),
  asyncHandler(async (_req, res) => {
    ok(res, await listGradeLevels());
  }),
);
