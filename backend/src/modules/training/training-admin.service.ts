import { z } from 'zod';
import {
  AUDIT_ACTION,
  ERROR_CODE,
  RICH_TEXT_MAX_LENGTH,
  SUPPORTED_LANGUAGES,
  type LocalizedText,
  type Role,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { recordAudit } from '../audit/audit.service.js';
import { createLogger } from '../../shared/logger.js';
import { sanitizeOptionalRichText } from '../../shared/security/sanitize.js';
import { purgeFiles } from '../files/files.service.js';

const log = createLogger('training-admin');

/**
 * Redacción del material de capacitación.
 *
 * Es el lado de escritura de la formación docente: hasta ahora los módulos
 * solo existían si alguien los ponía en la semilla, lo que significa que
 * ampliar la formación exigía tocar código y desplegar. Aquí un administrador
 * escribe, ordena, previsualiza y publica.
 *
 * Dos reglas gobiernan el módulo:
 *
 *  1. **Nada se ve hasta publicarlo.** Un módulo a medio escribir en la
 *     pantalla de un docente que está formándose es peor que no tener módulo:
 *     lo abre, no entiende nada y no vuelve.
 *  2. **El texto se sanea al guardar.** El contenido es HTML escrito por una
 *     persona y lo leen decenas de docentes; sin lista blanca, una etiqueta
 *     pegada desde Word puede traer cualquier cosa dentro.
 */

/** Texto en varios idiomas. Al menos uno tiene que venir con contenido. */
const localizedText = z
  .object({
    es: z.string().trim().max(RICH_TEXT_MAX_LENGTH).optional(),
    de: z.string().trim().max(RICH_TEXT_MAX_LENGTH).optional(),
    en: z.string().trim().max(RICH_TEXT_MAX_LENGTH).optional(),
  })
  .refine((value) => SUPPORTED_LANGUAGES.some((code) => (value[code] ?? '').trim().length > 0), {
    message: 'Hay que escribirlo al menos en un idioma',
  });

export const createModuleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9-]+$/, 'Solo mayúsculas, números y guiones'),
  kmkCompetencyId: z.string().uuid(),
  title: localizedText,
  description: localizedText,
  estimatedMinutes: z.number().int().min(0).max(600).nullable().optional(),
});

export const updateModuleSchema = z.object({
  title: localizedText.optional(),
  description: localizedText.optional(),
  kmkCompetencyId: z.string().uuid().optional(),
  estimatedMinutes: z.number().int().min(0).max(600).nullable().optional(),
});

export const contentSchema = z.object({
  type: z.enum(['TEXT', 'VIDEO', 'DOCUMENT', 'LINK', 'ACTIVITY']),
  title: localizedText,
  /** Cuerpo con formato. Opcional: un bloque de vídeo puede ser solo el enlace. */
  body: localizedText.optional().nullable(),
  url: z.string().trim().url().max(1000).nullable().optional(),
});

export const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) });

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type ContentInput = z.infer<typeof contentSchema>;

interface Actor {
  userId: string;
  roles: Role[];
}

/**
 * Limpia cada idioma por separado y descarta los vacíos.
 *
 * Guardar `{ es: 'texto', de: '', en: '' }` haría que `localize` devolviera
 * cadena vacía para un docente en alemán en lugar de recurrir al español. Con
 * las claves ausentes, el respaldo funciona.
 */
function sanitizeLocalized(text: Record<string, string | undefined>, field: string): LocalizedText {
  const clean: Record<string, string> = {};

  for (const language of SUPPORTED_LANGUAGES) {
    const value = sanitizeOptionalRichText(text[language], `${field}.${language}`);
    if (value) clean[language] = value;
  }

  return clean as LocalizedText;
}

const moduleInclude = {
  kmkCompetency: { select: { id: true, code: true, name: true, color: true } },
  _count: { select: { contents: true } },
} as const;

/**
 * Todos los módulos, incluidos los borradores.
 *
 * Es la diferencia con el listado del profesorado: quien redacta necesita ver
 * lo que está a medias, y quien se forma no.
 */
export async function listAllModules() {
  const modules = await prisma.trainingModule.findMany({
    orderBy: [{ position: 'asc' }],
    include: moduleInclude,
  });

  return modules.map((module) => ({
    id: module.id,
    code: module.code,
    status: module.status,
    publishedAt: module.publishedAt,
    title: module.title as LocalizedText,
    description: module.description as LocalizedText,
    estimatedMinutes: module.estimatedMinutes,
    position: module.position,
    contentCount: module._count.contents,
    hasAssessment: module.assessmentId !== null,
    competency: {
      id: module.kmkCompetency.id,
      code: module.kmkCompetency.code,
      name: module.kmkCompetency.name as LocalizedText,
      color: module.kmkCompetency.color,
    },
  }));
}

