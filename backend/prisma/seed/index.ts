import { PrismaClient } from '@prisma/client';
import { seedAcademicYear, seedAreasAndSubjects } from './academic.js';
import {
  seedEducationStructure,
  seedGradingScales,
  seedKmkFramework,
  seedPermissionsAndRoles,
  seedSystemSettings,
} from './core.js';
import { seedDemo } from './demo.js';
import { seedDemoActivity } from './demo-activity.js';
import { seedTrainingModules } from './training.js';

/**
 * Punto de entrada de la semilla.
 *
 * Dos bloques con propósitos distintos:
 *
 *  - **Base**: lo que el sistema necesita para funcionar (roles, permisos,
 *    competencias KMK, escalas, configuración, estructura educativa). Es
 *    idempotente y debe ejecutarse también en producción.
 *  - **Demostración**: usuarios y evaluaciones de ejemplo. Solo en entornos de
 *    desarrollo. Se omite con `SEED_DEMO=false` y se bloquea en producción
 *    salvo que se fuerce explícitamente.
 */

const prisma = new PrismaClient();

function shouldSeedDemo(): boolean {
  if (process.env.SEED_DEMO === 'false') return false;
  if (process.env.NODE_ENV === 'production') return process.env.SEED_DEMO === 'true';
  return true;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.warn('\nSembrando datos base…');

  await seedPermissionsAndRoles(prisma);
  await seedKmkFramework(prisma);
  await seedGradingScales(prisma);
  await seedSystemSettings(prisma);
  await seedEducationStructure(prisma);
  await seedAreasAndSubjects(prisma);
  await seedAcademicYear(prisma);
  await seedTrainingModules(prisma);

  if (shouldSeedDemo()) {
    console.warn('\nSembrando datos de demostración…');
    await seedDemo(prisma);
    await seedDemoActivity(prisma);
  } else {
    console.warn('\nDatos de demostración omitidos.');
  }

  console.warn(`\nSemilla completada en ${((Date.now() - startedAt) / 1000).toFixed(1)} s.\n`);
}

main()
  .catch((error: unknown) => {
    console.error('\nLa semilla falló:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
