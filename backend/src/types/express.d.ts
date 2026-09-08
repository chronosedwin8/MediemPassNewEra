import type { Language, Permission, Role } from '@medienpass/shared';

/**
 * Contexto que la autenticación adjunta a la petición.
 *
 * Se declara aquí, una sola vez, para que ningún controlador tenga que hacer
 * aserciones de tipo sobre `req` ni convivir con `any`.
 */
export interface AuthContext {
  userId: string;
  username: string;
  roles: Role[];
  permissions: Permission[];
  language: Language;
  /** Identificador de sesión, usado para revocar la cadena de refresco. */
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      /** Consulta ya validada y convertida por el middleware `validate`. */
      validatedQuery?: unknown;
    }
  }
}

export {};
