import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Se carga el .env del repositorio y se apunta a la base de pruebas, que la
// suite recrea en cada ejecución. Nunca se toca la base de desarrollo.
loadDotenv({ path: resolve(__dirname, '../.env') });

const testDatabaseUrl =
  process.env.DATABASE_URL_TEST ??
  process.env.DATABASE_URL?.replace(/medienpass_dev/, 'medienpass_test');

if (!testDatabaseUrl) {
  throw new Error('DATABASE_URL_TEST es obligatoria para las pruebas de integración');
}

// Se fija también en el proceso principal: `test.env` solo alcanza a los
// trabajadores, y `globalSetup` corre aquí, donde aplica el esquema.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    include: ['tests/integration/**/*.spec.ts'],
    globalSetup: ['./tests/setup/global-setup.ts'],
    setupFiles: ['./tests/setup/reset-database.ts'],
    // Las pruebas comparten una única base: ejecutarlas en paralelo haría que
    // el reseteo de una borrara los datos de otra.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      PHIDIAS_MODE: 'mock',
      AI_PROVIDER: 'mock',
      LOG_LEVEL: 'error',
      // El SSO se prueba con un proveedor controlado, no contra Entra ID. Los
      // valores de tenant son ficticios: el proveedor real nunca se instancia.
      SSO_ENABLED: 'true',
      ENTRA_TENANT_ID: 'tenant-de-prueba',
      ENTRA_CLIENT_ID: 'cliente-de-prueba',
      ENTRA_CLIENT_SECRET: 'secreto-de-prueba',
      ENTRA_REDIRECT_URI: 'http://localhost:3000/api/auth/sso/entra_id/callback',
      SSO_ALLOWED_DOMAINS: 'colegioaleman.edu.co',
      APP_URL: 'http://localhost:5173',
    },
  },
});
