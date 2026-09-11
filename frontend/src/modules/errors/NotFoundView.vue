<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import BaseButton from '@/design-system/BaseButton.vue';

/*
 * La salida depende de si hay sesión. A quien está trabajando se le devuelve a
 * su panel; a quien no, a la portada. Un único destino obligaba a equivocarse
 * con la mitad de los casos.
 */

const { t } = useI18n();
const auth = useAuthStore();
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
    <p class="text-6xl font-bold text-ink-subtle">404</p>
    <p class="text-lg">{{ t('errors.NOT_FOUND') }}</p>
    <RouterLink :to="auth.isAuthenticated ? { name: 'dashboard' } : { name: 'home' }">
      <BaseButton>
        {{ auth.isAuthenticated ? t('nav.dashboard') : t('public.home') }}
      </BaseButton>
    </RouterLink>
  </div>
</template>
