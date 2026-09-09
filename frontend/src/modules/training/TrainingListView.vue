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
 * Capacitación KMK del profesorado.
 *
 * Un docente no puede evaluar competencias digitales que él mismo no domina,
 * y esta es la parte del sistema que lo aborda: seis módulos, uno por
 * competencia del marco, con material y una evaluación al final.
 *
 * La evaluación del módulo usa el mismo motor que la de los estudiantes. No es
 * un ahorro de código: significa que el docente vive exactamente lo que van a
 * vivir sus alumnos, con el mismo temporizador, el mismo autoguardado y la
 * misma pantalla de resultados.
 */

interface Module {
  id: string;
  code: string;
  title: LocalizedText;
  description: LocalizedText;
  estimatedMinutes: number | null;
  contentCount: number;
  competency: { id: string; code: string; name: LocalizedText; color: string };
  progress: {
    status: string;
    contentsSeen: number;
    completedAt: string | null;
    assessmentPercentage: number | null;
    assessmentPassed: boolean | null;
  };
}

interface Summary {
  totalModules: number;
  completedModules: number;
  certifiedModules: number;
  completionRate: number;
}

const { t, locale, n } = useI18n();

const modules = ref<Module[]>([]);
const summary = ref<Summary | null>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    const [moduleData, summaryData] = await Promise.all([
      http.get<Module[]>('/training/modules'),
      http.get<Summary>('/training/summary'),
    ]);
    modules.value = moduleData;
    summary.value = summaryData;
  } finally {
    loading.value = false;
  }
});

/**
 * Estado de un módulo, en una sola palabra.
 *
 * Se distingue «certificado» de «en curso» a propósito: recorrer el material
 * no es lo mismo que demostrar la competencia, y mezclarlos vaciaría de
 * sentido la certificación.
 */
function moduleState(module: Module): {
  key: string;
  tone: 'success' | 'info' | 'warning' | 'neutral';
} {
  if (module.progress.assessmentPassed) return { key: 'certified', tone: 'success' };
  if (module.progress.assessmentPercentage !== null) return { key: 'attempted', tone: 'warning' };
  if (module.progress.contentsSeen > 0) return { key: 'inProgress', tone: 'info' };
  return { key: 'notStarted', tone: 'neutral' };
}

function contentProgress(module: Module): number {
  if (module.contentCount === 0) return 0;
  return Math.round((module.progress.contentsSeen / module.contentCount) * 100);
}

const certifiedCount = computed(() => summary.value?.certifiedModules ?? 0);
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else class="flex flex-col gap-6">
    <header>
      <h1 class="text-2xl font-semibold">{{ t('training.title') }}</h1>
      <p class="mt-1 max-w-2xl text-sm text-ink-muted">{{ t('training.intro') }}</p>
    </header>

    <BaseCard v-if="summary">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-sm text-ink-muted">{{ t('training.certifiedModules') }}</p>
          <p class="text-3xl font-semibold tabular-nums">
            {{ certifiedCount }}
            <span class="text-lg font-normal text-ink-subtle">/ {{ summary.totalModules }}</span>
          </p>
        </div>
        <div class="min-w-48 flex-1">
          <ProgressBar :value="summary.completionRate" :label="t('training.completionRate')" />
          <p class="mt-1 text-right text-xs tabular-nums text-ink-subtle">
            {{ n(summary.completionRate / 100, 'percent') }}
          </p>
        </div>
      </div>
    </BaseCard>

    <EmptyState v-if="modules.length === 0" :title="t('training.empty')" />

    <div v-else class="grid gap-4 md:grid-cols-2">
      <BaseCard v-for="module in modules" :key="module.id" class="relative flex flex-col gap-3">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2">
            <span
              class="size-3 shrink-0 rounded-full"
              :style="{ backgroundColor: module.competency.color }"
              aria-hidden="true"
            />
            <span class="text-xs font-medium text-ink-muted">
              KMK {{ module.competency.code }}
            </span>
          </div>
          <BaseBadge :tone="moduleState(module).tone">
            {{ t(`training.state.${moduleState(module).key}`) }}
          </BaseBadge>
        </div>

        <RouterLink :to="`/training/${module.id}`" class="text-lg font-semibold hover:underline">
          <span class="absolute inset-0" aria-hidden="true" />
          {{ localize(module.title, locale as never) }}
        </RouterLink>

        <p class="text-sm text-ink-muted">{{ localize(module.description, locale as never) }}</p>

        <div class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-subtle">
          <span>{{ t('training.contents', { count: module.contentCount }) }}</span>
          <span v-if="module.estimatedMinutes">
            {{ t('training.estimatedMinutes', { count: module.estimatedMinutes }) }}
          </span>
          <span v-if="module.progress.assessmentPercentage !== null" class="tabular-nums">
            {{ t('result.percentage') }}:
            {{ n(module.progress.assessmentPercentage / 100, 'percent') }}
          </span>
        </div>

        <ProgressBar
          v-if="module.contentCount > 0"
          :value="contentProgress(module)"
          :label="t('training.materialProgress')"
        />
      </BaseCard>
    </div>
  </div>
</template>
