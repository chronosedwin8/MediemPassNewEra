<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { localize, type LocalizedText } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import LocalizedField from '@/design-system/LocalizedField.vue';
import { useToast } from '@/composables/useToast';

/**
 * La ficha del módulo: qué es, qué competencia trabaja, cuánto dura y de qué
 * periodo es.
 *
 * El periodo importa porque la formación se planifica por trimestres igual que
 * las evaluaciones, y sin él no hay forma de responder «qué había que hacer en
 * el segundo».
 */

interface Competency {
  id: string;
  code: string;
  name: LocalizedText;
}

interface Periodo {
  id: string;
  name: string;
}

const props = defineProps<{
  moduleId: string;
  title: LocalizedText;
  description: LocalizedText;
  kmkCompetencyId: string;
  estimatedMinutes: number | null;
  academicPeriodId: string | null;
}>();

const emit = defineEmits<{ saved: [] }>();

const { t, locale } = useI18n();
const toast = useToast();

const competencies = ref<Competency[]>([]);
const periodos = ref<Periodo[]>([]);
const saving = ref(false);

const draft = reactive({
  title: { ...props.title } as Partial<LocalizedText>,
  description: { ...props.description } as Partial<LocalizedText>,
  kmkCompetencyId: props.kmkCompetencyId,
  estimatedMinutes: props.estimatedMinutes ?? 0,
  academicPeriodId: props.academicPeriodId ?? '',
});

onMounted(async () => {
  competencies.value = await http.get<Competency[]>('/kmk/competencies');

  /*
   * Los periodos cuelgan del año vigente y son opcionales: si el colegio aún
   * no los ha creado, el desplegable no aparece, en lugar de mostrar una lista
   * vacía que parece un fallo.
   */
  try {
    const ano = await http.get<{ periods?: Periodo[] }>('/academic/years/current');
    periodos.value = ano.periods ?? [];
  } catch {
    periodos.value = [];
  }
});

async function save(): Promise<void> {
  saving.value = true;
  try {
    await http.patch(`/training/admin/modules/${props.moduleId}`, {
      title: draft.title,
      description: draft.description,
      kmkCompetencyId: draft.kmkCompetencyId,
      // Cero significa «sin estimación», no «cero minutos».
      estimatedMinutes: draft.estimatedMinutes > 0 ? draft.estimatedMinutes : null,
      academicPeriodId: draft.academicPeriodId || null,
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
  'h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <BaseCard class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold">{{ t('training.admin.moduleData') }}</h2>

    <LocalizedField v-model="draft.title" :label="t('training.admin.moduleTitle')" />
    <LocalizedField
      v-model="draft.description"
      rich
      :label="t('training.admin.moduleDescription')"
      :hint="t('training.admin.moduleDescriptionHint')"
    />

    <div class="grid gap-4 sm:grid-cols-2">
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t('kmk.competency') }}</span>
        <select v-model="draft.kmkCompetencyId" :class="inputClass">
          <option v-for="competency in competencies" :key="competency.id" :value="competency.id">
            KMK {{ competency.code }} — {{ localize(competency.name, locale as never) }}
          </option>
        </select>
      </label>

      <label v-if="periodos.length > 0" class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t('statistics.period') }}</span>
        <select v-model="draft.academicPeriodId" :class="inputClass">
          <option value="">{{ t('training.admin.anyPeriod') }}</option>
          <option v-for="periodo in periodos" :key="periodo.id" :value="periodo.id">
            {{ periodo.name }}
          </option>
        </select>
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t('training.admin.estimatedMinutes') }}</span>
        <input
          v-model.number="draft.estimatedMinutes"
          type="number"
          min="0"
          max="600"
          :class="inputClass"
        />
        <span class="text-xs text-ink-subtle">{{ t('training.admin.estimatedHint') }}</span>
      </label>
    </div>

    <div>
      <BaseButton :loading="saving" @click="save">{{ t('common.save') }}</BaseButton>
    </div>
  </BaseCard>
</template>
