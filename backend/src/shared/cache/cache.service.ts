import { createLogger } from '../logger.js';

const log = createLogger('cache');

/**
 * Caché con interfaz propia.
 *
 * La implementación en memoria basta hoy y evita añadir Redis antes de que
 * haga falta. Lo importante es que nadie fuera de este archivo sepa dónde se
 * guardan los datos: migrar a Redis será cambiar la implementación, no el
 * código que la usa.
 */
export interface CacheService {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Invalida por prefijo, para tirar un grupo entero de claves relacionadas. */
  deleteByPrefix(prefix: string): Promise<void>;
  clear(): Promise<void>;
  /** Devuelve lo cacheado o ejecuta el productor y guarda su resultado. */
  remember<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T>;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export class InMemoryCacheService implements CacheService {
  private readonly store = new Map<string, CacheEntry>();
  private readonly sweeper: NodeJS.Timeout;

  constructor(sweepIntervalMs = 60_000) {
    // Sin barrido, las claves caducadas que nadie vuelve a pedir se quedarían
    // en memoria para siempre: una fuga lenta pero segura.
    this.sweeper = setInterval(() => this.sweep(), sweepIntervalMs);
    this.sweeper.unref();
  }

  private sweep(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
        removed += 1;
      }
    }
    if (removed > 0) log.debug({ removed, remaining: this.store.size }, 'barrido de caché');
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async remember<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await producer();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  stop(): void {
    clearInterval(this.sweeper);
  }
}

export const cache: CacheService = new InMemoryCacheService();
