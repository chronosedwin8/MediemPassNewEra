import { z } from 'zod';
import {
  ERROR_CODE,
  localizedTextSchema,
  type LocalizedText,
  type Paginated,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { buildPaginationMeta } from '../../shared/http/response.js';
import type { PaginationQuery } from '../../middleware/validate.js';

/**
 * Áreas académicas y materias.
 *
 * Comparten archivo porque comparten forma —código, nombre trilingüe, estado
 * y borrado lógico— y separarlas produciría dos copias del mismo código.
 *
 * Ambas están **curadas por el administrador**, no importadas de Phidias:
 * Phidias devuelve 262 "áreas" que incluyen propósitos pedagógicos de
 * preescolar y rúbricas de comportamiento, que no son áreas de conocimiento
 * sobre las que tenga sentido agregar estadísticas. `PhidiasService` las
 * expone para que el administrador elija, pero nada se crea solo.
 */

const codeSchema = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .regex(/^[A-Z0-9-]+$/, 'Solo mayúsculas, números y guion');

export const createAreaSchema = z.object({
  code: codeSchema,
  name: localizedTextSchema,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  active: z.boolean().default(true),
});

export const updateAreaSchema = createAreaSchema.partial().omit({ code: true });

export const createSubjectSchema = z.object({
  code: codeSchema,
  name: localizedTextSchema,
  areaId: z.string().uuid(),
  active: z.boolean().default(true),
});

export const updateSubjectSchema = createSubjectSchema.partial().omit({ code: true });

export type CreateAreaInput = z.infer<typeof createAreaSchema>;
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export interface AreaView {
  id: string;
  code: string;
  name: LocalizedText;
  color: string | null;
  active: boolean;
  subjectCount: number;
  teacherCount: number;
}

export interface SubjectView {
  id: string;
  code: string;
  name: LocalizedText;
  active: boolean;
  area: { id: string; code: string; name: LocalizedText };
}

// --- Áreas -------------------------------------------------------------------

export async function listAreas(query: PaginationQuery): Promise<Paginated<AreaView>> {
  const where = {
    deletedAt: null,
    ...(query.search ? { code: { contains: query.search.toUpperCase() } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.academicArea.count({ where }),
    prisma.academicArea.findMany({
      where,
      orderBy: { code: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        _count: { select: { subjects: true, teachers: true } },
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name as LocalizedText,
      color: row.color,
      active: row.active,
      subjectCount: row._count.subjects,
      teacherCount: row._count.teachers,
    })),
    meta: buildPaginationMeta(query.page, query.pageSize, total),
  };
}

export async function createArea(input: CreateAreaInput): Promise<AreaView> {
  const existing = await prisma.academicArea.findUnique({ where: { code: input.code } });
  if (existing) {
    throw AppError.conflict(ERROR_CODE.DUPLICATE_RESOURCE, 'Area code already exists', {
      code: input.code,
    });
  }

  const created = await prisma.academicArea.create({
    data: {
      code: input.code,
      name: input.name,
      color: input.color ?? null,
      active: input.active,
    },
  });

  return {
    id: created.id,
    code: created.code,
    name: created.name as LocalizedText,
    color: created.color,
    active: created.active,
    subjectCount: 0,
    teacherCount: 0,
  };
}

export async function updateArea(
  id: string,
  input: z.infer<typeof updateAreaSchema>,
): Promise<AreaView> {
  const existing = await prisma.academicArea.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { id });

  const updated = await prisma.academicArea.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color ?? null } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
    include: { _count: { select: { subjects: true, teachers: true } } },
  });

  return {
    id: updated.id,
    code: updated.code,
    name: updated.name as LocalizedText,
    color: updated.color,
    active: updated.active,
    subjectCount: updated._count.subjects,
    teacherCount: updated._count.teachers,
  };
}

/**
 * Borrado lógico de un área.
 *
 * Se impide si todavía tiene materias activas: dejar materias huérfanas
 * rompería los listados y las estadísticas por área sin avisar a nadie.
 */
export async function deleteArea(id: string): Promise<void> {
  const area = await prisma.academicArea.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { subjects: true } } },
  });
  if (!area) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { id });

  const activeSubjects = await prisma.subject.count({ where: { areaId: id, deletedAt: null } });
  if (activeSubjects > 0) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'Area still has active subjects', {
      subjects: activeSubjects,
    });
  }

  await prisma.academicArea.update({
    where: { id },
    data: { deletedAt: new Date(), active: false, code: `${area.code}-DEL-${Date.now()}`.slice(0, 20) },
  });
}

// --- Materias ----------------------------------------------------------------

export async function listSubjects(
  query: PaginationQuery & { areaId?: string },
): Promise<Paginated<SubjectView>> {
  const where = {
    deletedAt: null,
    ...(query.areaId ? { areaId: query.areaId } : {}),
    ...(query.search ? { code: { contains: query.search.toUpperCase() } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.subject.count({ where }),
    prisma.subject.findMany({
      where,
      orderBy: { code: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { area: { select: { id: true, code: true, name: true } } },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name as LocalizedText,
      active: row.active,
      area: {
        id: row.area.id,
        code: row.area.code,
        name: row.area.name as LocalizedText,
      },
    })),
    meta: buildPaginationMeta(query.page, query.pageSize, total),
  };
}

export async function createSubject(input: CreateSubjectInput): Promise<SubjectView> {
  const area = await prisma.academicArea.findFirst({
    where: { id: input.areaId, deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (!area) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { areaId: input.areaId });

  const existing = await prisma.subject.findUnique({ where: { code: input.code } });
  if (existing) {
    throw AppError.conflict(ERROR_CODE.DUPLICATE_RESOURCE, 'Subject code already exists', {
      code: input.code,
    });
  }

  const created = await prisma.subject.create({
    data: { code: input.code, name: input.name, areaId: input.areaId, active: input.active },
  });

  return {
    id: created.id,
    code: created.code,
    name: created.name as LocalizedText,
    active: created.active,
    area: { id: area.id, code: area.code, name: area.name as LocalizedText },
  };
}

export async function updateSubject(
  id: string,
  input: z.infer<typeof updateSubjectSchema>,
): Promise<SubjectView> {
  const existing = await prisma.subject.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { id });

  if (input.areaId) {
    const area = await prisma.academicArea.findFirst({
      where: { id: input.areaId, deletedAt: null },
      select: { id: true },
    });
    if (!area) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { areaId: input.areaId });
  }

  const updated = await prisma.subject.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.areaId ? { areaId: input.areaId } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
    include: { area: { select: { id: true, code: true, name: true } } },
  });

  return {
    id: updated.id,
    code: updated.code,
    name: updated.name as LocalizedText,
    active: updated.active,
    area: {
      id: updated.area.id,
      code: updated.area.code,
      name: updated.area.name as LocalizedText,
    },
  };
}

export async function deleteSubject(id: string): Promise<void> {
  const subject = await prisma.subject.findFirst({ where: { id, deletedAt: null } });
  if (!subject) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { id });

  // Una materia con evaluaciones vivas no se borra: sus resultados históricos
  // dejarían de poder atribuirse a nada.
  const assessments = await prisma.assessment.count({
    where: { subjectId: id, deletedAt: null },
  });
  if (assessments > 0) {
    throw AppError.conflict(ERROR_CODE.ASSESSMENT_IN_USE, 'Subject is used by assessments', {
      assessments,
    });
  }

  await prisma.subject.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      active: false,
      code: `${subject.code}-DEL-${Date.now()}`.slice(0, 20),
    },
  });
}
