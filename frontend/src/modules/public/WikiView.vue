<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Language } from '@medienpass/shared';
import { publicContent } from './content';
import type { WikiSection } from './content/types';
import WikiSectionCard from './WikiSectionCard.vue';

/**
 * Guía de uso de la plataforma.
 *
 * Está organizada por tarea y no por pantalla. Una ayuda que recorre menús
 * («el botón Publicar está en la esquina superior derecha») responde a una
 * pregunta que nadie se hace; las que sí se hacen son «cómo corrijo lo que la
 * máquina no puede» o «qué pasa si se me acaba el tiempo».
 *
 * El filtro por perfil existe porque la guía cubre tres papeles muy distintos
 * y quien es estudiante no debería tener que atravesar la administración del
 * año lectivo para encontrar lo suyo. Por defecto se muestra todo: filtrar es
 * una ayuda, pero esconder por omisión lo que alguien podría querer leer no.
 */

const { locale, t } = useI18n();

const wiki = computed(() => publicContent(locale.value as Language).wiki);

type Audience = WikiSection['audience'];

const AUDIENCES: Audience[] = ['all', 'student', 'teacher', 'admin'];

const filter = ref<Audience>('all');

/*
 * Con un perfil elegido se muestran también las secciones marcadas como «all»:
 * el acceso y las recomendaciones valen para cualquiera, y ocultarlas al
 * filtrar por «estudiante» dejaría fuera precisamente la sección de entrar.
 */
const visible = computed(() =>
  filter.value === 'all'
    ? wiki.value.sections
    : wiki.value.sections.filter(
        (section) => section.audience === filter.value || section.audience === 'all',
      ),
);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6">
    <h1 class="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{{ wiki.title }}</h1>
    <p class="mt-3 max-w-3xl text-lg text-ink-muted">{{ wiki.lead }}</p>

    <div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
      <!-- Índice: pegajoso en pantalla ancha, plegado arriba en móvil. -->
      <nav class="lg:sticky lg:top-24 lg:self-start" :aria-label="t('public.sections')">
        <p class="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          {{ t('public.filterBy') }}
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button
            v-for="audience in AUDIENCES"
            :key="audience"
            type="button"
            :aria-pressed="filter === audience"
            :class="[
              'rounded-md border px-3 py-1.5 text-sm transition-colors',
              filter === audience
                ? 'border-brand-600 bg-brand-600 font-medium text-ink-inverse'
                : 'border-border-strong bg-surface text-ink-muted hover:bg-surface-muted hover:text-ink',
            ]"
            @click="filter = audience"
          >
            {{ wiki.audiences[audience] }}
          </button>
        </div>

        <p class="mt-6 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          {{ t('public.sections') }}
        </p>
        <ol class="mt-2 flex list-none flex-col gap-1 p-0">
          <li v-for="section in visible" :key="section.id">
            <a
              :href="`#${section.id}`"
              class="block rounded-md px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              {{ section.title }}
            </a>
          </li>
        </ol>
      </nav>

      <div class="flex flex-col gap-10">
        <WikiSectionCard
          v-for="section in visible"
          :key="section.id"
          :section="section"
          :audiences="wiki.audiences"
        />

        <p class="border-t border-border pt-6">
          <a
            href="#"
            class="text-sm font-medium text-brand-700 underline underline-offset-2"
          >
            {{ t('public.backToTop') }}
          </a>
        </p>
      </div>
    </div>
  </div>
</template>
