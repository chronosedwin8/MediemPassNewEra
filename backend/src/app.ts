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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export { ERROR_CODE };
