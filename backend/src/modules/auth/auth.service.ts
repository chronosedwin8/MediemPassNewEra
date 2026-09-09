import {
  AUDIT_ACTION,
  ERROR_CODE,
  USER_STATUS,
  type Language,
  type Permission,
  type Role,
} from '@medienpass/shared';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { hashPassword, verifyPassword } from '../../shared/security/password.js';
import { createLogger } from '../../shared/logger.js';
import { recordAudit } from '../audit/audit.service.js';
import { assertAllowedDomain, type SsoProfile } from './sso.service.js';
import {
  createRefreshToken,
  refreshTokenHash,
  signAccessToken,
  type AccessTokenClaims,
} from './token.service.js';

const log = createLogger('auth');

/** Intentos fallidos consecutivos antes de bloquear temporalmente la cuenta. */
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  language: Language;
  roles: Role[];
  permissions: Permission[];
  mustChangePassword: boolean;
}

export interface LoginResult {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Carga el usuario con sus roles y permisos efectivos.
 *
 * Los permisos se calculan como la unión de los de todos sus roles: un usuario
 * con dos roles obtiene la suma, nunca la intersección.
 */
async function loadUserWithAccess(userId: string): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: {
      roles: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });

  if (!user) return null;

  const roles = user.roles.map((link) => link.role.code as Role);
  const permissions = [
    ...new Set(
      user.roles.flatMap((link) => link.role.permissions.map((rp) => rp.permission.code as Permission)),
    ),
  ];

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    language: user.preferredLanguage as Language,
    roles,
    permissions,
    mustChangePassword: user.mustChangePassword,
  };
}

/**
 * Comprueba que la cuenta puede iniciar sesión.
 *
 * Los tres estados no activos devuelven códigos distintos a propósito: una
 * cuenta pendiente de activación necesita que el usuario sepa que debe
 * activarla, no que crea que su contraseña es incorrecta.
 */
function assertAccountUsable(status: string, lockedUntil: Date | null): void {
  if (lockedUntil && lockedUntil > new Date()) {
    throw AppError.unauthorized(ERROR_CODE.ACCOUNT_LOCKED, 'Account temporarily locked');
  }
  switch (status) {
    case USER_STATUS.ACTIVE:
      return;
    case USER_STATUS.PENDING_ACTIVATION:
      throw AppError.unauthorized(ERROR_CODE.ACCOUNT_NOT_ACTIVATED, 'Account not activated');
    case USER_STATUS.SUSPENDED:
    case USER_STATUS.INACTIVE:
      throw AppError.unauthorized(ERROR_CODE.ACCOUNT_SUSPENDED, 'Account is not active');
    default:
      throw AppError.unauthorized(ERROR_CODE.ACCOUNT_SUSPENDED, 'Account is not active');
  }
}

async function registerFailedAttempt(userId: string, attempts: number): Promise<void> {
  const next = attempts + 1;
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: next,
      lockedUntil: next >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS) : null,
    },
  });
}

async function issueSession(
  user: AuthenticatedUser,
  metadata: RequestMetadata,
  family?: string,
): Promise<LoginResult> {
  const refresh = createRefreshToken(family);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refresh.tokenHash,
      family: refresh.family,
      expiresAt: refresh.expiresAt,
      userAgent: metadata.userAgent ?? null,
      ipAddress: metadata.ipAddress ?? null,
    },
  });

  const claims: AccessTokenClaims = {
    userId: user.id,
    username: user.username,
    roles: user.roles,
    permissions: user.permissions,
    language: user.language,
    sessionId: refresh.family,
  };

  return {
    user,
    accessToken: await signAccessToken(claims),
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
}

/**
 * Inicio de sesión con credenciales locales.
 *
 * El identificador puede ser el nombre de usuario o el correo: parte de la
 * matrícula real no tiene correo, así que exigirlo dejaría fuera a esos
 * estudiantes.
 */
