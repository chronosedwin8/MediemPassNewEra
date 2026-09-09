<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import { useToast } from '@/composables/useToast';

/**
 * Datos de la versión en borrador.
 *
 * Solo aparece en borrador. Una versión publicada es inmutable y el servidor lo
 * impone; ofrecer aquí un formulario que después va a ser rechazado sería
 * enseñar una puerta cerrada.
 */

const props = defineProps<{
  versionId: string;
  name: string;
  instructions: string | null;
  timeLimitMinutes: number | null;
}>();

const emit = defineEmits<{ saved: []; cancel: [] }>();

const { t } = useI18n();
const toast = useToast();

const draft = reactive({
  name: props.name,
  instructions: props.instructions ?? '',
  // Cero es la forma de decir «sin límite» en el formulario; el servidor lo
  // recibe como null.
  timeLimitMinutes: props.timeLimitMinutes ?? 0,
});

const saving = ref(false);

async function save(): Promise<void> {
  saving.value = true;
  try {
    await http.patch(`/assessments/versions/${props.versionId}`, {
      name: draft.name.trim(),
      instructions: draft.instructions.trim() || null,
      timeLimitMinutes: draft.timeLimitMinutes > 0 ? draft.timeLimitMinutes : null,
    });
    toast.success(t('common.saved'));
    emit('saved');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    saving.value = false;
  }
}

const inputClass =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <BaseCard :title="t('assessment.settings')">
    <div class="flex flex-col gap-4">
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t('assessment.name') }}</span>
        <input v-model="draft.name" type="text" :class="inputClass" />
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t('assessment.instructions') }}</span>
        <textarea
          v-model="draft.instructions"
          rows="3"
          class="resize-y rounded-md border border-border bg-surface p-3 text-sm outline-none focus:border-brand-500"
        />
      </label>

      <label class="flex max-w-xs flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t('assessment.timeLimit') }}</span>
        <input
          v-model.number="draft.timeLimitMinutes"
          type="number"
          min="0"
          max="600"
          :class="inputClass"
        />
        <span class="text-xs text-ink-subtle">{{ t('assessment.timeLimitZeroHint') }}</span>
      </label>

      <div class="flex gap-2">
        <BaseButton :loading="saving" @click="save">{{ t('common.save') }}</BaseButton>
        <BaseButton variant="secondary" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </BaseButton>
      </div>
    </div>
  </BaseCard>
</template>
