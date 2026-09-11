<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { WikiContent, WikiSection } from './content/types';
import ScreenSketch from './ScreenSketch.vue';

/**
 * Una sección de la guía: pasos numerados, boceto de pantalla y dudas.
 *
 * Los pasos van numerados y las recomendaciones marcadas aparte del cuerpo.
 * No es adorno: quien consulta una ayuda a mitad de una tarea lee en diagonal,
 * y separar «lo que hay que hacer» de «lo que conviene saber» es lo que
 * permite leer solo lo primero cuando se tiene prisa.
 */

defineProps<{
  section: WikiSection;
  audiences: WikiContent['audiences'];
}>();

const { t } = useI18n();
</script>

<template>
  <article :id="section.id" class="scroll-mt-20 border-t border-border pt-10 first:border-0">
    <div class="flex flex-wrap items-baseline gap-3">
      <h2 class="text-2xl font-bold tracking-tight text-ink">{{ section.title }}</h2>
      <span
        class="rounded-md bg-surface-muted px-2 py-1 text-xs font-medium uppercase tracking-wide text-ink-muted"
      >
        {{ t('public.audience') }}: {{ audiences[section.audience] }}
      </span>
    </div>

    <p class="mt-3 max-w-3xl text-base text-ink-muted">{{ section.lead }}</p>

    <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <ol class="flex list-none flex-col gap-4 p-0">
        <li
          v-for="(step, index) in section.steps"
          :key="step.title"
          class="rounded-lg border border-border bg-surface p-5"
        >
          <p class="text-xs font-semibold uppercase tracking-wide text-brand-600">
            {{ t('public.step', { number: index + 1 }) }}
          </p>
          <h3 class="mt-1 font-semibold text-ink">{{ step.title }}</h3>
          <p class="mt-2 text-sm leading-relaxed text-ink-muted">{{ step.body }}</p>

          <p
            v-if="step.tip"
            class="mt-3 rounded-md border-l-4 border-info bg-info-soft px-3 py-2 text-sm text-ink"
          >
            <span class="font-semibold">{{ t('public.tip') }}: </span>{{ step.tip }}
          </p>
        </li>
      </ol>

      <div v-if="section.screen || section.faq" class="flex flex-col gap-6">
        <ScreenSketch v-if="section.screen" :screen="section.screen" />

        <div v-if="section.faq" class="rounded-lg border border-border bg-surface p-5">
          <h3 class="font-semibold text-ink">{{ t('public.faq') }}</h3>
          <dl class="mt-3 flex flex-col gap-4">
            <div v-for="entry in section.faq" :key="entry.question">
              <dt class="text-sm font-medium text-ink">{{ entry.question }}</dt>
              <dd class="mt-1 ml-0 text-sm leading-relaxed text-ink-muted">{{ entry.answer }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </article>
</template>
