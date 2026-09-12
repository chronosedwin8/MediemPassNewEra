/**
 * Vocabulario del dominio, compartido por backend y frontend.
 *
 * Se declaran como objetos `const` en lugar de `enum` de TypeScript porque
 * los valores viajan por la API como cadenas y deben coincidir exactamente
 * con los enums de PostgreSQL definidos en Prisma.
 */

export const ROLE = {
  ADMIN: 'ADMIN',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
} as const;
export type Role = (typeof ROLE)[keyof typeof ROLE];

export const USER_STATUS = {
  /** Cuenta creada por sincronización, sin credenciales utilizables todavía. */
  PENDING_ACTIVATION: 'PENDING_ACTIVATION',
  ACTIVE: 'ACTIVE',
  /** Deshabilitada por un administrador. */
  SUSPENDED: 'SUSPENDED',
  /** Ya no pertenece a la institución; conserva su historial académico. */
  INACTIVE: 'INACTIVE',
} as const;
export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const IDENTITY_PROVIDER = {
  /** Contraseña gestionada por la plataforma (Argon2id). */
  LOCAL: 'LOCAL',
  /** Microsoft Entra ID mediante OIDC. */
  ENTRA_ID: 'ENTRA_ID',
} as const;
export type IdentityProvider = (typeof IDENTITY_PROVIDER)[keyof typeof IDENTITY_PROVIDER];

export const EXTERNAL_SOURCE = {
  PHIDIAS: 'PHIDIAS',
} as const;
export type ExternalSource = (typeof EXTERNAL_SOURCE)[keyof typeof EXTERNAL_SOURCE];

/**
 * Estado de matrícula normalizado.
 *
 * Phidias devuelve texto libre en español y con mayúsculas inconsistentes
 * (`activo`, `inscrito`, `Admitido`, `pendiente`, `suspendido`, `retirado`).
 * El mapeo vive en el backend y es tolerante: un valor desconocido no rompe
 * la sincronización, se registra y cae en `UNKNOWN`.
 */
export const ENROLLMENT_STATUS = {
  ACTIVE: 'ACTIVE',
  ENROLLED: 'ENROLLED',
  ADMITTED: 'ADMITTED',
  PENDING: 'PENDING',
  SUSPENDED: 'SUSPENDED',
  WITHDRAWN: 'WITHDRAWN',
  UNKNOWN: 'UNKNOWN',
} as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUS)[keyof typeof ENROLLMENT_STATUS];

/** Estados de matrícula que habilitan a un estudiante para ser evaluado. */
export const EVALUABLE_ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = [
  ENROLLMENT_STATUS.ACTIVE,
  ENROLLMENT_STATUS.ENROLLED,
];

export const LANGUAGE = {
  ES: 'es',
  DE: 'de',
  EN: 'en',
} as const;
export type Language = (typeof LANGUAGE)[keyof typeof LANGUAGE];
export const SUPPORTED_LANGUAGES: readonly Language[] = [LANGUAGE.ES, LANGUAGE.DE, LANGUAGE.EN];

/** A quién va dirigida una evaluación. Determina la escala aplicable. */
export const ASSESSMENT_AUDIENCE = {
  STUDENT: 'STUDENT',
  TEACHER: 'TEACHER',
} as const;
export type AssessmentAudience = (typeof ASSESSMENT_AUDIENCE)[keyof typeof ASSESSMENT_AUDIENCE];

/** Para qué se usa la evaluación. Un mismo motor sirve a los tres casos. */
export const ASSESSMENT_PURPOSE = {
  EVALUATION: 'EVALUATION',
  TRAINING: 'TRAINING',
  DIAGNOSTIC: 'DIAGNOSTIC',
} as const;
export type AssessmentPurpose = (typeof ASSESSMENT_PURPOSE)[keyof typeof ASSESSMENT_PURPOSE];

export const ASSESSMENT_VERSION_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type AssessmentVersionStatus =
  (typeof ASSESSMENT_VERSION_STATUS)[keyof typeof ASSESSMENT_VERSION_STATUS];

export const DIFFICULTY = {
  BASIC: 'BASIC',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
} as const;
export type Difficulty = (typeof DIFFICULTY)[keyof typeof DIFFICULTY];

/**
 * Tipos de pregunta.
 *
 * Añadir un tipo nuevo consiste en: registrar el código aquí, añadir su
 * esquema de contenido en `schemas/question-payload.ts` y su calificador en
 * `backend/src/modules/assessments/grading/`. Las evaluaciones existentes no
 * se ven afectadas porque cada versión publicada es inmutable.
 */
export const QUESTION_TYPE = {
  SINGLE_CHOICE: 'SINGLE_CHOICE',
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  TRUE_FALSE: 'TRUE_FALSE',
  OPEN_TEXT: 'OPEN_TEXT',
  FILL_BLANK: 'FILL_BLANK',
  MATCHING: 'MATCHING',
  GROUPING: 'GROUPING',
  TIMELINE: 'TIMELINE',
  ORDERING: 'ORDERING',
  IMAGE_CHOICE: 'IMAGE_CHOICE',
  HOTSPOT: 'HOTSPOT',
  SHORT_ANSWER: 'SHORT_ANSWER',
  LONG_ANSWER: 'LONG_ANSWER',

  /*
   * Respuestas capturadas con la cámara o el micrófono. No tienen solución
   * que comparar: son una grabación que alguien mira y califica, igual que
   * una redacción.
   */
  SELFIE: 'SELFIE',
  VIDEO_RESPONSE: 'VIDEO_RESPONSE',
  AUDIO_RESPONSE: 'AUDIO_RESPONSE',
} as const;
export type QuestionType = (typeof QUESTION_TYPE)[keyof typeof QUESTION_TYPE];

