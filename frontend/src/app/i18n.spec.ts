import { describe, expect, it } from 'vitest';
import { ERROR_CODE, SUPPORTED_LANGUAGES } from '@medienpass/shared';
import es from '@/locales/es.json';
import de from '@/locales/de.json';
import en from '@/locales/en.json';
import { i18n, setLanguage, translateError } from '@/app/i18n';

/**
 * Los catálogos de traducción, comprobados como contrato.
 *
 * Toda la aplicación descansa en una decisión: el servidor no envía mensajes,
 * envía códigos, y la traducción ocurre aquí. Eso solo funciona si el catálogo
 * está completo. Un código sin entrada no rompe nada visiblemente —se degrada
 * al mensaje genérico—, y por eso mismo puede pasar meses sin que nadie lo
 * note, mientras un docente ve «Ha ocurrido un error» en lugar de «Ya has
 * agotado los intentos permitidos». Estas pruebas convierten ese silencio en
 * un fallo de la suite.
 */

const CATALOGUES = { es, de, en } as Record<string, Record<string, unknown>>;

/** Aplana el catálogo a rutas del tipo `errors.ATTEMPT_LIMIT_REACHED`. */
function flatten(source: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(source).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object'
      ? flatten(value as Record<string, unknown>, path)
      : [path];
  });
}

describe('catálogos de traducción', () => {
  it('cubre los tres idiomas declarados', () => {
    expect(Object.keys(CATALOGUES).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
  });

  it('traduce todos los códigos de error que el servidor puede emitir', () => {
    const missing: string[] = [];

    for (const [language, catalogue] of Object.entries(CATALOGUES)) {
      const errors = (catalogue.errors ?? {}) as Record<string, string>;
      for (const code of Object.values(ERROR_CODE)) {
        if (typeof errors[code] !== 'string' || errors[code].trim() === '') {
          missing.push(`${language}.errors.${code}`);
        }
      }
    }

    // Se listan todos los que falten, no el primero: quien añada un código
    // nuevo quiere ver de una vez las tres entradas que le faltan.
    expect(missing).toEqual([]);
  });

  it('mantiene las mismas claves en los tres idiomas', () => {
    const reference = flatten(es).sort();

    for (const [language, catalogue] of Object.entries(CATALOGUES)) {
      if (language === 'es') continue;
      const keys = flatten(catalogue).sort();

      expect({ language, missing: reference.filter((key) => !keys.includes(key)) }).toEqual({
        language,
        missing: [],
      });
      expect({ language, extra: keys.filter((key) => !reference.includes(key)) }).toEqual({
        language,
        extra: [],
      });
    }
  });
});

describe('translateError', () => {
  it('traduce un código conocido', () => {
    setLanguage('es');
    expect(translateError(ERROR_CODE.ATTEMPT_LIMIT_REACHED)).toBe(
      es.errors[ERROR_CODE.ATTEMPT_LIMIT_REACHED as keyof typeof es.errors],
    );
  });

  it('devuelve el mensaje genérico ante un código desconocido, nunca la clave', () => {
    setLanguage('es');
    const message = translateError('ALGO_QUE_NO_EXISTE');

    expect(message).toBe(es.errors.generic);
    expect(message).not.toContain('errors.');
  });

  it('también con el código ausente', () => {
    expect(translateError(undefined)).toBe(es.errors.generic);
  });

  it('cambia de idioma sin recargar', () => {
    setLanguage('de');
    expect(translateError(ERROR_CODE.ATTEMPT_LIMIT_REACHED)).toBe(
      de.errors[ERROR_CODE.ATTEMPT_LIMIT_REACHED as keyof typeof de.errors],
    );

    setLanguage('en');
    expect(translateError(ERROR_CODE.ATTEMPT_LIMIT_REACHED)).toBe(
      en.errors[ERROR_CODE.ATTEMPT_LIMIT_REACHED as keyof typeof en.errors],
    );

    setLanguage('es');
  });

  it('deja el atributo lang del documento acorde al idioma', () => {
    setLanguage('de');
    expect(document.documentElement.lang).toBe('de');
    setLanguage('es');
  });
});

describe('formato de notas', () => {
  /**
   * Una nota alemana es «1,0», no «1». El decimal no es cosmético: «1» y «1,0»
   * se leen distinto, y en una escala donde 1 es el máximo la diferencia entre
   * ver un entero o un decimal cambia cómo se interpreta la cifra.
   */
  it('siempre muestra un decimal', () => {
    setLanguage('es');
    expect(i18n.global.n(1, 'grade')).toBe('1,0');
    expect(i18n.global.n(2.5, 'grade')).toBe('2,5');
  });

  it('usa coma decimal en alemán y punto en inglés', () => {
    setLanguage('de');
    expect(i18n.global.n(1.7, 'grade')).toBe('1,7');

    setLanguage('en');
    expect(i18n.global.n(1.7, 'grade')).toBe('1.7');

    setLanguage('es');
  });
});

describe('textos en los componentes', () => {
  /**
   * Ningún texto visible se escribe dentro de un componente.
   *
   * La regla es fácil de romper sin querer: se añade una casilla con su
   * etiqueta en español mientras se prueba algo y se queda ahí. No falla nada,
   * simplemente esa palabra deja de traducirse, y en una aplicación que un
   * colegio usa en tres idiomas eso se descubre tarde y de la peor forma. Esta
   * prueba recorre las plantillas y busca texto suelto entre etiquetas.
   */
  it('no deja texto suelto en las plantillas', async () => {
    const templates = import.meta.glob('@/**/*.vue', { query: '?raw', import: 'default' });
    const offenders: string[] = [];

    // Texto entre etiquetas que no es una interpolación ni un valor numérico.
    const textNode = /(?<![:@])>\s*([\p{L}][^<>{}]{2,})\s*</gu;
    const onlySymbols = /^[\d\s.,:%/-]+$/;

    for (const [path, load] of Object.entries(templates)) {
      const source = (await load()) as string;
      const template = source.split('<template>')[1];
      if (!template) continue;

      for (const match of template.matchAll(textNode)) {
        const text = match[1]!.trim();
        if (!onlySymbols.test(text)) offenders.push(`${path}: «${text}»`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
