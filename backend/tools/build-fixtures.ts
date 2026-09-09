import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../src/config/env.js';
import {
  phidiasAreasResponseSchema,
  phidiasConsolidateResponseSchema,
  phidiasPeriodsResponseSchema,
  phidiasSubjectsResponseSchema,
} from '../src/infrastructure/external/phidias/phidias.schemas.js';

/**
 * Generador de fixtures anonimizados.
 *
 * Descarga la estructura real de Phidias y produce fixtures que conservan
 * **la forma y las proporciones** —jerarquía, número de secciones, tamaño de
 * los grupos, reparto de estados de matrícula, porcentaje de estudiantes sin
 * correo o con correo personal— pero **ningún dato personal real**: nombres,
 * correos, nombres de usuario e identificadores se sustituyen.
 *
 * De este modo el mock ejercita los mismos casos límite que la API real —los
 * veinte estudiantes sin correo, los estados desconocidos— sin que la
 * matrícula del colegio acabe en un repositorio.
 *
 *   npm run phidias:fixtures     (requiere PHIDIAS_TOKEN y PHIDIAS_MODE=live)
 */

const OUTPUT_DIR = resolve(import.meta.dirname, '../src/infrastructure/external/phidias/fixtures');

const FIRST_NAMES = [
  'Sofía',
  'Mateo',
  'Valentina',
  'Samuel',
  'Isabella',
  'Lukas',
  'Emilia',
  'Tomás',
  'Mariana',
  'Jonas',
  'Camila',
  'Daniel',
  'Antonia',
  'Felipe',
  'Greta',
  'Nicolás',
  'Luciana',
  'Sebastián',
  'Helena',
  'Andrés',
  'Paulina',
  'Martín',
  'Elena',
  'Diego',
  'Clara',
  'Julián',
  'Renata',
  'Emilio',
  'Alina',
  'Santiago',
  'Ana',
  'Pablo',
];

const LAST_NAMES = [
  'Restrepo',
  'Vargas',
  'Schmidt',
  'Ospina',
  'Weber',
  'Molina',
  'Klein',
  'Navarro',
  'Fischer',
  'Cabrera',
  'Herrera',
  'Becker',
  'Salazar',
  'Wagner',
  'Pardo',
  'Hoffmann',
];

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(`${env.PHIDIAS_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${env.PHIDIAS_TOKEN ?? ''}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`${path} devolvió HTTP ${response.status}`);
  return response.json();
}

function write(name: string, data: unknown): void {
  writeFileSync(resolve(OUTPUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.warn(`  ${name}`);
}

async function main(): Promise<void> {
  if (env.PHIDIAS_MODE !== 'live' || !env.PHIDIAS_TOKEN) {
    throw new Error('Se requiere PHIDIAS_MODE=live y PHIDIAS_TOKEN para regenerar los fixtures');
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  console.warn('\nGenerando fixtures anonimizados…');

  // --- Catálogos: no contienen datos personales, se copian tal cual ---------
  const areas = phidiasAreasResponseSchema.parse(await fetchJson('/1/academic/areas'));
  const periods = phidiasPeriodsResponseSchema.parse(await fetchJson('/1/academic/periods'));

  const currentYear = Math.max(...periods.response.map((period) => period.year));
  const subjects = phidiasSubjectsResponseSchema.parse(
    await fetchJson(`/1/academic/subjects?year=${currentYear}`),
  );

  write(
    'areas.json',
    areas.filter((area) => area.year === currentYear),
  );
  write('periods.json', periods);
  write('subjects.json', subjects);

  // --- Matrícula: se conserva la forma, se sustituye a las personas ---------
  const consolidate = phidiasConsolidateResponseSchema.parse(
    await fetchJson('/1/course/consolidate'),
  );

  let counter = 0;
  const anonymized = consolidate.map((level) => ({
    id: level.id,
    name: level.name,
    courses: level.courses.map((course) => ({
      id: course.id,
      name: course.name,
      sections: course.sections.map((section) => ({
        id: section.id,
        name: section.name,
        students: section.students.map((student) => {
          counter += 1;
          const firstName = FIRST_NAMES[counter % FIRST_NAMES.length]!;
          const lastName = `${LAST_NAMES[counter % LAST_NAMES.length]!} ${
            LAST_NAMES[(counter * 7) % LAST_NAMES.length]!
          }`;
          // Prefijo propio: los fixtures y la semilla de demostración deben
          // poder convivir en la misma base sin colisiones artificiales.
          const username = `ph${counter}.${slug(firstName)}.${slug(lastName.split(' ')[0]!)}`;

          // Se preserva **si tenía correo y de qué clase**, porque de ahí
          // salen los casos límite que importan, pero nunca el correo real.
          const originalDomain = student.email?.split('@')[1]?.toLowerCase();
          const email = !student.email
            ? null
            : originalDomain === 'colegioaleman.edu.co'
              ? `${username}@colegioaleman.edu.co`
              : `${username}@ejemplo.com`;

          return {
            id: 900000 + counter,
            firstname: firstName.toUpperCase(),
            lastname: lastName.toUpperCase(),
            username,
            email,
            code: student.code === null || student.code === undefined ? null : 900000 + counter,
            language: student.language ?? 'es',
            enrollment: {
              status: student.enrollment?.status ?? null,
              date: student.enrollment?.date ?? null,
            },
          };
        }),
      })),
    })),
  }));

  write('consolidate.json', anonymized);

  const students = anonymized.flatMap((level) =>
    level.courses.flatMap((course) => course.sections.flatMap((section) => section.students)),
  );
  const statuses = students.reduce<Record<string, number>>((acc, student) => {
    const key = student.enrollment.status ?? '(sin estado)';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  console.warn(
    `\nFixtures generados: ${anonymized.length} niveles · ${students.length} estudiantes\n` +
      `  estados: ${JSON.stringify(statuses)}\n` +
      `  sin correo: ${students.filter((student) => !student.email).length}\n`,
  );
}

main().catch((error: unknown) => {
  console.error('\nNo se pudieron generar los fixtures:', error);
  process.exitCode = 1;
});
