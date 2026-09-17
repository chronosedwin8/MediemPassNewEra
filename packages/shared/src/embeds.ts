/**
 * Qué se puede incrustar dentro del material de formación.
 *
 * Un `<iframe>` que apunte a donde diga una cadena de la base de datos es una
 * vía directa para meter contenido ajeno en una página con sesión iniciada: la
 * página incrustada no lee la nuestra, pero sí puede imitarla entera y pedir
 * una contraseña. Por eso no se incrusta una URL porque sí, sino porque su
 * dominio está en esta lista y porque sabemos traducirla a su reproductor.
 *
 * La lista vive en el paquete compartido para que la decisión sea una sola: el
 * servidor la usa al guardar —quien envíe un `PUT` a mano se salta el
 * navegador entero— y el cliente al pintar. Lo que no encaja no se pierde, se
 * degrada a enlace, que es seguro.
 *
 * Añadir una plataforma es añadir una entrada aquí. Es a propósito: obliga a
 * mirar qué URL sirve su reproductor, que casi nunca es la que se copia de la
 * barra de direcciones.
 */

export interface EmbedPlatform {
  /** Nombre para la interfaz: lo que se le dice a quien escribe el material. */
  readonly label: string;
  readonly hosts: readonly string[];
  /** Traduce la URL que copia una persona a la que sirve el reproductor. */
  readonly embed: (url: URL) => string | null;
}

/** Último segmento no vacío de la ruta. */
function lastSegment(url: URL): string | null {
  const segment = url.pathname.split('/').filter(Boolean).pop();
  return segment && segment.length > 0 ? segment : null;
}

export const EMBED_PLATFORMS: readonly EmbedPlatform[] = [
  {
    label: 'YouTube',
    hosts: ['www.youtube.com', 'youtube.com', 'youtu.be', 'www.youtube-nocookie.com'],
    embed: (url) => {
      // youtu.be lleva el identificador en la ruta; youtube.com, en ?v=
      const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
      const fromPath = lastSegment(url);
      const video = id ?? (url.pathname.includes('/embed/') ? fromPath : null);
      // El dominio sin cookies: el material de formación no tiene por qué
      // dejar rastro publicitario en el navegador de quien lo ve.
      return video ? `https://www.youtube-nocookie.com/embed/${video}` : null;
    },
  },
  {
    label: 'Vimeo',
    hosts: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'],
    embed: (url) => {
      const id = lastSegment(url);
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    },
  },
  {
    label: 'Genially',
    hosts: ['view.genially.com', 'app.genial.ly', 'view.genial.ly'],
    embed: (url) => {
      const id = lastSegment(url);
      return id ? `https://view.genially.com/${id}` : null;
    },
  },
  {
    label: 'HeyGen',
    hosts: ['app.heygen.com'],
    embed: (url) => {
      const id = lastSegment(url);
      return id ? `https://app.heygen.com/embeds/${id}` : null;
    },
  },
  {
    label: 'Google Drive',
    hosts: ['drive.google.com'],
    embed: (url) => {
      // .../file/d/<id>/view → .../file/d/<id>/preview
      const partes = url.pathname.split('/').filter(Boolean);
      const indice = partes.indexOf('d');
      const id = indice >= 0 ? partes[indice + 1] : null;
      return id ? `https://drive.google.com/file/d/${id}/preview` : null;
    },
  },
  {
    label: 'Google Docs',
    hosts: ['docs.google.com'],
    // Presentaciones, documentos y formularios traen su propia ruta de
    // publicación; se respeta la que venga y solo se fuerza el origen.
    embed: (url) => `https://docs.google.com${url.pathname}${url.search}`,
  },
  {
    label: 'Canva',
    hosts: ['www.canva.com', 'canva.com'],
    embed: (url) =>
      url.pathname.includes('/design/')
        ? `https://www.canva.com${url.pathname.replace(/\/(view|edit)\/?$/, '/view')}?embed`
        : null,
  },
  {
    label: 'Wordwall',
    hosts: ['wordwall.net', 'www.wordwall.net'],
    embed: (url) => {
      const id = url.pathname.split('/').filter(Boolean)[1];
      return id && /^\d+$/.test(id) ? `https://wordwall.net/embed/${id}` : null;
    },
  },
  {
    label: 'Padlet',
    hosts: ['padlet.com', 'es.padlet.com'],
    embed: (url) => `https://padlet.com/embed${url.pathname}`,
  },
  {
    label: 'H5P',
    hosts: ['h5p.org'],
    embed: (url) => `https://h5p.org${url.pathname}/embed`,
  },
  {
    label: 'Prezi',
    hosts: ['prezi.com'],
    embed: (url) => {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://prezi.com/embed/${id}/` : null;
    },
  },
  {
    label: 'ThingLink',
    hosts: ['www.thinglink.com', 'thinglink.com'],
    embed: (url) => {
      const id = lastSegment(url);
      return id ? `https://www.thinglink.com/card/${id}` : null;
    },
  },
];

/** Archivos que el navegador reproduce por sí solo, sin incrustar nada. */
export const VIDEO_FILE_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.ogv', '.m4v'] as const;
export const AUDIO_FILE_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.wav', '.oga', '.opus'] as const;

export type EmbedResolution =
  | { kind: 'iframe'; src: string; platform: string }
  | { kind: 'video'; src: string }
  | { kind: 'audio'; src: string }
  | { kind: 'link'; src: string };

/**
 * Cómo mostrar una URL de material.
 *
 * `origin` es el origen propio cuando se resuelve en el navegador: lo servido
 * por la plataforma misma se reproduce aunque no lleve extensión, porque de
 * ahí salen los vídeos de la capacitación. En el servidor no se pasa, y
 * entonces solo cuenta la lista de plataformas y la extensión.
 */
export function resolveEmbed(raw: string, origin?: string): EmbedResolution {
  const texto = raw.trim();
  let url: URL;

  try {
    // Una ruta que empieza por una sola barra es material propio; «//» no lo
    // es: es una URL sin esquema que apunta fuera.
    if (texto.startsWith('/') && !texto.startsWith('//') && origin) {
      url = new URL(texto, origin);
    } else {
      url = new URL(texto);
      // HTTPS o nada: `javascript:` no debe llegar jamás a un `src`, y un
      // recurso por HTTP ni siquiera carga dentro de una página segura.
      if (url.protocol !== 'https:') return { kind: 'link', src: texto };
    }
  } catch {
    return { kind: 'link', src: texto };
  }

  const ruta = url.pathname.toLowerCase();
  const propio = origin !== undefined && url.origin === origin;

  if (AUDIO_FILE_EXTENSIONS.some((extension) => ruta.endsWith(extension))) {
    return { kind: 'audio', src: url.href };
  }
  if (VIDEO_FILE_EXTENSIONS.some((extension) => ruta.endsWith(extension)) || propio) {
    return { kind: 'video', src: url.href };
  }

  const platform = EMBED_PLATFORMS.find((candidate) => candidate.hosts.includes(url.hostname));
  const src = platform?.embed(url) ?? null;

  return src ? { kind: 'iframe', src, platform: platform!.label } : { kind: 'link', src: url.href };
}

/** Si esa URL se va a poder incrustar, para avisar antes de guardar. */
export function isEmbeddable(raw: string): boolean {
  return resolveEmbed(raw).kind !== 'link';
}
