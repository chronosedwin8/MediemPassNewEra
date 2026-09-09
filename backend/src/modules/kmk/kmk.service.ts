import { ERROR_CODE, localizedTextSchema, type LocalizedText } from '@medienpass/shared';
import { z } from 'zod';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { cache } from '../../shared/cache/cache.service.js';

/**
 * Competencias KMK.
 *
 * El marco cambia rarísima vez y se consulta en casi todas las pantallas, así
 * que el árbol completo se cachea. Cualquier escritura lo invalida.
 */

const CACHE_KEY = 'kmk:tree';
const CACHE_TTL_SECONDS = 600;

export interface SubcompetencyNode {
  id: string;
  code: string;
  name: LocalizedText;
  description: LocalizedText | null;
  position: number;
  active: boolean;
  indicators: Array<{ id: string; code: string; name: LocalizedText; position: number }>;
}

export interface CompetencyNode {
  id: string;
  code: string;
  name: LocalizedText;
  description: LocalizedText;
  color: string;
  icon: string | null;
  position: number;
  active: boolean;
  subcompetencies: SubcompetencyNode[];
}

export const upsertCompetencySchema = z.object({
  code: z.string().trim().min(1).max(10),
  name: localizedTextSchema,
  description: localizedTextSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Debe ser un color hexadecimal'),
  icon: z.string().trim().max(50).optional(),
  position: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const upsertSubcompetencySchema = z.object({
  competencyId: z.string().uuid(),
  code: z.string().trim().min(1).max(10),
  name: localizedTextSchema,
  description: localizedTextSchema.optional(),
  position: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export type UpsertCompetencyInput = z.infer<typeof upsertCompetencySchema>;
export type UpsertSubcompetencyInput = z.infer<typeof upsertSubcompetencySchema>;

export async function getCompetencyTree(includeInactive = false): Promise<CompetencyNode[]> {
  const cacheKey = `${CACHE_KEY}:${includeInactive ? 'all' : 'active'}`;

  return cache.remember(cacheKey, CACHE_TTL_SECONDS, async () => {
    const rows = await prisma.kmkCompetency.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { position: 'asc' },
      include: {
        subcompetencies: {
          where: includeInactive ? {} : { active: true },
          orderBy: { position: 'asc' },
          include: {
            indicators: {
              where: includeInactive ? {} : { active: true },
              orderBy: { position: 'asc' },
            },
          },
        },
      },
    });

    return rows.map((competency) => ({
      id: competency.id,
      code: competency.code,
      name: competency.name as LocalizedText,
      description: competency.description as LocalizedText,
      color: competency.color,
      icon: competency.icon,
      position: competency.position,
      active: competency.active,
      subcompetencies: competency.subcompetencies.map((sub) => ({
        id: sub.id,
        code: sub.code,
        name: sub.name as LocalizedText,
        description: (sub.description as LocalizedText | null) ?? null,
        position: sub.position,
        active: sub.active,
        indicators: sub.indicators.map((indicator) => ({
          id: indicator.id,
          code: indicator.code,
          name: indicator.name as LocalizedText,
          position: indicator.position,
        })),
      })),
    }));
  });
}

export async function getCompetency(id: string): Promise<CompetencyNode> {
  const tree = await getCompetencyTree(true);
  const found = tree.find((competency) => competency.id === id);
  if (!found) throw AppError.notFound(ERROR_CODE.COMPETENCY_NOT_FOUND, { id });
  return found;
}

/**
 * Comprueba que una competencia (y su subcompetencia, si se indica) existen y
 * que la subcompetencia pertenece realmente a esa competencia.
 *
 * Lo usa el editor de preguntas: una pregunta asociada a la competencia 3 con
 * una subcompetencia de la 5 produciría estadísticas sin sentido.
 */
export async function assertCompetencyPair(
  competencyId: string,
  subcompetencyId: string | null | undefined,
): Promise<void> {
  const competency = await prisma.kmkCompetency.findUnique({
    where: { id: competencyId },
    select: { id: true, active: true },
  });
  if (!competency) throw AppError.notFound(ERROR_CODE.COMPETENCY_NOT_FOUND, { competencyId });

  if (!subcompetencyId) return;

  const subcompetency = await prisma.kmkSubcompetency.findUnique({
    where: { id: subcompetencyId },
    select: { competencyId: true },
  });

  if (!subcompetency) {
    throw AppError.notFound(ERROR_CODE.COMPETENCY_NOT_FOUND, { subcompetencyId });
  }
  if (subcompetency.competencyId !== competencyId) {
    throw AppError.conflict(
      ERROR_CODE.CONFLICT,
      'Subcompetency does not belong to the given competency',
      { competencyId, subcompetencyId },
    );
  }
}

async function invalidate(): Promise<void> {
  await cache.deleteByPrefix(CACHE_KEY);
}

export async function createCompetency(input: UpsertCompetencyInput): Promise<CompetencyNode> {
  const existing = await prisma.kmkCompetency.findUnique({ where: { code: input.code } });
  if (existing) {
    throw AppError.conflict(ERROR_CODE.DUPLICATE_RESOURCE, 'Competency code already exists', {
      code: input.code,
    });
  }

  const maxPosition = await prisma.kmkCompetency.aggregate({ _max: { position: true } });

  const created = await prisma.kmkCompetency.create({
    data: {
      code: input.code,
      name: input.name,
      description: input.description,
      color: input.color,
      icon: input.icon ?? null,
      position: input.position ?? (maxPosition._max.position ?? -1) + 1,
      active: input.active ?? true,
    },
  });

  await invalidate();
  return getCompetency(created.id);
}

export async function updateCompetency(
  id: string,
  input: Partial<UpsertCompetencyInput>,
): Promise<CompetencyNode> {
  const existing = await prisma.kmkCompetency.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound(ERROR_CODE.COMPETENCY_NOT_FOUND, { id });

  await prisma.kmkCompetency.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.color ? { color: input.color } : {}),
      ...(input.icon !== undefined ? { icon: input.icon ?? null } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });

  await invalidate();
  return getCompetency(id);
}

