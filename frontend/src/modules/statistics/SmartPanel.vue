<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  SMART_LETTER,
  SMART_LEVEL_MAX,
  SMART_MAX_SCORE,
  type SmartBand,
  type SmartDimension,
} from '@medienpass/shared';
import { http } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import ProgressBar from '@/design-system/ProgressBar.vue';

/**
 * Objetivos SMART, dimensión a dimensión.
 *
 * Es la razón de guardar el desglose de la rúbrica y no solo los puntos. Con
 * los puntos, lo más que se puede decir es que los objetivos se dan regular;
 * con las cinco medias se ve que lo que falta es el plazo, y eso sí cambia la
 * clase siguiente.
 */

interface DimensionStat {
  dimension: SmartDimension;
  average: number;
  percentage: number;
  scored: number;
}

interface SmartReport {
  evaluated: number;
  averageScore: number;
  dimensions: DimensionStat[];
  bands: Array<{ band: SmartBand; count: number }>;
  weakest: SmartDimension | null;
  strongest: SmartDimension | null;
}

const props = defineProps<{ filters: Record<string, string | undefined> }>();

const { t } = useI18n();

const report = ref<SmartReport | null>(null);
const loading = ref(true);

async function load(): Promise<void> {
  loading.value = true;
  try {
    report.value = await http.get<SmartReport>('/statistics/smart', props.filters);
  } finally {
    loading.value = false;
  }
}

watch(() => props.filters, load, { deep: true, immediate: true });

const hasData = computed(() => (report.value?.evaluated ?? 0) > 0);

/** Una dimensión floja se marca; no se esconde, que es lo que hay que ver. */
function toneFor(entry: DimensionStat): 'brand' | 'success' {
  return entry.average >= SMART_LEVEL_MAX * 0.7 ? 'success' : 'brand';
}
</script>

<template>
  <BaseCard :title="t('smart.statsTitle')">
    <BaseSpinner v-if="loading" />

    <p v-else-if="!hasData" class="text-sm text-ink-muted">{{ t('smart.noData') }}</p>

    <template v-else-if="report">
      <p class="text-sm text-ink-muted">{{ t('smart.statsHint') }}</p>

      <div class="mt-4 grid gap-4 sm:grid-cols-3">
        <div class="rounded-lg border border-border bg-surface p-3">
          <p class="text-sm text-ink-muted">{{ t('smart.evaluated') }}</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums">{{ report.evaluated }}</p>
        </div>
        <div class="rounded-lg border border-border bg-surface p-3">
          <p class="text-sm text-ink-muted">
            {{ t('smart.averageScore', { max: SMART_MAX_SCORE }) }}
          </p>
          <p class="mt-1 text-2xl font-semibold tabular-nums">{{ report.averageScore }}</p>
        </div>
        <div class="rounded-lg border border-border bg-surface p-3">
          <p class="text-sm text-ink-muted">{{ t('smart.weakest') }}</p>
          <p class="mt-1 font-medium">
            {{ report.weakest ? t(`smart.dimension.${report.weakest}.name`) : '—' }}
          </p>
        </div>
      </div>

      <ul class="mt-5 flex list-none flex-col gap-3 p-0">
        <li v-for="entry in report.dimensions" :key="entry.dimension" class="flex flex-col gap-1">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="flex items-center gap-2">
              <span
                class="flex size-5 items-center justify-center rounded bg-brand-100 text-xs font-bold text-brand-700"
                aria-hidden="true"
              >
                {{ SMART_LETTER[entry.dimension] }}
              </span>
              {{ t(`smart.dimension.${entry.dimension}.name`) }}
            </span>
            <span class="tabular-nums text-ink-muted">
              {{ entry.average }} / {{ SMART_LEVEL_MAX }}
            </span>
          </div>
          <ProgressBar :value="entry.percentage" :max="100" :tone="toneFor(entry)" />
        </li>
      </ul>

      <!-- Reparto por banda: dice si el curso es homogéneo o está partido. -->
      <div class="mt-5 flex flex-wrap gap-2">
        <span
          v-for="entry in report.bands"
          :key="entry.band"
          class="rounded-md bg-surface-muted px-2 py-1 text-xs"
        >
          {{ t(`smart.band.${entry.band}`) }}:
          <span class="font-medium tabular-nums">{{ entry.count }}</span>
        </span>
      </div>

      <p class="mt-4 text-xs text-ink-subtle">{{ t('smart.notAGoalHint') }}</p>
    </template>
  </BaseCard>
</template>
