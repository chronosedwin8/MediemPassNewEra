import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './shared/logger.js';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/prisma.js';

/**
 * Arranque y apagado ordenado.
 *
 * El apagado importa: al desplegar, el proceso recibe SIGTERM y debe terminar
 * las peticiones en curso antes de cerrar la base. Salir de inmediato dejaría
 * intentos a medio guardar, que es justo el dato que un estudiante no puede
 * permitirse perder.
 */

const SHUTDOWN_TIMEOUT_MS = 15_000;

async function start(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, environment: env.NODE_ENV, phidias: env.PHIDIAS_MODE, ai: env.AI_PROVIDER },
      `${env.APP_NAME} escuchando en http://localhost:${env.PORT}`,
    );
  });

  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'apagando');

    // Red de seguridad: si una conexión se niega a cerrarse, no se puede
    // esperar indefinidamente o el orquestador matará el proceso de todos
    // modos, y sin registro.
    const forceExit = setTimeout(() => {
      logger.error('el apagado ordenado agotó su tiempo; se fuerza la salida');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close((error) => {
      // Un servidor que nunca llegó a escuchar —por ejemplo, porque el puerto
      // estaba ocupado— responde aquí con ERR_SERVER_NOT_RUNNING. No es un
      // fallo del cierre, y registrarlo como tal despista: el error de verdad
      // es el que provocó el apagado, y ya está unas líneas más arriba.
      const closeFailed =
        error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING';
      if (closeFailed) logger.error({ err: error }, 'error al cerrar el servidor HTTP');
      disconnectDatabase()
        .catch((dbError: unknown) => logger.error({ err: dbError }, 'error al cerrar la base'))
        .finally(() => {
          clearTimeout(forceExit);
          process.exit(error ? 1 : 0);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Un fallo no capturado deja el proceso en estado desconocido: se registra
  // y se sale para que el supervisor levante una instancia sana.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'promesa rechazada sin manejar');
    shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'excepción no capturada');
    shutdown('uncaughtException');
  });
}

start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'no se pudo arrancar el servidor');
  process.exit(1);
});