export async function createSubcompetency(
  input: UpsertSubcompetencyInput,
): Promise<CompetencyNode> {
  const competency = await prisma.kmkCompetency.findUnique({ where: { id: input.competencyId } });
  if (!competency) {
    throw AppError.notFound(ERROR_CODE.COMPETENCY_NOT_FOUND, { id: input.competencyId });
  }

  const existing = await prisma.kmkSubcompetency.findUnique({ where: { code: input.code } });
  if (existing) {
    throw AppError.conflict(ERROR_CODE.DUPLICATE_RESOURCE, 'Subcompetency code already exists', {
      code: input.code,
    });
  }

  const maxPosition = await prisma.kmkSubcompetency.aggregate({
    where: { competencyId: input.competencyId },
    _max: { position: true },
  });

  await prisma.kmkSubcompetency.create({
    data: {
      competencyId: input.competencyId,
      code: input.code,
      name: input.name,
      description: input.description ?? undefined,
      position: input.position ?? (maxPosition._max.position ?? -1) + 1,
      active: input.active ?? true,
    },
  });

  await invalidate();
  return getCompetency(input.competencyId);
}

/**
 * Desactiva una competencia en lugar de borrarla.
 *
 * Borrarla rompería toda pregunta y toda respuesta que la referencian, que es
 * exactamente el historial que la plataforma existe para conservar.
 */
export async function deactivateCompetency(id: string): Promise<void> {
  const competency = await prisma.kmkCompetency.findUnique({ where: { id } });
  if (!competency) throw AppError.notFound(ERROR_CODE.COMPETENCY_NOT_FOUND, { id });

  await prisma.kmkCompetency.update({ where: { id }, data: { active: false } });
  await invalidate();
}
