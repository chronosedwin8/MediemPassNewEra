<script setup lang="ts">
import { useToast } from '@/composables/useToast';
import { useI18n } from 'vue-i18n';

const { toasts, dismiss } = useToast();
const { t } = useI18n();

const toneClasses: Record<string, string> = {
  success: 'border-success/40 bg-success-soft text-success',
  error: 'border-danger/40 bg-danger-soft text-danger',
  info: 'border-info/40 bg-info-soft text-info',
};
</script>

<template>
  <!--
    `aria-live` para que un lector de pantalla anuncie los avisos sin que el
    usuario tenga que buscarlos. Los errores interrumpen; el resto, no.
  -->
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border px-4 py-3 shadow-raised"
        :class="toneClasses[toast.tone]"
        role="status"
        :aria-live="toast.tone === 'error' ? 'assertive' : 'polite'"
      >
        <p class="flex-1 text-sm">{{ toast.message }}</p>
        <button
          type="button"
          class="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
          :aria-label="t('common.close')"
          @click="dismiss(toast.id)"
        >
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
