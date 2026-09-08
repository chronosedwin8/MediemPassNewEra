import { hash, verify } from '@node-rs/argon2';

/**
 * Hasheo de contraseñas con Argon2id.
 *
 * Parámetros según las recomendaciones de OWASP: 19 MiB de memoria, dos
 * iteraciones y paralelismo 1. Argon2id resiste tanto ataques por canal
 * lateral como por hardware dedicado, que es exactamente el escenario de una
 * base de datos filtrada.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

/**
 * Comprueba una contraseña. Devuelve `false` ante un hash corrupto en lugar
 * de propagar la excepción: un registro dañado no debe convertir un login
 * fallido en un error 500 que revele el estado interno.
 */
export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
