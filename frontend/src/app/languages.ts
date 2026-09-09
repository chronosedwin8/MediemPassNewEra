import { LANGUAGE, SUPPORTED_LANGUAGES, type Language } from '@medienpass/shared';

/**
 * El nombre de cada idioma, en ese idioma.
 *
 * No se traducen y no deben traducirse: alguien que busca el alemán busca
 * «Deutsch», no «Alemán», y precisamente porque no entiende la interfaz en la
 * que está. Es la única familia de textos visibles que vive fuera de los
 * catálogos, y por eso está aquí, en un sitio con nombre, en lugar de suelta
 * dentro de un `<option>`.
 */
export const LANGUAGE_NAMES: Record<Language, string> = {
  [LANGUAGE.ES]: 'Español',
  [LANGUAGE.DE]: 'Deutsch',
  [LANGUAGE.EN]: 'English',
};

export const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map((code) => ({
  code,
  label: LANGUAGE_NAMES[code],
}));
