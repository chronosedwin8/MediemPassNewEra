<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FrameworkColumn, HomeContent } from '../content/types';

/**
 * Los cuatro marcos, en pestañas.
 *
 * Puestos uno debajo de otro son treinta descripciones seguidas y nadie llega
 * al final. En pestañas, cada marco se lee entero y la comparación entre ellos
 * la hace la tabla de correspondencias que viene justo después, que para eso
 * está.
 */

const props = defineProps<{ frameworks: HomeContent['frameworks'] }>();

const { t } = useI18n();

type Key = 'kmk' | 'isteStudents' | 'isteEducators' | 'ib';

const KEYS: Key[] = ['kmk', 'isteStudents', 'isteEducators', 'ib'];

const active = ref<Key>('kmk');

const columns = computed<Array<{ key: Key; column: FrameworkColumn }>>(() =>
  KEYS.map((key) => ({ key, column: props.frameworks[key] })),
);

const current = computed(() => props.frameworks[active.value]);
</script>

<template>
  <section id="marcos" class="border-y border-border bg-surface">
    <div class="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 class="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        {{ frameworks.title }}
      </h2>
      <p class="mt-3 max-w-3xl text-lg text-ink-muted">{{ frameworks.lead }}</p>

      <div class="mt-8 flex flex-wrap gap-2" role="tablist" :aria-label="frameworks.title">
        <button
          v-for="entry in columns"
          :key="entry.key"
          type="button"
          role="tab"
          :aria-selected="active === entry.key"
          :class="[
            'rounded-md border px-4 py-2 text-sm font-medium transition-colors',
            active === entry.key
              ? 'border-brand-600 bg-brand-600 text-ink-inverse'
              : 'border-border-strong bg-surface text-ink-muted hover:bg-surface-muted hover:text-ink',
          ]"
          @click="active = entry.key"
        >
          {{ entry.column.name }}
        </button>
      </div>

      <div class="mt-6 rounded-lg border border-border bg-canvas p-6" role="tabpanel">
        <p class="text-sm font-medium text-brand-700">{{ current.subtitle }}</p>
        <p class="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">{{ current.intro }}</p>

        <ul class="mt-6 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          <li
            v-for="item in current.items"
            :key="item.title"
            class="rounded-md border border-border bg-surface p-4"
          >
            <p class="text-xs font-semibold uppercase tracking-wide text-brand-600">
              {{ item.tag }}
            </p>
            <p class="mt-1 font-medium text-ink">{{ item.title }}</p>
            <p class="mt-2 text-sm leading-relaxed text-ink-muted">{{ item.body }}</p>
          </li>
        </ul>

        <p class="mt-6 text-sm">
          <span class="text-ink-subtle">{{ t('public.source') }}: </span>
          <a
            :href="current.source.url"
            target="_blank"
            rel="noopener noreferrer"
            class="font-medium text-brand-700 underline underline-offset-2"
          >
            {{ current.source.label }}
          </a>
        </p>
      </div>
    </div>
  </section>
</template>
