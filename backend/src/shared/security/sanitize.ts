import sanitizeHtml from 'sanitize-html';
import {
  EMBED_ALLOWED_HOSTNAMES,
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
  allowedSchemesByTag: {
    img: [...RICH_TEXT_ALLOWED_SCHEMES],
    // Los medios y los marcos, solo cifrados: un recurso por HTTP dentro de
    // una página segura ni siquiera carga, y avisa de que algo va mal.
    iframe: ['https'],
    video: ['https'],
    audio: ['https'],
    source: ['https'],
  },
  /*
   * La lista blanca de dominios incrustables. Es lo que convierte `iframe` en
   * una etiqueta admisible: sin esto, cualquiera que pueda escribir material
   * podría meter una página ajena —con su propio formulario de contraseña—
   * dentro de una pantalla con sesión iniciada.
   */
  allowedIframeHostnames: [...EMBED_ALLOWED_HOSTNAMES],
  allowProtocolRelative: false,
  // Se descarta el contenido de estas etiquetas, no solo la etiqueta: dejar el
  // texto de dentro de un `<script>` suelto en el documento no sirve de nada y
  // confunde.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],

  /*
   * Un medio al que se le cayó la dirección se va entero.
   *
   * Cuando el marco apunta a un dominio que no admitimos, o el vídeo viene sin
   * cifrar, el saneado quita el `src` pero deja la etiqueta: un marco vacío
   * que no carga nada —inofensivo— y un hueco negro en mitad de la lección que
   * nadie sabe de dónde salió. Quitarlo deja el contenido como si nunca se
   * hubiera pegado, que es lo que quien lo lee espera.
   */
  exclusiveFilter: (frame) =>
    ['iframe', 'video', 'audio', 'img', 'source'].includes(frame.tag) && !frame.attribs['src'],

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

    /*
     * El marco sale siempre con las mismas condiciones, vengan o no en lo que
     * se guardó. `sandbox` es la parte que importa: la página incrustada puede
     * ejecutar sus guiones y reproducir su vídeo, pero no navegar la pestaña
     * que la contiene ni abrir descargas, que es como un incrustado se
     * convierte en una redirección a una página de inicio de sesión falsa.
     *
     * `allow-same-origin` junto a `allow-scripts` solo sería un problema si lo
     * incrustado viviera en nuestro propio origen —podría quitarse el propio
     * cajón—, y no es el caso: la lista de dominios son todos de terceros.
     * Sin él, YouTube y Genially no funcionan.
     */
    iframe: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        loading: 'lazy',
        referrerpolicy: 'strict-origin-when-cross-origin',
        sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
        allow: 'accelerometer; encrypted-media; picture-in-picture; fullscreen',
      },
    }),

    // Sin controles no hay forma de reproducirlo, y sin `preload` el navegador
    // se descarga vídeos enteros que quizá nadie mire.
    video: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, controls: 'controls', preload: 'metadata' },
    }),
    audio: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, controls: 'controls', preload: 'metadata' },
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
