import { Router } from 'express';
import { z } from 'zod';
import {
  ASSESSMENT_AUDIENCE,
  ASSESSMENT_VERSION_STATUS,
  PERMISSION,
  hasPermission,
} from '@medienpass/shared';
import { asyncHandler, created, noContent, ok, paginated } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { getQuery, paginationQuery, uuidParam, validate } from '../../middleware/validate.js';
import type { PaginationQuery } from '../../middleware/validate.js';
import {
  archiveVersion,
  createAssessment,
  createAssessmentSchema,
  createNewVersion,
  deleteAssessment,
  getAssessment,
  listAssessments,
  publishVersion,
  updateVersion,
  updateVersionSchema,
} from './assessments.service.js';
import {
  createQuestion,
  createQuestionSchema,
  deleteQuestion,
  listQuestions,
  reorderQuestions,
  reorderSchema,
  updateQuestion,
  updateQuestionSchema,
} from './questions.service.js';

export const assessmentsRouter: Router = Router();

assessmentsRouter.use(authenticate);

const listQuery = paginationQuery.extend({
  audience: z.enum([ASSESSMENT_AUDIENCE.STUDENT, ASSESSMENT_AUDIENCE.TEACHER]).optional(),
  subjectId: z.string().uuid().optional(),
  status: z
    .enum([
      ASSESSMENT_VERSION_STATUS.DRAFT,
      ASSESSMENT_VERSION_STATUS.PUBLISHED,
      ASSESSMENT_VERSION_STATUS.ARCHIVED,
    ])
    .optional(),
});

assessmentsRouter.get(
  '/',
  requirePermission(PERMISSION.ASSESSMENT_READ),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    // Quien tiene `assessment:read_all` ve las de todos; el resto, las suyas.
    const canReadAll = hasPermission(auth.permissions, PERMISSION.ASSESSMENT_READ_ALL);
    const result = await listAssessments(auth, canReadAll, getQuery<PaginationQuery>(req));
    paginated(res, result.items, result.meta);
  }),
);

assessmentsRouter.post(
  '/',
  requirePermission(PERMISSION.ASSESSMENT_CREATE),
  validate({ body: createAssessmentSchema }),
  asyncHandler(async (req, res) => {
    created(res, await createAssessment(requireAuth(req), req.body));
  }),
);

assessmentsRouter.get(
  '/:id',
  requirePermission(PERMISSION.ASSESSMENT_READ),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const canReadAll = hasPermission(auth.permissions, PERMISSION.ASSESSMENT_READ_ALL);
    ok(res, await getAssessment(auth, canReadAll, req.params['id']!));
  }),
);

assessmentsRouter.delete(
  '/:id',
  requirePermission(PERMISSION.ASSESSMENT_DELETE),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    await deleteAssessment(requireAuth(req), req.params['id']!);
    noContent(res);
  }),
);

// --- Versiones ---------------------------------------------------------------

assessmentsRouter.post(
  '/:id/versions',
  requirePermission(PERMISSION.ASSESSMENT_UPDATE),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    created(res, await createNewVersion(requireAuth(req), req.params['id']!));
  }),
);

assessmentsRouter.patch(
  '/versions/:versionId',
  requirePermission(PERMISSION.ASSESSMENT_UPDATE),
  validate({ params: uuidParam('versionId'), body: updateVersionSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await updateVersion(requireAuth(req), req.params['versionId']!, req.body));
  }),
);

assessmentsRouter.post(
  '/versions/:versionId/publish',
  requirePermission(PERMISSION.ASSESSMENT_PUBLISH),
  validate({ params: uuidParam('versionId') }),
  asyncHandler(async (req, res) => {
    ok(res, await publishVersion(requireAuth(req), req.params['versionId']!));
  }),
);

assessmentsRouter.post(
  '/versions/:versionId/archive',
  requirePermission(PERMISSION.ASSESSMENT_UPDATE),
  validate({ params: uuidParam('versionId') }),
  asyncHandler(async (req, res) => {
    ok(res, await archiveVersion(requireAuth(req), req.params['versionId']!));
  }),
);

// --- Preguntas ---------------------------------------------------------------

assessmentsRouter.get(
  '/versions/:versionId/questions',
  requirePermission(PERMISSION.ASSESSMENT_READ),
  validate({ params: uuidParam('versionId') }),
  asyncHandler(async (req, res) => {
    ok(res, await listQuestions(requireAuth(req), req.params['versionId']!));
  }),
);

assessmentsRouter.post(
  '/versions/:versionId/questions',
  requirePermission(PERMISSION.ASSESSMENT_UPDATE),
  validate({ params: uuidParam('versionId'), body: createQuestionSchema }),
  asyncHandler(async (req, res) => {
    created(res, await createQuestion(requireAuth(req), req.params['versionId']!, req.body));
  }),
);

assessmentsRouter.put(
  '/versions/:versionId/questions/reorder',
  requirePermission(PERMISSION.ASSESSMENT_UPDATE),
  validate({ params: uuidParam('versionId'), body: reorderSchema }),
  asyncHandler(async (req, res) => {
    const { questionIds } = req.body as { questionIds: string[] };
    await reorderQuestions(requireAuth(req), req.params['versionId']!, questionIds);
    noContent(res);
  }),
);

assessmentsRouter.patch(
  '/questions/:questionId',
  requirePermission(PERMISSION.ASSESSMENT_UPDATE),
  validate({ params: uuidParam('questionId'), body: updateQuestionSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await updateQuestion(requireAuth(req), req.params['questionId']!, req.body));
  }),
);

assessmentsRouter.delete(
  '/questions/:questionId',
  requirePermission(PERMISSION.ASSESSMENT_UPDATE),
  validate({ params: uuidParam('questionId') }),
  asyncHandler(async (req, res) => {
    await deleteQuestion(requireAuth(req), req.params['questionId']!);
    noContent(res);
  }),
);
