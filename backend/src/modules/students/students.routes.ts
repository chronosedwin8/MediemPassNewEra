import { Router } from 'express';
import { z } from 'zod';
import { ENROLLMENT_STATUS, PERMISSION } from '@medienpass/shared';
import { asyncHandler, created, ok, paginated } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { getQuery, paginationQuery, uuidParam, validate } from '../../middleware/validate.js';
import type { PaginationQuery } from '../../middleware/validate.js';
import {
  backfillInstitutionalEmails,
  createStudent,
  createStudentSchema,
  issueCredentials,
  issueCredentialsSchema,
  getStudent,
  listStudents,
  updateStudent,
  updateStudentSchema,
} from './students.service.js';

export const studentsRouter: Router = Router();

studentsRouter.use(authenticate);

const listQuery = paginationQuery.extend({
  groupId: z.string().uuid().optional(),
  /*
   * Buscar candidatos para un grupo. Una electiva reúne estudiantes de varios
   * cursos, así que armarla exige ver más allá del alumnado propio; la
   * apertura va atada a tener acceso a ese grupo concreto.
   */
  availableForGroupId: z.string().uuid().optional(),
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

/**
 * Emisión de credenciales.
 *
 * Cubre los dos momentos que importan: justo después de sincronizar, cuando
 * llegan cientos de cuentas sin contraseña, y el caso suelto de meses después.
 * Las contraseñas generadas se devuelven una sola vez y no se guardan en claro.
 */
studentsRouter.post(
  '/credentials',
  requirePermission(PERMISSION.USER_RESET_PASSWORD),
  validate({ body: issueCredentialsSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await issueCredentials(req.body, requireAuth(req).userId));
  }),
);

/**
 * Alinea los correos existentes con la regla institucional.
 *
 * `dryRun` por defecto: la llamada dice qué cambiaría sin tocar nada, y hay
 * que pedir explícitamente que se aplique. Cambiar el usuario con el que
 * entran mil estudiantes no es algo que deba ocurrir por explorar la API.
 */
studentsRouter.post(
  '/backfill-emails',
  requirePermission(PERMISSION.STUDENT_UPDATE),
  validate({ body: z.object({ apply: z.boolean().default(false) }) }),
  asyncHandler(async (req, res) => {
    const { apply } = req.body as { apply: boolean };
    ok(res, await backfillInstitutionalEmails(requireAuth(req), !apply));
  }),
);
