<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import { useToast } from '@/composables/useToast';

/**
 * Confirmación de borrado definitivo.
 *
 * Antes de ofrecer el botón se le pregunta al servidor qué se destruiría, y se
 * dice en cifras. Un «¿seguro?» genérico se responde por inercia; «esto borrará
 * 84 intentos de 29 estudiantes» se lee.
 *
 * Y no se confirma pulsando: hay que escribir el título. La diferencia no es
 * ceremonia, es que un botón se pulsa sin mirar y un título hay que leerlo y
 * teclearlo, que es exactamente la pausa que falta antes de destruir las notas
 * de un curso entero.
 */

interface DeletionImpact {
  title: string;
  versions: number;
  questions: number;
  assignments: number;
  attempts: number;
  answers: number;
  students: number;
}

const props = defineProps<{ assessmentId: string }>();
const emit = defineEmits<{ deleted: []; cancel: [] }>();

const { t } = useI18n();
const toast = useToast();

const impact = ref<DeletionImpact | null>(null);
const confirmation = ref('');
const loading = ref(true);
const deleting = ref(false);

onMounted(async () => {
  try {
    impact.value = await http.get<DeletionImpact>(
      `/assessments/${props.assessmentId}/deletion-impact`,
    );
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
    emit('cancel');
  } finally {
    loading.value = false;
  }
});

async function confirm(): Promise<void> {
  deleting.value = true;
  try {
    await http.post(`/assessments/${props.assessmentId}/purge`, {
      confirmation: confirmation.value,
    });
    toast.success(t('assessment.deleted'));
    emit('deleted');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <BaseCard class="border-danger/50 bg-danger/5">
    <BaseSpinner v-if="loading" />

    <template v-else-if="impact">
      <h2 class="text-lg font-semibold text-danger">{{ t('assessment.deleteTitle') }}</h2>
      <p class="mt-2 text-sm">{{ t('assessment.deleteIntro') }}</p>

      <ul class="mt-3 flex flex-col gap-1 text-sm tabular-nums">
        <li>{{ t('assessment.deleteVersions', { count: impact.versions }) }}</li>
        <li>{{ t('assessment.deleteQuestions', { count: impact.questions }) }}</li>
        <li>{{ t('assessment.deleteAssignments', { count: impact.assignments }) }}</li>
        <li v-if="impact.attempts > 0" class="font-medium text-danger">
          {{
            t('assessment.deleteAttempts', { count: impact.attempts, students: impact.students })
          }}
        </li>
      </ul>

      <label class="mt-4 flex flex-col gap-1.5">
        <span class="text-sm font-medium">
          {{ t('assessment.deleteConfirmHint', { title: impact.title }) }}
        </span>
        <input
          v-model="confirmation"
          type="text"
          class="h-9 max-w-md rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-danger"
        />
      </label>

      <div class="mt-4 flex gap-2">
        <BaseButton
          variant="danger"
          :disabled="confirmation.trim() !== impact.title.trim()"
          :loading="deleting"
          @click="confirm"
        >
          {{ t('assessment.deleteAction') }}
        </BaseButton>
        <BaseButton variant="secondary" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </BaseButton>
      </div>
    </template>
  </BaseCard>
</template>
