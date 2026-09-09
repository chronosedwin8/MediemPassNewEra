import { z } from 'zod';
import { AUDIT_ACTION, ERROR_CODE, type Role } from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { recordAudit } from '../audit/audit.service.js';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('rollover');

/**
 * Apertura de un nuevo año lectivo.
 *
 * Lo que hace y, sobre todo, lo que **no** hace:
 *
 *  - Crea el año nuevo y lo marca como corriente.
 *  - Replica la estructura de grupos del año anterior —mismo código, mismo
 *    grado, mismo director de curso— **vacíos de estudiantes**.
 *  - Deja intacto el año anterior: sus grupos, sus matrículas, sus intentos y
 *    sus notas siguen ahí, consultables. Un año lectivo que termina no borra
 *    lo que pasó en él.
 *
 * La matrícula real entra después, con la sincronización de Phidias, que es
 * de donde sale de verdad. Crear los grupos con los estudiantes del año
 * anterior sería más vistoso y estaría mal: al día siguiente habría alumnos
 * matriculados en cursos donde no están, repitentes promovidos por error y
 * retirados que reaparecen. Prefiere quedarse corto y que lo llene el dato
 * bueno.
 *
 * La operación es **idempotente**: si el año ya existe, no se duplica; si un
 * grupo ya está creado, se respeta. Volver a ejecutarla no rompe nada, que es
 * lo mínimo exigible a un botón que alguien pulsará con dudas.
 */

export const rolloverSchema = z
  .object({
    code: z.string().trim().min(4).max(20),
    name: z.string().trim().min(4).max(100),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    /** Año del que se copia la estructura. Por omisión, el corriente. */
    sourceYearId: z.string().uuid().optional(),
    /** Copiar los directores de curso del año anterior. */
    copyHomeroomTeachers: z.boolean().default(true),
    /**
     * Sin esto no se ejecuta nada. Es una operación que cambia el año en el
     * que trabaja todo el colegio, y conviene que cueste un gesto explícito.
     */
    confirm: z.literal(true),
  })
  .superRefine((input, ctx) => {
    if (input.endDate <= input.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'El año debe terminar después de empezar',
      });
    }
  });

export type RolloverInput = z.infer<typeof rolloverSchema>;

interface Actor {
  userId: string;
  roles: Role[];
}

export interface RolloverPreview {
  sourceYear: { id: string; code: string; name: string } | null;
  groupsToCreate: number;
  groupsAlreadyPresent: number;
  /** Grupos del año origen que no se copian por estar dados de baja. */
  inactiveGroupsSkipped: number;
}

export interface RolloverResult {
  academicYearId: string;
  code: string;
  groupsCreated: number;
  groupsSkipped: number;
}

async function resolveSourceYear(sourceYearId?: string) {
  const year = sourceYearId
    ? await prisma.academicYear.findUnique({ where: { id: sourceYearId } })
    : await prisma.academicYear.findFirst({ where: { isCurrent: true } });

  if (sourceYearId && !year) {
    throw AppError.notFound(ERROR_CODE.NOT_FOUND, { sourceYearId });
  }
  return year;
}

/** Qué haría el reinicio, sin hacerlo. */
export async function previewRollover(sourceYearId?: string): Promise<RolloverPreview> {
  const source = await resolveSourceYear(sourceYearId);
  if (!source) {
    return {
      sourceYear: null,
      groupsToCreate: 0,
      groupsAlreadyPresent: 0,
      inactiveGroupsSkipped: 0,
    };
  }

  const [active, inactive] = await Promise.all([
    prisma.group.count({ where: { academicYearId: source.id, active: true, deletedAt: null } }),
    prisma.group.count({
      where: { academicYearId: source.id, OR: [{ active: false }, { deletedAt: { not: null } }] },
    }),
  ]);

  return {
    sourceYear: { id: source.id, code: source.code, name: source.name },
    groupsToCreate: active,
    groupsAlreadyPresent: 0,
    inactiveGroupsSkipped: inactive,
  };
}

export async function rolloverAcademicYear(
  actor: Actor,
  input: RolloverInput,
): Promise<RolloverResult> {
  const source = await resolveSourceYear(input.sourceYearId);

  const existing = await prisma.academicYear.findUnique({ where: { code: input.code } });
  if (existing) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'That academic year already exists', {
      code: input.code,
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    // Solo puede haber un año corriente: es lo que resuelve «¿a qué año
    // pertenece esto?» en todo el sistema cuando nadie lo indica.
    await tx.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });

    const year = await tx.academicYear.create({
      data: {
        code: input.code,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        isCurrent: true,
        active: true,
      },
    });

    if (!source) return { year, created: 0, skipped: 0 };

    const groups = await tx.group.findMany({
      where: { academicYearId: source.id, active: true, deletedAt: null },
      select: {
        code: true,
        name: true,
        gradeLevelId: true,
        subjectId: true,
        homeroomTeacherId: true,
      },
      orderBy: { code: 'asc' },
    });

    /*
     * `externalSource` y `externalId` se dejan en blanco a propósito.
     *
     * En Phidias los identificadores de sección se reasignan cada año: copiar
     * el del año pasado ataría el grupo nuevo a una sección que ya no es esa,
     * y la primera sincronización mezclaría dos cursos distintos. Los rellena
     * la sincronización cuando reconozca el grupo por su nombre.
     */
    const { count } = await tx.group.createMany({
      data: groups.map((group) => ({
        academicYearId: year.id,
        gradeLevelId: group.gradeLevelId,
        subjectId: group.subjectId,
        homeroomTeacherId: input.copyHomeroomTeachers ? group.homeroomTeacherId : null,
        code: group.code,
        name: group.name,
        active: true,
      })),
      skipDuplicates: true,
    });

    return { year, created: count, skipped: groups.length - count };
  });

  await recordAudit({
    userId: actor.userId,
    action: AUDIT_ACTION.ROLLOVER_ACADEMIC_YEAR,
    entityType: 'academic_year',
    entityId: result.year.id,
    metadata: {
      code: input.code,
      sourceYearCode: source?.code ?? null,
      groupsCreated: result.created,
      copyHomeroomTeachers: input.copyHomeroomTeachers,
    },
  });

  log.warn(
    { code: input.code, groupsCreated: result.created, actorId: actor.userId },
    'año lectivo iniciado',
  );

  return {
    academicYearId: result.year.id,
    code: result.year.code,
    groupsCreated: result.created,
    groupsSkipped: result.skipped,
  };
}
