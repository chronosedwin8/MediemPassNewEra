import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLogger } from '../../../shared/logger.js';
import {
  fromUnixSeconds,
  phidiasAreasResponseSchema,
  phidiasConsolidateResponseSchema,
  phidiasPeriodsResponseSchema,
  phidiasSubjectsResponseSchema,
  type PhidiasArea,
  type PhidiasSubject,
} from './phidias.schemas.js';
import { flattenConsolidate, type NormalizedSection } from './phidias.mapper.js';
import type {
  AcademicYearRef,
  NormalizedPeriod,
  PhidiasService,
  PhidiasStatus,
} from './phidias.service.js';

const log = createLogger('phidias:mock');

/**
 * Implementación simulada de Phidias.
 *
 * Sirve fixtures **anonimizados generados a partir de la API real**, no datos
 * inventados: conservan la jerarquía completa, el número de secciones, el
 * tamaño de los grupos, el reparto de estados de matrícula y los casos límite
 * que de verdad existen —estudiantes sin correo, correos personales, nombres
 * de usuario numéricos, el estado `Admitido` que no está en ningún catálogo—.
 * Los nombres, correos e identificadores están sustituidos.
 *
 * Es una clase aparte y no un interruptor dentro del servicio real: la
 * especificación exige que los datos de prueba no puedan mezclarse con
 * producción, y la forma fiable de garantizarlo es que no compartan código.
 *
 * Se regeneran con `npm run phidias:fixtures`.
 */

const FIXTURES_DIR = resolve(import.meta.dirname, 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, name), 'utf8'));
}

export class MockPhidiasService implements PhidiasService {
  private readonly areas: PhidiasArea[];
  private readonly subjects: PhidiasSubject[];
  private readonly periods: NormalizedPeriod[];
  private readonly enrollment: { sections: NormalizedSection[]; discarded: number };

  constructor() {
    this.areas = phidiasAreasResponseSchema.parse(loadFixture('areas.json'));
    this.subjects = phidiasSubjectsResponseSchema.parse(loadFixture('subjects.json')).response;
    this.periods = phidiasPeriodsResponseSchema
      .parse(loadFixture('periods.json'))
      .response.map((raw) => ({
        externalId: raw.id,
        name: raw.name.trim(),
        yearExternalId: raw.year,
        startDate: fromUnixSeconds(raw.start_date) ?? new Date(0),
        endDate: fromUnixSeconds(raw.end_date) ?? new Date(0),
        weight: raw.weight ?? 0,
        categoryId: raw.category ?? null,
      }));
    this.enrollment = flattenConsolidate(
      phidiasConsolidateResponseSchema.parse(loadFixture('consolidate.json')),
    );

    log.info(
      {
        sections: this.enrollment.sections.length,
        students: this.enrollment.sections.reduce((sum, s) => sum + s.students.length, 0),
      },
      'servicio simulado cargado con fixtures anonimizados',
    );
  }

  getStatus(): PhidiasStatus {
    return {
      mode: 'mock',
      configured: true,
      circuit: { open: false, failures: 0, retryInMs: 0 },
      knownBrokenEndpoints: [],
    };
  }

  async resolveCurrentAcademicYear(): Promise<AcademicYearRef> {
    const byYear = new Map<number, NormalizedPeriod[]>();
    for (const period of this.periods) {
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

    const current = candidates.find(
      (candidate) => candidate.startDate.getTime() <= now && candidate.endDate.getTime() >= now,
    );

    const fallback = candidates.sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];
    const resolved = current ?? fallback;
    if (!resolved) throw new Error('Los fixtures no contienen periodos');
    return resolved;
  }

  async getAcademicAreas(yearExternalId?: number): Promise<PhidiasArea[]> {
    return yearExternalId ? this.areas.filter((area) => area.year === yearExternalId) : this.areas;
  }

  async getSubjects(yearExternalId: number): Promise<PhidiasSubject[]> {
    return this.subjects.filter((subject) => subject.year === yearExternalId);
  }

  async getPeriods(yearExternalId?: number): Promise<NormalizedPeriod[]> {
    return yearExternalId
      ? this.periods.filter((period) => period.yearExternalId === yearExternalId)
      : this.periods;
  }

  async getEnrolledStudents(): Promise<{ sections: NormalizedSection[]; discarded: number }> {
    // Se devuelve una copia: una prueba que mutase el resultado contaminaría
    // las siguientes, porque los fixtures se cargan una sola vez.
    return {
      sections: this.enrollment.sections.map((section) => ({
        ...section,
        students: section.students.map((student) => ({ ...student })),
      })),
      discarded: this.enrollment.discarded,
    };
  }

  async invalidateCache(): Promise<void> {
    // Los fixtures no se cachean: no hay nada que invalidar.
  }
}
