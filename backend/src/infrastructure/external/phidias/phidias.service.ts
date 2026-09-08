import { env } from '../../../config/env.js';
import { createLogger } from '../../../shared/logger.js';
import { circuitStatus, invalidatePhidiasCache, phidiasGet } from './phidias.client.js';
import {
  fromUnixSeconds,
  phidiasAreasResponseSchema,
  phidiasConsolidateResponseSchema,
  phidiasPeriodsResponseSchema,
  phidiasSubjectsResponseSchema,
  type PhidiasArea,
  type PhidiasPeriod,
  type PhidiasSubject,
} from './phidias.schemas.js';
import { flattenConsolidate, type NormalizedSection } from './phidias.mapper.js';
import { MockPhidiasService } from './phidias.mock.js';

const log = createLogger('phidias:service');

/**
 * Servicio de Phidias.
 *
 * La interfaz describe lo que la plataforma necesita, no lo que la API ofrece.
 * Hay dos implementaciones —la real y una simulada— seleccionables por
 * `PHIDIAS_MODE`, y estrictamente separadas: los datos ficticios nunca se
 * mezclan con producción.
 */

export interface AcademicYearRef {
  externalId: number;
  startDate: Date;
  endDate: Date;
  periodCount: number;
}

export interface NormalizedPeriod {
  externalId: number;
  name: string;
  yearExternalId: number;
  startDate: Date;
  endDate: Date;
  weight: number;
  categoryId: number | null;
}

export interface PhidiasStatus {
  mode: 'live' | 'mock';
  configured: boolean;
  circuit: { open: boolean; failures: number; retryInMs: number };
  /** Endpoints que la API expone pero que no funcionan en este entorno. */
  knownBrokenEndpoints: string[];
}

export interface PhidiasService {
  getStatus(): PhidiasStatus;
  /** Año escolar vigente, resuelto por fecha contra los periodos reales. */
  resolveCurrentAcademicYear(): Promise<AcademicYearRef>;
  getAcademicAreas(yearExternalId?: number): Promise<PhidiasArea[]>;
  getSubjects(yearExternalId: number): Promise<PhidiasSubject[]>;
  getPeriods(yearExternalId?: number): Promise<NormalizedPeriod[]>;
  /** Matrícula del año en curso, ya aplanada y con los datos minimizados. */
  getEnrolledStudents(): Promise<{ sections: NormalizedSection[]; discarded: number }>;
  invalidateCache(): Promise<void>;
}

/**
 * Endpoints que la documentación de Phidias describe pero que este entorno no
 * sirve. Comprobado el 8 de septiembre de 2026; se declaran para que la
 * interfaz de administración pueda explicarlo en lugar de mostrar un error
 * genérico.
 */
const KNOWN_BROKEN_ENDPOINTS = [
  '/1/academic/course_group (HTTP 500)',
  '/1/academic/period_categories (HTTP 500)',
  '/1/academic/grading2/ranking (HTTP 401: el token carece de permisos)',
  '/1/academic/student/report/subject/grading (HTTP 401)',
  '/1/academic/grading/evaluation (HTTP 401)',
];

function normalizePeriod(raw: PhidiasPeriod): NormalizedPeriod {
  return {
    externalId: raw.id,
    name: raw.name.trim(),
    yearExternalId: raw.year,
    startDate: fromUnixSeconds(raw.start_date) ?? new Date(0),
    endDate: fromUnixSeconds(raw.end_date) ?? new Date(0),
    weight: raw.weight ?? 0,
    categoryId: raw.category ?? null,
  };
}

export class LivePhidiasService implements PhidiasService {
  getStatus(): PhidiasStatus {
    return {
      mode: 'live',
      configured: Boolean(env.PHIDIAS_TOKEN),
      circuit: circuitStatus(),
      knownBrokenEndpoints: KNOWN_BROKEN_ENDPOINTS,
    };
  }

