import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION } from '@medienpass/shared';
import { asyncHandler, ok } from '../../../shared/http/response.js';
import { authenticate, requireAuth } from '../../../middleware/authenticate.js';
import { requirePermission } from '../../../middleware/authorize.js';
import { getQuery, validate } from '../../../middleware/validate.js';
import { getPhidiasService } from '../../../infrastructure/external/phidias/phidias.service.js';
import {
  importSections,
  listSections,
  listSyncLogs,
  syncStudents,
} from './phidias-sync.service.js';

/**
 * Rutas de la integración con Phidias.
 *
 * El token de Phidias no aparece en ninguna respuesta de este router, ni
 * siquiera enmascarado: el estado informa de si está configurado, nunca de su
 * valor. Toda la comunicación con Phidias ocurre en el backend; el navegador
 * jamás la ve.
 */

export const phidiasRouter: Router = Router();

phidiasRouter.use(authenticate);

phidiasRouter.get(
  '/status',
  requirePermission(PERMISSION.PHIDIAS_READ),
  asyncHandler(async (_req, res) => {
    ok(res, getPhidiasService().getStatus());
  }),
);

/** Año escolar vigente según Phidias, resuelto por fecha contra sus periodos. */
phidiasRouter.get(
  '/academic-year',
  requirePermission(PERMISSION.PHIDIAS_READ),
  asyncHandler(async (_req, res) => {
    ok(res, await getPhidiasService().resolveCurrentAcademicYear());
  }),
);

/**
 * Catálogos tal como los devuelve Phidias, para que el administrador decida
 * qué áreas y materias merecen existir en la plataforma. Nada se crea solo.
 */
phidiasRouter.get(
  '/catalog',
  requirePermission(PERMISSION.PHIDIAS_READ),
  asyncHandler(async (_req, res) => {
    const service = getPhidiasService();
    const year = await service.resolveCurrentAcademicYear();
    const [areas, subjects, periods] = await Promise.all([
      service.getAcademicAreas(year.externalId),
      service.getSubjects(year.externalId),
      service.getPeriods(year.externalId),
    ]);
    ok(res, { academicYear: year, areas, subjects, periods });
  }),
);

/** Vista previa de la matrícula, sin escribir nada en la base. */
phidiasRouter.get(
  '/preview/students',
  requirePermission(PERMISSION.PHIDIAS_READ),
  asyncHandler(async (req, res) => {
    ok(res, await syncStudents(requireAuth(req).userId, { dryRun: true }));
  }),
);

/**
 * Los cursos de este año, para elegir cuáles traer.
 *
 * Con `phidias:import` y no `phidias:read`: es la puerta del docente, y no
 * enseña ni el estado de la integración ni la configuración, solo cursos.
 */
phidiasRouter.get(
  '/sections',
  requirePermission(PERMISSION.PHIDIAS_IMPORT),
  asyncHandler(async (req, res) => {
    ok(res, await listSections(requireAuth(req).userId));
  }),
);

const importBody = z.object({
  sectionExternalIds: z.array(z.number().int().positive()).min(1).max(20),
  joinAsTeacher: z.boolean().default(true),
});

/** Trae los cursos elegidos como grupos. No desactiva a nadie. */
phidiasRouter.post(
  '/sections/import',
  requirePermission(PERMISSION.PHIDIAS_IMPORT),
  validate({ body: importBody }),
  asyncHandler(async (req, res) => {
    const { sectionExternalIds, joinAsTeacher } = req.body as z.infer<typeof importBody>;
    ok(res, await importSections(requireAuth(req).userId, sectionExternalIds, joinAsTeacher));
  }),
);

const syncBody = z.object({
  dryRun: z.boolean().default(false),
  /**
   * Contraseña inicial para las cuentas nuevas. No se persiste en claro ni
   * aparece en los registros: se hashea y se descarta.
   */
  initialPassword: z.string().min(10).max(128).optional(),
});

phidiasRouter.post(
  '/sync/students',
  requirePermission(PERMISSION.PHIDIAS_SYNC),
  validate({ body: syncBody }),
  asyncHandler(async (req, res) => {
    const { dryRun, initialPassword } = req.body as { dryRun: boolean; initialPassword?: string };
    ok(res, await syncStudents(requireAuth(req).userId, { dryRun, initialPassword }));
  }),
);

const logsQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

phidiasRouter.get(
  '/sync/logs',
  requirePermission(PERMISSION.PHIDIAS_READ),
  validate({ query: logsQuery }),
  asyncHandler(async (req, res) => {
    const { limit } = getQuery<{ limit: number }>(req);
    ok(res, await listSyncLogs(limit));
  }),
);
