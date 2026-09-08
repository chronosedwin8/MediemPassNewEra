import { z } from 'zod';
import {
  ASSESSMENT_AUDIENCE,
  AUDIT_ACTION,
  ERROR_CODE,
  SCALE_KIND,
  bandDisplayRange,
  localizedTextSchema,
  validateScaleBands,
  type AssessmentAudience,
  type GradingBand,
  type GradingScale,
  type LocalizedText,
  type ScaleKind,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { cache } from '../../shared/cache/cache.service.js';
import { recordAudit } from '../audit/audit.service.js';

/**
 * Escalas de calificación.
 *
 * La pieza central: **una escala en uso no se modifica, se versiona**.
 * Editarla crea la versión siguiente y desactiva la anterior, que sigue
 * existiendo porque los resultados ya emitidos apuntan a ella. Sin esto,
 * cambiar en 2028 el umbral del sobresaliente reescribiría el significado de
 * todos los boletines de 2026.
 */

const CACHE_PREFIX = 'scale:';
const CACHE_TTL_SECONDS = 300;

const bandSchema = z.object({
  position: z.number().int().min(0).max(20),
  value: z.number().min(0).max(100),
  minPercentage: z.number().min(0).max(100),
  label: localizedTextSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const updateScaleSchema = z.object({
  name: localizedTextSchema.optional(),
  passingPercentage: z.number().min(0).max(100),
  bands: z.array(bandSchema).min(1).max(20),
});

export type UpdateScaleInput = z.infer<typeof updateScaleSchema>;

export interface ScaleBandView extends GradingBand {
  /** Rango que se muestra al usuario; el máximo se deriva de la banda mejor. */
  displayMin: number;
  displayMax: number;
  labels: LocalizedText;
}

export interface ScaleView {
  id: string;
  code: string;
  version: number;
  name: LocalizedText;
  audience: AssessmentAudience;
  kind: ScaleKind;
  passingPercentage: number;
  lowerIsBetter: boolean;
  isActive: boolean;
  createdAt: Date;
  bands: ScaleBandView[];
}

type ScaleRow = {
  id: string;
  code: string;
  version: number;
  name: unknown;
  audience: string;
  kind: string;
  passingPercentage: unknown;
  lowerIsBetter: boolean;
  isActive: boolean;
  createdAt: Date;
  bands: Array<{
    position: number;
    value: unknown;
    minPercentage: unknown;
    label: unknown;
    color: string;
  }>;
};

function toView(row: ScaleRow): ScaleView {
  const bands: GradingBand[] = row.bands
    .map((band) => ({
      position: band.position,
      value: Number(band.value),
      minPercentage: Number(band.minPercentage),
      label: (band.label as LocalizedText).es,
      color: band.color,
    }))
    .sort((a, b) => a.position - b.position);

  return {
    id: row.id,
    code: row.code,
    version: row.version,
    name: row.name as LocalizedText,
    audience: row.audience as AssessmentAudience,
    kind: row.kind as ScaleKind,
    passingPercentage: Number(row.passingPercentage),
    lowerIsBetter: row.lowerIsBetter,
    isActive: row.isActive,
    createdAt: row.createdAt,
    bands: bands.map((band, index) => {
      const range = bandDisplayRange(band, bands);
      return {
        ...band,
        displayMin: range.min,
        displayMax: range.max,
        labels: row.bands.find((raw) => raw.position === band.position)?.label as LocalizedText,
        // `index` se usa solo para conservar el orden en la respuesta.
        position: bands[index]!.position,
      };
    }),
  };
}

const scaleInclude = { bands: { orderBy: { position: 'asc' as const } } };

/**
 * Escala vigente para una audiencia.
 *
 * La usa el motor al calificar, así que se cachea: es una consulta por cada
 * intento enviado.
 */
export async function getActiveScale(audience: AssessmentAudience): Promise<GradingScale> {
  return cache.remember(`${CACHE_PREFIX}active:${audience}`, CACHE_TTL_SECONDS, async () => {
    const row = await prisma.gradingScale.findFirst({
      where: { audience, isActive: true },
      orderBy: { version: 'desc' },
      include: scaleInclude,
    });

    if (!row) {
      throw AppError.notFound(ERROR_CODE.SCALE_NOT_FOUND, { audience });
    }

    return {
      id: row.id,
      name: (row.name as LocalizedText).es,
      kind: row.kind as ScaleKind,
      passingPercentage: Number(row.passingPercentage),
      lowerIsBetter: row.lowerIsBetter,
      bands: row.bands.map((band) => ({
        position: band.position,
        value: Number(band.value),
        minPercentage: Number(band.minPercentage),
        label: (band.label as LocalizedText).es,
        color: band.color,
      })),
    };
  });
}

/** Escala concreta por id: la que un resultado histórico tiene fijada. */
export async function getScaleById(id: string): Promise<GradingScale> {
  return cache.remember(`${CACHE_PREFIX}id:${id}`, CACHE_TTL_SECONDS, async () => {
    const row = await prisma.gradingScale.findUnique({ where: { id }, include: scaleInclude });
    if (!row) throw AppError.notFound(ERROR_CODE.SCALE_NOT_FOUND, { id });

    return {
      id: row.id,
      name: (row.name as LocalizedText).es,
      kind: row.kind as ScaleKind,
      passingPercentage: Number(row.passingPercentage),
      lowerIsBetter: row.lowerIsBetter,
      bands: row.bands.map((band) => ({
        position: band.position,
        value: Number(band.value),
        minPercentage: Number(band.minPercentage),
        label: (band.label as LocalizedText).es,
        color: band.color,
      })),
    };
  });
}

export async function listScales(includeHistory = false): Promise<ScaleView[]> {
  const rows = await prisma.gradingScale.findMany({
    where: includeHistory ? {} : { isActive: true },
    orderBy: [{ audience: 'asc' }, { version: 'desc' }],
    include: scaleInclude,
  });
  return rows.map((row) => toView(row as unknown as ScaleRow));
}

/**
 * Publica una versión nueva de la escala.
 *
 * Nunca actualiza la vigente. Valida las bandas con las mismas invariantes que
 * usa el frontend para previsualizarlas, de modo que una escala con huecos o
 * con umbrales que no descienden se rechaza antes de tocar la base.
 */
export async function updateScale(
  code: string,
  input: UpdateScaleInput,
  actorId: string,
): Promise<ScaleView> {
  const current = await prisma.gradingScale.findFirst({
    where: { code, isActive: true },
    orderBy: { version: 'desc' },
    include: scaleInclude,
  });
  if (!current) throw AppError.notFound(ERROR_CODE.SCALE_NOT_FOUND, { code });

  if (current.kind === SCALE_KIND.PERCENTAGE && input.bands.length > 1) {
    throw AppError.conflict(
      ERROR_CODE.SCALE_BANDS_INVALID,
      'A percentage scale cannot define grade bands',
    );
  }

  const bands: GradingBand[] = input.bands.map((band) => ({
    position: band.position,
    value: band.value,
    minPercentage: band.minPercentage,
    label: band.label.es,
    color: band.color,
  }));

  try {
    validateScaleBands(bands);
  } catch (error) {
    throw new AppError(
      ERROR_CODE.SCALE_BANDS_INVALID,
      error instanceof Error ? error.message : 'Invalid bands',
      { cause: error },
    );
  }

  const nextVersion = current.version + 1;

  const createdId = await prisma.$transaction(async (tx) => {
    // La anterior se desactiva pero permanece: los intentos ya calificados la
    // referencian y deben poder resolverla para siempre.
    await tx.gradingScale.updateMany({
      where: { code, isActive: true },
      data: { isActive: false },
    });

    const scale = await tx.gradingScale.create({
      data: {
        code,
        version: nextVersion,
        name: (input.name ?? current.name) as object,
        audience: current.audience,
        kind: current.kind,
        passingPercentage: input.passingPercentage,
        lowerIsBetter: current.lowerIsBetter,
        isActive: true,
        createdById: actorId,
      },
    });

    await tx.gradingScaleBand.createMany({
      data: input.bands.map((band) => ({
        scaleId: scale.id,
        position: band.position,
        value: band.value,
        minPercentage: band.minPercentage,
        label: band.label as object,
        color: band.color,
      })),
    });

    return scale.id;
  });

  await cache.deleteByPrefix(CACHE_PREFIX);

  await recordAudit({
    userId: actorId,
    action: AUDIT_ACTION.UPDATE_GRADING_SCALE,
    entityType: 'grading_scale',
    entityId: createdId,
    metadata: { code, previousVersion: current.version, newVersion: nextVersion },
  });

  const createdRow = await prisma.gradingScale.findUniqueOrThrow({
    where: { id: createdId },
    include: scaleInclude,
  });

  return toView(createdRow as unknown as ScaleRow);
}

export const DEFAULT_SCALE_CODES = {
  [ASSESSMENT_AUDIENCE.STUDENT]: 'student-default',
  [ASSESSMENT_AUDIENCE.TEACHER]: 'teacher-default',
} as const;
