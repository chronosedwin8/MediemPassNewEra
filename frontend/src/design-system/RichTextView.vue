<script setup lang="ts">
import { computed } from 'vue';
import DOMPurify from 'dompurify';
import './rich-text.css';
import {
  RICH_TEXT_ALLOWED_ATTRIBUTES,
  RICH_TEXT_ALLOWED_TAGS,
  RICH_TEXT_ALLOWED_SCHEMES,
  isAllowedIframeSrc,
  isSafeMediaSrc,
} from '@medienpass/shared';

/**
 * Pinta contenido con formato.
 *
 * Usa `v-html`, que normalmente es una mala idea, y por eso el contenido pasa
 * antes por DOMPurify con la misma lista blanca que aplica el servidor.
 *
 * **Esta no es la defensa principal.** El saneado que cuenta ocurre al guardar,
 * en el backend, porque cualquiera puede enviar un `PUT` saltándose el
 * navegador entero. Lo de aquí es una segunda barrera para el día en que
 * contenido antiguo, importado o traído por otra vía llegue sin haber pasado
 * por allí. Dos capas cuestan poco; una sola falla entera cuando falla.
 */

const props = defineProps<{ html: string | null | undefined; compact?: boolean }>();

/**
 * De dónde puede venir cada medio.
 *
 * DOMPurify decide qué etiquetas sobreviven, pero no sabe qué plataformas
 * admitimos. Esta comprobación quita el marco que apunte a un dominio que no
 * está en la lista y el vídeo o el audio servidos sin cifrar, que es
 * exactamente el caso que la lista blanca existe para impedir.
 *
 * Se registra una sola vez y comprueba cada elemento saneado.
 */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  const etiqueta = node.nodeName.toLowerCase();
  if (!['iframe', 'video', 'audio', 'source'].includes(etiqueta)) return;

  const src = (node as Element).getAttribute('src') ?? '';
  const admitido = etiqueta === 'iframe' ? isAllowedIframeSrc(src) : isSafeMediaSrc(src);

  if (!admitido) {
    node.parentNode?.removeChild(node);
    return;
  }

  if (etiqueta === 'iframe') {
    // Las mismas condiciones que impone el servidor, por si el contenido llegó
    // por otra vía: la página incrustada no navega la pestaña que la contiene.
    (node as Element).setAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-presentation allow-popups',
    );
    (node as Element).setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    (node as Element).setAttribute('loading', 'lazy');
  }
});

const clean = computed(() =>
  DOMPurify.sanitize(props.html ?? '', {
    ALLOWED_TAGS: [...RICH_TEXT_ALLOWED_TAGS],
    ALLOWED_ATTR: [...new Set(Object.values(RICH_TEXT_ALLOWED_ATTRIBUTES).flat())],
    ALLOWED_URI_REGEXP: new RegExp(
      `^(?:(?:${RICH_TEXT_ALLOWED_SCHEMES.join('|')}):|[^a-z]|[a-z+.-]+(?:[^a-z+.\\-:]|$))`,
      'i',
    ),
    // Un enlace que se abre en la misma pestaña saca al estudiante del examen.
    ADD_ATTR: ['target', 'rel', 'allow', 'allowfullscreen', 'controls', 'sandbox'],
    ADD_TAGS: ['iframe'],
  }),
);
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- El contenido pasa por DOMPurify justo arriba. -->
  <div class="rich-text" :class="compact ? 'rich-text--compact' : ''" v-html="clean" />
</template>
