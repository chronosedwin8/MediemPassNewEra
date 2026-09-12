<script setup lang="ts">
import type { SmartContent } from '../content/types';

/**
 * La rúbrica SMART en la portada.
 *
 * Se enseña entera —dimensiones, indicadores, niveles y bandas— en lugar de
 * definir el acrónimo. Es la diferencia entre contar qué significa SMART y
 * decir con qué se va a puntuar: lo segundo es lo que una familia o un docente
 * pueden leer antes de que a alguien le pongan un 12 sobre 20.
 *
 * El ejemplo de las dos formulaciones va al final por lo mismo. Una rúbrica se
 * entiende cuando se ve aplicada a una meta mal escrita y a la misma meta bien
 * escrita; la tabla sola se lee y se olvida.
 */

defineProps<{ smart: SmartContent }>();
</script>

<template>
  <section id="smart" class="border-y border-border bg-surface">
    <div class="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 class="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{{ smart.title }}</h2>
      <p class="mt-3 max-w-3xl text-lg text-ink-muted">{{ smart.lead }}</p>

      <!--
        La precisión va delante de la tabla y no en una nota al pie. Presentar
        SMART dentro de una plataforma de evaluación invita a leerlo como un
        criterio de calificación, y no lo es; puesto debajo, lo lee quien ya se
        formó la idea equivocada.
      -->
      <p
        class="mt-6 rounded-md border border-warning bg-warning-soft px-4 py-3 text-sm text-ink"
        role="note"
      >
        {{ smart.caveat }}
      </p>

      <div class="mt-8 overflow-x-auto rounded-lg border border-border">
        <table class="w-full min-w-[34rem] border-collapse bg-canvas text-left text-sm">
          <thead>
            <tr class="border-b border-border bg-surface-muted">
              <th scope="col" class="px-4 py-3 font-semibold text-ink">
                {{ smart.columns.dimension }}
              </th>
              <th scope="col" class="px-4 py-3 font-semibold text-ink">
                {{ smart.columns.indicator }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in smart.rows"
              :key="row.letter"
              class="border-b border-border align-top last:border-0"
            >
              <th scope="row" class="px-4 py-3 text-left font-medium text-ink">
                <span class="flex items-center gap-2">
                  <span
                    class="flex size-6 items-center justify-center rounded-md bg-brand-100 text-xs font-bold text-brand-700"
                    aria-hidden="true"
                  >
                    {{ row.letter }}
                  </span>
                  {{ row.name }}
                </span>
              </th>
              <td class="px-4 py-3 text-ink-muted">{{ row.indicator }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-10 grid gap-8 lg:grid-cols-2">
        <div>
          <h3 class="text-lg font-semibold text-ink">{{ smart.scale.title }}</h3>
          <p class="mt-2 text-sm leading-relaxed text-ink-muted">{{ smart.scale.lead }}</p>

          <ul class="mt-4 flex list-none flex-col gap-1.5 p-0 text-sm text-ink-muted">
            <li v-for="level in smart.scale.levels" :key="level">{{ level }}</li>
          </ul>

          <div class="mt-4 flex flex-wrap gap-2">
            <span
              v-for="band in smart.scale.bands"
              :key="band.range"
              class="rounded-md border border-border bg-canvas px-2 py-1 text-xs"
            >
              <span class="font-semibold tabular-nums">{{ band.range }}</span> · {{ band.label }}
            </span>
          </div>
        </div>

        <div>
          <h3 class="text-lg font-semibold text-ink">{{ smart.example.title }}</h3>

          <figure class="mt-4 m-0 rounded-lg border border-danger/30 bg-danger-soft p-4">
            <blockquote class="text-sm italic text-ink">«{{ smart.example.weak.goal }}»</blockquote>
            <figcaption class="mt-2 text-xs text-ink-muted">
              {{ smart.example.weak.verdict }}
            </figcaption>
          </figure>

          <figure class="mt-3 m-0 rounded-lg border border-success/30 bg-success-soft p-4">
            <blockquote class="text-sm italic text-ink">
              «{{ smart.example.strong.goal }}»
            </blockquote>
            <figcaption class="mt-2 text-xs text-ink-muted">
              {{ smart.example.strong.verdict }}
            </figcaption>
          </figure>
        </div>
      </div>
    </div>
  </section>
</template>
