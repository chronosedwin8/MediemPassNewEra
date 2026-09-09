<script setup lang="ts">
import { computed } from 'vue';
import DOMPurify from 'dompurify';
import {
  RICH_TEXT_ALLOWED_ATTRIBUTES,
  RICH_TEXT_ALLOWED_TAGS,
  RICH_TEXT_ALLOWED_SCHEMES,
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

const clean = computed(() =>
  DOMPurify.sanitize(props.html ?? '', {
    ALLOWED_TAGS: [...RICH_TEXT_ALLOWED_TAGS],
    ALLOWED_ATTR: [...new Set(Object.values(RICH_TEXT_ALLOWED_ATTRIBUTES).flat())],
    ALLOWED_URI_REGEXP: new RegExp(
      `^(?:(?:${RICH_TEXT_ALLOWED_SCHEMES.join('|')}):|[^a-z]|[a-z+.-]+(?:[^a-z+.\\-:]|$))`,
      'i',
    ),
    // Un enlace que se abre en la misma pestaña saca al estudiante del examen.
    ADD_ATTR: ['target', 'rel'],
  }),
);
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- El contenido pasa por DOMPurify justo arriba. -->
  <div class="rich-text" :class="compact ? 'rich-text--compact' : ''" v-html="clean" />
</template>

<style scoped>
/*
 * El estilo vive aquí y no en clases sueltas porque el HTML viene de la base de
 * datos: no se le pueden añadir clases de Tailwind a etiquetas que escribió un
 * docente hace seis meses.
 */
.rich-text {
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.rich-text :deep(p) {
  margin: 0 0 0.75em;
}

.rich-text :deep(p:last-child) {
  margin-bottom: 0;
}

.rich-text :deep(h3),
.rich-text :deep(h4) {
  margin: 1.25em 0 0.5em;
  font-weight: 600;
}

.rich-text :deep(h3) {
  font-size: 1.05rem;
}

.rich-text :deep(ul),
.rich-text :deep(ol) {
  margin: 0 0 0.75em;
  padding-left: 1.4em;
}

.rich-text :deep(ul) {
  list-style: disc;
}

.rich-text :deep(ol) {
  list-style: decimal;
}

.rich-text :deep(li) {
  margin-bottom: 0.25em;
}

.rich-text :deep(blockquote) {
  margin: 0 0 0.75em;
  padding-left: 0.9em;
  border-left: 3px solid var(--color-border-strong, #cbd5e1);
  color: var(--color-ink-muted, #64748b);
}

.rich-text :deep(code) {
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
  background: var(--color-surface-muted, #f1f5f9);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
}

.rich-text :deep(pre) {
  margin: 0 0 0.75em;
  padding: 0.75em;
  border-radius: 0.5rem;
  background: var(--color-surface-muted, #f1f5f9);
  overflow-x: auto;
}

.rich-text :deep(pre code) {
  padding: 0;
  background: none;
}

.rich-text :deep(a) {
  color: var(--color-brand-600, #2563eb);
  text-decoration: underline;
}

/* Una imagen de enunciado no debe empujar el ancho de la pantalla. */
.rich-text :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 0.5rem;
  margin: 0.5em 0;
}

.rich-text--compact :deep(p) {
  margin-bottom: 0.35em;
}
</style>
