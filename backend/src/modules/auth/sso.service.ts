import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { ERROR_CODE, IDENTITY_PROVIDER, type IdentityProvider } from '@medienpass/shared';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/app-error.js';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('auth:sso');

/**
 * Inicio de sesión federado mediante OIDC.
 *
 * Convive con las credenciales locales: son dos formas de demostrar la misma
 * identidad, no dos cuentas. Un usuario puede entrar hoy con su cuenta del
 * colegio y mañana con su contraseña, y en ambos casos es el mismo `User`.
 *
 * El SSO **no crea cuentas**. El censo de estudiantes viene de Phidias y el de
 * docentes lo gestiona administración; permitir que cualquiera con una cuenta
 * del tenant se diera de alta solo por iniciar sesión rompería ese control.
 * Si el correo no corresponde a nadie, se rechaza y se registra.
 */

export interface SsoProfile {
  provider: IdentityProvider;
  /** Identificador estable en el proveedor. En Entra ID es el `oid`. */
  subject: string;
  email: string | null;
  name: string | null;
}

/** Datos que hay que conservar entre la ida y la vuelta del flujo. */
export interface SsoHandshake {
  authorizationUrl: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface SsoProvider {
  readonly id: IdentityProvider;
  isConfigured(): boolean;
  createHandshake(redirectUri: string): Promise<SsoHandshake>;
  exchangeCode(params: {
    code: string;
    codeVerifier: string;
    nonce: string;
    redirectUri: string;
  }): Promise<SsoProfile>;
}

// --- Utilidades del flujo ----------------------------------------------------

const base64url = (buffer: Buffer): string => buffer.toString('base64url');

/**
 * Reto PKCE.
 *
 * Impide que un tercero que intercepte el código de autorización pueda
 * canjearlo: sin el verificador original, el proveedor rechaza el canje.
 */
function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64url(randomBytes(48));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

interface DiscoveryDocument {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

// --- Microsoft Entra ID ------------------------------------------------------

class EntraIdProvider implements SsoProvider {
  readonly id = IDENTITY_PROVIDER.ENTRA_ID;

  private discovery: DiscoveryDocument | null = null;
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  isConfigured(): boolean {
    return Boolean(env.ENTRA_TENANT_ID && env.ENTRA_CLIENT_ID && env.ENTRA_CLIENT_SECRET);
  }

  /**
   * Documento de descubrimiento del tenant.
   *
   * Se cachea en el proceso: los endpoints de Entra ID no cambian y pedirlo en
   * cada inicio de sesión añadiría una ida y vuelta innecesaria.
   */
  private async getDiscovery(): Promise<DiscoveryDocument> {
    if (this.discovery) return this.discovery;

    const url = `https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/v2.0/.well-known/openid-configuration`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (!response.ok) {
      throw new AppError(
        ERROR_CODE.EXTERNAL_SERVICE_UNAVAILABLE,
        `Entra ID discovery failed with ${response.status}`,
      );
    }

    this.discovery = (await response.json()) as DiscoveryDocument;
    this.jwks = createRemoteJWKSet(new URL(this.discovery.jwks_uri));
    return this.discovery;
  }

  async createHandshake(redirectUri: string): Promise<SsoHandshake> {
    const discovery = await this.getDiscovery();
    const { codeVerifier, codeChallenge } = createPkcePair();
    const state = base64url(randomBytes(24));
    const nonce = base64url(randomBytes(24));

    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set('client_id', env.ENTRA_CLIENT_ID!);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    // Restringe la elección de cuenta a las del colegio en la propia pantalla
    // de Microsoft, en lugar de dejar que el usuario elija una personal y
    // descubra el rechazo después.
    if (env.SSO_ALLOWED_DOMAINS.length === 1) {
      url.searchParams.set('domain_hint', env.SSO_ALLOWED_DOMAINS[0]!);
    }

    return { authorizationUrl: url.toString(), state, nonce, codeVerifier };
  }

  async exchangeCode(params: {
    code: string;
    codeVerifier: string;
    nonce: string;
    redirectUri: string;
  }): Promise<SsoProfile> {
    const discovery = await this.getDiscovery();

    const body = new URLSearchParams({
      client_id: env.ENTRA_CLIENT_ID!,
      client_secret: env.ENTRA_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    });

    const response = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      // Nunca se propaga el cuerpo de la respuesta: puede contener el secreto
      // del cliente reflejado por el proveedor.
      log.warn({ status: response.status }, 'el canje del código con Entra ID falló');
      throw AppError.unauthorized(
        ERROR_CODE.SSO_STATE_MISMATCH,
        'Authorization code exchange failed',
      );
    }

    const tokens = (await response.json()) as { id_token?: string };
    if (!tokens.id_token) {
      throw AppError.unauthorized(ERROR_CODE.TOKEN_INVALID, 'Entra ID returned no id_token');
    }

    if (!this.jwks)
      throw AppError.internal('El conjunto de claves de Entra ID no está inicializado');

    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(tokens.id_token, this.jwks, {
        issuer: discovery.issuer,
        audience: env.ENTRA_CLIENT_ID!,
      });
      payload = verified.payload;
    } catch (error) {
      log.warn({ err: error }, 'la verificación del id_token falló');
      throw AppError.unauthorized(ERROR_CODE.TOKEN_INVALID, 'Invalid id_token');
    }

    // El nonce ata esta respuesta a la petición que la originó: sin
    // comprobarlo, un id_token válido obtenido en otro contexto sería
    // reutilizable aquí.
    if (payload['nonce'] !== params.nonce) {
      throw AppError.unauthorized(ERROR_CODE.SSO_STATE_MISMATCH, 'Nonce mismatch');
    }

    const subject = (payload['oid'] as string | undefined) ?? payload.sub;
    if (!subject) {
      throw AppError.unauthorized(ERROR_CODE.TOKEN_INVALID, 'id_token has no stable subject');
    }

    const email =
      (payload['email'] as string | undefined) ??
      (payload['preferred_username'] as string | undefined) ??
      null;

    return {
      provider: this.id,
      subject,
      email: email ? email.toLowerCase() : null,
      name: (payload['name'] as string | undefined) ?? null,
    };
  }
}

// --- Registro ----------------------------------------------------------------

let provider: SsoProvider = new EntraIdProvider();

export function getSsoProvider(): SsoProvider {
  return provider;
}

/** Solo para pruebas: permite inyectar un proveedor controlado. */
export function setSsoProvider(next: SsoProvider | null): void {
  provider = next ?? new EntraIdProvider();
}

export function isSsoEnabled(): boolean {
  return env.SSO_ENABLED && provider.isConfigured();
}

/**
 * Comprueba que el correo pertenece a un dominio autorizado.
 *
 * Con la lista vacía no se restringe nada, que es lo correcto cuando el
 * tenant ya limita quién puede autenticarse. Con dominios configurados, se
 * rechaza cualquier otro: un invitado del tenant no debe entrar a la
 * plataforma académica solo por tener cuenta.
 */
export function assertAllowedDomain(email: string | null): void {
  if (env.SSO_ALLOWED_DOMAINS.length === 0) return;

  const domain = email?.split('@')[1]?.toLowerCase();
  if (!domain || !env.SSO_ALLOWED_DOMAINS.includes(domain)) {
    throw AppError.unauthorized(ERROR_CODE.SSO_DOMAIN_NOT_ALLOWED, 'Email domain is not allowed');
  }
}
