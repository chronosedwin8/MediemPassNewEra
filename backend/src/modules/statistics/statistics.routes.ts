import { Router } from 'express';
import { PERMISSION, hasAnyPermission } from '@medienpass/shared';
import { asyncHandler, ok } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import { getQuery, uuidParam, validate } from '../../middleware/validate.js';
import { statisticsFiltersSchema, type StatisticsFilters } from './filters.js';
import {
  getGroupStatistics,
  getKmkReport,
  getOverview,
  getStudentProgress,
  getTeacherOverview,
} from './statistics.service.js';

/**
 * Rutas de estadísticas.
 *
 * Todas comparten el mismo conjunto de filtros y el mismo alcance: un
 * administrador ve el colegio, un docente sus grupos y sus evaluaciones, y un
 * estudiante lo suyo. El alcance no se pide, se impone.
 */

export const statisticsRouter: Router = Router();

statisticsRouter.use(authenticate);

const ANY_STATS_PERMISSION = [
  PERMISSION.STATS_READ_OWN,
  PERMISSION.STATS_READ_SCOPED,
  PERMISSION.STATS_READ_GLOBAL,
] as const;

/** Desempeño por competencia KMK. Es la consulta central de la plataforma. */
statisticsRouter.get(
  '/kmk',
  requireAnyPermission(...ANY_STATS_PERMISSION),
  validate({ query: statisticsFiltersSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await getKmkReport(requireAuth(req), getQuery<StatisticsFilters>(req)));
  }),
);

/** Resumen general. Un docente lo recibe acotado a lo suyo. */
statisticsRouter.get(
  '/overview',
  requireAnyPermission(...ANY_STATS_PERMISSION),
  validate({ query: statisticsFiltersSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await getOverview(requireAuth(req), getQuery<StatisticsFilters>(req)));
  }),
);

/**
 * Progreso de un estudiante.
 *
 * Sin identificador, el del usuario actual. Con identificador, se exige el
 * permiso de ver resultados ajenos: un estudiante no consulta el progreso de
 * otro por cambiar un número en la URL.
 */
statisticsRouter.get(
  '/students/:userId?',
  requireAnyPermission(...ANY_STATS_PERMISSION),
  validate({ query: statisticsFiltersSchema }),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const requested = req.params['userId'];

    const canReadOthers = hasAnyPermission(auth.permissions, [
      PERMISSION.RESULT_READ_SCOPED,
      PERMISSION.RESULT_READ_ALL,
    ]);

    const targetUserId = requested && canReadOthers ? requested : auth.userId;

    ok(res, await getStudentProgress(auth, targetUserId, getQuery<StatisticsFilters>(req)));
  }),
);

/** Resumen docente. Sin identificador, el del usuario actual. */
statisticsRouter.get(
  '/teachers/:userId?',
  requireAnyPermission(PERMISSION.STATS_READ_SCOPED, PERMISSION.STATS_READ_GLOBAL),
  validate({ query: statisticsFiltersSchema }),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const canReadOthers = hasAnyPermission(auth.permissions, [PERMISSION.STATS_READ_GLOBAL]);
    const targetUserId = req.params['userId'] && canReadOthers ? req.params['userId'] : auth.userId;

    ok(res, await getTeacherOverview(auth, targetUserId, getQuery<StatisticsFilters>(req)));
  }),
);

statisticsRouter.get(
  '/groups/:id',
  requireAnyPermission(PERMISSION.STATS_READ_SCOPED, PERMISSION.STATS_READ_GLOBAL),
  validate({ params: uuidParam(), query: statisticsFiltersSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await getGroupStatistics(
        requireAuth(req),
        req.params['id']!,
        getQuery<StatisticsFilters>(req),
      ),
    );
  }),
);
