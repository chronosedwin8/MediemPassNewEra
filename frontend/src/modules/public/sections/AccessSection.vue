<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { HomeContent } from '../content/types';

/**
 * Las tres puertas de entrada.
 *
 * Son tres tarjetas, pero un único destino: la pantalla de acceso es la misma
 * para todo el mundo y el papel lo decide la sesión, no el enlace por el que
 * se llegó. Separarlas en tres accesos distintos habría significado inventar
 * una elección que el servidor ignora, y con ella la primera confusión: elegir
 * «docente» por error y creer que por eso no se puede entrar.
 *
 * Lo que sí cambia es lo que cada perfil necesita saber antes de entrar —de
 * qué correo se trata, qué va a encontrar dentro—, y eso es lo que llevan.
 */

defineProps<{ access: HomeContent['access'] }>();

const { t } = useI18n();

/** Trazados de los iconos, uno por perfil. */
const ICONS: Record<string, string> = {
  student:
    'M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422A12.083 12.083 0 0112 20.055a12.083 12.083 0 01-6.16-9.477L12 14z',
  teacher:
    'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  admin:
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35A1.724 1.724 0 005.4 8.322c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z',
};
</script>

<template>
  <section id="acceso" class="mx-auto max-w-6xl px-4 py-16 sm:px-6">
    <h2 class="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{{ access.title }}</h2>
    <p class="mt-3 max-w-3xl text-lg text-ink-muted">{{ access.lead }}</p>

    <div class="mt-10 grid gap-6 lg:grid-cols-3">
      <article
        v-for="role in access.roles"
        :key="role.key"
        class="flex flex-col rounded-lg border border-border bg-surface p-6 shadow-card"
      >
        <span
          class="flex size-10 items-center justify-center rounded-md bg-brand-50 text-brand-700"
        >
          <svg
            class="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" :d="ICONS[role.key]" />
          </svg>
        </span>

        <h3 class="mt-4 text-lg font-semibold text-ink">{{ role.title }}</h3>
        <p class="mt-2 text-sm leading-relaxed text-ink-muted">{{ role.body }}</p>

        <ul class="mt-4 flex list-none flex-col gap-2 p-0 text-sm text-ink-muted">
          <li v-for="bullet in role.bullets" :key="bullet" class="flex gap-2">
            <svg
              class="mt-0.5 size-4 shrink-0 text-brand-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {{ bullet }}
          </li>
        </ul>

        <RouterLink
          :to="{ name: 'login' }"
          class="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-ink-inverse transition-colors hover:bg-brand-700"
        >
          {{ t('public.signIn') }}
        </RouterLink>
      </article>
    </div>
  </section>
</template>