/** Tipos cuya respuesta no puede calificarse automáticamente. */
export const MANUALLY_GRADED_QUESTION_TYPES: readonly QuestionType[] = [
  QUESTION_TYPE.OPEN_TEXT,
  QUESTION_TYPE.LONG_ANSWER,
  QUESTION_TYPE.SELFIE,
  QUESTION_TYPE.VIDEO_RESPONSE,
  QUESTION_TYPE.AUDIO_RESPONSE,
];

export const ASSIGNMENT_TARGET_TYPE = {
  USER: 'USER',
  GROUP: 'GROUP',
} as const;
export type AssignmentTargetType =
  (typeof ASSIGNMENT_TARGET_TYPE)[keyof typeof ASSIGNMENT_TARGET_TYPE];

export const RECIPIENT_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type RecipientStatus = (typeof RECIPIENT_STATUS)[keyof typeof RECIPIENT_STATUS];

export const ATTEMPT_STATUS = {
  IN_PROGRESS: 'IN_PROGRESS',
  /** Enviado y calificado automáticamente en su totalidad. */
  SUBMITTED: 'SUBMITTED',
  /** Enviado, pero con respuestas abiertas pendientes de calificación docente. */
  PENDING_REVIEW: 'PENDING_REVIEW',
  /** Calificación definitiva, incluida la parte manual. */
  GRADED: 'GRADED',
  /** Cerrado por vencimiento del plazo sin envío explícito del estudiante. */
  EXPIRED: 'EXPIRED',
  ABANDONED: 'ABANDONED',
} as const;
export type AttemptStatus = (typeof ATTEMPT_STATUS)[keyof typeof ATTEMPT_STATUS];

/** Estados en los que el intento ya no admite modificación de respuestas. */
export const CLOSED_ATTEMPT_STATUSES: readonly AttemptStatus[] = [
  ATTEMPT_STATUS.SUBMITTED,
  ATTEMPT_STATUS.PENDING_REVIEW,
  ATTEMPT_STATUS.GRADED,
  ATTEMPT_STATUS.EXPIRED,
  ATTEMPT_STATUS.ABANDONED,
];

/**
 * Tipo de escala de calificación.
 * - `BANDED`: bandas de porcentaje con etiqueta y valor (escala alemana 1.0–6.0).
 * - `PERCENTAGE`: el porcentaje es la nota (evaluaciones docentes 0–100 %).
 */
export const SCALE_KIND = {
  BANDED: 'BANDED',
  PERCENTAGE: 'PERCENTAGE',
} as const;
export type ScaleKind = (typeof SCALE_KIND)[keyof typeof SCALE_KIND];

export const AI_GENERATION_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  /** El modelo respondió y la respuesta superó validación sintáctica y semántica. */
  VALIDATED: 'VALIDATED',
  /** Se creó la versión borrador a partir de la respuesta validada. */
  APPLIED: 'APPLIED',
  /** El modelo respondió pero la respuesta no era utilizable. Nada se persistió. */
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
} as const;
export type AiGenerationStatus = (typeof AI_GENERATION_STATUS)[keyof typeof AI_GENERATION_STATUS];

export const SYNC_STATUS = {
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
} as const;
export type SyncStatus = (typeof SYNC_STATUS)[keyof typeof SYNC_STATUS];

/** Acciones auditables (sección 42). */
export const AUDIT_ACTION = {
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  CREATE_USER: 'CREATE_USER',
  UPDATE_USER: 'UPDATE_USER',
  DELETE_USER: 'DELETE_USER',
  CREATE_ASSESSMENT: 'CREATE_ASSESSMENT',
  UPDATE_ASSESSMENT: 'UPDATE_ASSESSMENT',
  PUBLISH_ASSESSMENT: 'PUBLISH_ASSESSMENT',
  ARCHIVE_ASSESSMENT: 'ARCHIVE_ASSESSMENT',
  ASSIGN_ASSESSMENT: 'ASSIGN_ASSESSMENT',
  START_ATTEMPT: 'START_ATTEMPT',
  COMPLETE_ASSESSMENT: 'COMPLETE_ASSESSMENT',
  GRADE_ATTEMPT: 'GRADE_ATTEMPT',
  GENERATE_AI_ASSESSMENT: 'GENERATE_AI_ASSESSMENT',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  UPDATE_GRADING_SCALE: 'UPDATE_GRADING_SCALE',
  SYNC_PHIDIAS: 'SYNC_PHIDIAS',
  UPDATE_ROLE_PERMISSIONS: 'UPDATE_ROLE_PERMISSIONS',
  /**
   * Borrado definitivo de una evaluación con todo lo asociado.
   *
   * Tiene entrada propia, distinta de ARCHIVE_ASSESSMENT, porque es la única
   * acción del sistema que destruye historial académico sin vuelta atrás. Si
   * alguien pregunta un año después qué pasó con las notas de un curso, esta
   * es la entrada que lo responde.
   */
  DELETE_ASSESSMENT: 'DELETE_ASSESSMENT',
  ROLLOVER_ACADEMIC_YEAR: 'ROLLOVER_ACADEMIC_YEAR',
  CREATE_TRAINING_MODULE: 'CREATE_TRAINING_MODULE',
  PUBLISH_TRAINING_MODULE: 'PUBLISH_TRAINING_MODULE',
  /**
   * Borrado de archivos del almacenamiento externo.
   *
   * Entrada propia porque son datos que salen del sistema: una vez eliminados
   * de S3 no hay copia, y conviene poder decir después quién los borró, cuántos
   * eran y con qué criterio.
   */
  DELETE_STORED_FILES: 'DELETE_STORED_FILES',
} as const;
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];
