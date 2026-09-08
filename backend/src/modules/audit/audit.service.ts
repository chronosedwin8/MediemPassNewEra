import type { AuditAction } from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('audit');

/**
 * Registro de auditoría.
 *
 * Deja constancia de quién hizo qué y cuándo. Dos decisiones de diseño:
 *
 *  1. **Nunca hace fallar la operación auditada.** Si el registro no puede
 *     escribirse, se anota el problema y la petición continúa: perder una
 *     entrada de auditoría es malo, pero impedir que un docente publique una
 *     evaluación por ello es peor.
 *  2. **Los metadatos se depuran.** La especificación prohíbe registrar
 *     información sensible innecesaria, así que las claves peligrosas se
 *     eliminan aquí, no se confía en que quien llama se acuerde.
 */

const FORBIDDEN_METADATA_KEYS = new Set([
  'password',
  'passwordhash',
  'newpassword',
  'currentpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'apikey',
  'clientsecret',
  'document',
  'documentnumber',
  'address',
  'phone',
  'mobile',
  'birthday',
  'birthdate',
]);

function sanitize(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) continue;
    clean[key] = value;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

export interface AuditEntry {
  userId?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent?.slice(0, 300) ?? null,
        metadata: (sanitize(entry.metadata) ?? undefined) as object | undefined,
      },
    });
  } catch (error) {
    log.error({ err: error, action: entry.action }, 'no se pudo escribir la entrada de auditoría');
  }
}
