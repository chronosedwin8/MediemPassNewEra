import { LANGUAGE, type Language } from '@medienpass/shared';
import type { PublicContent } from './types';
import { es } from './es';
import { de } from './de';
import { en } from './en';

/**
 * Los tres idiomas se importan de golpe, sin `import()` diferido.
 *
 * Es deliberado, y tiene un coste medido: los tres juntos son unos 30 kB
 * comprimidos. No los paga toda la aplicación, porque portada y guía son las
 * únicas que importan este módulo y ambas son rutas diferidas; el empaquetado
 * las deja en un fragmento aparte que solo se descarga al abrir una página
 * pública. Quien entra directo a identificarse no carga nada de esto.
 *
 * A cambio, cambiar de idioma es instantáneo y no hay una segunda petición
 * entre pulsar «Deutsch» y ver el texto en alemán, que es justo lo que se
 * espera de un selector de idioma en una página pública.
 */
const CONTENT: Record<Language, PublicContent> = {
  [LANGUAGE.ES]: es,
  [LANGUAGE.DE]: de,
  [LANGUAGE.EN]: en,
};

export function publicContent(language: Language): PublicContent {
  return CONTENT[language];
}

export type { PublicContent } from './types';
