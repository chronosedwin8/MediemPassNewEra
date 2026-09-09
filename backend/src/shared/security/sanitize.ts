import sanitizeHtml from 'sanitize-html';
import {
  RICH_TEXT_ALLOWED_ATTRIBUTES,
  RICH_TEXT_ALLOWED_SCHEMES,
  RICH_TEXT_ALLOWED_TAGS,
  RICH_TEXT_MAX_LENGTH,
  isRichTextEmpty,
} from '@medienpass/shared';
import { AppError } from '../errors/app-error.js';

/**
 * Saneado del texto enriquecido.
 *
 * Esta es **la** autoridad: lo que sale de aquí es lo que se guarda, y por
 * tanto lo que verán los estudiantes. El cliente vuelve a sanear al pintar,
 * pero como segunda barrera, no como sustituto: cualquiera puede enviar un
 * `PUT` con el HTML que quiera saltándose el navegador entero.
 *
 * Se aplica la lista blanca del paquete compartido para que la regla sea una
 * sola y no dos que se van separando con el tiempo.
 */

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...RICH_TEXT_ALLOWED_TAGS],
  allowedAttributes: Object.fromEntries(
    Object.entries(RICH_TEXT_ALLOWED_ATTRIBUTES).map(([tag, attributes]) => [tag, [...attributes]]),
  ),
  allowedSchemes: [...RICH_TEXT_ALLOWED_SCHEMES],
  // Las imágenes pueden venir de nuestro almacenamiento por URL firmada.
  allowedSchemesByTag: { img: [...RICH_TEXT_ALLOWED_SCHEMES] },
  allowProtocolRelative: false,
  // Se descarta el contenido de estas etiquetas, no solo la etiqueta: dejar el
  // texto de dentro de un `<script>` suelto en el documento no sirve de nada y
  // confunde.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],

  transformTags: {
    /*
     * Todo enlace externo sale con `rel="noopener noreferrer"` y en pestaña
     * nueva. `noopener` no es cosmético: sin él, la página de destino puede
     * manipular la pestaña de origen a través de `window.opener`, que en una
     * plataforma con sesión iniciada es un vector de phishing directo.
     */
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
    }),
  },
};

/**
 * Limpia el HTML y comprueba que quede algo.
 *
 * `field` solo se usa para nombrar el problema en el error: si un docente
 * pega algo que se queda en nada al sanear, merece saber qué campo era.
 */
export function sanitizeRichText(html: string, field = 'content'): string {
  const clean = sanitizeHtml(html, OPTIONS).trim();

  if (clean.length > RICH_TEXT_MAX_LENGTH) {
    throw AppError.validation([
      {
        path: field,
        rule: 'too_long',
        message: `El contenido supera los ${RICH_TEXT_MAX_LENGTH} caracteres`,
      },
    ]);
  }

  return clean;
}

/**
 * Igual, pero exigiendo que el resultado no quede vacío.
 *
 * El caso que cubre es concreto: alguien pega contenido de Word, todo son
 * etiquetas que no admitimos, y se guarda un enunciado en blanco sin que nadie
 * se entere hasta que un estudiante abre la evaluación.
 */
export function sanitizeRequiredRichText(html: string, field = 'content'): string {
  const clean = sanitizeRichText(html, field);

  if (isRichTextEmpty(clean)) {
    throw AppError.validation([
      {
        path: field,
        rule: 'empty_after_sanitize',
        message: 'El contenido quedó vacío al limpiarlo. Revisa el formato antes de guardar.',
      },
    ]);
  }

  return clean;
}

/** Versión que admite nulo, para campos opcionales. */
export function sanitizeOptionalRichText(
  html: string | null | undefined,
  field = 'content',
): string | null {
  if (html === null || html === undefined) return null;
  const clean = sanitizeRichText(html, field);
  return isRichTextEmpty(clean) ? null : clean;
}
