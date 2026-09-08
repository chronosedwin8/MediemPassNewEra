import { env } from '../src/config/env.js';
import {
  phidiasAreasResponseSchema,
  phidiasConsolidateResponseSchema,
  phidiasPeriodsResponseSchema,
  phidiasSubjectsResponseSchema,
} from '../src/infrastructure/external/phidias/phidias.schemas.js';
import type { ZodTypeAny } from 'zod';

/**
 * Sonda de contratos.
 *
 * Consulta cada endpoint y contrasta la respuesta con el esquema declarado.
 * Es lo primero que hay que ejecutar cuando la sincronización empieza a fallar
 * sin que nada haya cambiado de este lado: dice si Phidias movió algo y qué.
 *
 * No escribe nada en la base de datos ni imprime datos personales.
 *
 *   PHIDIAS_MODE=live npm run phidias:probe
 */

interface Probe {
  label: string;
  path: string;
  schema: ZodTypeAny | null;
  /** Endpoints que se sabe rotos: se sondean para confirmar si siguen igual. */
  expectedBroken?: boolean;
}

function buildProbes(yearId: number): Probe[] {
  return [
    { label: 'areas', path: '/1/academic/areas', schema: phidiasAreasResponseSchema },
    { label: 'subjects', path: `/1/academic/subjects?year=${yearId}`, schema: phidiasSubjectsResponseSchema },
    { label: 'periods', path: '/1/academic/periods', schema: phidiasPeriodsResponseSchema },
    { label: 'consolidate', path: '/1/course/consolidate', schema: phidiasConsolidateResponseSchema },
    { label: 'course_group', path: '/1/academic/course_group', schema: null, expectedBroken: true },
    { label: 'period_categories', path: '/1/academic/period_categories', schema: null, expectedBroken: true },
    { label: 'ranking', path: '/1/academic/grading2/ranking', schema: null, expectedBroken: true },
    { label: 'grading/areas', path: '/1/academic/grading/areas', schema: null },
    { label: 'grading/courses', path: '/1/academic/grading/courses', schema: null },
  ];
}

function describeShape(value: unknown): string {
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as object);
    const response = (value as { response?: unknown }).response;
    const suffix = Array.isArray(response) ? ` → response[${response.length}]` : '';
    return `object{${keys.slice(0, 4).join(',')}}${suffix}`;
  }
  return typeof value;
}

async function probe(item: Probe): Promise<void> {
  const startedAt = Date.now();

  try {
    const response = await fetch(`${env.PHIDIAS_BASE_URL}${item.path}`, {
      headers: { Authorization: `Bearer ${env.PHIDIAS_TOKEN ?? ''}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(env.PHIDIAS_TIMEOUT_MS),
    });

    const text = await response.text();
    const elapsed = `${Date.now() - startedAt} ms`;
    const size = `${(text.length / 1024).toFixed(0)} KB`;

    if (!response.ok) {
      const note = item.expectedBroken ? '(roto conocido)' : '⚠️  INESPERADO';
      console.warn(
        `  ${String(response.status).padEnd(4)} ${item.label.padEnd(20)} ${elapsed.padStart(9)} ${note}`,
      );
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.warn(`  200  ${item.label.padEnd(20)} ${elapsed.padStart(9)} ⚠️  la respuesta no es JSON`);
      return;
    }

    let contract = '';
    if (item.schema) {
      const result = item.schema.safeParse(parsed);
      contract = result.success
        ? '· contrato OK'
        : `· ⚠️  ${result.error.issues.length} discrepancias: ${result.error.issues
            .slice(0, 3)
            .map((issue) => `${issue.path.join('.')} (${issue.message})`)
            .join('; ')}`;
    }

    console.warn(
      `  200  ${item.label.padEnd(20)} ${elapsed.padStart(9)} ${size.padStart(8)}  ` +
        `${describeShape(parsed).padEnd(28)} ${contract}`,
    );
  } catch (error) {
    console.warn(
      `  ERR  ${item.label.padEnd(20)} ${String(Date.now() - startedAt).padStart(6)} ms  ` +
        `${error instanceof Error ? error.name : 'fallo'}`,
    );
  }
}

async function main(): Promise<void> {
  if (env.PHIDIAS_MODE !== 'live' || !env.PHIDIAS_TOKEN) {
    throw new Error('Se requiere PHIDIAS_MODE=live y PHIDIAS_TOKEN para sondear la API real');
  }

  console.warn(`\nSondeando ${env.PHIDIAS_BASE_URL}\n`);

  // El año se resuelve antes de sondear, porque `subjects` lo necesita y
  // usar una constante sería reproducir el error que se quiere detectar.
  const periodsResponse = await fetch(`${env.PHIDIAS_BASE_URL}/1/academic/periods`, {
    headers: { Authorization: `Bearer ${env.PHIDIAS_TOKEN}`, Accept: 'application/json' },
  });
  const periods = phidiasPeriodsResponseSchema.parse(await periodsResponse.json());
  const now = Math.floor(Date.now() / 1000);
  const currentYear =
    periods.response.find((period) => period.start_date <= now && period.end_date >= now)?.year ??
    Math.max(...periods.response.map((period) => period.year));

  console.warn(`  Año escolar vigente según los periodos: year=${currentYear}\n`);

  for (const item of buildProbes(currentYear)) {
    await probe(item);
  }

  console.warn('');
}

main().catch((error: unknown) => {
  console.error('\nLa sonda falló:', error);
  process.exitCode = 1;
});
