<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { localize, type LocalizedText } from '@medienpass/shared';
import { http } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';
import ProgressBar from '@/design-system/ProgressBar.vue';

/**
 * Qué porcentaje del claustro ha hecho cada capacitación.
 *
 * Es la pregunta que la dirección hace siempre y que antes había que
 * responder abriendo el expediente de cada docente. El porcentaje se calcula
 * sobre quien la tiene asignada, no sobre el claustro entero: una formación
 * dirigida a ocho personas no puede parecer un fracaso porque los otros
 * cuarenta no la hicieran.
 *
 * Debajo, quién va al día. Sin nombres, el porcentaje no lleva a ninguna
 * acción: no se le puede recordar la formación a un promedio.
 */

interface ModuleCompletion {
  moduleId: string;
  code: string;
  title: LocalizedText;
  competency: { code: string; name: LocalizedText };
  targeted: number;
  started: number;
  completed: number;
  certified: number;
  completionRate: number;
}

interface Report {
  teacherCount: number;
  overallRate: number;
  modules: ModuleCompletion[];
  teachers: Array<{
    userId: string;
    firstName: string;
    lastName: string;
    targeted: number;
    completed: number;
    completionRate: number;
  }>;
}

const { t, n, locale } = useI18n();

const report = ref<Report | null>(null);
const cargando = ref(true);
const verTodos = ref(false);

onMounted(async () => {
  try {
    report.value = await http.get<Report>('/statistics/training/completion');
  } catch {
    report.value = null;
  } finally {
    cargando.value = false;
  }
});

/** Primero quien va más atrasado: es con quien hay que hablar. */
const docentes = computed(() => {
  const filas = [...(report.value?.teachers ?? [])]
    .filter((fila) => fila.targeted > 0)
    .sort((a, b) => a.completionRate - b.completionRate);
  return verTodos.value ? filas : filas.slice(0, 10);
});

function tono(rate: number): 'danger' | 'warning' | 'success' {
  if (rate < 50) return 'danger';
  if (rate < 80) return 'warning';
  return 'success';
}
</script>

<template>
  <BaseCard :title="t('statistics.trainingCompletion')">
    <BaseSpinner v-if="cargando" size="sm" />

    <EmptyState
      v-else-if="!report || report.modules.length === 0"
      :title="t('statistics.noTraining')"
    />

    <div v-else class="flex flex-col gap-5">
      <div>
        <p class="text-sm text-ink-muted">
          {{ t('statistics.trainingOverall', { count: report.teacherCount }) }}
        </p>
        <p class="mt-1 text-3xl font-semibold tabular-nums">
          {{ n(report.overallRate / 100, 'percent') }}
        </p>
      </div>

      <ul class="flex flex-col gap-3">
        <li v-for="module in report.modules" :key="module.moduleId" class="flex flex-col gap-1">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="text-sm font-medium">
              <span class="text-ink-muted">KMK {{ module.competency.code }}</span>
              · {{ localize(module.title, locale as never) || module.code }}
            </span>
            <span class="flex items-center gap-2 text-xs text-ink-muted">
              <span class="tabular-nums">
                {{ t('statistics.completedOf', { done: module.completed, total: module.targeted }) }}
              </span>
              <BaseBadge v-if="module.certified > 0" tone="info">
                {{ t('statistics.certified', { count: module.certified }) }}
              </BaseBadge>
              <BaseBadge :tone="tono(module.completionRate)">
                {{ n(module.completionRate / 100, 'percent') }}
              </BaseBadge>
            </span>
          </div>
          <ProgressBar :value="module.completionRate" :label="''" />
        </li>
      </ul>

      <section v-if="docentes.length > 0" class="flex flex-col gap-2">
        <h3 class="text-sm font-medium">{{ t('statistics.byTeacher') }}</h3>
        <ul class="flex flex-col gap-1">
          <li
            v-for="docente in docentes"
            :key="docente.userId"
            class="flex items-center justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0"
          >
            <span>{{ docente.lastName }}, {{ docente.firstName }}</span>
            <span class="flex items-center gap-2">
              <span class="tabular-nums text-ink-muted">
                {{ docente.completed }}/{{ docente.targeted }}
              </span>
              <BaseBadge :tone="tono(docente.completionRate)">
                {{ n(docente.completionRate / 100, 'percent') }}
              </BaseBadge>
            </span>
          </li>
        </ul>
        <button
          v-if="(report.teachers.length ?? 0) > 10"
          type="button"
          class="self-start text-xs text-brand-600 hover:underline"
          @click="verTodos = !verTodos"
        >
          {{ verTodos ? t('common.showLess') : t('common.showAll') }}
        </button>
      </section>
    </div>
  </BaseCard>
</template>
