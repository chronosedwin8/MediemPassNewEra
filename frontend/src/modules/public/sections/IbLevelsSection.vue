<script setup lang="ts">
import type { HomeContent } from '../content/types';

defineProps<{ ibLevels: HomeContent['ibLevels'] }>();
</script>

<template>
  <section class="border-y border-border bg-surface">
    <div class="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 class="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{{ ibLevels.title }}</h2>
      <p class="mt-3 max-w-3xl text-lg text-ink-muted">{{ ibLevels.lead }}</p>

      <!--
        En columnas y no en acordeón: los cuatro programas forman una
        progresión, y lo que se quiere ver es precisamente cómo cambia la misma
        exigencia de PYP a CP. Escondidos detrás de un clic cada uno, esa
        progresión desaparece.
      -->
      <ol class="mt-10 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
        <li
          v-for="level in ibLevels.levels"
          :key="level.tag"
          class="flex flex-col rounded-lg border border-border bg-canvas p-5"
        >
          <span
            class="inline-flex w-fit rounded-md bg-brand-600 px-2 py-1 text-xs font-bold tracking-wide text-ink-inverse"
          >
            {{ level.tag }}
          </span>
          <h3 class="mt-3 font-semibold text-ink">{{ level.title }}</h3>
          <p class="mt-2 text-sm leading-relaxed text-ink-muted">{{ level.body }}</p>
        </li>
      </ol>
    </div>
  </section>
</template>
