import pino from 'pino';
import { env, isDevelopment, isTest } from '../config/env.js';

/**
 * Registro estructurado.
 *
 * La lista de redacción no es decorativa: la especificación prohíbe registrar
 * contraseñas, tokens de Phidias y documentos de estudiantes, y la forma
 * fiable de cumplirlo es que el propio registrador los borre, en lugar de
 * confiar en que nadie los pase nunca por descuido.
 */

const REDACTED_PATHS = [
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'newPassword',
  'currentPassword',
  'token',
  '*.token',
  'accessToken',
  'refreshToken',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'PHIDIAS_TOKEN',
  'phidiasToken',
  'AI_API_KEY',
  'apiKey',
  'clientSecret',
  // Datos personales que la plataforma nunca necesita y que Phidias devuelve.
  'document',
  '*.document',
  'documentNumber',
  'address',
  '*.address',
  'phone',
  'mobile',
  'birthday',
  'birthdate',
];

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: { paths: REDACTED_PATHS, censor: '[REDACTADO]' },
  base: { app: env.APP_NAME },
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,app' },
        },
      }
    : {}),
});

/** Registrador con contexto fijo, para no repetir el módulo en cada llamada. */
export function createLogger(module: string): pino.Logger {
  return logger.child({ module });
}