/** Un módulo con su material, tal como lo edita quien lo escribe. */
export async function getModuleForEditing(moduleId: string) {
  const module = await prisma.trainingModule.findUnique({
    where: { id: moduleId },
    include: {
      ...moduleInclude,
      contents: {
        orderBy: { position: 'asc' },
        include: {
          files: {
            select: {
              id: true,
              originalName: true,
              contentType: true,
              sizeBytes: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
      assessment: { select: { id: true, title: true } },
    },
  });
  if (!module) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { moduleId });

  return module;
}

export async function createModule(actor: Actor, input: CreateModuleInput) {
  const [competency, existing] = await Promise.all([
    prisma.kmkCompetency.findUnique({ where: { id: input.kmkCompetencyId }, select: { id: true } }),
    prisma.trainingModule.findUnique({ where: { code: input.code }, select: { id: true } }),
  ]);

  if (!competency) throw AppError.notFound(ERROR_CODE.COMPETENCY_NOT_FOUND);
  if (existing) {
    throw AppError.conflict(ERROR_CODE.DUPLICATE_RESOURCE, 'Ya existe un módulo con ese código', {
      code: input.code,
    });
  }

  const maxPosition = await prisma.trainingModule.aggregate({ _max: { position: true } });

  const module = await prisma.trainingModule.create({
    data: {
      code: input.code,
      kmkCompetencyId: input.kmkCompetencyId,
      title: sanitizeLocalized(input.title, 'title'),
      description: sanitizeLocalized(input.description, 'description'),
      estimatedMinutes: input.estimatedMinutes ?? null,
      position: (maxPosition._max.position ?? -1) + 1,
      // Nace en borrador siempre: publicar es un acto, no un efecto.
      status: 'DRAFT',
    },
    include: moduleInclude,
  });

  await recordAudit({
    userId: actor.userId,
    action: AUDIT_ACTION.CREATE_TRAINING_MODULE,
    entityType: 'training_module',
    entityId: module.id,
    metadata: { code: module.code },
  });

  return module;
}

export async function updateModule(actor: Actor, moduleId: string, input: UpdateModuleInput) {
  const module = await prisma.trainingModule.findUnique({
    where: { id: moduleId },
    select: { id: true },
  });
  if (!module) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { moduleId });

  return prisma.trainingModule.update({
    where: { id: moduleId },
    data: {
      ...(input.title ? { title: sanitizeLocalized(input.title, 'title') } : {}),
      ...(input.description
        ? { description: sanitizeLocalized(input.description, 'description') }
        : {}),
      ...(input.kmkCompetencyId ? { kmkCompetencyId: input.kmkCompetencyId } : {}),
      ...(input.estimatedMinutes !== undefined ? { estimatedMinutes: input.estimatedMinutes } : {}),
    },
    include: moduleInclude,
  });
}

/**
 * Publica el módulo.
 *
 * Se exige que tenga material. Publicar un módulo vacío es exactamente lo que
 * la regla pretende evitar: un docente lo abre, no encuentra nada y deja de
 * fiarse del resto.
 */
export async function publishModule(actor: Actor, moduleId: string) {
  const module = await prisma.trainingModule.findUnique({
    where: { id: moduleId },
    include: { _count: { select: { contents: true } } },
  });
  if (!module) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { moduleId });

  if (module._count.contents === 0) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'El módulo no tiene material que mostrar');
  }

  const updated = await prisma.trainingModule.update({
    where: { id: moduleId },
    data: { status: 'PUBLISHED', publishedAt: module.publishedAt ?? new Date(), active: true },
    include: moduleInclude,
  });

  await recordAudit({
    userId: actor.userId,
    action: AUDIT_ACTION.PUBLISH_TRAINING_MODULE,
    entityType: 'training_module',
    entityId: moduleId,
    metadata: { code: module.code, contents: module._count.contents },
  });

  log.info({ moduleId, code: module.code }, 'módulo de capacitación publicado');
  return updated;
}

/**
 * Lo retira de circulación sin borrarlo.
 *
 * El avance de quien ya lo cursó se conserva: haberlo hecho es un hecho del
 * pasado y retirar el módulo no lo deshace.
 */
