import { z } from 'zod';
import {
  AUDIT_ACTION,
  ERROR_CODE,
  LANGUAGE,
  ROLE,
  USER_STATUS,
  type LocalizedText,
  type Paginated,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { buildPaginationMeta } from '../../shared/http/response.js';
import { hashPassword } from '../../shared/security/password.js';
import { recordAudit } from '../audit/audit.service.js';
import type { PaginationQuery } from '../../middleware/validate.js';

/**
 * Docentes.
 *
 * Un docente es un `User` con rol TEACHER más un perfil `Teacher`. Crear uno
 * es por tanto una operación compuesta, y se hace en una transacción: un
 * usuario sin perfil, o un perfil sin rol, dejaría a la persona incapaz de
 * entrar o de trabajar.
 */

export const createTeacherSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9._-]+$/),
  email: z.string().trim().email().max(200),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  employeeCode: z.string().trim().max(30).optional(),
  preferredLanguage: z.enum([LANGUAGE.ES, LANGUAGE.DE, LANGUAGE.EN]).default(LANGUAGE.ES),
  password: z.string().min(10).max(128).optional(),
  areaIds: z.array(z.string().uuid()).default([]),
  subjectIds: z.array(z.string().uuid()).default([]),
});

export const updateTeacherSchema = z.object({
  employeeCode: z.string().trim().max(30).nullable().optional(),
  active: z.boolean().optional(),
});

export const setAreasSchema = z.object({
  areaIds: z.array(z.string().uuid()).max(20),
  primaryAreaId: z.string().uuid().nullable().optional(),
});

export const setSubjectsSchema = z.object({
  subjectIds: z.array(z.string().uuid()).max(40),
});

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;

export interface TeacherView {
  id: string;
  userId: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
  active: boolean;
  status: string;
  areas: Array<{ id: string; code: string; name: LocalizedText; isPrimary: boolean }>;
  subjects: Array<{ id: string; code: string; name: LocalizedText }>;
  groupCount: number;
  assessmentCount: number;
}

const teacherInclude = {
  user: {
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      _count: { select: { homeroomGroups: true, createdAssessments: true } },
    },
  },
  areas: { include: { area: { select: { id: true, code: true, name: true } } } },
  subjects: { include: { subject: { select: { id: true, code: true, name: true } } } },
} as const;

type TeacherRow = {
  id: string;
  employeeCode: string | null;
  active: boolean;
  user: {
    id: string;
    username: string;
    email: string | null;
    firstName: string;
    lastName: string;
    status: string;
    _count: { homeroomGroups: number; createdAssessments: number };
  };
  areas: Array<{ isPrimary: boolean; area: { id: string; code: string; name: unknown } }>;
  subjects: Array<{ subject: { id: string; code: string; name: unknown } }>;
};

function toView(row: TeacherRow): TeacherView {
  return {
    id: row.id,
    userId: row.user.id,
    username: row.user.username,
    email: row.user.email,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    employeeCode: row.employeeCode,
    active: row.active,
    status: row.user.status,
    areas: row.areas.map((link) => ({
      id: link.area.id,
      code: link.area.code,
      name: link.area.name as LocalizedText,
      isPrimary: link.isPrimary,
    })),
    subjects: row.subjects.map((link) => ({
      id: link.subject.id,
      code: link.subject.code,
      name: link.subject.name as LocalizedText,
    })),
    groupCount: row.user._count.homeroomGroups,
    assessmentCount: row.user._count.createdAssessments,
  };
}

