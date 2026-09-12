import { Router } from 'express';
import { PERMISSION, hasAnyPermission } from '@medienpass/shared';
import { asyncHandler, ok } from '../../shared/http/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import { getQuery, uuidParam, validate } from '../../middleware/validate.js';
import { statisticsFiltersSchema, type StatisticsFilters } from './filters.js';
import { getAssessmentReport } from './assessment-report.service.js';
import { breakdownQuerySchema, getKmkBreakdown } from './kmk-breakdown.service.js';
import { getSmartReport } from './smart.service.js';
import { getStudentPanel } from './student-panel.service.js';
import { getTeacherPanel } from './teacher-panel.service.js';
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

/**
 * La misma competencia, desglosada por materia, grupo o estudiante.
 *
 * `/kmk` responde «cómo va esto»; esta responde «comparado con qué». Son dos
 * preguntas distintas y por eso son dos rutas: filtrar la primera cincuenta
 * veces para comparar cincuenta grupos es lo que esta evita.
 */
statisticsRouter.get(
  '/kmk/breakdown',
  requireAnyPermission(...ANY_STATS_PERMISSION),
  validate({ query: statisticsFiltersSchema.merge(breakdownQuerySchema) }),
  asyncHandler(async (req, res) => {
    const query = getQuery<StatisticsFilters & { dimension: 'subject' | 'group' | 'student' }>(req);
    ok(res, await getKmkBreakdown(requireAuth(req), query.dimension, query));
  }),
);

/**
 * Objetivos SMART, dimensión a dimensión.
 *
 * Responde a la pregunta que los puntos no contestan: no «qué tal se les dan
 * los objetivos» sino en qué dimensión concreta fallan, que casi siempre es el
 * plazo y el indicador medible.
 */
statisticsRouter.get(
  '/smart',
  requireAnyPermission(...ANY_STATS_PERMISSION),
  validate({ query: statisticsFiltersSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await getSmartReport(requireAuth(req), getQuery<StatisticsFilters>(req)));
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
 * Panel del estudiante: lo suyo, todo junto.
 *
 * Sin identificador, el del usuario actual. Con identificador hace falta el
 * permiso de ver resultados ajenos, igual que en el progreso: el puesto dentro
 * del grupo y la nota media de un compañero no se consultan cambiando un
 * número en la dirección.
 */
statisticsRouter.get(
  '/panel/student/:userId?',
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

    ok(res, await getStudentPanel(auth, targetUserId, getQuery<StatisticsFilters>(req)));
  }),
);

/**
 * Panel del docente: lo que enseña y lo que aprende.
 *
 * El de otra persona solo con el alcance global. Un docente ve el suyo, y eso
 * incluye su capacitación, que es información sobre él mismo: que la vea la
 * coordinación es razonable, que la vea el compañero de al lado no.
 */
statisticsRouter.get(
  '/panel/teacher/:userId?',
  requireAnyPermission(PERMISSION.STATS_READ_SCOPED, PERMISSION.STATS_READ_GLOBAL),
  validate({ query: statisticsFiltersSchema }),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const canReadOthers = hasAnyPermission(auth.permissions, [PERMISSION.STATS_READ_GLOBAL]);
    const targetUserId = req.params['userId'] && canReadOthers ? req.params['userId'] : auth.userId;

    ok(res, await getTeacherPanel(auth, targetUserId, getQuery<StatisticsFilters>(req)));
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

/**
 * Resultados de una evaluación, grupo por grupo.
 *
 * Responde a lo que un docente se pregunta al día siguiente de aplicar algo:
 * cómo fue en cada curso y qué pregunta falló todo el mundo. El panel general
 * responde a «cómo va el colegio», que es otra pregunta.
 */
statisticsRouter.get(
  '/assessments/:id',
  requireAnyPermission(PERMISSION.STATS_READ_SCOPED, PERMISSION.STATS_READ_GLOBAL),
  validate({ params: uuidParam(), query: statisticsFiltersSchema }),
  asyncHandler(async (req, res) => {
    const filters = getQuery<StatisticsFilters>(req);
    ok(res, await getAssessmentReport(requireAuth(req), req.params['id']!, filters));
  }),
);
