/**
 * Catálogo de códigos de error de la API.
 *
 * La API nunca es la fuente del texto que ve el usuario: devuelve un `code`
 * estable y el frontend lo traduce con i18n (`errors.<CODE>`). El `message`
 * que acompaña a la respuesta es para diagnóstico y registros, en inglés.
 * Esto es lo que permite cumplir la sección 40 sin duplicar traducciones
 * en el servidor.
 */

export const ERROR_CODE = {
  // --- 400 / 422 · entrada -----------------------------------------------
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNSUPPORTED_LANGUAGE: 'UNSUPPORTED_LANGUAGE',

  // --- 401 · autenticación ------------------------------------------------
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  ACCOUNT_NOT_ACTIVATED: 'ACCOUNT_NOT_ACTIVATED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  SSO_DOMAIN_NOT_ALLOWED: 'SSO_DOMAIN_NOT_ALLOWED',
  SSO_ACCOUNT_NOT_LINKED: 'SSO_ACCOUNT_NOT_LINKED',
  SSO_STATE_MISMATCH: 'SSO_STATE_MISMATCH',

  // --- 403 · autorización -------------------------------------------------
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  NOT_RESOURCE_OWNER: 'NOT_RESOURCE_OWNER',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  CSRF_TOKEN_INVALID: 'CSRF_TOKEN_INVALID',

  // --- 404 · no encontrado ------------------------------------------------
  NOT_FOUND: 'NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  ASSESSMENT_NOT_FOUND: 'ASSESSMENT_NOT_FOUND',
  ASSESSMENT_VERSION_NOT_FOUND: 'ASSESSMENT_VERSION_NOT_FOUND',
  QUESTION_NOT_FOUND: 'QUESTION_NOT_FOUND',
  ASSIGNMENT_NOT_FOUND: 'ASSIGNMENT_NOT_FOUND',
  ATTEMPT_NOT_FOUND: 'ATTEMPT_NOT_FOUND',
  GROUP_NOT_FOUND: 'GROUP_NOT_FOUND',
  COMPETENCY_NOT_FOUND: 'COMPETENCY_NOT_FOUND',
  SCALE_NOT_FOUND: 'SCALE_NOT_FOUND',

  // --- 409 · conflicto de estado ------------------------------------------
  CONFLICT: 'CONFLICT',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  EMAIL_ALREADY_IN_USE: 'EMAIL_ALREADY_IN_USE',
  /** Una versión publicada es inmutable: hay que crear una versión nueva. */
  VERSION_IMMUTABLE: 'VERSION_IMMUTABLE',
  ASSESSMENT_NOT_PUBLISHED: 'ASSESSMENT_NOT_PUBLISHED',
  ASSESSMENT_HAS_NO_QUESTIONS: 'ASSESSMENT_HAS_NO_QUESTIONS',
  ASSESSMENT_IN_USE: 'ASSESSMENT_IN_USE',
  ATTEMPT_ALREADY_SUBMITTED: 'ATTEMPT_ALREADY_SUBMITTED',
  ATTEMPT_LIMIT_REACHED: 'ATTEMPT_LIMIT_REACHED',
  ATTEMPT_ALREADY_IN_PROGRESS: 'ATTEMPT_ALREADY_IN_PROGRESS',
  ASSIGNMENT_NOT_OPEN_YET: 'ASSIGNMENT_NOT_OPEN_YET',
  ASSIGNMENT_CLOSED: 'ASSIGNMENT_CLOSED',
  TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED',
  CERTIFICATE_NOT_ENABLED: 'CERTIFICATE_NOT_ENABLED',
  CERTIFICATE_NOT_READY: 'CERTIFICATE_NOT_READY',
  CERTIFICATE_NOT_EARNED: 'CERTIFICATE_NOT_EARNED',
  SCALE_BANDS_INVALID: 'SCALE_BANDS_INVALID',

  // --- 422 · reglas de dominio --------------------------------------------
  QUESTION_PAYLOAD_INVALID: 'QUESTION_PAYLOAD_INVALID',
  QUESTION_HAS_NO_CORRECT_ANSWER: 'QUESTION_HAS_NO_CORRECT_ANSWER',
  ANSWER_FORMAT_INVALID: 'ANSWER_FORMAT_INVALID',
  KMK_COMPETENCY_REQUIRED: 'KMK_COMPETENCY_REQUIRED',

  // --- 429 --------------------------------------------------------------
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  AI_QUOTA_EXCEEDED: 'AI_QUOTA_EXCEEDED',

  // --- 5xx · internos y servicios externos ---------------------------------
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  EXTERNAL_SERVICE_TIMEOUT: 'EXTERNAL_SERVICE_TIMEOUT',
  EXTERNAL_SERVICE_UNAVAILABLE: 'EXTERNAL_SERVICE_UNAVAILABLE',
  PHIDIAS_UNAUTHORIZED: 'PHIDIAS_UNAUTHORIZED',
  PHIDIAS_SYNC_FAILED: 'PHIDIAS_SYNC_FAILED',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  AI_RESPONSE_INVALID: 'AI_RESPONSE_INVALID',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

/** Detalle de un fallo de validación, campo a campo. */
export interface ValidationIssue {
  /** Ruta del campo, p. ej. `questions.2.points`. */
  path: string;
  /** Código estable del problema, traducible en el frontend. */
  rule: string;
  message: string;
}

export interface ApiErrorBody {
  code: ErrorCode;
  /** Texto técnico en inglés. No mostrar al usuario final: traducir `code`. */
  message: string;
  /** Datos de apoyo para traducir el mensaje (p. ej. `{ min: 1, max: 30 }`). */
  details?: Record<string, unknown>;
  issues?: ValidationIssue[];
  /** Correlacionador para cruzar la respuesta con los registros del servidor. */
  requestId?: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

/** Estado HTTP por defecto de cada código. El backend puede afinarlo por caso. */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  BAD_REQUEST: 400,
  UNSUPPORTED_LANGUAGE: 400,

  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_INVALID: 401,
  REFRESH_TOKEN_REUSED: 401,
  ACCOUNT_NOT_ACTIVATED: 401,
  ACCOUNT_SUSPENDED: 401,
  ACCOUNT_LOCKED: 401,
  SSO_DOMAIN_NOT_ALLOWED: 401,
  SSO_ACCOUNT_NOT_LINKED: 401,
  SSO_STATE_MISMATCH: 401,

  FORBIDDEN: 403,
  INSUFFICIENT_PERMISSIONS: 403,
  NOT_RESOURCE_OWNER: 403,
  OUT_OF_SCOPE: 403,
  CSRF_TOKEN_INVALID: 403,

  NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  ASSESSMENT_NOT_FOUND: 404,
  ASSESSMENT_VERSION_NOT_FOUND: 404,
  QUESTION_NOT_FOUND: 404,
  ASSIGNMENT_NOT_FOUND: 404,
  ATTEMPT_NOT_FOUND: 404,
  GROUP_NOT_FOUND: 404,
  COMPETENCY_NOT_FOUND: 404,
  SCALE_NOT_FOUND: 404,

  CONFLICT: 409,
  DUPLICATE_RESOURCE: 409,
  EMAIL_ALREADY_IN_USE: 409,
  VERSION_IMMUTABLE: 409,
  ASSESSMENT_NOT_PUBLISHED: 409,
  ASSESSMENT_HAS_NO_QUESTIONS: 409,
  ASSESSMENT_IN_USE: 409,
  ATTEMPT_ALREADY_SUBMITTED: 409,
  ATTEMPT_LIMIT_REACHED: 409,
  ATTEMPT_ALREADY_IN_PROGRESS: 409,
  ASSIGNMENT_NOT_OPEN_YET: 409,
  ASSIGNMENT_CLOSED: 409,
  TIME_LIMIT_EXCEEDED: 409,
  CERTIFICATE_NOT_ENABLED: 409,
  CERTIFICATE_NOT_READY: 409,
  CERTIFICATE_NOT_EARNED: 409,
  SCALE_BANDS_INVALID: 409,

  QUESTION_PAYLOAD_INVALID: 422,
  QUESTION_HAS_NO_CORRECT_ANSWER: 422,
  ANSWER_FORMAT_INVALID: 422,
  KMK_COMPETENCY_REQUIRED: 422,

  RATE_LIMIT_EXCEEDED: 429,
  AI_QUOTA_EXCEEDED: 429,

  INTERNAL_ERROR: 500,
  EXTERNAL_SERVICE_ERROR: 502,
  EXTERNAL_SERVICE_TIMEOUT: 504,
  EXTERNAL_SERVICE_UNAVAILABLE: 503,
  PHIDIAS_UNAUTHORIZED: 502,
  PHIDIAS_SYNC_FAILED: 502,
  AI_PROVIDER_ERROR: 502,
  AI_RESPONSE_INVALID: 422,
};
