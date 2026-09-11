<script setup lang="ts">
import type { HomeContent } from '../content/types';

defineProps<{ crosswalk: HomeContent['crosswalk'] }>();
</script>

<template>
  <section class="mx-auto max-w-6xl px-4 py-16 sm:px-6">
    <h2 class="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{{ crosswalk.title }}</h2>
    <p class="mt-3 max-w-3xl text-lg text-ink-muted">{{ crosswalk.lead }}</p>

    <!--
      La advertencia va delante de la tabla y no en una nota al pie.
      Presentar correspondencias entre marcos de tres organismos distintos
      invita a leerlas como oficiales, y no lo son: las traza el colegio.
      Puesta debajo, la lee quien ya se ha formado la idea equivocada.
    -->
    <p
      class="mt-6 rounded-md border border-warning bg-warning-soft px-4 py-3 text-sm text-ink"
      role="note"
    >
      {{ crosswalk.caveat }}
    </p>

    <div class="mt-6 overflow-x-auto rounded-lg border border-border">
      <table class="w-full min-w-[46rem] border-collapse bg-surface text-left text-sm">
        <thead>
          <tr class="border-b border-border bg-surface-muted">
            <th scope="col" class="px-4 py-3 font-semibold text-ink">
              {{ crosswalk.columns.kmk }}
            </th>
            <th scope="col" class="px-4 py-3 font-semibold text-ink">
              {{ crosswalk.columns.iste }}
            </th>
            <th scope="col" class="px-4 py-3 font-semibold text-ink">{{ crosswalk.columns.ib }}</th>
            <th scope="col" class="px-4 py-3 font-semibold text-ink">
              {{ crosswalk.columns.practice }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in crosswalk.rows"
            :key="row.kmk"
            class="border-b border-border last:border-0 align-top"
          >
            <th scope="row" class="px-4 py-3 text-left font-medium text-ink">{{ row.kmk }}</th>
            <td class="px-4 py-3 text-ink-muted">{{ row.iste }}</td>
            <td class="px-4 py-3 text-ink-muted">{{ row.ib }}</td>
            <td class="px-4 py-3 text-ink-muted">{{ row.practice }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
