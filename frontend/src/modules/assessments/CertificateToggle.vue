<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import { useToast } from '@/composables/useToast';

/**
 * Emisión del diploma de competencias KMK.
 *
 * Vive fuera del formulario de ajustes de la versión por un motivo concreto:
 * ese formulario solo aparece en borrador, porque una versión publicada es
 * inmutable, y este ajuste es la única excepción a esa regla. La excepción se
 * sostiene porque emitir diploma no cambia ninguna nota ni ningún desglose:
 * decide si de un resultado ya calculado se puede imprimir un documento.
 *
 * Sin ella, el docente que se acuerda del diploma al ver las notas —que es
 * cuando uno se acuerda— tendría que crear una versión nueva y reasignarla, y
 * quienes ya respondieron se quedarían sin él.
 */

const props = defineProps<{ versionId: string; enabled: boolean }>();

const emit = defineEmits<{ changed: [enabled: boolean] }>();

const { t } = useI18n();
const toast = useToast();

const value = ref(props.enabled);
const saving = ref(false);

watch(
  () => props.enabled,
  (next) => {
    value.value = next;
  },
);

async function toggle(next: boolean): Promise<void> {
  saving.value = true;
  try {
    await http.patch(`/assessments/versions/${props.versionId}/certificate`, { enabled: next });
    value.value = next;
    toast.success(t('common.saved'));
    emit('changed', next);
  } catch (error) {
    // Se devuelve la casilla a su sitio: dejarla marcada tras un fallo haría
    // creer al docente que sus estudiantes van a poder descargar algo.
    value.value = !next;
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseCard :title="t('assessment.certificate')">
    <label class="flex items-start gap-3">
      <input
        type="checkbox"
        class="mt-0.5 size-4 rounded border-border-strong"
        :checked="value"
        :disabled="saving"
        @change="toggle(($event.target as HTMLInputElement).checked)"
      />
      <span class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ t('assessment.certificateEnable') }}</span>
        <span class="text-xs text-ink-subtle">{{ t('assessment.certificateHint') }}</span>
        <span class="text-xs text-ink-subtle">{{ t('assessment.certificateThreshold') }}</span>
      </span>
    </label>
  </BaseCard>
</template>
