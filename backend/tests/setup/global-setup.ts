import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Preparación única de la suite de integración.
 *
 * Aplica el esquema a la base de pruebas antes de la primera prueba. Se usa
 * `db push` en lugar de `migrate deploy` porque a la suite le interesa el
 * esquema vigente, no el historial: es más rápido y no deja la tabla de
 * migraciones a medias si una migración se está redactando en ese momento.
 */
export async function setup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL no está definida para las pruebas');

  if (!databaseUrl.includes('test')) {
    // Salvaguarda deliberada: esta preparación borra datos. Si alguien
    // ejecutase la suite apuntando a desarrollo o a producción, debe fallar
    // antes de tocar nada.
    throw new Error(
      `Las pruebas de integración exigen una base cuyo nombre contenga "test". Recibido: ${databaseUrl.replace(/:[^:@]+@/, ':***@')}`,
    );
  }

  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}
