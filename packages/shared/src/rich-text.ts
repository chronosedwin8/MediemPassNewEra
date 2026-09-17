/**
 * Texto enriquecido: qué se admite y qué no.
 *
 * Los enunciados de las preguntas y las respuestas abiertas se guardan como
 * HTML, y eso abre una vía de ataque concreta: un docente —o una cuenta de
 * docente comprometida— podría escribir un enunciado con `<script>` que se
 * ejecutaría en la sesión de cada estudiante que abra la evaluación. Un
 * estudiante podría hacer lo mismo en una respuesta abierta que después lee
 * su profesor.
 *
 * La defensa es una **lista blanca**, nunca una lista de lo prohibido:
 * enumerar lo peligroso garantiza olvidarse de algo, y el atacante solo
 * necesita encontrar ese algo. Aquí se declara lo permitido y todo lo demás
 * se descarta.
 *
 * Estas constantes viven en el paquete compartido porque el saneado ocurre en
 * dos sitios y tiene que ser el mismo: el servidor limpia al guardar —esa es
 * la autoridad— y el cliente vuelve a limpiar al pintar, como segunda barrera
 * por si algún día entra contenido por otra vía.
 */

import { EMBED_PLATFORMS } from './embeds.js';

/**
 * Etiquetas admitidas.
 *
 * Además del formato de texto, el material admite medios: una capacitación que
 * solo puede llevar párrafos obliga a enlazar fuera, y quien sale de la
 * plataforma a ver el vídeo a menudo no vuelve.
 *
 * `iframe` es la etiqueta delicada, y por eso no basta con admitirla: su
 * dirección tiene que estar además en la lista de plataformas conocidas
 * (`EMBED_PLATFORMS`). Un marco que apunte a donde diga la base de datos puede
 * imitar esta página entera y pedir una contraseña.
 *
 * Lo que sigue fuera: `script`, `style`, `form`, `input`, `object`, `embed` y
 * cualquier atributo de evento. Y `svg`, que puede llevar guiones dentro.
 */
export const RICH_TEXT_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'sub',
  'sup',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'h2',
  'h3',
  'h4',
  'hr',
  'a',
  'img',
  // Medios y estructura, para escribir material de verdad.
  'figure',
  'figcaption',
  'video',
  'audio',
  'source',
  'iframe',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
] as const;

/**
 * Atributos admitidos por etiqueta.
 *
 * `img` no admite `style` ni manejadores de evento; solo de dónde sale la
 * imagen y qué describe. `alt` se admite precisamente para que se pueda
 * escribir: una imagen sin texto alternativo es una pregunta que un estudiante
 * ciego no puede responder.
 */
export const RICH_TEXT_ALLOWED_ATTRIBUTES: Record<string, readonly string[]> = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  /*
   * En el marco no se admite `srcdoc` —es HTML arbitrario por otra puerta— ni
   * `name`, ni nada que apunte a la ventana de origen. `sandbox` se impone al
   * sanear, no se acepta de quien escribe.
   */
  iframe: [
    'src',
    'title',
    'width',
    'height',
    'allow',
    'allowfullscreen',
    'loading',
    'referrerpolicy',
    'sandbox',
  ],
  video: ['src', 'controls', 'poster', 'preload', 'width', 'height', 'playsinline'],
  audio: ['src', 'controls', 'preload'],
  source: ['src', 'type'],
  th: ['colspan', 'rowspan', 'scope'],
  td: ['colspan', 'rowspan'],
};

/**
 * Los dominios cuyo contenido se puede incrustar.
 *
 * Sale de la misma tabla que traduce cada dirección a su reproductor, para que
 * no haya dos listas que se vayan separando con el tiempo.
 */
export const EMBED_ALLOWED_HOSTNAMES: readonly string[] = [
  ...new Set(EMBED_PLATFORMS.flatMap((plataforma) => plataforma.hosts)),
];

/**
 * Los medios se sirven por HTTPS o desde la propia plataforma.
 *
 * Una ruta que empieza por una sola barra es material propio; `//algo` no lo
 * es —es una URL sin esquema que apunta fuera— y se descarta.
 */
export function isSafeMediaSrc(src: string): boolean {
  const valor = src.trim();
  if (valor.startsWith('/') && !valor.startsWith('//')) return true;
  return /^https:\/\//i.test(valor);
}

/** Si esa dirección puede ir en un `iframe`: HTTPS y plataforma conocida. */
export function isAllowedIframeSrc(src: string): boolean {
  try {
    const url = new URL(src.trim());
    return url.protocol === 'https:' && EMBED_ALLOWED_HOSTNAMES.includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Esquemas de URL admitidos.
 *
 * Sin `javascript:` por razones evidentes, pero tampoco `blob:` ni `file:`.
 * `data:` se admite **solo** para imágenes y se limita por tamaño más abajo:
 * es lo que permite pegar una captura sin subirla, pero sin él un documento
 * podría llevar incrustado cualquier cosa.
 */
export const RICH_TEXT_ALLOWED_SCHEMES = ['http', 'https', 'mailto'] as const;

/**
 * Longitud máxima del HTML ya saneado.
 *
 * Sube con los medios dentro: una lección con tres vídeos, sus pies de foto y
 * un incrustado gasta en etiquetas lo que antes ocupaba el texto entero.
 */
export const RICH_TEXT_MAX_LENGTH = 80_000;

/**
 * Texto plano a partir del HTML, para lo que no debe llevar formato.
 *
 * Se usa en listados, resúmenes y en el `aria-label` de los botones: ahí un
 * enunciado con negritas y saltos de línea estorba más de lo que aporta.
 *
 * No es una medida de seguridad y no debe usarse como tal. Quitar etiquetas
 * con una expresión regular es exactamente el enfoque que se salta cualquier
 * atacante; para eso está el saneado de verdad.
 */
export function richTextToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|li|h3|h4|blockquote)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** `true` cuando el contenido no aporta nada aunque tenga etiquetas. */
export function isRichTextEmpty(html: string | null | undefined): boolean {
  if (!html) return true;
  /*
   * Un medio solo es contenido, aunque no haya texto: una lección que es un
   * vídeo y nada más es una lección legítima, y tratarla como vacía la
   * descartaba al guardar sin decir por qué.
   */
  if (/<(img|video|audio|iframe)\b/i.test(html)) return false;
  return richTextToPlain(html).length === 0;
}

/** Recorta a un número de caracteres visibles, para vistas previas. */
export function richTextPreview(html: string, maxLength = 140): string {
  const plain = richTextToPlain(html);
  return plain.length <= maxLength ? plain : `${plain.slice(0, maxLength - 1)}…`;
}
