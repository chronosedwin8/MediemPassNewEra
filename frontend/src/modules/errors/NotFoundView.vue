<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/design-system/BaseButton.vue';

const { t } = useI18n();
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
    <p class="text-6xl font-bold text-ink-subtle">404</p>
    <p class="text-lg">{{ t('errors.NOT_FOUND') }}</p>
    <RouterLink to="/">
      <BaseButton>{{ t('nav.dashboard') }}</BaseButton>
    </RouterLink>
  </div>
</template>
