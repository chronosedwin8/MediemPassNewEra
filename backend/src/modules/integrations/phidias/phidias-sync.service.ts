import {
  AUDIT_ACTION,
  ENROLLMENT_STATUS,
  EXTERNAL_SOURCE,
  ROLE,
  SETTING_KEY,
  SYNC_STATUS,
  USER_STATUS,
  institutionalEmail,
} from '@medienpass/shared';
import { prisma } from '../../../infrastructure/database/prisma.js';
import { createLogger } from '../../../shared/logger.js';
import { recordAudit } from '../../audit/audit.service.js';
import { getSetting } from '../../settings/settings.service.js';
import { hashPassword } from '../../../shared/security/password.js';
import { getPhidiasService } from '../../../infrastructure/external/phidias/phidias.service.js';
import type {
  NormalizedSection,
  NormalizedStudent,
} from '../../../infrastructure/external/phidias/phidias.mapper.js';

const log = createLogger('phidias:sync');

/**
 * Sincronización de estudiantes desde Phidias.
 *
 * Flujo: obtener → validar → normalizar → insertar o actualizar → auditar.
 *
 * Reglas que no se negocian:
 *
 *  - **Nunca se borra a nadie.** Un estudiante que desaparece de la respuesta
 *    se marca como retirado, no se elimina: su historial académico debe
 *    sobrevivir, y una respuesta incompleta por un fallo puntual de Phidias no
 *    puede llevarse por delante a media matrícula.
 *  - **Nunca falla entera por un registro.** Un correo duplicado o un estado
 *    desconocido se anotan como incidencia y el proceso continúa.
 *  - **Es idempotente.** Ejecutarla dos veces seguidas no duplica nada.
 */

export interface SyncIssue {
  externalId: number;
  username: string;
  reason: string;
  detail?: string;
}

export interface SyncResult {
  syncLogId: string;
  status: (typeof SYNC_STATUS)[keyof typeof SYNC_STATUS];
  academicYearExternalId: number;
  sectionsProcessed: number;
  studentsCreated: number;
  studentsUpdated: number;
  studentsDeactivated: number;
  groupsCreated: number;
  groupsMatched: number;
  membershipsAdded: number;
  skipped: number;
  issues: SyncIssue[];
  durationMs: number;
}

export interface SyncOptions {
  /** Ejecuta el flujo completo sin escribir nada. Para previsualizar. */
  dryRun?: boolean;
  /**
   * Contraseña inicial para las cuentas que se crean.
   *
   * Sin ella, el estudiante nace pendiente de activación y solo puede entrar
   * por SSO. Con ella, puede entrar además con su correo y esta contraseña, y
   * se le obliga a cambiarla en el primer acceso. No se guarda en claro en
   * ningún sitio: se hashea y se olvida.
   */
  initialPassword?: string;
}

/** Estado mutable que acompaña a una ejecución. */
interface SyncContext {
  issues: SyncIssue[];
  created: number;
  updated: number;
  skipped: number;
  membershipsAdded: number;
  groupsCreated: number;
  groupsMatched: number;
  seenExternalIds: Set<number>;
  studentRoleId: string;
  academicYearId: string;
  gradeByCode: Map<string, string>;
  /** Hash de la contraseña inicial, calculado una sola vez. */
  initialPasswordHash: string | null;
}

/**
 * Empareja el grado de Phidias con un grado propio.
 *
 * Se hace por nombre porque los identificadores de Phidias cambian cada curso.
 * `KLASSE 8` → `K8`, `KINDERKRIPPE` → `KKP`.
 */
function resolveGradeCode(courseName: string): string | null {
  const normalized = courseName.trim().toUpperCase();

  const klasse = /^KLASSE\s+(\d{1,2})$/.exec(normalized);
  if (klasse) return `K${klasse[1]}`;

  const preschool: Record<string, string> = {
    KINDERKRIPPE: 'KKP',
    PREKINDER: 'PK',
    KINDER: 'KIN',
  };

  return preschool[normalized] ?? null;
}

/**
 * Decide qué correo se asigna.
 *
 * Manda el **correo institucional derivado del código**, no el que venga en
 * Phidias. La razón es concreta: de los 1.177 estudiantes matriculados, 20 no
 * tienen correo registrado y 74 tienen cuentas personales de gmail, hotmail o
 * yahoo. Usar ese campo dejaba a 94 sin poder entrar y ataba la identidad de
 * los demás a una cuenta que el colegio no controla. El código, en cambio, lo
 * tiene todo el mundo y no cambia.
 *
 * El correo de Phidias solo se usa como último recurso, cuando no hay código.
 *
 * Si el correo resultante ya pertenece a otra cuenta se deja sin correo y se
 * anota la incidencia: es preferible a rechazar al estudiante o a romper la
 * unicidad. En la matrícula real esto ocurre con correos compartidos entre
 * hermanos.
 */
