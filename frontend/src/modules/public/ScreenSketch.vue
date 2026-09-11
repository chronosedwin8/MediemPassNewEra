<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { WikiSection } from './content/types';

/**
 * Boceto esquemático de una pantalla.
 *
 * No es una captura y no debe parecerlo. Una captura envejece con el primer
 * cambio de interfaz y acaba enseñando una aplicación que ya no existe, que es
 * peor que no enseñar nada: quien lee la ayuda concluye que se ha perdido.
 * Esto otro describe **qué zonas hay y para qué sirve cada una**, que es lo
 * que sigue siendo cierto aunque cambie el color de un botón.
 *
 * Tampoco lleva imágenes: se dibuja con el mismo sistema de diseño que la
 * aplicación, así que hereda el modo oscuro, se lee con lector de pantalla y
 * no añade un solo kilobyte de descarga.
 */

defineProps<{ screen: NonNullable<WikiSection['screen']> }>();

const { t } = useI18n();
</script>

<template>
  <figure class="m-0 rounded-lg border border-border bg-surface-muted p-4">
    <figcaption class="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span class="text-sm font-semibold text-ink">{{ screen.title }}</span>
      <span class="text-xs text-ink-subtle">{{ screen.caption }}</span>
    </figcaption>

    <div class="flex flex-col gap-2">
      <div
        v-for="region in screen.regions"
        :key="region.label"
        class="flex flex-col gap-0.5 rounded-md border px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3"
        :class="
          region.emphasis
            ? 'border-brand-200 bg-brand-50'
            : 'border-border border-dashed bg-surface'
        "
      >
        <span class="text-sm font-medium" :class="region.emphasis ? 'text-brand-700' : 'text-ink'">
          {{ region.label }}
        </span>
        <span class="text-xs text-ink-muted sm:ml-auto sm:text-right">{{ region.note }}</span>
      </div>
    </div>

    <p class="mt-3 text-xs text-ink-subtle">{{ t('public.screenNote') }}</p>
  </figure>
</template>
