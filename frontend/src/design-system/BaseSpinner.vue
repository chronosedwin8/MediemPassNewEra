<script setup lang="ts">
import { useI18n } from 'vue-i18n';

/** Indicador de carga. Anuncia su estado por texto, no solo por movimiento. */
withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' });
const { t } = useI18n();
</script>

<template>
  <div class="flex items-center justify-center gap-2 py-6" role="status">
    <svg
      class="animate-spin text-brand-600"
      :class="{ 'size-4': size === 'sm', 'size-6': size === 'md', 'size-8': size === 'lg' }"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
      <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
    <span class="sr-only">{{ t('common.loading') }}</span>
  </div>
</template>