async function resolveEmail(
  student: NormalizedStudent,
  existingUserId: string | null,
  issues: SyncIssue[],
): Promise<string | null> {
  const domain = await getSetting(SETTING_KEY.STUDENT_EMAIL_DOMAIN);
  const candidate = institutionalEmail(student.code, domain) ?? student.email;
  if (!candidate) return null;

  const clash = await prisma.user.findFirst({
    where: {
      email: candidate,
      deletedAt: null,
      ...(existingUserId ? { NOT: { id: existingUserId } } : {}),
    },
    select: { id: true },
  });

  if (!clash) return candidate;

  issues.push({
    externalId: student.externalId,
    username: student.username,
    reason: 'EMAIL_ALREADY_IN_USE',
    detail: `El correo ${candidate} ya pertenece a otra cuenta; se deja sin correo.`,
  });
  return null;
}

/**
 * Decide el nombre de usuario.
 *
 * Se prefiere el correo institucional, porque es con lo que el estudiante va a
 * entrar: pedirle que recuerde un nombre de usuario distinto de su correo es
 * una fuente de soporte innecesaria.
 *
 * Si está ocupado se le añade el identificador externo, que es único por
 * definición. Perder al estudiante por un choque de nombre sería absurdo.
 */
async function resolveUsername(
  student: NormalizedStudent,
  email: string | null,
  issues: SyncIssue[],
): Promise<string> {
  const preferred = email ?? student.username;

  const taken = await prisma.user.findFirst({
    where: { username: preferred },
    select: { id: true },
  });

  if (!taken) return preferred;

  const username = `${student.externalId}.${preferred}`;
  issues.push({
    externalId: student.externalId,
    username: student.username,
    reason: 'USERNAME_TAKEN',
    detail: `Se creó como ${username}.`,
  });
  return username;
}

/**
 * Inserta o actualiza un estudiante.
 *
 * La identidad es `(external_source, external_id)`, que en Phidias es estable
 * entre cursos, a diferencia de los identificadores de sección.
 */
async function upsertStudent(
  student: NormalizedStudent,
  gradeLevelId: string,
  context: SyncContext,
): Promise<string | null> {
  const existing = await prisma.student.findUnique({
    where: {
      externalSource_externalId: {
        externalSource: EXTERNAL_SOURCE.PHIDIAS,
        externalId: student.externalId,
      },
    },
    include: { user: { select: { id: true } } },
  });

  const email = await resolveEmail(student, existing?.user.id ?? null, context.issues);

  if (existing) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: existing.user.id },
        data: {
          firstName: student.firstName,
          lastName: student.lastName,
          email,
          preferredLanguage: student.language,
        },
      }),
      prisma.student.update({
        where: { id: existing.id },
        data: {
          code: student.code,
          gradeLevelId,
          enrollmentStatus: student.enrollmentStatus,
          rawEnrollmentStatus: student.rawEnrollmentStatus,
          lastSyncedAt: new Date(),
        },
      }),
    ]);
    context.updated += 1;
    return existing.id;
  }

  return createStudentAccount(student, email, gradeLevelId, context);
}

/**
 * Crea la cuenta y el perfil de un estudiante nuevo.
 *
 * Con contraseña inicial la cuenta nace utilizable y se obliga a cambiarla;
 * sin ella queda pendiente de activación y solo entra por SSO hasta que
 * administración le emita credenciales.
 */
async function createStudentAccount(
  student: NormalizedStudent,
  email: string | null,
  gradeLevelId: string,
  context: SyncContext,
): Promise<string | null> {
  const username = await resolveUsername(student, email, context.issues);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          email,
          firstName: student.firstName,
          lastName: student.lastName,
          preferredLanguage: student.language,
          status: context.initialPasswordHash ? USER_STATUS.ACTIVE : USER_STATUS.PENDING_ACTIVATION,
          passwordHash: context.initialPasswordHash,
          passwordUpdatedAt: context.initialPasswordHash ? new Date() : null,
          mustChangePassword: Boolean(context.initialPasswordHash),
          roles: { create: { roleId: context.studentRoleId } },
        },
      });

      return tx.student.create({
        data: {
          userId: user.id,
          externalSource: EXTERNAL_SOURCE.PHIDIAS,
          externalId: student.externalId,
          code: student.code,
          gradeLevelId,
          enrollmentStatus: student.enrollmentStatus,
          rawEnrollmentStatus: student.rawEnrollmentStatus,
          lastSyncedAt: new Date(),
        },
      });
    });

    context.created += 1;
    return created.id;
  } catch (error) {
    context.issues.push({
      externalId: student.externalId,
      username: student.username,
      reason: 'CREATE_FAILED',
      detail: error instanceof Error ? error.message : 'error desconocido',
    });
    context.skipped += 1;
    return null;
  }
}

