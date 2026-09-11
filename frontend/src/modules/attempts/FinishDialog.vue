<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/design-system/BaseButton.vue';

/**
 * Confirmación antes de entregar.
 *
 * Vive aparte del runner porque entregar es irreversible y merece su propio
 * sitio: aquí está todo lo que decide si alguien cierra su examen —el aviso,
 * el recuento de lo que se deja en blanco y el foco del teclado— sin mezclarse
 * con la navegación entre preguntas.
 */

defineProps<{ unansweredCount: number; submitting: boolean }>();

const emit = defineEmits<{ confirm: []; cancel: [] }>();

const { t } = useI18n();

const dialogRef = ref<HTMLElement | null>(null);

// El foco entra en el diálogo al abrirse: sin esto, quien navega con teclado
// sigue en la pregunta de detrás y no encuentra los botones.
onMounted(() => dialogRef.value?.focus());
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
    @click.self="emit('cancel')"
  >
    <div
      ref="dialogRef"
      tabindex="-1"
      class="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-title"
      @keydown.esc="emit('cancel')"
    >
      <h2 id="finish-title" class="text-lg font-semibold">{{ t('attempt.finishTitle') }}</h2>
      <p class="mt-2 text-sm text-ink-muted">{{ t('attempt.finishWarning') }}</p>

      <p
        v-if="unansweredCount > 0"
        class="mt-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning"
      >
        {{ t('attempt.finishWithUnanswered', { count: unansweredCount }) }}
      </p>

      <div class="mt-6 flex justify-end gap-2">
        <BaseButton variant="secondary" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </BaseButton>
        <BaseButton :loading="submitting" @click="emit('confirm')">
          {{ t('attempt.finishConfirm') }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
