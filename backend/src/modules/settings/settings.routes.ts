import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, ok } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { getQuery, validate } from '../../middleware/validate.js';
import { getAllSettings, setSettings } from './settings.service.js';
import { listScales, updateScale, updateScaleSchema } from './scales.service.js';

export const settingsRouter: Router = Router();

settingsRouter.use(authenticate);

// Cualquier sesión puede leer la configuración: la interfaz necesita el nombre
// de la plataforma, el idioma por defecto y las escalas para pintar resultados.
settingsRouter.get(
  '/',
  requirePermission(PERMISSION.SETTINGS_READ),
  asyncHandler(async (_req, res) => {
    ok(res, await getAllSettings());
  }),
);

settingsRouter.patch(
  '/',
  requirePermission(PERMISSION.SETTINGS_MANAGE),
  validate({ body: z.record(z.unknown()) }),
  asyncHandler(async (req, res) => {
    ok(res, await setSettings(req.body as Record<string, unknown>, requireAuth(req).userId));
  }),
);

const scalesQuery = z.object({
  includeHistory: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

settingsRouter.get(
  '/scales',
  requirePermission(PERMISSION.SETTINGS_READ),
  validate({ query: scalesQuery }),
  asyncHandler(async (req, res) => {
    const { includeHistory } = getQuery<{ includeHistory: boolean }>(req);
    ok(res, await listScales(includeHistory));
  }),
);

// Publica una versión nueva. Nunca modifica la vigente: los resultados ya
// emitidos siguen apuntando a la escala con la que se calcularon.
settingsRouter.put(
  '/scales/:code',
  requirePermission(PERMISSION.SCALE_MANAGE),
  validate({
    params: z.object({ code: z.string().trim().min(1).max(50) }),
    body: updateScaleSchema,
  }),
  asyncHandler(async (req, res) => {
    ok(res, await updateScale(req.params['code']!, req.body, requireAuth(req).userId));
  }),
);
