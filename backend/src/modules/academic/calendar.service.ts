import { z } from 'zod';
import { ERROR_CODE, type LocalizedText } from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';

/**
 * Calendario académico: años, periodos, niveles y grados.
 *
 * Los años y periodos pueden llegar de Phidias; los niveles y grados son
 * propios y estables, porque los identificadores de Phidias se reasignan cada
 * curso —los niveles pasaron de 14/15/16 a 17/18/19 entre 2025-26 y 2026-27— y
 * anclarse a ellos impediría comparar un año con otro.
 */

export const createYearSchema = z
  .object({
    code: z.string().trim().min(4).max(20),
    name: z.string().trim().min(1).max(100),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    externalId: z.number().int().positive().nullable().optional(),
    isCurrent: z.boolean().default(false),
  })
  .refine((input) => input.startDate < input.endDate, {
    message: 'La fecha de inicio debe ser anterior a la de fin',
    path: ['endDate'],
  });

export const createPeriodSchema = z
  .object({
    academicYearId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    position: z.number().int().min(0),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    weight: z.number().int().min(0).max(100).default(0),
    externalId: z.number().int().positive().nullable().optional(),
  })
  .refine((input) => input.startDate < input.endDate, {
    message: 'La fecha de inicio debe ser anterior a la de fin',
    path: ['endDate'],
  });

export type CreateYearInput = z.infer<typeof createYearSchema>;
export type CreatePeriodInput = z.infer<typeof createPeriodSchema>;

export interface PeriodView {
  id: string;
  name: string;
  position: number;
  startDate: Date;
  endDate: Date;
  weight: number;
  isCurrent: boolean;
}

export interface YearView {
  id: string;
  code: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
  active: boolean;
  periods: PeriodView[];
}

function withCurrentFlag(
  periods: Array<{
    id: string;
    name: string;
    position: number;
    startDate: Date;
    endDate: Date;
    weight: number;
  }>,
  now: Date,
): PeriodView[] {
  return periods.map((period) => ({
    ...period,
    isCurrent: period.startDate <= now && period.endDate >= now,
  }));
}

export async function listYears(): Promise<YearView[]> {
  const now = new Date();
  const rows = await prisma.academicYear.findMany({
    orderBy: { startDate: 'desc' },
    include: { periods: { orderBy: { position: 'asc' } } },
  });

  return rows.map((year) => ({
    id: year.id,
    code: year.code,
    name: year.name,
    startDate: year.startDate,
    endDate: year.endDate,
    isCurrent: year.isCurrent,
    active: year.active,
    periods: withCurrentFlag(year.periods, now),
  }));
}

/**
 * Año vigente.
 *
 * Se prefiere la marca explícita del administrador y, si no la hay, se
 * resuelve por fecha. Ninguna de las dos puede fallar en silencio: sin año
 * vigente no se pueden crear grupos ni asignar evaluaciones.
 */
export async function getCurrentYear(): Promise<YearView> {
  const now = new Date();

  const marked = await prisma.academicYear.findFirst({
    where: { isCurrent: true, active: true },
    include: { periods: { orderBy: { position: 'asc' } } },
  });

  const byDate =
    marked ??
    (await prisma.academicYear.findFirst({
      where: { active: true, startDate: { lte: now }, endDate: { gte: now } },
      include: { periods: { orderBy: { position: 'asc' } } },
    }));

  if (!byDate) {
    throw AppError.notFound(ERROR_CODE.NOT_FOUND, {
      message: 'No hay ningún año académico vigente configurado',
    });
  }

  return {
    id: byDate.id,
    code: byDate.code,
    name: byDate.name,
    startDate: byDate.startDate,
    endDate: byDate.endDate,
    isCurrent: byDate.isCurrent,
    active: byDate.active,
    periods: withCurrentFlag(byDate.periods, now),
  };
}

/**
 * Periodo que contiene una fecha dada, dentro del año indicado.
 *
 * Lo usa el motor al calificar, para atribuir cada respuesta al periodo
 * correcto: sin esto, las estadísticas por periodo no existirían.
 */
export async function resolvePeriodAt(date: Date, academicYearId?: string): Promise<string | null> {
  const period = await prisma.academicPeriod.findFirst({
    where: {
      active: true,
      startDate: { lte: date },
      endDate: { gte: date },
      ...(academicYearId ? { academicYearId } : {}),
    },
    orderBy: { position: 'asc' },
    select: { id: true },
  });

  return period?.id ?? null;
}

export async function createYear(input: CreateYearInput): Promise<YearView> {
  const existing = await prisma.academicYear.findUnique({ where: { code: input.code } });
  if (existing) {
    throw AppError.conflict(ERROR_CODE.DUPLICATE_RESOURCE, 'Academic year code already exists');
  }

  const created = await prisma.academicYear.create({
    data: {
      code: input.code,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      externalId: input.externalId ?? null,
      isCurrent: input.isCurrent,
    },
  });

  // Solo puede haber un año vigente: marcarlo desmarca al anterior.
  if (input.isCurrent) {
    await prisma.academicYear.updateMany({
      where: { id: { not: created.id } },
      data: { isCurrent: false },
    });
  }

  return { ...created, periods: [] };
}

export async function createPeriod(input: CreatePeriodInput): Promise<PeriodView> {
  const year = await prisma.academicYear.findUnique({ where: { id: input.academicYearId } });
  if (!year) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { id: input.academicYearId });

  if (input.startDate < year.startDate || input.endDate > year.endDate) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'Period falls outside its academic year', {
      yearStart: year.startDate,
      yearEnd: year.endDate,
    });
  }

  const clash = await prisma.academicPeriod.findFirst({
    where: { academicYearId: input.academicYearId, position: input.position },
  });
  if (clash) {
    throw AppError.conflict(ERROR_CODE.DUPLICATE_RESOURCE, 'Position already used in this year');
  }

  const created = await prisma.academicPeriod.create({
    data: {
      academicYearId: input.academicYearId,
      name: input.name,
      position: input.position,
      startDate: input.startDate,
      endDate: input.endDate,
      weight: input.weight,
      externalId: input.externalId ?? null,
    },
  });

  const now = new Date();
  return {
    id: created.id,
    name: created.name,
    position: created.position,
    startDate: created.startDate,
    endDate: created.endDate,
    weight: created.weight,
    isCurrent: created.startDate <= now && created.endDate >= now,
  };
}

// --- Niveles y grados (solo lectura desde la API) ----------------------------

export interface GradeLevelView {
  id: string;
  code: string;
  name: LocalizedText;
  ordinal: number | null;
  position: number;
  educationLevel: { id: string; code: string; name: LocalizedText };
}

export async function listGradeLevels(): Promise<GradeLevelView[]> {
  const rows = await prisma.gradeLevel.findMany({
    where: { active: true },
    orderBy: { position: 'asc' },
    include: { educationLevel: { select: { id: true, code: true, name: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name as LocalizedText,
    ordinal: row.ordinal,
    position: row.position,
    educationLevel: {
      id: row.educationLevel.id,
      code: row.educationLevel.code,
      name: row.educationLevel.name as LocalizedText,
    },
  }));
}
