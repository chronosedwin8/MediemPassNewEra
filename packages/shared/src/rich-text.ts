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

/** Etiquetas admitidas. Formato de texto y poco más: nada de estructura. */
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
  'h3',
  'h4',
  'a',
  'img',
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
};

/**
 * Esquemas de URL admitidos.
 *
 * Sin `javascript:` por razones evidentes, pero tampoco `blob:` ni `file:`.
 * `data:` se admite **solo** para imágenes y se limita por tamaño más abajo:
 * es lo que permite pegar una captura sin subirla, pero sin él un documento
 * podría llevar incrustado cualquier cosa.
 */
export const RICH_TEXT_ALLOWED_SCHEMES = ['http', 'https', 'mailto'] as const;

/** Longitud máxima del HTML ya saneado. */
export const RICH_TEXT_MAX_LENGTH = 20_000;

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
  // Una imagen sola es contenido, aunque no haya texto.
  if (/<img\b/i.test(html)) return false;
  return richTextToPlain(html).length === 0;
}

/** Recorta a un número de caracteres visibles, para vistas previas. */
export function richTextPreview(html: string, maxLength = 140): string {
  const plain = richTextToPlain(html);
  return plain.length <= maxLength ? plain : `${plain.slice(0, maxLength - 1)}…`;
}
