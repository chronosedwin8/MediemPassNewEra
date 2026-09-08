import { z } from 'zod';
import { LANGUAGE, SUPPORTED_LANGUAGES, type Language } from './enums.js';

/**
 * Texto de catálogo traducido a los tres idiomas de la plataforma.
 *
 * Se usa para entidades del sistema —competencias KMK, áreas, materias,
 * etiquetas de escalas, títulos de módulos— que sí deben traducirse. NO se usa
 * para contenido pedagógico: una evaluación tiene un idioma propio y sus
 * preguntas no se traducen automáticamente, porque hacerlo sería incorrecto
 * desde el punto de vista académico.
 */
export interface LocalizedText {
  es: string;
  de: string;
  en: string;
}

export const localizedTextSchema = z.object({
  es: z.string().trim().min(1),
  de: z.string().trim().min(1),
  en: z.string().trim().min(1),
});

/** Variante para descripciones, donde la cadena vacía es aceptable. */
export const localizedTextOptionalSchema = z.object({
  es: z.string().trim(),
  de: z.string().trim(),
  en: z.string().trim(),
});

/**
 * Resuelve el texto en el idioma pedido, con reserva razonada:
 * idioma solicitado → español → alemán → inglés → primera cadena no vacía.
 * Nunca devuelve `undefined`, para que la interfaz no muestre huecos.
 */
export function localize(text: LocalizedText | null | undefined, language: Language): string {
  if (!text) return '';
  const fallbackOrder: Language[] = [language, LANGUAGE.ES, LANGUAGE.DE, LANGUAGE.EN];
  for (const candidate of fallbackOrder) {
    const value = text[candidate];
    if (value && value.trim().length > 0) return value;
  }
  return '';
}

/** Construye un `LocalizedText` repitiendo el mismo valor en los tres idiomas. */
export function sameInAllLanguages(value: string): LocalizedText {
  return { es: value, de: value, en: value };
}

export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Normaliza un código de idioma externo.
 * Phidias devuelve tanto `es` como `es_ES`; Entra ID puede devolver `de-DE`.
 */
export function normalizeLanguage(value: string | null | undefined, fallback: Language = LANGUAGE.ES): Language {
  if (!value) return fallback;
  const base = value.toLowerCase().replace('_', '-').split('-')[0];
  return isSupportedLanguage(base) ? base : fallback;
}