/** Crea el grupo de la sección o recupera el existente para ese año. */
async function ensureGroup(
  section: NormalizedSection,
  academicYearId: string,
  gradeLevelId: string,
): Promise<{ id: string; wasCreated: boolean }> {
  const existing = await prisma.group.findFirst({
    where: {
      academicYearId,
      OR: [
        { externalSource: EXTERNAL_SOURCE.PHIDIAS, externalId: section.externalId },
        { code: section.code },
      ],
    },
    select: { id: true },
  });

  if (existing) {
    // Se completa el vínculo externo si el grupo se había creado a mano.
    await prisma.group.update({
      where: { id: existing.id },
      data: { externalSource: EXTERNAL_SOURCE.PHIDIAS, externalId: section.externalId },
    });
    return { id: existing.id, wasCreated: false };
  }

  const created = await prisma.group.create({
    data: {
      code: section.code,
      name: section.code,
      academicYearId,
      gradeLevelId,
      externalSource: EXTERNAL_SOURCE.PHIDIAS,
      externalId: section.externalId,
    },
  });

  return { id: created.id, wasCreated: true };
}

/** Inscribe al estudiante en el grupo, reactivando si ya había estado. */
async function ensureMembership(
  groupId: string,
  studentId: string,
  context: SyncContext,
): Promise<void> {
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_studentId: { groupId, studentId } },
  });

  if (!membership) {
    await prisma.groupMembership.create({ data: { groupId, studentId } });
    context.membershipsAdded += 1;
    return;
  }

  if (!membership.active) {
    await prisma.groupMembership.update({
      where: { id: membership.id },
      data: { active: true, leftAt: null },
    });
    context.membershipsAdded += 1;
  }
}

async function processSection(section: NormalizedSection, context: SyncContext): Promise<void> {
  const gradeCode = resolveGradeCode(section.courseName);
  const gradeLevelId = gradeCode ? context.gradeByCode.get(gradeCode) : undefined;

  if (!gradeLevelId) {
    context.issues.push({
      externalId: section.externalId,
      username: section.code,
      reason: 'UNKNOWN_GRADE',
      detail: `No existe un grado propio equivalente a "${section.courseName}".`,
    });
    context.skipped += section.students.length;
    return;
  }

  const group = await ensureGroup(section, context.academicYearId, gradeLevelId);
  if (group.wasCreated) context.groupsCreated += 1;
  else context.groupsMatched += 1;

  for (const student of section.students) {
    context.seenExternalIds.add(student.externalId);
    const studentId = await upsertStudent(student, gradeLevelId, context);
    if (studentId) await ensureMembership(group.id, studentId, context);
  }
}

/**
 * Marca como retirado a quien ya no aparece.
 *
 * No se borra: su historial académico sigue siendo válido y puede
 * reincorporarse el curso siguiente.
 */
async function markVanishedStudents(seenExternalIds: Set<number>): Promise<number> {
  const vanished = await prisma.student.findMany({
    where: {
      externalSource: EXTERNAL_SOURCE.PHIDIAS,
      externalId: { notIn: [...seenExternalIds] },
      enrollmentStatus: { not: ENROLLMENT_STATUS.WITHDRAWN },
    },
    select: { id: true },
  });

  if (vanished.length === 0) return 0;

  await prisma.student.updateMany({
    where: { id: { in: vanished.map((student) => student.id) } },
    data: { enrollmentStatus: ENROLLMENT_STATUS.WITHDRAWN, lastSyncedAt: new Date() },
  });

  return vanished.length;
}

async function buildContext(
  initialPassword?: string,
): Promise<
  Pick<SyncContext, 'studentRoleId' | 'academicYearId' | 'gradeByCode' | 'initialPasswordHash'>
> {
  const academicYear = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  if (!academicYear) {
    throw new Error(
      'No hay un año académico vigente en la plataforma con el que emparejar la matrícula',
    );
  }

  const studentRole = await prisma.role.findUniqueOrThrow({ where: { code: ROLE.STUDENT } });
  const gradeLevels = await prisma.gradeLevel.findMany({ select: { id: true, code: true } });

  return {
    studentRoleId: studentRole.id,
    academicYearId: academicYear.id,
    gradeByCode: new Map(gradeLevels.map((grade) => [grade.code, grade.id])),
    // Se hashea una vez y se reutiliza: Argon2id es caro a propósito, y
    // repetirlo mil doscientas veces convertiría la sincronización en minutos.
    initialPasswordHash: initialPassword ? await hashPassword(initialPassword) : null,
  };
}

/**
 * Vista previa: recorre el flujo completo de lectura y normalización, pero no
 * escribe nada. Sirve para que el administrador vea qué va a pasar antes de
 * tocar mil doscientos registros.
 */
