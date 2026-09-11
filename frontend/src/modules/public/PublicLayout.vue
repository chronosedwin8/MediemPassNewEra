<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { Language } from '@medienpass/shared';
import { LANGUAGE_OPTIONS } from '@/app/languages';
import { setLanguage } from '@/app/i18n';
import { useAuthStore } from '@/stores/auth';

/**
 * Marco de las páginas públicas.
 *
 * Es el único sitio de la aplicación que se ve sin sesión, y por eso no
 * comparte layout con el resto: `AppLayout` da por hecho que hay un usuario
 * con permisos para construir el menú, y aquí no lo hay.
 *
 * El selector de idioma aparece antes de entrar a propósito. Quien llega a
 * este dominio puede ser una familia alemana recién llegada leyendo sobre el
 * colegio, y hacerle iniciar sesión para poder leer en su idioma sería un
 * orden absurdo.
 */

const { t, locale } = useI18n();
const auth = useAuthStore();

function changeLanguage(event: Event): void {
  setLanguage((event.target as HTMLSelectElement).value as Language);
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-canvas">
    <a class="skip-link" href="#public-main">{{ t('nav.skipToContent') }}</a>

    <header class="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <RouterLink :to="{ name: 'home' }" class="flex items-center gap-2">
          <span
            class="flex size-8 items-center justify-center rounded-md bg-brand-600 text-ink-inverse"
          >
            <span class="text-sm font-bold">M</span>
          </span>
          <!--
            En móvil se queda solo el cuadro. A 430 px la cabecera no daba de
            sí y empujaba la página entera hacia la derecha; el nombre es lo
            único prescindible, porque el cuadro ya lleva a la portada.
          -->
          <span class="hidden font-semibold sm:inline">{{ t('app.name') }}</span>
        </RouterLink>

        <nav class="flex items-center gap-1 text-sm sm:ml-4" :aria-label="t('public.sections')">
          <!-- El enlace a la portada se oculta en móvil: lo cubre el logotipo. -->
          <RouterLink
            :to="{ name: 'home' }"
            class="hidden rounded-md px-3 py-2 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink sm:block"
            active-class="bg-brand-50 font-medium text-brand-700"
          >
            {{ t('public.home') }}
          </RouterLink>
          <RouterLink
            :to="{ name: 'wiki' }"
            class="whitespace-nowrap rounded-md px-2 py-2 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink sm:px-3"
            active-class="bg-brand-50 font-medium text-brand-700"
          >
            {{ t('public.wiki') }}
          </RouterLink>
        </nav>

        <div class="ml-auto flex items-center gap-2">
          <label class="sr-only" for="public-language">{{ t('common.language') }}</label>
          <select
            id="public-language"
            class="h-9 rounded-md border border-border bg-surface px-2 text-sm"
            :value="locale"
            @change="changeLanguage"
          >
            <option v-for="option in LANGUAGE_OPTIONS" :key="option.code" :value="option.code">
              {{ option.label }}
            </option>
          </select>

          <!--
            Con sesión abierta el botón lleva al panel en lugar de a la
            pantalla de acceso: quien ya entró y vuelve a la portada busca
            volver a su trabajo, no identificarse otra vez.
          -->
          <RouterLink
            :to="auth.isAuthenticated ? { name: 'dashboard' } : { name: 'login' }"
            class="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-md bg-brand-600 px-3 text-sm font-medium text-ink-inverse transition-colors hover:bg-brand-700 sm:px-4"
          >
            {{ auth.isAuthenticated ? t('nav.dashboard') : t('public.signIn') }}
          </RouterLink>
        </div>
      </div>
    </header>

    <main id="public-main" class="flex-1">
      <RouterView />
    </main>

    <footer class="border-t border-border bg-surface">
      <div class="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-ink-muted sm:px-6">
        <p class="font-medium text-ink">{{ t('public.school') }}</p>
        <p>{{ t('public.footer') }}</p>
        <p class="text-ink-subtle">{{ t('public.privacyNote') }}</p>
      </div>
    </footer>
  </div>
</template>
