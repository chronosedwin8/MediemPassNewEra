<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { localize, type LocalizedText } from '@medienpass/shared';
import { http } from '@/services/http';
import KmkChart from './KmkChart.vue';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';

/**
 * Estadísticas por competencia KMK.
 *
 * Los filtros se envían tal cual al servidor, que es quien calcula: si el
 * cliente hiciera sus propias cuentas, dos pantallas podrían discrepar sobre
 * el mismo dato.
 */

interface CompetencyStat {
  competencyId: string;
  code: string;
  name: LocalizedText;
  color: string;
  percentage: number;
  answerCount: number;
  correctRate: number;
  level: string;
}

interface KmkReport {
  competencies: CompetencyStat[];
  trend: Array<{ period: string; code: string; percentage: number }>;
  strongest: CompetencyStat | null;
  weakest: CompetencyStat | null;
  totalAnswers: number;
}

interface Option {
  id: string;
  code: string;
  name?: LocalizedText;
}

const { t, locale, n } = useI18n();

const report = ref<KmkReport | null>(null);
const loading = ref(true);

const subjects = ref<Option[]>([]);
const groups = ref<Option[]>([]);

const filters = ref({ subjectId: '', groupId: '' });

const levelTone: Record<string, 'success' | 'info' | 'warning' | 'danger'> = {
  AVANZADO: 'success',
  CONSOLIDADO: 'info',
  EN_DESARROLLO: 'warning',
  INICIAL: 'danger',
};

const levelLabel: Record<string, string> = {
  AVANZADO: 'Avanzado',
  CONSOLIDADO: 'Consolidado',
  EN_DESARROLLO: 'En desarrollo',
  INICIAL: 'Inicial',
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    report.value = await http.get<KmkReport>('/statistics/kmk', {
      subjectId: filters.value.subjectId || undefined,
      groupId: filters.value.groupId || undefined,
    });
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const [subjectList, groupList] = await Promise.all([
    http.list<Option>('/subjects', { pageSize: 100 }),
    http.list<Option>('/groups', { pageSize: 100 }),
  ]);
  subjects.value = subjectList.items;
  groups.value = groupList.items;
  await load();
});

watch(filters, load, { deep: true });

const hasData = computed(() => (report.value?.totalAnswers ?? 0) > 0);

const selectClass =
  'h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Filtros. Los mismos nombres que usa la API en toda la plataforma. -->
    <div class="flex flex-wrap gap-3">
      <div class="flex flex-col gap-1.5">
        <label class="text-xs font-medium text-ink-muted" for="filter-subject">
          {{ t('assessment.subject') }}
        </label>
        <select id="filter-subject" v-model="filters.subjectId" :class="selectClass">
          <option value="">{{ t('common.none') }}</option>
          <option v-for="subject in subjects" :key="subject.id" :value="subject.id">
            {{ subject.code }}
          </option>
        </select>
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-xs font-medium text-ink-muted" for="filter-group">
          {{ t('assignment.group') }}
        </label>
        <select id="filter-group" v-model="filters.groupId" :class="selectClass">
          <option value="">{{ t('common.none') }}</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">
            {{ group.code }}
          </option>
        </select>
      </div>
    </div>

    <BaseSpinner v-if="loading" size="lg" />

    <EmptyState
      v-else-if="!hasData"
      :title="t('kmk.noData')"
      :description="t('dashboard.student.noPendingHint')"
    />

    <template v-else-if="report">
      <!-- Fortaleza y debilidad, que es lo primero que se busca aquí. -->
      <div class="grid gap-4 sm:grid-cols-2">
        <BaseCard v-if="report.strongest">
          <p class="text-sm text-ink-muted">{{ t('kmk.strongest') }}</p>
          <p class="mt-1 font-medium">
            <span class="text-ink-muted">KMK {{ report.strongest.code }}</span>
            · {{ localize(report.strongest.name, locale as never) }}
          </p>
          <p class="mt-2 text-2xl font-semibold tabular-nums text-success">
            {{ n(report.strongest.percentage / 100, 'percent') }}
          </p>
        </BaseCard>

        <BaseCard v-if="report.weakest">
          <p class="text-sm text-ink-muted">{{ t('kmk.weakest') }}</p>
          <p class="mt-1 font-medium">
            <span class="text-ink-muted">KMK {{ report.weakest.code }}</span>
            · {{ localize(report.weakest.name, locale as never) }}
          </p>
          <p class="mt-2 text-2xl font-semibold tabular-nums text-danger">
            {{ n(report.weakest.percentage / 100, 'percent') }}
          </p>
        </BaseCard>
      </div>

      <BaseCard :title="t('result.byCompetency')">
        <KmkChart :competencies="report.competencies" />
      </BaseCard>

      <BaseCard :title="t('kmk.title')">
        <ul class="flex flex-col gap-3">
          <li
            v-for="entry in report.competencies.filter((c) => c.answerCount > 0)"
            :key="entry.competencyId"
            class="flex flex-wrap items-center justify-between gap-2"
          >
            <span class="text-sm">
              <span class="text-ink-muted">KMK {{ entry.code }}</span>
              · {{ localize(entry.name, locale as never) }}
            </span>
            <span class="flex items-center gap-3">
              <span class="text-sm tabular-nums text-ink-muted">
                {{ n(entry.correctRate / 100, 'percent') }} {{ t('result.correct').toLowerCase() }}
              </span>
              <BaseBadge :tone="levelTone[entry.level] ?? 'neutral'">
                {{ levelLabel[entry.level] ?? entry.level }}
              </BaseBadge>
            </span>
          </li>
        </ul>
      </BaseCard>
    </template>
  </div>
</template>
