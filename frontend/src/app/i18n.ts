import { createI18n } from 'vue-i18n';
import { LANGUAGE, SUPPORTED_LANGUAGES, type Language } from '@medienpass/shared';
import es from '@/locales/es.json';
import de from '@/locales/de.json';
import en from '@/locales/en.json';

/**
 * Internacionalización.
 *
 * Ningún texto visible se escribe dentro de un componente: todos salen de los
 * catálogos. Eso incluye los mensajes de error, que el servidor emite como
 * código estable (`ATTEMPT_LIMIT_REACHED`) y se traducen aquí. Es la única
 * forma de tener la aplicación realmente en tres idiomas sin duplicar
 * traducciones en el backend.
 */

const STORAGE_KEY = 'medienpass.language';

/**
 * Idioma inicial.
 *
 * Se prefiere el que el usuario eligió, luego el del navegador y, por último,
 * español. Cuando la sesión se abre, el idioma guardado en su perfil manda
 * sobre todo lo anterior.
 */
function resolveInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
      return stored as Language;
    }
  } catch {
    // Navegación privada o almacenamiento bloqueado: no es motivo para fallar.
  }

  const browser = navigator.language.split('-')[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(browser ?? '')
    ? (browser as Language)
    : LANGUAGE.ES;
}

/**
 * Formatos numéricos por idioma.
 *
 * `grade` fuerza un decimal siempre: una nota es «1,0», nunca «1». En alemán
 * y español el separador decimal es la coma, y mostrar «1.0» a un estudiante
 * alemán sería incorrecto.
 */
const numberFormats = {
  es: {
    grade: { minimumFractionDigits: 1, maximumFractionDigits: 1 },
    percent: { style: 'percent' as const, maximumFractionDigits: 1 },
    decimal: { maximumFractionDigits: 2 },
  },
  de: {
    grade: { minimumFractionDigits: 1, maximumFractionDigits: 1 },
    percent: { style: 'percent' as const, maximumFractionDigits: 1 },
    decimal: { maximumFractionDigits: 2 },
  },
  en: {
    grade: { minimumFractionDigits: 1, maximumFractionDigits: 1 },
    percent: { style: 'percent' as const, maximumFractionDigits: 1 },
    decimal: { maximumFractionDigits: 2 },
  },
};

const datetimeFormats = {
  es: {
    short: { year: 'numeric' as const, month: 'short' as const, day: 'numeric' as const },
    long: {
      year: 'numeric' as const,
      month: 'long' as const,
      day: 'numeric' as const,
      hour: '2-digit' as const,
      minute: '2-digit' as const,
    },
  },
  de: {
    short: { year: 'numeric' as const, month: 'short' as const, day: 'numeric' as const },
    long: {
      year: 'numeric' as const,
      month: 'long' as const,
      day: 'numeric' as const,
      hour: '2-digit' as const,
      minute: '2-digit' as const,
    },
  },
  en: {
    short: { year: 'numeric' as const, month: 'short' as const, day: 'numeric' as const },
    long: {
      year: 'numeric' as const,
      month: 'long' as const,
      day: 'numeric' as const,
      hour: '2-digit' as const,
      minute: '2-digit' as const,
    },
  },
};

export const i18n = createI18n({
  legacy: false,
  locale: resolveInitialLanguage(),
  fallbackLocale: LANGUAGE.ES,
  messages: { es, de, en },
  numberFormats,
  datetimeFormats,
  // Una clave sin traducir es un defecto que hay que ver en desarrollo, no
  // un aviso que se pierde entre el ruido de la consola.
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
});

export function setLanguage(language: Language): void {
  i18n.global.locale.value = language;
  document.documentElement.lang = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Sin almacenamiento, el idioma dura lo que la sesión. Aceptable.
  }
}

export function currentLanguage(): Language {
  return i18n.global.locale.value as Language;
}

/**
 * Traduce un código de error del servidor.
 *
 * Si el código no está en el catálogo se devuelve el mensaje genérico en
 * lugar de la clave cruda: mostrar `errors.ALGO_RARO` a un estudiante sería
 * peor que decirle que algo ha fallado.
 */
export function translateError(code: string | undefined, params?: Record<string, unknown>): string {
  const key = `errors.${code ?? 'generic'}`;
  const translated = i18n.global.t(key, params ?? {});
  return translated === key ? i18n.global.t('errors.generic') : translated;
}
