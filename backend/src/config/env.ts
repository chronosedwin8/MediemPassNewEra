import { z } from 'zod';

/**
 * Configuración del proceso, validada al arrancar.
 *
 * Si falta una variable obligatoria el servidor no arranca y explica cuál:
 * es preferible fallar en el arranque que descubrir a las tres de la mañana
 * que `JWT_SECRET` estaba vacío y los tokens se firmaban con `undefined`.
 *
 * Ningún secreto debe salir de aquí hacia registros ni respuestas. El token
 * de Phidias, en particular, solo lo consume `PhidiasClient`.
 */

const booleanFromString = z
  .string()
  .transform((value) => value.toLowerCase() === 'true' || value === '1')
  .pipe(z.boolean());

const commaSeparated = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string()));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().default('Medienpass'),
    APP_URL: z.string().url().default('http://localhost:5173'),
    PORT: z.coerce.number().int().positive().default(3000),
    DEFAULT_LANGUAGE: z.enum(['es', 'de', 'en']).default('es'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
    DATABASE_URL_TEST: z.string().optional(),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET debe tener al menos 32 caracteres'),
    REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),
    COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET debe tener al menos 32 caracteres'),

    SSO_ENABLED: booleanFromString.default('false'),
    ENTRA_TENANT_ID: z.string().optional(),
    ENTRA_CLIENT_ID: z.string().optional(),
    ENTRA_CLIENT_SECRET: z.string().optional(),
    ENTRA_REDIRECT_URI: z.string().optional(),
    SSO_ALLOWED_DOMAINS: commaSeparated.default(''),

    CORS_ORIGIN: commaSeparated.default('http://localhost:5173'),

    PHIDIAS_BASE_URL: z.string().url().default('https://ds-barranquilla.phidias.co/rest'),
    PHIDIAS_TOKEN: z.string().optional(),
    PHIDIAS_MODE: z.enum(['live', 'mock']).default('mock'),
    PHIDIAS_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    PHIDIAS_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    PHIDIAS_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(300),
    PHIDIAS_ACADEMIC_YEAR_ID: z.coerce.number().int().positive().optional(),

    AI_PROVIDER: z.enum(['google', 'anthropic', 'openai', 'mock']).default('mock'),
    AI_API_KEY: z.string().optional(),
    AI_MODEL: z.string().default('gemini-2.5-pro'),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
    AI_MAX_QUESTIONS_PER_REQUEST: z.coerce.number().int().positive().default(30),
    AI_RATE_LIMIT_PER_USER_PER_DAY: z.coerce.number().int().positive().default(50),

    CACHE_DRIVER: z.enum(['memory', 'redis']).default('memory'),
    REDIS_URL: z.string().optional(),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(10),
  })
  // Las dependencias entre variables se comprueban aquí: activar SSO sin
  // credenciales produciría un fallo tardío y confuso en pleno login.
  .superRefine((env, ctx) => {
    if (env.SSO_ENABLED) {
      for (const key of ['ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} es obligatoria cuando SSO_ENABLED=true`,
          });
        }
      }
    }
    if (env.PHIDIAS_MODE === 'live' && !env.PHIDIAS_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PHIDIAS_TOKEN'],
        message: 'PHIDIAS_TOKEN es obligatorio cuando PHIDIAS_MODE=live',
      });
    }
    if (env.AI_PROVIDER !== 'mock' && !env.AI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AI_API_KEY'],
        message: `AI_API_KEY es obligatoria cuando AI_PROVIDER=${env.AI_PROVIDER}`,
      });
    }
    if (env.CACHE_DRIVER === 'redis' && !env.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_URL'],
        message: 'REDIS_URL es obligatoria cuando CACHE_DRIVER=redis',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  · ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${details}\n`);
  }

  return parsed.data;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDevelopment = env.NODE_ENV === 'development';
