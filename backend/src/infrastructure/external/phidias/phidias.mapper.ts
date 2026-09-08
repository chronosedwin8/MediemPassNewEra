import { ENROLLMENT_STATUS, normalizeLanguage, type EnrollmentStatus, type Language } from '@medienpass/shared';
import { createLogger } from '../../../shared/logger.js';
import type { PhidiasLevel, PhidiasStudent } from './phidias.schemas.js';

const log = createLogger('phidias:mapper');

/**
 * Normalización de los datos de Phidias.
 *
 * Aquí se aplica la **minimización de datos**: el objeto de estudiante que
 * devuelve Phidias trae más de sesenta campos, entre ellos documento de
 * identidad, dirección, teléfono, fecha de nacimiento y un campo `password`.
 * De todos ellos, la plataforma construye un objeto con ocho. Lo que no se
 * copia aquí no existe en el sistema y, por tanto, no puede filtrarse.
 */

export interface NormalizedStudent {
  externalId: number;
  firstName: string;
  lastName: string;
  username: string;
  email: string | null;
  code: string | null;
  language: Language;
  enrollmentStatus: EnrollmentStatus;
  /** Valor original, para poder diagnosticar estados nuevos sin adivinar. */
  rawEnrollmentStatus: string | null;
}

export interface NormalizedSection {
  externalId: number;
  code: string;
  levelName: string;
  courseName: string;
  students: NormalizedStudent[];
}

/**
 * Mapeo de estados de matrícula.
 *
 * Phidias devuelve texto libre en español con mayúsculas inconsistentes. El
 * conjunto observado en producción incluye `activo`, `inscrito`, `Admitido`,
 * `pendiente`, `suspendido` y `retirado`, y aparecen valores nuevos con el
 * tiempo: `Admitido` no existía en la extracción del curso anterior.
 *
 * Por eso el mapeo es tolerante: un valor desconocido cae en `UNKNOWN`, se
 * registra como incidencia y **no** interrumpe la sincronización. Detener la
 * carga de mil doscientos estudiantes porque uno tiene un estado nuevo sería
 * desproporcionado.
 */
const ENROLLMENT_STATUS_MAP: Record<string, EnrollmentStatus> = {
  activo: ENROLLMENT_STATUS.ACTIVE,
  activa: ENROLLMENT_STATUS.ACTIVE,
  inscrito: ENROLLMENT_STATUS.ENROLLED,
  inscrita: ENROLLMENT_STATUS.ENROLLED,
  matriculado: ENROLLMENT_STATUS.ENROLLED,
  admitido: ENROLLMENT_STATUS.ADMITTED,
  admitida: ENROLLMENT_STATUS.ADMITTED,
  pendiente: ENROLLMENT_STATUS.PENDING,
  suspendido: ENROLLMENT_STATUS.SUSPENDED,
  suspendida: ENROLLMENT_STATUS.SUSPENDED,
  retirado: ENROLLMENT_STATUS.WITHDRAWN,
  retirada: ENROLLMENT_STATUS.WITHDRAWN,
};

const unknownStatuses = new Set<string>();

export function mapEnrollmentStatus(raw: string | null | undefined): EnrollmentStatus {
  if (!raw) return ENROLLMENT_STATUS.UNKNOWN;

  const normalized = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  const mapped = ENROLLMENT_STATUS_MAP[normalized];
  if (mapped) return mapped;

  // Se registra una sola vez por valor: si aparecen cien estudiantes con un
  // estado nuevo, interesa saberlo, no llenar el registro cien veces.
  if (!unknownStatuses.has(normalized)) {
    unknownStatuses.add(normalized);
    log.warn({ rawStatus: raw }, 'estado de matrícula desconocido; se mapea a UNKNOWN');
  }

  return ENROLLMENT_STATUS.UNKNOWN;
}

export function observedUnknownStatuses(): string[] {
  return [...unknownStatuses];
}

/**
 * Normaliza el nombre.
 *
 * Los datos reales llegan con mayúsculas inconsistentes: la misma persona
 * puede aparecer como `SHARON SOFIA` o como `Jhony`. Se normaliza a
 * capitalización de nombre propio para que los listados no parezcan un grito.
 */
function toTitleCase(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('es')
    .split(/\s+/)
    .map((word) => (word.length > 0 ? word[0]!.toLocaleUpperCase('es') + word.slice(1) : word))
    .join(' ');
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  // Un correo sin arroba no es un correo: es un dato sucio que rompería la
  // unicidad y el envío de notificaciones.
  return trimmed.includes('@') && trimmed.length > 3 ? trimmed : null;
}

/**
 * Convierte a cadena un campo que Phidias devuelve indistintamente como
 * número, cadena o nulo. Es el caso de  y .
 */
function toTrimmedString(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function normalizeStudent(raw: PhidiasStudent): NormalizedStudent | null {
  const firstName = toTitleCase(raw.firstname ?? '');
  const lastName = toTitleCase(raw.lastname ?? '');
  const username = toTrimmedString(raw.username).toLowerCase();

  // Sin nombre o sin usuario no hay nada que sincronizar: es un registro roto
  // en origen y se descarta como incidencia, no como error.
  if (!username || (!firstName && !lastName)) return null;

  return {
    externalId: raw.id,
    firstName: firstName || username,
    lastName: lastName || '—',
    username,
    email: normalizeEmail(raw.email),
    code: toTrimmedString(raw.code) || null,
    language: normalizeLanguage(raw.language),
    enrollmentStatus: mapEnrollmentStatus(raw.enrollment?.status),
    rawEnrollmentStatus: raw.enrollment?.status ?? null,
  };
}

/**
 * Aplana el árbol Nivel → Grado → Sección → Estudiantes.
 *
 * Se conservan los nombres de nivel y grado porque son los que permiten
 * emparejar la sección con un grado propio: los identificadores numéricos de
 * Phidias se reasignan cada curso y no sirven de ancla entre años.
 */
export function flattenConsolidate(levels: PhidiasLevel[]): {
  sections: NormalizedSection[];
  discarded: number;
} {
  const sections: NormalizedSection[] = [];
  let discarded = 0;

  for (const level of levels) {
    for (const course of level.courses) {
      for (const section of course.sections) {
        const students: NormalizedStudent[] = [];

        for (const rawStudent of section.students) {
          const student = normalizeStudent(rawStudent);
          if (student) students.push(student);
          else discarded += 1;
        }

        sections.push({
          externalId: section.id,
          code: section.name.trim().toUpperCase(),
          levelName: level.name.trim(),
          courseName: course.name.trim(),
          students,
        });
      }
    }
  }

  return { sections, discarded };
}
