import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, created, noContent, ok } from '../../shared/http/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { getQuery, uuidParam, validate } from '../../middleware/validate.js';
import {
  createCompetency,
  createSubcompetency,
  deactivateCompetency,
  getCompetency,
  getCompetencyTree,
  updateCompetency,
  upsertCompetencySchema,
  upsertSubcompetencySchema,
} from './kmk.service.js';

export const kmkRouter: Router = Router();

kmkRouter.use(authenticate);

const listQuery = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

// Cualquier rol autenticado puede leer el marco: los estudiantes ven su
// desempeño por competencia y necesitan sus nombres y descripciones.
kmkRouter.get(
  '/competencies',
  requirePermission(PERMISSION.KMK_READ),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { includeInactive } = getQuery<{ includeInactive: boolean }>(req);
    ok(res, await getCompetencyTree(includeInactive));
  }),
);

kmkRouter.get(
  '/competencies/:id',
  requirePermission(PERMISSION.KMK_READ),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    ok(res, await getCompetency(req.params['id']!));
  }),
);

kmkRouter.post(
  '/competencies',
  requirePermission(PERMISSION.KMK_MANAGE),
  validate({ body: upsertCompetencySchema }),
  asyncHandler(async (req, res) => {
    created(res, await createCompetency(req.body));
  }),
);

kmkRouter.patch(
  '/competencies/:id',
  requirePermission(PERMISSION.KMK_MANAGE),
  validate({ params: uuidParam(), body: upsertCompetencySchema.partial() }),
  asyncHandler(async (req, res) => {
    ok(res, await updateCompetency(req.params['id']!, req.body));
  }),
);

kmkRouter.delete(
  '/competencies/:id',
  requirePermission(PERMISSION.KMK_MANAGE),
  validate({ params: uuidParam() }),
  asyncHandler(async (req, res) => {
    await deactivateCompetency(req.params['id']!);
    noContent(res);
  }),
);

kmkRouter.post(
  '/subcompetencies',
  requirePermission(PERMISSION.KMK_MANAGE),
  validate({ body: upsertSubcompetencySchema }),
  asyncHandler(async (req, res) => {
    created(res, await createSubcompetency(req.body));
  }),
);
