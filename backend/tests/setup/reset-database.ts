import { afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/infrastructure/database/prisma.js';

/**
 * Aislamiento entre pruebas.
 *
 * Cada prueba arranca con la base vacía. Se hace con un único `TRUNCATE` en
 * cascada sobre todas las tablas, que es mucho más rápido que borrar tabla
 * por tabla y evita tener que mantener a mano el orden de las claves ajenas
 * —orden que cambiaría cada vez que se añade una relación—.
 */

let tableNames: string[] | null = null;

async function resolveTableNames(): Promise<string[]> {
  if (tableNames) return tableNames;

  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;

  tableNames = rows.map((row) => `"public"."${row.tablename}"`);
  return tableNames;
}

beforeEach(async () => {
  const tables = await resolveTableNames();
  if (tables.length === 0) return;
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
