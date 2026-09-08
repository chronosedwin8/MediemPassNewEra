import { Router } from 'express';
import { z } from 'zod';
import { ENROLLMENT_STATUS, PERMISSION } from '@medienpass/shared';
import { asyncHandler, created, ok, paginated } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { getQuery, paginationQuery, uuidParam, validate } from '../../middleware/validate.js';
import type { PaginationQuery } from '../../middleware/validate.js';
import {
  createStudent,
  createStudentSchema,
  getStudent,
  listStudents,
  updateStudent,
  updateStudentSchema,
} from './students.service.js';

export const studentsRouter: Router = Router();

studentsRouter.use(authenticate);

const listQuery = paginationQuery.extend({
  groupId: z.string().uuid().optional(),
  gradeLevelId: z.string().uuid().optional(),
  enrollmentStatus: z
    .enum([
      ENROLLMENT_STATUS.ACTIVE,
      ENROLLMENT_STATUS.ENROLLED,
      ENROLLMENT_STATUS.ADMITTED,
      ENROLLMENT_STATUS.PENDING,
      ENROLLMENT_STATUS.SUSPENDED,
      ENROLLMENT_STATUS.WITHDRAWN,
      ENROLLMENT_STATUS.UNKNOWN,
    ])
    .optional(),
  // Atajo para el caso más frecuente: a quién se puede evaluar de verdad.
  evaluableOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

studentsRouter.get(
  '/',
  requirePermission(PERMISSION.STUDENT_READ),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const result = await listStudents(requireAuth(req), getQuery<PaginationQuery>(req));
    paginated(res, result.items, result.meta);
  }),
);

studentsRouter.post(
  '/',
  requirePermission(PERMISSION.STUDENT_CREATE),
  validate({ body: createStudentSchema }),
  asyncHandler(async (req, res) => {
    created(res, await createStudent(req.body));
  }),
);

studentsRouter.get(
  '/:id',
  requirePermission(PERMISSION.STUDENT_READ),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await getStudent(requireAuth(req), req.params['id']!));
  }),
);

studentsRouter.patch(
  '/:id',
  requirePermission(PERMISSION.STUDENT_UPDATE),
  validate({ params: uuidParam(), body: updateStudentSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await updateStudent(req.params['id']!, req.body));
  }),
);
