import { Node, mergeAttributes } from '@tiptap/core';
import { isAllowedIframeSrc, isSafeMediaSrc } from '@medienpass/shared';

/**
 * Vídeo, audio y contenido incrustado como bloques del editor.
 *
 * TipTap trae imagen y poco más, así que el resto de HTML5 hay que enseñárselo.
 * Cada nodo se define con el mismo par de reglas: cómo reconocer la etiqueta al
 * cargar contenido guardado (`parseHTML`) y cómo volver a escribirla
 * (`renderHTML`). Sin `parseHTML`, abrir una lección que ya tenía un vídeo lo
 * borraría al guardar, que es la peor forma posible de perder trabajo.
 *
 * Los tres nodos comprueban la dirección **también aquí**. No sustituye al
 * saneado del servidor —eso es la autoridad—, pero evita el caso concreto de
 * que alguien pegue HTML con un marco a un dominio cualquiera, lo vea
 * aparentemente aceptado en el editor y descubra al guardar que desapareció.
 */

/** Atributo `src` con su comprobación, común a los tres. */
function srcAttribute(check: (value: string) => boolean) {
  return {
    src: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => {
        const value = element.getAttribute('src') ?? '';
        return check(value) ? value : null;
      },
      renderHTML: (attributes: Record<string, unknown>) =>
        attributes['src'] ? { src: attributes['src'] as string } : {},
    },
  };
}

export const VideoNode = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return { ...srcAttribute(isSafeMediaSrc), title: { default: null } };
  },

  parseHTML() {
    return [{ tag: 'video[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['video', mergeAttributes(HTMLAttributes, { controls: 'controls', preload: 'metadata' })];
  },
});

export const AudioNode = Node.create({
  name: 'audio',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return { ...srcAttribute(isSafeMediaSrc), title: { default: null } };
  },

  parseHTML() {
    return [{ tag: 'audio[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['audio', mergeAttributes(HTMLAttributes, { controls: 'controls', preload: 'metadata' })];
  },
});

export const EmbedNode = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return { ...srcAttribute(isAllowedIframeSrc), title: { default: null } };
  },

  parseHTML() {
    return [{ tag: 'iframe[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'iframe',
      mergeAttributes(HTMLAttributes, {
        loading: 'lazy',
        referrerpolicy: 'strict-origin-when-cross-origin',
        // Las mismas condiciones que impone el servidor al guardar, para que
        // lo que se ve mientras se escribe sea lo que después se publica.
        sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
        allow: 'accelerometer; encrypted-media; picture-in-picture; fullscreen',
      }),
    ];
  },
});
