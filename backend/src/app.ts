import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ERROR_CODE } from '@medienpass/shared';
import { env, isProduction } from './config/env.js';
import { requestContext } from './middleware/request-context.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { generalRateLimit } from './middleware/rate-limit.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { kmkRouter } from './modules/kmk/kmk.routes.js';
import { areasRouter, calendarRouter, subjectsRouter } from './modules/academic/academic.routes.js';
import { groupsRouter } from './modules/groups/groups.routes.js';
import { teachersRouter } from './modules/teachers/teachers.routes.js';
import { studentsRouter } from './modules/students/students.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { phidiasRouter } from './modules/integrations/phidias/phidias.routes.js';
import { assessmentsRouter } from './modules/assessments/assessments.routes.js';
import { assignmentsRouter } from './modules/assignments/assignments.routes.js';
import { attemptsRouter } from './modules/attempts/attempts.routes.js';
import { statisticsRouter } from './modules/statistics/statistics.routes.js';
import { plansRouter } from './modules/plans/plans.routes.js';
import { trainingRouter } from './modules/training/training.routes.js';
import { aiRouter } from './modules/ai/ai.routes.js';

/**
 * Composición de la aplicación.
 *
 * Se separa de `server.ts` para que las pruebas de integración puedan montar
 * la aplicación y lanzarle peticiones sin abrir un puerto.
 *
 * El orden de los middleware importa: contexto de petición primero (para que
 * todo lo demás pueda registrar con identificador), seguridad después,
 * análisis del cuerpo a continuación, rutas al final y manejo de errores al
 * cierre, que es donde Express espera encontrarlo.
 */
export function createApp(): Express {
  const app = express();

  // Detrás de un proxy inverso, `req.ip` debe leer X-Forwarded-For para que
  // el límite de peticiones y la auditoría registren la IP real del cliente.
  if (isProduction) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestContext);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", ...env.CORS_ORIGIN],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use(
    cors({
      // Lista blanca explícita. Nunca `*` junto a credenciales: sería permitir
      // que cualquier sitio hiciera peticiones autenticadas en nombre del
      // usuario.
      origin: (origin, callback) => {
        if (!origin || env.CORS_ORIGIN.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origen no permitido: ${origin}`));
      },
      credentials: true,
      exposedHeaders: ['x-request-id'],
    }),
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser(env.COOKIE_SECRET));

  app.use('/api', generalRateLimit);

  app.get('/api/health', (_req, res) => {
    res.json({
      success: true,
      data: { status: 'ok', name: env.APP_NAME, environment: env.NODE_ENV },
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/teachers', teachersRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/areas', areasRouter);
  app.use('/api/subjects', subjectsRouter);
  app.use('/api/academic', calendarRouter);
  app.use('/api/kmk', kmkRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/assessments', assessmentsRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api/attempts', attemptsRouter);
  app.use('/api/statistics', statisticsRouter);
  app.use('/api/evaluation-plans', plansRouter);
  app.use('/api/training', trainingRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/integrations/phidias', phidiasRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export { ERROR_CODE };
