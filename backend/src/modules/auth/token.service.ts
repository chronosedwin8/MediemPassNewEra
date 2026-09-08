import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { ERROR_CODE, type Language, type Permission, type Role } from '@medienpass/shared';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/app-error.js';

/**
 * Emisión y verificación de tokens.
 *
 * Modelo: acceso corto en cabecera + refresco largo, rotativo, en cookie
 * `httpOnly`. De los dos, solo el de acceso viaja donde JavaScript puede
 * leerlo, y caduca en quince minutos.
 *
 * Del refresco se guarda **únicamente su hash**: si la base de datos se
 * filtrase, los tokens almacenados no serían utilizables. Cada refresco
 * pertenece a una `family`; usar un token ya rotado revoca la familia entera,
 * porque es la señal característica de que alguien lo ha robado.
 */

const accessSecret = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'medienpass';
const AUDIENCE = 'medienpass-api';

export interface AccessTokenClaims {
  userId: string;
  username: string;
  roles: Role[];
  permissions: Permission[];
  language: Language;
  sessionId: string;
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({
    username: claims.username,
    roles: claims.roles,
    permissions: claims.permissions,
    language: claims.language,
    sid: claims.sessionId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, accessSecret, { issuer: ISSUER, audience: AUDIENCE });
    payload = result.payload;
  } catch (error) {
    // `jose` distingue la expiración del resto: al cliente le importa, porque
    // ante un token expirado debe intentar refrescar en lugar de pedir login.
    const isExpired = error instanceof Error && error.name === 'JWTExpired';
    throw AppError.unauthorized(
      isExpired ? ERROR_CODE.TOKEN_EXPIRED : ERROR_CODE.TOKEN_INVALID,
      isExpired ? 'Access token expired' : 'Invalid access token',
    );
  }

  if (!payload.sub || typeof payload['sid'] !== 'string') {
    throw AppError.unauthorized(ERROR_CODE.TOKEN_INVALID, 'Malformed token payload');
  }

  return {
    userId: payload.sub,
    username: String(payload['username'] ?? ''),
    roles: (payload['roles'] as Role[]) ?? [],
    permissions: (payload['permissions'] as Permission[]) ?? [],
    language: (payload['language'] as Language) ?? 'es',
    sessionId: payload['sid'],
  };
}

// --- Refresco ---------------------------------------------------------------

export interface RefreshTokenMaterial {
  /** Valor que viaja al cliente. No se persiste. */
  token: string;
  /** Lo único que se guarda en la base de datos. */
  tokenHash: string;
  family: string;
  expiresAt: Date;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseDuration(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) throw new Error(`Duración inválida: ${duration}`);
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * (multipliers[unit!] ?? 0);
}

export function createRefreshToken(family?: string): RefreshTokenMaterial {
  const token = randomBytes(48).toString('base64url');
  return {
    token,
    tokenHash: hashToken(token),
    family: family ?? randomUUID(),
    expiresAt: new Date(Date.now() + parseDuration(env.REFRESH_TOKEN_EXPIRES_IN)),
  };
}

export function refreshTokenHash(token: string): string {
  return hashToken(token);
}

// --- CSRF -------------------------------------------------------------------

/**
 * Token CSRF por doble envío.
 *
 * Solo hace falta donde la autenticación depende de una cookie —el refresco—,
 * porque el resto de la API se autentica con una cabecera que un sitio de
 * terceros no puede fijar.
 */
export function createCsrfToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Comparación en tiempo constante: comparar con `===` filtra información. */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