export async function listTeachers(
  query: PaginationQuery & { areaId?: string; subjectId?: string },
): Promise<Paginated<TeacherView>> {
  const where = {
    user: {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' as const } },
              { lastName: { contains: query.search, mode: 'insensitive' as const } },
              { username: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    ...(query.areaId ? { areas: { some: { areaId: query.areaId } } } : {}),
    ...(query.subjectId ? { subjects: { some: { subjectId: query.subjectId } } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.teacher.count({ where }),
    prisma.teacher.findMany({
      where,
      orderBy: { user: { lastName: 'asc' } },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: teacherInclude,
    }),
  ]);

  return {
    items: rows.map((row) => toView(row as unknown as TeacherRow)),
    meta: buildPaginationMeta(query.page, query.pageSize, total),
  };
}

export async function getTeacher(id: string): Promise<TeacherView> {
  const row = await prisma.teacher.findFirst({
    where: { id, user: { deletedAt: null } },
    include: teacherInclude,
  });
  if (!row) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { id });
  return toView(row as unknown as TeacherRow);
}

export async function createTeacher(input: CreateTeacherInput, actorId: string): Promise<TeacherView> {
  const username = input.username.toLowerCase();
  const email = input.email.toLowerCase();

  const clash = await prisma.user.findFirst({
    where: { deletedAt: null, OR: [{ username }, { email }] },
    select: { username: true },
  });
  if (clash) {
    throw AppError.conflict(
      clash.username === username ? ERROR_CODE.DUPLICATE_RESOURCE : ERROR_CODE.EMAIL_ALREADY_IN_USE,
      'Username or email already in use',
    );
  }

  const teacherRole = await prisma.role.findUnique({ where: { code: ROLE.TEACHER } });
  if (!teacherRole) throw AppError.internal('El rol TEACHER no está sembrado');

  const passwordHash = input.password ? await hashPassword(input.password) : null;

  // Transacción: usuario, rol y perfil son una sola cosa desde el punto de
  // vista del negocio. Crear el usuario y fallar al asignar el rol dejaría a
  // una persona dentro del sistema sin poder hacer absolutamente nada.
  const teacherId = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username,
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        preferredLanguage: input.preferredLanguage,
        status: passwordHash ? USER_STATUS.ACTIVE : USER_STATUS.PENDING_ACTIVATION,
        passwordHash,
        passwordUpdatedAt: passwordHash ? new Date() : null,
        mustChangePassword: Boolean(passwordHash),
        roles: { create: { roleId: teacherRole.id } },
      },
    });

    const teacher = await tx.teacher.create({
      data: { userId: user.id, employeeCode: input.employeeCode ?? null },
    });

    if (input.areaIds.length > 0) {
      await tx.teacherArea.createMany({
        data: input.areaIds.map((areaId, index) => ({
          teacherId: teacher.id,
          areaId,
          isPrimary: index === 0,
        })),
        skipDuplicates: true,
      });
    }

    if (input.subjectIds.length > 0) {
      await tx.teacherSubject.createMany({
        data: input.subjectIds.map((subjectId) => ({ teacherId: teacher.id, subjectId })),
        skipDuplicates: true,
      });
    }

    return teacher.id;
  });

  await recordAudit({
    userId: actorId,
    action: AUDIT_ACTION.CREATE_USER,
    entityType: 'teacher',
    entityId: teacherId,
    metadata: { username },
  });

  return getTeacher(teacherId);
}

export async function updateTeacher(
  id: string,
  input: z.infer<typeof updateTeacherSchema>,
): Promise<TeacherView> {
  const teacher = await prisma.teacher.findUnique({ where: { id }, select: { id: true } });
  if (!teacher) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { id });

  await prisma.teacher.update({
    where: { id },
    data: {
      ...(input.employeeCode !== undefined ? { employeeCode: input.employeeCode ?? null } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });

  return getTeacher(id);
}

/**
 * Reemplaza el conjunto de áreas del docente.
 *
 * Se sustituye entero en lugar de añadir o quitar de una en una: la interfaz
 * presenta una lista de casillas, y enviar el estado completo evita que dos
 * ediciones simultáneas se pisen a medias.
 */
export async function setTeacherAreas(
  id: string,
  areaIds: string[],
  primaryAreaId?: string | null,
): Promise<TeacherView> {
  const teacher = await prisma.teacher.findUnique({ where: { id }, select: { id: true } });
  if (!teacher) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { id });

  if (areaIds.length > 0) {
    const areas = await prisma.academicArea.findMany({
      where: { id: { in: areaIds }, deletedAt: null },
      select: { id: true },
    });
    if (areas.length !== areaIds.length) {
      throw AppError.notFound(ERROR_CODE.NOT_FOUND, { message: 'Unknown area' });
    }
  }

  if (primaryAreaId && !areaIds.includes(primaryAreaId)) {
    throw AppError.conflict(ERROR_CODE.CONFLICT, 'The primary area must be among the assigned ones');
  }

  await prisma.$transaction([
    prisma.teacherArea.deleteMany({ where: { teacherId: id } }),
    prisma.teacherArea.createMany({
      data: areaIds.map((areaId) => ({
        teacherId: id,
        areaId,
        isPrimary: primaryAreaId ? areaId === primaryAreaId : false,
      })),
    }),
  ]);

  return getTeacher(id);
}

export async function setTeacherSubjects(id: string, subjectIds: string[]): Promise<TeacherView> {
  const teacher = await prisma.teacher.findUnique({ where: { id }, select: { id: true } });
  if (!teacher) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { id });

  if (subjectIds.length > 0) {
    const subjects = await prisma.subject.findMany({
      where: { id: { in: subjectIds }, deletedAt: null },
      select: { id: true },
    });
    if (subjects.length !== subjectIds.length) {
      throw AppError.notFound(ERROR_CODE.NOT_FOUND, { message: 'Unknown subject' });
    }
  }

  await prisma.$transaction([
    prisma.teacherSubject.deleteMany({ where: { teacherId: id } }),
    prisma.teacherSubject.createMany({
      data: subjectIds.map((subjectId) => ({ teacherId: id, subjectId })),
    }),
  ]);

  return getTeacher(id);
}
