import { PrismaClient } from '@prisma/client';
import { env, isProduction } from '../../config/env.js';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('prisma');

/**
 * Cliente único de base de datos.
 *
 * Se instancia una sola vez por proceso: abrir un pool por módulo agotaría
 * las conexiones de PostgreSQL en cuanto el sistema tuviera carga real.
 */
export const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
  log: isProduction
    ? [{ emit: 'event', level: 'error' }]
    : [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
});

prisma.$on('error', (event) => log.error({ target: event.target }, event.message));
if (!isProduction) {
  prisma.$on('warn', (event) => log.warn({ target: event.target }, event.message));
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  log.info('conexión a PostgreSQL establecida');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  log.info('conexión a PostgreSQL cerrada');
}

export type { Prisma } from '@prisma/client';
