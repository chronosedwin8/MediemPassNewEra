<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ASSESSMENT_AUDIENCE, ASSESSMENT_PURPOSE } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import { useToast } from '@/composables/useToast';

/**
 * La evaluación que certifica el módulo.
 *
 * Sin ella el módulo se puede leer pero no aprobar, y la plataforma lo decía
 * —«no tiene evaluación vinculada, así que no se puede certificar»— sin
 * ofrecer ninguna forma de vincularla. La ruta existía desde el principio.
 *
 * Solo se ofrecen evaluaciones de audiencia docente y propósito de
 * capacitación, que es lo único que el servidor acepta. Enlazar por error una
 * de estudiantes la calificaría con la escala 1.0–6.0 en lugar del porcentaje
 * y la metería en las estadísticas del alumnado; filtrar aquí evita que
 * alguien descubra esa regla por un error en rojo.
 */

interface Evaluacion {
  id: string;
  title: string;
  audience: string;
  purpose: string;
  status?: string;
}

const props = defineProps<{
  moduleId: string;
  vinculada: { id: string; title: string } | null;
}>();

const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const toast = useToast();

const cargando = ref(true);
const guardando = ref(false);
const candidatas = ref<Evaluacion[]>([]);
const elegida = ref(props.vinculada?.id ?? '');

const puedeGuardar = computed(
  () => elegida.value !== '' && elegida.value !== props.vinculada?.id && !guardando.value,
);

onMounted(async () => {
  try {
    const resultado = await http.list<Evaluacion>('/assessments', {
      audience: ASSESSMENT_AUDIENCE.TEACHER,
      purpose: ASSESSMENT_PURPOSE.TRAINING,
      pageSize: 100,
    });
    candidatas.value = resultado.items;
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    cargando.value = false;
  }
});

async function vincular(): Promise<void> {
  guardando.value = true;
  try {
    await http.put(`/training/admin/modules/${props.moduleId}/assessment`, {
      assessmentId: elegida.value,
    });
    toast.success(t('common.saved'));
    emit('changed');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p v-if="vinculada" class="flex flex-wrap items-center gap-2 text-sm">
      <BaseBadge tone="success">{{ t('training.admin.linked') }}</BaseBadge>
      <span class="font-medium">{{ vinculada.title }}</span>
    </p>
    <p v-else class="text-sm text-ink-muted">{{ t('training.admin.noAssessment') }}</p>

    <!--
      El vacío explica qué falta hacer y dónde.

      Una lista desplegable sin opciones no dice nada; aquí lo que falta es
      crear la evaluación primero, en otra pantalla, con dos ajustes concretos.
    -->
    <p v-if="!cargando && candidatas.length === 0" class="text-sm text-ink-muted">
      {{ t('training.admin.noCandidates') }}
    </p>

    <div v-else class="flex flex-wrap items-end gap-2">
      <label class="flex min-w-64 flex-1 flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t('training.admin.chooseAssessment') }}</span>
        <select
          v-model="elegida"
          :disabled="cargando"
          class="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
        >
          <option value="" disabled>{{ t('common.choose') }}</option>
          <option v-for="e in candidatas" :key="e.id" :value="e.id">{{ e.title }}</option>
        </select>
      </label>

      <BaseButton :disabled="!puedeGuardar" :loading="guardando" @click="vincular">
        {{ vinculada ? t('training.admin.relink') : t('training.admin.link') }}
      </BaseButton>
    </div>
  </div>
</template>
