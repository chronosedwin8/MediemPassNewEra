import { ROLE, type Role } from './enums.js';

/**
 * Catálogo único de permisos.
 *
 * Vive en el paquete compartido porque backend y frontend deben razonar sobre
 * exactamente los mismos códigos: el servidor los exige y la interfaz decide
 * con ellos qué menús y acciones muestra. Duplicarlos garantizaría que un día
 * dejen de coincidir.
 *
 * Forma: `recurso:acción`. Un permiso concede la capacidad; el *alcance*
 * (sobre qué filas puede ejercerla el usuario) lo resuelven aparte las guardas
 * de propiedad: un docente con `assessment:update` solo edita las suyas.
 */
export const PERMISSION = {
  // --- Usuarios y acceso ---------------------------------------------------
  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_MANAGE_ROLES: 'user:manage_roles',
  USER_RESET_PASSWORD: 'user:reset_password',

  // --- Docentes ------------------------------------------------------------
  TEACHER_READ: 'teacher:read',
  TEACHER_CREATE: 'teacher:create',
  TEACHER_UPDATE: 'teacher:update',
  TEACHER_DELETE: 'teacher:delete',

  // --- Estudiantes ---------------------------------------------------------
  STUDENT_READ: 'student:read',
  STUDENT_CREATE: 'student:create',
  STUDENT_UPDATE: 'student:update',
  STUDENT_DELETE: 'student:delete',

  // --- Estructura académica -------------------------------------------------
  AREA_READ: 'area:read',
  AREA_MANAGE: 'area:manage',
  SUBJECT_READ: 'subject:read',
  SUBJECT_MANAGE: 'subject:manage',
  GROUP_READ: 'group:read',
  GROUP_CREATE: 'group:create',
  GROUP_UPDATE: 'group:update',
  GROUP_DELETE: 'group:delete',
  GROUP_MANAGE_MEMBERS: 'group:manage_members',
  ACADEMIC_YEAR_READ: 'academic_year:read',
  ACADEMIC_YEAR_MANAGE: 'academic_year:manage',

  // --- Competencias KMK ----------------------------------------------------
  KMK_READ: 'kmk:read',
  KMK_MANAGE: 'kmk:manage',

  // --- Evaluaciones --------------------------------------------------------
  ASSESSMENT_READ: 'assessment:read',
  /** Ver cualquier evaluación, no solo las propias. */
  ASSESSMENT_READ_ALL: 'assessment:read_all',
  ASSESSMENT_CREATE: 'assessment:create',
  ASSESSMENT_UPDATE: 'assessment:update',
  ASSESSMENT_DELETE: 'assessment:delete',
  ASSESSMENT_PUBLISH: 'assessment:publish',
  ASSESSMENT_ASSIGN: 'assessment:assign',

  // --- Intentos y resultados ------------------------------------------------
  /** Resolver una evaluación asignada. */
  ATTEMPT_TAKE: 'attempt:take',
  /** Ver los resultados propios. */
  RESULT_READ_OWN: 'result:read_own',
  /** Ver los resultados de los estudiantes a cargo. */
  RESULT_READ_SCOPED: 'result:read_scoped',
  RESULT_READ_ALL: 'result:read_all',
  /** Calificar manualmente respuestas abiertas. */
  ATTEMPT_GRADE: 'attempt:grade',

  // --- Planes de evaluación -------------------------------------------------
  PLAN_READ: 'plan:read',
  PLAN_MANAGE: 'plan:manage',

  // --- Estadísticas ---------------------------------------------------------
  STATS_READ_OWN: 'stats:read_own',
  STATS_READ_SCOPED: 'stats:read_scoped',
  STATS_READ_GLOBAL: 'stats:read_global',

  // --- Capacitación ---------------------------------------------------------
  TRAINING_PARTICIPATE: 'training:participate',
  TRAINING_MANAGE: 'training:manage',

  // --- Inteligencia artificial ----------------------------------------------
  AI_GENERATE: 'ai:generate',
  AI_CONFIGURE: 'ai:configure',

  // --- Administración -------------------------------------------------------
  SETTINGS_READ: 'settings:read',
  SETTINGS_MANAGE: 'settings:manage',
  SCALE_MANAGE: 'scale:manage',
  AUDIT_READ: 'audit:read',
  PHIDIAS_SYNC: 'phidias:sync',
  PHIDIAS_READ: 'phidias:read',
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSION);

const TEACHER_PERMISSIONS: readonly Permission[] = [
  PERMISSION.STUDENT_READ,
  PERMISSION.TEACHER_READ,
  PERMISSION.AREA_READ,
  PERMISSION.SUBJECT_READ,
  PERMISSION.ACADEMIC_YEAR_READ,
  PERMISSION.GROUP_READ,
  PERMISSION.GROUP_CREATE,
  PERMISSION.GROUP_UPDATE,
  PERMISSION.GROUP_MANAGE_MEMBERS,
  PERMISSION.KMK_READ,
  PERMISSION.ASSESSMENT_READ,
  PERMISSION.ASSESSMENT_CREATE,
  PERMISSION.ASSESSMENT_UPDATE,
  PERMISSION.ASSESSMENT_DELETE,
  PERMISSION.ASSESSMENT_PUBLISH,
  PERMISSION.ASSESSMENT_ASSIGN,
  PERMISSION.ATTEMPT_TAKE,
  PERMISSION.ATTEMPT_GRADE,
  PERMISSION.RESULT_READ_OWN,
  PERMISSION.RESULT_READ_SCOPED,
  PERMISSION.PLAN_READ,
  PERMISSION.PLAN_MANAGE,
  PERMISSION.STATS_READ_OWN,
  PERMISSION.STATS_READ_SCOPED,
  PERMISSION.TRAINING_PARTICIPATE,
  PERMISSION.AI_GENERATE,
];

const STUDENT_PERMISSIONS: readonly Permission[] = [
  PERMISSION.ATTEMPT_TAKE,
  PERMISSION.RESULT_READ_OWN,
  PERMISSION.STATS_READ_OWN,
  PERMISSION.KMK_READ,
];

/**
 * Permisos por rol. Es la fuente que consume la semilla de la base de datos:
 * los permisos se persisten para poder crear roles nuevos desde la
 * administración sin tocar código, pero estos tres roles nacen de aquí.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [ROLE.ADMIN]: ALL_PERMISSIONS,
  [ROLE.TEACHER]: TEACHER_PERMISSIONS,
  [ROLE.STUDENT]: STUDENT_PERMISSIONS,
};

/** Descompone `recurso:acción`. */
export function splitPermission(permission: Permission): { resource: string; action: string } {
  const separatorIndex = permission.indexOf(':');
  return {
    resource: permission.slice(0, separatorIndex),
    action: permission.slice(separatorIndex + 1),
  };
}

export function hasPermission(
  granted: readonly string[],
  required: Permission | readonly Permission[],
): boolean {
  const list = Array.isArray(required) ? required : [required as Permission];
  return list.every((permission) => granted.includes(permission));
}

export function hasAnyPermission(
  granted: readonly string[],
  required: readonly Permission[],
): boolean {
  return required.some((permission) => granted.includes(permission));
}
