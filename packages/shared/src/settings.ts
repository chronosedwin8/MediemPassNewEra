import { z } from 'zod';
import { LANGUAGE } from './enums.js';

/**
 * Configuración del sistema.
 *
 * Cada clave declara aquí su esquema y su valor por defecto, de modo que
 * `SettingsService` puede devolver valores tipados y validar cualquier cambio
 * antes de persistirlo. Que el catálogo viva en el paquete compartido permite
 * al panel de administración construir el formulario a partir de la misma
 * definición que valida el servidor.
 *
 * Aquí solo hay ajustes sin efecto histórico. Las escalas de calificación, que
 * sí lo tienen, son entidades versionadas en base de datos: cambiar una escala
 * no debe reescribir el significado de notas ya emitidas.
 */

export const SETTING_KEY = {
  PLATFORM_NAME: 'platform.name',
  PLATFORM_LOGO_URL: 'platform.logo_url',
  PLATFORM_DEFAULT_LANGUAGE: 'platform.default_language',
  /**
   * Dominio del correo institucional de los estudiantes.
   *
   * El correo de un estudiante es su código seguido de este dominio. Es un
   * ajuste y no una constante porque un cambio de dominio institucional no
   * debería exigir un despliegue.
   */
  STUDENT_EMAIL_DOMAIN: 'platform.student_email_domain',

  ASSESSMENT_DEFAULT_TIME_LIMIT: 'assessment.default_time_limit_minutes',
  ASSESSMENT_DEFAULT_ATTEMPTS: 'assessment.default_attempts_allowed',
  ASSESSMENT_SHOW_RESULTS_IMMEDIATELY: 'assessment.show_results_immediately',
  ASSESSMENT_SHOW_CORRECT_ANSWERS: 'assessment.show_correct_answers',
  ASSESSMENT_SHOW_FEEDBACK: 'assessment.show_feedback',
  /// Margen tras el vencimiento durante el cual todavía se acepta un envío,
  /// para no penalizar la latencia de red del último segundo.
  ASSESSMENT_SUBMIT_GRACE_SECONDS: 'assessment.submit_grace_seconds',

  PHIDIAS_ACADEMIC_YEAR_ID: 'phidias.academic_year_id',
  /// Phidias expone varias familias de periodos solapadas y su endpoint de
  /// categorías está caído; el administrador designa cuál es la oficial.
  PHIDIAS_OFFICIAL_PERIOD_CATEGORY: 'phidias.official_period_category',
  PHIDIAS_AUTO_SYNC_ENABLED: 'phidias.auto_sync_enabled',

  AI_ENABLED: 'ai.enabled',
  AI_MAX_QUESTIONS: 'ai.max_questions_per_request',
} as const;

export type SettingKey = (typeof SETTING_KEY)[keyof typeof SETTING_KEY];

interface SettingDefinition<T> {
  schema: z.ZodType<T>;
  defaultValue: T;
  description: string;
}

function define<T>(
  schema: z.ZodType<T>,
  defaultValue: T,
  description: string,
): SettingDefinition<T> {
  return { schema, defaultValue, description };
}

export const SETTING_DEFINITIONS = {
  [SETTING_KEY.PLATFORM_NAME]: define(
    z.string().trim().min(1).max(80),
    'Medienpass',
    'Nombre visible de la plataforma',
  ),
  [SETTING_KEY.PLATFORM_LOGO_URL]: define(
    z.string().trim().max(500),
    '',
    'URL del logotipo institucional',
  ),
  [SETTING_KEY.PLATFORM_DEFAULT_LANGUAGE]: define(
    z.enum([LANGUAGE.ES, LANGUAGE.DE, LANGUAGE.EN]),
    LANGUAGE.ES,
    'Idioma por defecto para cuentas nuevas',
  ),

  [SETTING_KEY.STUDENT_EMAIL_DOMAIN]: define(
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'Debe ser un dominio válido, sin arroba'),
    'colegioaleman.edu.co',
    'Dominio del correo institucional de los estudiantes',
  ),

  [SETTING_KEY.ASSESSMENT_DEFAULT_TIME_LIMIT]: define(
    z.number().int().min(0).max(600),
    45,
    'Duración máxima por defecto en minutos (0 = sin límite)',
  ),
  [SETTING_KEY.ASSESSMENT_DEFAULT_ATTEMPTS]: define(
    z.number().int().min(1).max(20),
    1,
    'Número de intentos permitidos por defecto',
  ),
  [SETTING_KEY.ASSESSMENT_SHOW_RESULTS_IMMEDIATELY]: define(
    z.boolean(),
    true,
    'Mostrar el resultado al estudiante nada más terminar',
  ),
  [SETTING_KEY.ASSESSMENT_SHOW_CORRECT_ANSWERS]: define(
    z.boolean(),
    true,
    'Mostrar las respuestas correctas tras finalizar',
  ),
  [SETTING_KEY.ASSESSMENT_SHOW_FEEDBACK]: define(
    z.boolean(),
    true,
    'Mostrar la retroalimentación de cada pregunta',
  ),
  [SETTING_KEY.ASSESSMENT_SUBMIT_GRACE_SECONDS]: define(
    z.number().int().min(0).max(300),
    30,
    'Margen de gracia tras el vencimiento para aceptar el envío',
  ),

  [SETTING_KEY.PHIDIAS_ACADEMIC_YEAR_ID]: define(
    z.number().int().positive().nullable(),
    null,
    'Año académico de Phidias fijado a mano (nulo = resolver por fecha)',
  ),
  [SETTING_KEY.PHIDIAS_OFFICIAL_PERIOD_CATEGORY]: define(
    z.number().int().nullable(),
    null,
    'Categoría de periodo de Phidias considerada oficial',
  ),
  [SETTING_KEY.PHIDIAS_AUTO_SYNC_ENABLED]: define(
    z.boolean(),
    false,
    'Sincronización automática programada de estudiantes',
  ),

  [SETTING_KEY.AI_ENABLED]: define(z.boolean(), true, 'Generación de evaluaciones con IA activa'),
  [SETTING_KEY.AI_MAX_QUESTIONS]: define(
    z.number().int().min(1).max(50),
    30,
    'Máximo de preguntas por generación',
  ),
} as const;

export type SettingValue<K extends SettingKey> =
  (typeof SETTING_DEFINITIONS)[K] extends SettingDefinition<infer T> ? T : never;

export const ALL_SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];
