<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { HomeContent } from '../content/types';

defineProps<{ hero: HomeContent['hero'] }>();

const { t } = useI18n();
</script>

<template>
  <section class="border-b border-border bg-surface">
    <div class="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <p class="text-sm font-medium uppercase tracking-wide text-brand-600">
        {{ hero.eyebrow }}
      </p>

      <h1 class="mt-3 text-4xl font-bold tracking-tight text-ink sm:text-5xl">
        {{ hero.title }}
      </h1>

      <p class="mt-4 max-w-2xl text-xl text-ink-muted sm:text-2xl">{{ hero.lead }}</p>

      <p class="mt-6 max-w-3xl text-base leading-relaxed text-ink-muted">{{ hero.body }}</p>

      <div class="mt-8 flex flex-wrap gap-3">
        <RouterLink
          :to="{ name: 'login' }"
          class="inline-flex h-11 items-center rounded-md bg-brand-600 px-5 font-medium text-ink-inverse transition-colors hover:bg-brand-700"
        >
          {{ t('public.signIn') }}
        </RouterLink>
        <RouterLink
          :to="{ name: 'wiki' }"
          class="inline-flex h-11 items-center rounded-md border border-border-strong bg-surface px-5 font-medium text-ink transition-colors hover:bg-surface-muted"
        >
          {{ t('public.readWiki') }}
        </RouterLink>
        <a
          href="#marcos"
          class="inline-flex h-11 items-center rounded-md px-5 font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          {{ t('public.seeFrameworks') }}
        </a>
      </div>
    </div>
  </section>
</template>
