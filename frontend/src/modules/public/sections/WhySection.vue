<script setup lang="ts">
import type { HomeContent } from '../content/types';

defineProps<{ why: HomeContent['why'] }>();
</script>

<template>
  <section class="mx-auto max-w-6xl px-4 py-16 sm:px-6">
    <h2 class="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{{ why.title }}</h2>
    <p class="mt-3 max-w-3xl text-lg text-ink-muted">{{ why.lead }}</p>

    <!--
      Cuatro bloques y no una lista de viñetas: cada uno es un paso del
      argumento (problema, consecuencia, enfoque, límite) y la rejilla los
      mantiene visibles a la vez en lugar de obligar a recordar el anterior.
    -->
    <div class="mt-10 grid gap-6 sm:grid-cols-2">
      <article
        v-for="point in why.points"
        :key="point.title"
        class="rounded-lg border border-border bg-surface p-6 shadow-card"
      >
        <p class="text-xs font-semibold uppercase tracking-wide text-brand-600">
          {{ point.tag }}
        </p>
        <h3 class="mt-2 text-lg font-semibold text-ink">{{ point.title }}</h3>
        <p class="mt-3 text-sm leading-relaxed text-ink-muted">{{ point.body }}</p>
      </article>
    </div>
  </section>
</template>
