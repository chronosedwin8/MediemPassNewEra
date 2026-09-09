<script setup lang="ts">
/** Contenedor visual estándar. Un solo sitio define borde, radio y sombra. */
withDefaults(defineProps<{ title?: string; subtitle?: string; padded?: boolean }>(), {
  padded: true,
});
</script>

<template>
  <section class="rounded-lg border border-border bg-surface shadow-card">
    <header v-if="title || $slots.actions" class="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div>
        <h2 v-if="title" class="font-semibold text-ink">{{ title }}</h2>
        <p v-if="subtitle" class="mt-0.5 text-sm text-ink-muted">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="shrink-0"><slot name="actions" /></div>
    </header>
    <div :class="padded ? 'p-5' : ''"><slot /></div>
  </section>
</template>
