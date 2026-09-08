import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, created, ok, paginated } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { getQuery, paginationQuery, uuidParam, validate } from '../../middleware/validate.js';
import type { PaginationQuery } from '../../middleware/validate.js';
import {
  createTeacher,
  createTeacherSchema,
  getTeacher,
  listTeachers,
  setAreasSchema,
  setSubjectsSchema,
  setTeacherAreas,
  setTeacherSubjects,
  updateTeacher,
  updateTeacherSchema,
} from './teachers.service.js';

export const teachersRouter: Router = Router();

teachersRouter.use(authenticate);

const listQuery = paginationQuery.extend({
  areaId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
});

teachersRouter.get(
  '/',
  requirePermission(PERMISSION.TEACHER_READ),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const result = await listTeachers(
      getQuery<PaginationQuery & { areaId?: string; subjectId?: string }>(req),
    );
    paginated(res, result.items, result.meta);
  }),
);

teachersRouter.post(
  '/',
  requirePermission(PERMISSION.TEACHER_CREATE),
  validate({ body: createTeacherSchema }),
  asyncHandler(async (req, res) => {
    created(res, await createTeacher(req.body, requireAuth(req).userId));
  }),
);

teachersRouter.get(
  '/:id',
  requirePermission(PERMISSION.TEACHER_READ),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await getTeacher(req.params['id']!));
  }),
);

teachersRouter.patch(
  '/:id',
  requirePermission(PERMISSION.TEACHER_UPDATE),
  validate({ params: uuidParam(), body: updateTeacherSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await updateTeacher(req.params['id']!, req.body));
  }),
);

teachersRouter.put(
  '/:id/areas',
  requirePermission(PERMISSION.TEACHER_UPDATE),
  validate({ params: uuidParam(), body: setAreasSchema }),
  asyncHandler(async (req, res) => {
    const { areaIds, primaryAreaId } = req.body as { areaIds: string[]; primaryAreaId?: string | null };
    ok(res, await setTeacherAreas(req.params['id']!, areaIds, primaryAreaId));
  }),
);

teachersRouter.put(
  '/:id/subjects',
  requirePermission(PERMISSION.TEACHER_UPDATE),
  validate({ params: uuidParam(), body: setSubjectsSchema }),
  asyncHandler(async (req, res) => {
    const { subjectIds } = req.body as { subjectIds: string[] };
    ok(res, await setTeacherSubjects(req.params['id']!, subjectIds));
  }),
);