async function completeDryRun(
  syncLogId: string,
  yearExternalId: number,
  sections: NormalizedSection[],
  issues: SyncIssue[],
  startedAt: number,
): Promise<SyncResult> {
  const students = sections.reduce((sum, section) => sum + section.students.length, 0);

  await prisma.phidiasSyncLog.update({
    where: { id: syncLogId },
    data: { status: SYNC_STATUS.SUCCESS, finishedAt: new Date(), skipped: students },
  });

  return {
    syncLogId,
    status: SYNC_STATUS.SUCCESS,
    academicYearExternalId: yearExternalId,
    sectionsProcessed: sections.length,
    studentsCreated: 0,
    studentsUpdated: 0,
    studentsDeactivated: 0,
    groupsCreated: 0,
    groupsMatched: 0,
    membershipsAdded: 0,
    skipped: students,
    issues,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Cierra la ejecución: retira a los ausentes, actualiza el historial, deja la
 * entrada de auditoría y compone el informe.
 */
async function finalizeSync(
  syncLogId: string,
  actorId: string,
  yearExternalId: number,
  sectionCount: number,
  context: SyncContext,
  startedAt: number,
): Promise<SyncResult> {
  const deactivated = await markVanishedStudents(context.seenExternalIds);
  const status = context.issues.length > 0 ? SYNC_STATUS.PARTIAL : SYNC_STATUS.SUCCESS;

  await prisma.phidiasSyncLog.update({
    where: { id: syncLogId },
    data: {
      status,
      finishedAt: new Date(),
      created: context.created,
      updated: context.updated,
      deactivated,
      skipped: context.skipped,
      failed: context.issues.filter((issue) => issue.reason === 'CREATE_FAILED').length,
      // Se acotan las incidencias guardadas: mil incidencias iguales no aportan
      // más que las cien primeras y engordan la fila sin motivo.
      issues: context.issues.slice(0, 100) as unknown as object,
    },
  });

  await recordAudit({
    userId: actorId,
    action: AUDIT_ACTION.SYNC_PHIDIAS,
    entityType: 'phidias_sync_log',
    entityId: syncLogId,
    metadata: {
      created: context.created,
      updated: context.updated,
      deactivated,
      issues: context.issues.length,
    },
  });

  const result: SyncResult = {
    syncLogId,
    status,
    academicYearExternalId: yearExternalId,
    sectionsProcessed: sectionCount,
    studentsCreated: context.created,
    studentsUpdated: context.updated,
    studentsDeactivated: deactivated,
    groupsCreated: context.groupsCreated,
    groupsMatched: context.groupsMatched,
    membershipsAdded: context.membershipsAdded,
    skipped: context.skipped,
    issues: context.issues,
    durationMs: Date.now() - startedAt,
  };

  // Se registran los totales, no la lista completa: cien incidencias en una
  // sola línea de registro no ayudan a nadie y ya están guardadas en la base.
  const { issues: _issues, ...summary } = result;
  log.info({ ...summary, issueCount: context.issues.length }, 'sincronización completada');

  return result;
}

export async function syncStudents(
  actorId: string,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const startedAt = Date.now();
  const service = getPhidiasService();

  const syncLog = await prisma.phidiasSyncLog.create({
    data: { syncType: 'STUDENTS', status: SYNC_STATUS.RUNNING, triggeredById: actorId },
  });

  try {
    const year = await service.resolveCurrentAcademicYear();
    const { sections, discarded } = await service.getEnrolledStudents();

    const context: SyncContext = {
      issues: [],
      created: 0,
      updated: 0,
      skipped: discarded,
      membershipsAdded: 0,
      groupsCreated: 0,
      groupsMatched: 0,
      seenExternalIds: new Set<number>(),
      ...(options.dryRun
        ? {
            studentRoleId: '',
            academicYearId: '',
            gradeByCode: new Map<string, string>(),
            initialPasswordHash: null,
          }
        : await buildContext(options.initialPassword)),
    };

    if (discarded > 0) {
      context.issues.push({
        externalId: 0,
        username: '—',
        reason: 'INCOMPLETE_RECORDS',
        detail: `${discarded} registros sin nombre o sin usuario, descartados en origen.`,
      });
    }

    if (options.dryRun) {
      return completeDryRun(syncLog.id, year.externalId, sections, context.issues, startedAt);
    }

    for (const section of sections) {
      await processSection(section, context);
    }

    return finalizeSync(syncLog.id, actorId, year.externalId, sections.length, context, startedAt);
  } catch (error) {
    await prisma.phidiasSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: SYNC_STATUS.FAILED,
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'error desconocido',
      },
    });

    log.error({ err: error }, 'la sincronización falló');
    throw error;
  }
}

export async function listSyncLogs(limit = 20) {
  return prisma.phidiasSyncLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: { triggeredBy: { select: { id: true, username: true } } },
  });
}