export async function login(
  identifier: string,
  password: string,
  metadata: RequestMetadata = {},
): Promise<LoginResult> {
  const normalized = identifier.trim().toLowerCase();

  const account = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [{ username: normalized }, { email: normalized }],
    },
    select: {
      id: true,
      passwordHash: true,
      status: true,
      failedLoginAttempts: true,
      lockedUntil: true,
    },
  });

  // Se hashea igualmente cuando el usuario no existe, para que el tiempo de
  // respuesta no revele qué cuentas están registradas.
  if (!account?.passwordHash) {
    await verifyPassword(
      '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000',
      password,
    );
    await recordAudit({
      action: AUDIT_ACTION.LOGIN_FAILED,
      metadata: { reason: 'unknown_account' },
      ...metadata,
    });
    throw AppError.unauthorized(ERROR_CODE.INVALID_CREDENTIALS, 'Invalid credentials');
  }

  assertAccountUsable(account.status, account.lockedUntil);

  const valid = await verifyPassword(account.passwordHash, password);
  if (!valid) {
    await registerFailedAttempt(account.id, account.failedLoginAttempts);
    await recordAudit({
      userId: account.id,
      action: AUDIT_ACTION.LOGIN_FAILED,
      metadata: { reason: 'bad_password', attempt: account.failedLoginAttempts + 1 },
      ...metadata,
    });
    throw AppError.unauthorized(ERROR_CODE.INVALID_CREDENTIALS, 'Invalid credentials');
  }

  const user = await loadUserWithAccess(account.id);
  if (!user) throw AppError.unauthorized(ERROR_CODE.INVALID_CREDENTIALS, 'Invalid credentials');

  await prisma.user.update({
    where: { id: account.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await recordAudit({ userId: user.id, action: AUDIT_ACTION.LOGIN, ...metadata });
  log.info({ userId: user.id, roles: user.roles }, 'inicio de sesión correcto');

  return issueSession(user, metadata);
}

/**
 * Inicio de sesión federado.
 *
 * Resuelve la identidad en dos pasos, y el orden importa:
 *
 *  1. Por `(proveedor, sujeto)`, que en Entra ID es el `oid` y es estable
 *     aunque la persona cambie de correo o de apellido.
 *  2. Si no hay vínculo todavía, por correo. Es el primer inicio de sesión de
 *     alguien que ya existe en la plataforma, y se aprovecha para dejar el
 *     vínculo creado.
 *
 * **No crea cuentas.** El censo de estudiantes viene de Phidias y el de
 * docentes lo gestiona administración; dar de alta a cualquiera que tenga
 * cuenta en el tenant vaciaría de sentido ese control. Sin correspondencia, se
 * rechaza con un código propio para que la interfaz pueda explicarlo.
 */
export async function loginWithSso(
  profile: SsoProfile,
  metadata: RequestMetadata = {},
): Promise<LoginResult> {
  assertAllowedDomain(profile.email);

  const linked = await prisma.userIdentity.findUnique({
    where: {
      provider_providerUserId: { provider: profile.provider, providerUserId: profile.subject },
    },
    select: { id: true, userId: true },
  });

  let userId = linked?.userId ?? null;

  if (!userId && profile.email) {
    const byEmail = await prisma.user.findFirst({
      where: { email: profile.email, deletedAt: null },
      select: { id: true },
    });
    userId = byEmail?.id ?? null;
  }

  if (!userId) {
    await recordAudit({
      action: AUDIT_ACTION.LOGIN_FAILED,
      metadata: { reason: 'sso_not_linked', provider: profile.provider },
      ...metadata,
    });
    throw AppError.unauthorized(
      ERROR_CODE.SSO_ACCOUNT_NOT_LINKED,
      'No account matches this identity',
    );
  }

  const account = await prisma.user.findFirstOrThrow({
    where: { id: userId },
    select: { id: true, status: true, lockedUntil: true },
  });

  /*
   * Una cuenta creada por sincronización llega en `PENDING_ACTIVATION` porque
   * no tiene contraseña. Entrar por SSO **es** activarla: la persona acaba de
   * demostrar su identidad ante el proveedor del colegio, que es una prueba
   * al menos tan buena como una contraseña que le habríamos enviado por
   * correo.
   */
  if (account.status === USER_STATUS.PENDING_ACTIVATION) {
    await prisma.user.update({ where: { id: userId }, data: { status: USER_STATUS.ACTIVE } });
  } else {
    assertAccountUsable(account.status, account.lockedUntil);
  }

  const user = await loadUserWithAccess(userId);
  if (!user) throw AppError.unauthorized(ERROR_CODE.SSO_ACCOUNT_NOT_LINKED);

  // El vínculo se crea o se refresca aquí, de modo que a partir del segundo
  // inicio de sesión ya no hace falta buscar por correo.
  if (linked) {
    await prisma.userIdentity.update({
      where: { id: linked.id },
      data: { lastUsedAt: new Date(), email: profile.email },
    });
  } else {
    await prisma.userIdentity.create({
      data: {
        userId,
        provider: profile.provider,
        providerUserId: profile.subject,
        email: profile.email,
        lastUsedAt: new Date(),
      },
    });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await recordAudit({
    userId,
    action: AUDIT_ACTION.LOGIN,
    metadata: { method: 'sso', provider: profile.provider },
    ...metadata,
  });
  log.info({ userId, provider: profile.provider }, 'inicio de sesión federado correcto');

  return issueSession(user, metadata);
}

/**
 * Rotación del token de refresco.
 *
 * Si llega un refresco válido en forma pero ya rotado o revocado, se asume
 * robo y se revoca la familia completa: el atacante y la víctima quedan fuera,
 * y la víctima vuelve a entrar con sus credenciales.
 */
export async function refreshSession(
  token: string,
  metadata: RequestMetadata = {},
): Promise<LoginResult> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: refreshTokenHash(token) },
  });

  if (!stored) {
    throw AppError.unauthorized(ERROR_CODE.TOKEN_INVALID, 'Unknown refresh token');
  }

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { family: stored.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    log.warn({ userId: stored.userId, family: stored.family }, 'refresco reutilizado: familia revocada');
    throw AppError.unauthorized(ERROR_CODE.REFRESH_TOKEN_REUSED, 'Refresh token reuse detected');
  }

  if (stored.expiresAt <= new Date()) {
    throw AppError.unauthorized(ERROR_CODE.TOKEN_EXPIRED, 'Refresh token expired');
  }

  const user = await loadUserWithAccess(stored.userId);
  if (!user) throw AppError.unauthorized(ERROR_CODE.TOKEN_INVALID, 'User no longer available');

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return issueSession(user, metadata, stored.family);
}

