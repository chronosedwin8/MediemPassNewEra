<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { localize, type LocalizedText } from '@medienpass/shared';
import { http } from '@/services/http';
import KmkChart from './KmkChart.vue';
import KmkBreakdownTable from './KmkBreakdownTable.vue';
import type { BreakdownRow, Dimension } from './breakdown-types';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';

/**
 * Estadísticas por competencia KMK.
 *
 * Dos lecturas de lo mismo, en este orden: el conjunto —en qué se es fuerte y
 * en qué no— y el desglose —quién y en qué—. La segunda existe porque la
 * primera, aplicada a un curso entero, esconde a quien va muy por detrás.
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

const filters = ref({ subjectId: '', groupId: '', studentId: '' });

/**
 * Por qué dimensión se desglosa. Por grupo de partida: es la comparación que
 * más veces se quiere y la que menos filas produce.
 */
const dimension = ref<Dimension>('group');

const DIMENSIONS: Array<{ value: Dimension; labelKey: string }> = [
  { value: 'subject', labelKey: 'kmk.dimensionSubject' },
  { value: 'group', labelKey: 'kmk.dimensionGroup' },
  { value: 'student', labelKey: 'kmk.dimensionStudent' },
];

/**
 * Estudiante enfocado al pulsar su fila.
 *
 * Solo los estudiantes: materia y grupo tienen su propio desplegable arriba, y
 * al pulsarlos se ve ahí. Un alumno no lo tiene —elegir entre mil ciento
 * setenta y siete nombres no es buscar a nadie— así que necesita su propio
 * indicador de a quién se está mirando y cómo salir.
 */
const focusedStudent = ref<string | null>(null);

const levelTone: Record<string, 'success' | 'info' | 'warning' | 'danger'> = {
  AVANZADO: 'success',
  CONSOLIDADO: 'info',
  EN_DESARROLLO: 'warning',
  INICIAL: 'danger',
};

function levelLabel(level: string): string {
  return t(`kmk.level${level}`);
}

/** Lo que se manda al servidor: los vacíos no viajan. */
const query = computed(() => ({
  subjectId: filters.value.subjectId || undefined,
  groupId: filters.value.groupId || undefined,
  studentId: filters.value.studentId || undefined,
}));

async function load(): Promise<void> {
  loading.value = true;
  try {
    report.value = await http.get<KmkReport>('/statistics/kmk', query.value);
  } finally {
    loading.value = false;
  }
}

const FOCUS_FIELD: Record<Dimension, 'subjectId' | 'groupId' | 'studentId'> = {
  subject: 'subjectId',
  group: 'groupId',
  student: 'studentId',
};

/**
 * Pulsar una fila acota el informe de arriba a esa entidad.
 *
 * Es lo que convierte la tabla en un itinerario: se ve que el 10.º B flojea,
 * se pulsa, y el gráfico de competencias pasa a ser el de ese curso. Con un
 * estudiante, ese gráfico es su perfil individual.
 */
function focus(row: BreakdownRow, label: string): void {
  filters.value[FOCUS_FIELD[dimension.value]] = row.id;
  focusedStudent.value = dimension.value === 'student' ? label : focusedStudent.value;
}

function clearFocus(): void {
  filters.value.studentId = '';
  focusedStudent.value = null;
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
    <div class="flex flex-wrap items-end gap-3">
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

      <!--
        El estudiante enfocado no tiene desplegable propio: elegir entre mil
        ciento setenta y siete nombres no es una forma razonable de buscar a
        nadie. Se llega pulsando su fila en el desglose, y aquí solo se muestra
        a quién se está mirando y cómo salir.
      -->
      <button
        v-if="focusedStudent"
        type="button"
        class="inline-flex h-10 items-center gap-2 rounded-md border border-brand-600 bg-brand-50 px-3 text-sm font-medium text-brand-700"
        @click="clearFocus"
      >
        {{ focusedStudent }}
        <span aria-hidden="true">×</span>
        <span class="sr-only">{{ t('common.close') }}</span>
      </button>
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
                {{ levelLabel(entry.level) }}
              </BaseBadge>
            </span>
          </li>
        </ul>
      </BaseCard>
    </template>

    <!--
      El desglose se pinta aunque el agregado esté vacío por los filtros: es
      justamente donde se ve que una materia no ha evaluado nada.
    -->
    <BaseCard :title="t('kmk.breakdown')">
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-medium text-ink-muted">{{ t('kmk.viewBy') }}</span>
          <button
            v-for="option in DIMENSIONS"
            :key="option.value"
            type="button"
            :aria-pressed="dimension === option.value"
            :class="[
              'rounded-md border px-3 py-1.5 text-sm transition-colors',
              dimension === option.value
                ? 'border-brand-600 bg-brand-600 font-medium text-ink-inverse'
                : 'border-border-strong bg-surface text-ink-muted hover:bg-surface-muted hover:text-ink',
            ]"
            @click="dimension = option.value"
          >
            {{ t(option.labelKey) }}
          </button>
        </div>

        <p class="text-sm text-ink-muted">{{ t('kmk.breakdownHint') }}</p>

        <KmkBreakdownTable
          :dimension="dimension"
          :filters="query"
          @select="(row) => focus(row, typeof row.name === 'string' ? row.name : row.code || '')"
        />
      </div>
    </BaseCard>
  </div>
</template>