  /**
   * Resuelve el año escolar vigente.
   *
   * `year` en Phidias **no** es el año calendario: es un identificador interno
   * (1, 2, 3…). El curso 2026-2027 es `year=6`. Fijarlo a mano en una variable
   * de entorno significa que el sistema deja de funcionar cada mes de agosto,
   * así que se resuelve comparando la fecha actual con las fechas reales de
   * los periodos. La variable de entorno queda solo como anulación manual.
   */
  async resolveCurrentAcademicYear(): Promise<AcademicYearRef> {
    const periods = await this.getPeriods();
    if (periods.length === 0) {
      throw new Error('Phidias no devolvió ningún periodo académico');
    }

    const byYear = new Map<number, NormalizedPeriod[]>();
    for (const period of periods) {
      const list = byYear.get(period.yearExternalId) ?? [];
      list.push(period);
      byYear.set(period.yearExternalId, list);
    }

    const now = Date.now();
    const candidates = [...byYear.entries()].map(([externalId, list]) => ({
      externalId,
      startDate: new Date(Math.min(...list.map((p) => p.startDate.getTime()))),
      endDate: new Date(Math.max(...list.map((p) => p.endDate.getTime()))),
      periodCount: list.length,
    }));

    const override = env.PHIDIAS_ACADEMIC_YEAR_ID;
    if (override) {
      const forced = candidates.find((candidate) => candidate.externalId === override);
      if (forced) {
        log.info({ externalId: override }, 'año académico fijado por configuración');
        return forced;
      }
      log.warn({ override }, 'el año fijado por configuración no existe; se resuelve por fecha');
    }

    const current = candidates.find(
      (candidate) => candidate.startDate.getTime() <= now && candidate.endDate.getTime() >= now,
    );

    if (current) return current;

    // Fuera del calendario escolar (vacaciones de julio, por ejemplo) se toma
    // el año más reciente ya iniciado, que es lo que un humano entendería por
    // "el curso actual".
    const mostRecent = candidates
      .filter((candidate) => candidate.startDate.getTime() <= now)
      .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];

    if (!mostRecent) throw new Error('No se pudo determinar el año académico vigente');

    log.warn(
      { externalId: mostRecent.externalId },
      'ninguna fecha coincide con hoy; se usa el año iniciado más reciente',
    );
    return mostRecent;
  }

  async getAcademicAreas(yearExternalId?: number): Promise<PhidiasArea[]> {
    const areas = await phidiasGet('/1/academic/areas', phidiasAreasResponseSchema);
    // Las áreas se repiten por año con identificadores distintos; sin filtrar
    // se obtendrían más de doscientas entradas, la mayoría de cursos pasados.
    return yearExternalId ? areas.filter((area) => area.year === yearExternalId) : areas;
  }

  async getSubjects(yearExternalId: number): Promise<PhidiasSubject[]> {
    const { response } = await phidiasGet('/1/academic/subjects', phidiasSubjectsResponseSchema, {
      year: yearExternalId,
    });
    return response;
  }

  async getPeriods(yearExternalId?: number): Promise<NormalizedPeriod[]> {
    const { response } = await phidiasGet('/1/academic/periods', phidiasPeriodsResponseSchema);
    const periods = response.map(normalizePeriod);
    return yearExternalId
      ? periods.filter((period) => period.yearExternalId === yearExternalId)
      : periods;
  }

  async getEnrolledStudents(): Promise<{ sections: NormalizedSection[]; discarded: number }> {
    // Sin parámetros, `consolidate` devuelve el año en curso. Es una respuesta
    // de unos dos megabytes, así que se cachea como todas las demás.
    const levels = await phidiasGet('/1/course/consolidate', phidiasConsolidateResponseSchema);
    const result = flattenConsolidate(levels);

    log.info(
      {
        sections: result.sections.length,
        students: result.sections.reduce((sum, section) => sum + section.students.length, 0),
        discarded: result.discarded,
      },
      'matrícula obtenida',
    );

    return result;
  }

  async invalidateCache(): Promise<void> {
    await invalidatePhidiasCache();
  }
}

let instance: PhidiasService | null = null;

/**
 * Devuelve la implementación configurada.
 *
 * La separación entre real y simulada es total: no hay una clase que "a veces"
 * use datos ficticios, hay dos clases distintas y el modo se decide una sola
 * vez al arrancar.
 */
export function getPhidiasService(): PhidiasService {
  if (!instance) {
    instance = env.PHIDIAS_MODE === 'live' ? new LivePhidiasService() : new MockPhidiasService();
    log.info({ mode: env.PHIDIAS_MODE }, 'servicio de Phidias inicializado');
  }
  return instance;
}

/** Solo para pruebas: permite inyectar una implementación concreta. */
export function setPhidiasService(service: PhidiasService | null): void {
  instance = service;
}