export async function logout(token: string | undefined, metadata: RequestMetadata = {}): Promise<void> {
  if (!token) return;
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: refreshTokenHash(token) },
    select: { id: true, family: true, userId: true },
  });
  if (!stored) return;

  // Se revoca la familia entera: cerrar sesión debe cerrar esta sesión por
  // completo, no solo el último token emitido.
  await prisma.refreshToken.updateMany({
    where: { family: stored.family, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await recordAudit({ userId: stored.userId, action: AUDIT_ACTION.LOGOUT, ...metadata });
}

export async function getCurrentUser(userId: string): Promise<AuthenticatedUser> {
  const user = await loadUserWithAccess(userId);
  if (!user) throw AppError.notFound(ERROR_CODE.USER_NOT_FOUND);
  return user;
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  metadata: RequestMetadata = {},
): Promise<void> {
  const account = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, passwordHash: true },
  });

  if (!account?.passwordHash) {
    throw AppError.unauthorized(ERROR_CODE.INVALID_CREDENTIALS, 'Account has no local password');
  }

  const valid = await verifyPassword(account.passwordHash, currentPassword);
  if (!valid) {
    throw AppError.unauthorized(ERROR_CODE.INVALID_CREDENTIALS, 'Current password is incorrect');
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(newPassword),
      passwordUpdatedAt: new Date(),
      mustChangePassword: false,
    },
  });

  // Cambiar la contraseña invalida todas las sesiones abiertas: si el motivo
  // del cambio es una sospecha de robo, dejar sesiones vivas lo haría inútil.
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await recordAudit({ userId, action: AUDIT_ACTION.PASSWORD_CHANGED, ...metadata });
}
