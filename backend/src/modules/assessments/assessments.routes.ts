import { Router } from 'express';
import { z } from 'zod';
import {
  ASSESSMENT_AUDIENCE,
  ASSESSMENT_PURPOSE,
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
  getDeletionImpact,
  purgeAssessment,
  getAssessment,
  listAssessments,
  previewVersion,
  publishVersion,
  updateVersion,
  setCertificateEnabled,
  certificateSettingSchema,
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
  /*
   * Filtrar por propósito hace falta para elegir la evaluación de un módulo de
   * capacitación: solo valen las de audiencia docente Y propósito de
   * capacitación, y sin este filtro la pantalla ofrecía también las que el
   * servidor rechaza, de modo que la regla se descubría con un error en rojo.
   */
  purpose: z
    .enum([
      ASSESSMENT_PURPOSE.EVALUATION,
      ASSESSMENT_PURPOSE.DIAGNOSTIC,
      ASSESSMENT_PURPOSE.TRAINING,
    ])
    .optional(),
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

/** Qué se destruiría. Lo consulta el diálogo antes de pedir confirmación. */
assessmentsRouter.get(
  '/:id/deletion-impact',
  requirePermission(PERMISSION.ASSESSMENT_DELETE),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await getDeletionImpact(requireAuth(req), req.params['id']!));
  }),
);

/**
 * Borrado definitivo con todo el historial.
 *
 * Ruta aparte de `DELETE /:id` a propósito: son operaciones distintas y no
 * conviene que se diferencien por un parámetro fácil de pasar por error.
 * `DELETE` archiva; esto destruye.
 */
assessmentsRouter.post(
  '/:id/purge',
  requirePermission(PERMISSION.ASSESSMENT_DELETE),
  validate({
    params: uuidParam(),
    body: z.object({ confirmation: z.string().min(1) }),
  }),
  asyncHandler(async (req, res) => {
    const { confirmation } = req.body as { confirmation: string };
    ok(res, await purgeAssessment(requireAuth(req), req.params['id']!, confirmation));
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

/**
 * Emisión de diplomas.
 *
 * Ruta propia y no parte de la actualización general porque, a diferencia del
 * resto de los ajustes, este también se puede cambiar con la versión ya
 * publicada. La inmutabilidad protege lo que determina una nota; esto solo
 * decide si de un resultado se puede imprimir un documento.
 */
assessmentsRouter.patch(
  '/versions/:versionId/certificate',
  requirePermission(PERMISSION.ASSESSMENT_UPDATE),
  validate({ params: uuidParam('versionId'), body: certificateSettingSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await setCertificateEnabled(requireAuth(req), req.params['versionId']!, req.body.enabled),
    );
  }),
);

/**
 * Previsualización de una versión.
 *
 * `withSolutions=false` devuelve exactamente lo que verá el estudiante,
 * podado con la misma función que usa el motor. Con `true` añade, en un campo
 * aparte, la solución y la retroalimentación para que el docente pueda
 * revisarlas —sobre todo en lo que ha escrito la IA, que nadie ha leído aún—.
 */
assessmentsRouter.get(
  '/versions/:versionId/preview',
  requirePermission(PERMISSION.ASSESSMENT_READ),
  validate({
    params: z.object({ versionId: z.string().uuid() }),
    query: z.object({ withSolutions: z.coerce.boolean().default(false) }),
  }),
  asyncHandler(async (req, res) => {
    const { withSolutions } = getQuery<{ withSolutions: boolean }>(req);
    ok(res, await previewVersion(requireAuth(req), req.params['versionId']!, withSolutions));
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