export async function unpublishModule(actor: Actor, moduleId: string, archive: boolean) {
  const module = await prisma.trainingModule.findUnique({
    where: { id: moduleId },
    select: { id: true, code: true },
  });
  if (!module) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { moduleId });

  const updated = await prisma.trainingModule.update({
    where: { id: moduleId },
    data: { status: archive ? 'ARCHIVED' : 'DRAFT', active: false },
    include: moduleInclude,
  });

  await recordAudit({
    userId: actor.userId,
    action: AUDIT_ACTION.PUBLISH_TRAINING_MODULE,
    entityType: 'training_module',
    entityId: moduleId,
    metadata: { code: module.code, operation: archive ? 'archive' : 'unpublish' },
  });

  return updated;
}

/**
 * Borra el módulo y su material.
 *
 * Se niega si alguien registró avance: eso ya no es contenido editable, es el
 * expediente de formación de una persona. Para quitarlo de en medio está
 * archivar.
 */
export async function deleteModule(actor: Actor, moduleId: string) {
  const module = await prisma.trainingModule.findUnique({
    where: { id: moduleId },
    include: { _count: { select: { progress: true } } },
  });
  if (!module) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { moduleId });

  if (module._count.progress > 0) {
    throw AppError.conflict(
      ERROR_CODE.CONFLICT,
      'Hay docentes con avance registrado en este módulo; archívalo en lugar de borrarlo',
      { progress: module._count.progress },
    );
  }

  const contents = await prisma.trainingContent.findMany({
    where: { moduleId },
    select: { id: true },
  });

  // Los archivos primero: la cascada de la base borraría las filas y dejaría
  // los objetos en el bucket sin nada que los mencione.
  for (const content of contents) {
    await purgeFiles(actor, { trainingContentId: content.id }, 'training_module_delete');
  }

  await prisma.trainingModule.delete({ where: { id: moduleId } });
  log.warn({ moduleId, code: module.code }, 'módulo de capacitación eliminado');
}

// --- Bloques de contenido ----------------------------------------------------

export async function addContent(moduleId: string, input: ContentInput) {
  const module = await prisma.trainingModule.findUnique({
    where: { id: moduleId },
    select: { id: true },
  });
  if (!module) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { moduleId });

  const maxPosition = await prisma.trainingContent.aggregate({
    where: { moduleId },
    _max: { position: true },
  });

  return prisma.trainingContent.create({
    data: {
      moduleId,
      type: input.type,
      title: sanitizeLocalized(input.title, 'title'),
      body: input.body ? sanitizeLocalized(input.body, 'body') : undefined,
      url: input.url ?? null,
      position: (maxPosition._max.position ?? -1) + 1,
    },
  });
}

export async function updateContent(contentId: string, input: ContentInput) {
  const content = await prisma.trainingContent.findUnique({
    where: { id: contentId },
    select: { id: true },
  });
  if (!content) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { contentId });

  return prisma.trainingContent.update({
    where: { id: contentId },
    data: {
      type: input.type,
      title: sanitizeLocalized(input.title, 'title'),
      body: input.body ? sanitizeLocalized(input.body, 'body') : undefined,
      url: input.url ?? null,
    },
  });
}

export async function deleteContent(actor: Actor, contentId: string) {
  const content = await prisma.trainingContent.findUnique({
    where: { id: contentId },
    select: { id: true },
  });
  if (!content) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { contentId });

  await purgeFiles(actor, { trainingContentId: contentId }, 'training_content_delete');
  await prisma.trainingContent.delete({ where: { id: contentId } });
}

/**
 * Reordena el material.
 *
 * Se escriben todas las posiciones en una transacción, no solo las que
 * cambiaron: calcular el mínimo de escrituras exigiría comparar estados y es
 * el tipo de optimización que produce listas con dos elementos en la posición
 * tres.
 */
export async function reorderContents(moduleId: string, ids: string[]): Promise<void> {
  const contents = await prisma.trainingContent.findMany({
    where: { moduleId },
    select: { id: true },
  });

  const known = new Set(contents.map((content) => content.id));
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
    throw AppError.validation([
      {
        path: 'ids',
        rule: 'incomplete_order',
        message: 'La lista debe contener exactamente los bloques del módulo',
      },
    ]);
  }

  await prisma.$transaction(
    ids.map((id, position) => prisma.trainingContent.update({ where: { id }, data: { position } })),
  );
}
