import {
  AUDIT_ACTION,
  ERROR_CODE,
  SETTING_DEFINITIONS,
  type SettingKey,
  type SettingValue,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { cache } from '../../shared/cache/cache.service.js';
import { createLogger } from '../../shared/logger.js';
import { recordAudit } from '../audit/audit.service.js';

const log = createLogger('settings');

/**
 * Configuración del sistema, tipada y cacheada.
 *
 * Cada clave declara su esquema y su valor por defecto en el paquete
 * compartido, de modo que:
 *
 *  - `get` devuelve el tipo correcto sin conversiones en el punto de uso;
 *  - un valor corrupto en la base no tumba el sistema: se registra y se
 *    devuelve el valor por defecto, porque una configuración mal guardada no
 *    debe impedir que un estudiante entregue su evaluación;
 *  - el panel de administración puede construir su formulario a partir de la
 *    misma definición que valida el servidor.
 *
 * Aquí solo hay ajustes sin efecto histórico. Las escalas de calificación son
 * entidades versionadas aparte, precisamente porque sí lo tienen.
 */

const CACHE_KEY_PREFIX = 'settings:';
const CACHE_TTL_SECONDS = 300;

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const definition = SETTING_DEFINITIONS[key];

  return cache.remember(`${CACHE_KEY_PREFIX}${key}`, CACHE_TTL_SECONDS, async () => {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    if (!row) return definition.defaultValue as SettingValue<K>;

    const parsed = definition.schema.safeParse(row.value);
    if (!parsed.success) {
      log.error(
        { key, issues: parsed.error.issues },
        'valor de configuración inválido en base de datos; se usa el valor por defecto',
      );
      return definition.defaultValue as SettingValue<K>;
    }

    return parsed.data as SettingValue<K>;
  });
}

/** Lee varias claves de una vez, evitando una consulta por clave. */
export async function getSettings<K extends SettingKey>(
  keys: readonly K[],
): Promise<{ [P in K]: SettingValue<P> }> {
  const entries = await Promise.all(keys.map(async (key) => [key, await getSetting(key)] as const));
  return Object.fromEntries(entries) as { [P in K]: SettingValue<P> };
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const keys = Object.keys(SETTING_DEFINITIONS) as SettingKey[];
  const entries = await Promise.all(keys.map(async (key) => [key, await getSetting(key)] as const));
  return Object.fromEntries(entries);
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: unknown,
  actorId: string,
): Promise<SettingValue<K>> {
  const definition = SETTING_DEFINITIONS[key];
  if (!definition) throw AppError.notFound(ERROR_CODE.NOT_FOUND, { key });

  const parsed = definition.schema.safeParse(value);
  if (!parsed.success) {
    throw AppError.validation(
      parsed.error.issues.map((issue) => ({
        path: [key, ...issue.path.map(String)].join('.'),
        rule: issue.code,
        message: issue.message,
      })),
      `Invalid value for setting ${key}`,
    );
  }

  await prisma.systemSetting.upsert({
    where: { key },
    create: {
      key,
      value: parsed.data as never,
      description: definition.description,
      updatedById: actorId,
    },
    update: { value: parsed.data as never, updatedById: actorId },
  });

  await cache.delete(`${CACHE_KEY_PREFIX}${key}`);

  await recordAudit({
    userId: actorId,
    action: AUDIT_ACTION.UPDATE_SETTINGS,
    entityType: 'system_setting',
    entityId: key,
    metadata: { key },
  });

  return parsed.data as SettingValue<K>;
}

/** Actualiza varias claves. Valida todas antes de escribir ninguna. */
export async function setSettings(
  values: Record<string, unknown>,
  actorId: string,
): Promise<Record<string, unknown>> {
  const keys = Object.keys(values) as SettingKey[];

  for (const key of keys) {
    if (!(key in SETTING_DEFINITIONS)) {
      throw AppError.notFound(ERROR_CODE.NOT_FOUND, { key });
    }
  }

  const result: Record<string, unknown> = {};
  for (const key of keys) {
    result[key] = await setSetting(key, values[key], actorId);
  }
  return result;
}

/** Invalida la caché completa. Útil tras una restauración o una semilla. */
export async function invalidateSettingsCache(): Promise<void> {
  await cache.deleteByPrefix(CACHE_KEY_PREFIX);
}
