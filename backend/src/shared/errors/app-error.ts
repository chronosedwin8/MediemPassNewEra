import {
  ERROR_CODE,
  ERROR_HTTP_STATUS,
  type ErrorCode,
  type ValidationIssue,
} from '@medienpass/shared';

/**
 * Error de dominio con código estable.
 *
 * Todo fallo previsible del sistema se expresa como un `AppError`. El
 * middleware de errores lo traduce a una respuesta HTTP consistente y el
 * frontend traduce el `code` al idioma del usuario, de modo que el servidor
 * nunca es la fuente del texto que se lee en pantalla.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly issues?: ValidationIssue[];
  /** `true` cuando es un fallo esperado del dominio y no un defecto del código. */
  readonly isOperational = true;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: {
      status?: number;
      details?: Record<string, unknown>;
      issues?: ValidationIssue[];
      cause?: unknown;
    },
  ) {
    super(message ?? code, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = options?.status ?? ERROR_HTTP_STATUS[code];
    this.details = options?.details;
    this.issues = options?.issues;
    Error.captureStackTrace?.(this, AppError);
  }

  // --- Atajos para los casos más frecuentes -------------------------------

  static notFound(code: ErrorCode = ERROR_CODE.NOT_FOUND, details?: Record<string, unknown>): AppError {
    return new AppError(code, 'Resource not found', { details });
  }

  static unauthorized(code: ErrorCode = ERROR_CODE.UNAUTHENTICATED, message?: string): AppError {
    return new AppError(code, message ?? 'Authentication required');
  }

  static forbidden(code: ErrorCode = ERROR_CODE.FORBIDDEN, details?: Record<string, unknown>): AppError {
    return new AppError(code, 'Access denied', { details });
  }

  static conflict(code: ErrorCode, message?: string, details?: Record<string, unknown>): AppError {
    return new AppError(code, message ?? 'Conflicting state', { details });
  }

  static validation(issues: ValidationIssue[], message = 'Validation failed'): AppError {
    return new AppError(ERROR_CODE.VALIDATION_ERROR, message, { issues });
  }

  static internal(message = 'Unexpected error', cause?: unknown): AppError {
    return new AppError(ERROR_CODE.INTERNAL_ERROR, message, { cause });
  }
}

/**
 * Fallo de un servicio externo (Phidias, proveedor de IA).
 *
 * Se distingue del error interno porque la causa está fuera del sistema y la
 * respuesta al cliente debe ser 502/504, no 500: el problema no es nuestro
 * código y el operador necesita saberlo para diagnosticar.
 */
export class ExternalServiceError extends AppError {
  constructor(
    readonly service: string,
    code: ErrorCode = ERROR_CODE.EXTERNAL_SERVICE_ERROR,
    message?: string,
    options?: { details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(code, message ?? `${service} request failed`, {
      details: { service, ...options?.details },
      cause: options?.cause,
    });
    this.name = 'ExternalServiceError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
