<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { localize } from '@medienpass/shared';
import { http } from '@/services/http';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';
import type { Breakdown, BreakdownCell, BreakdownRow, Dimension } from './breakdown-types';

/**
 * Matriz de competencias KMK por materia, grupo o estudiante.
 *
 * Una fila por entidad, una columna por competencia. Es la vista que responde
 * a «¿quién y en qué?», que es lo que un promedio no dice: un curso al 75 %
 * puede ser treinta alumnos al 75 % o quince al 100 % y quince al 50 %, y son
 * dos clases distintas que piden dos decisiones distintas.
 *
 * Todos los números vienen calculados del servidor. Aquí solo se pintan.
 */

const props = defineProps<{
  dimension: Dimension;
  filters: Record<string, string | undefined>;
}>();

const emit = defineEmits<{ select: [row: BreakdownRow] }>();

const { t, locale, n } = useI18n();

const data = ref<Breakdown | null>(null);
const loading = ref(true);

async function load(): Promise<void> {
  loading.value = true;
  try {
    data.value = await http.get<Breakdown>('/statistics/kmk/breakdown', {
      dimension: props.dimension,
      ...props.filters,
    });
  } finally {
    loading.value = false;
  }
}

watch(() => [props.dimension, props.filters] as const, load, { deep: true, immediate: true });

const DIMENSION_LABEL: Record<Dimension, string> = {
  subject: 'kmk.dimensionSubject',
  group: 'kmk.dimensionGroup',
  student: 'kmk.dimensionStudent',
};

/**
 * Color de fondo de cada celda según el nivel.
 *
 * Los tonos salen de los tokens de estado, los mismos que usan las insignias
 * del resto de la plataforma: quien ya sabe que el ámbar es «cuidado» no tiene
 * que aprender un código nuevo aquí.
 */
const LEVEL_CLASS: Record<string, string> = {
  AVANZADO: 'bg-success-soft',
  CONSOLIDADO: 'bg-info-soft',
  EN_DESARROLLO: 'bg-warning-soft',
  INICIAL: 'bg-danger-soft',
};

/**
 * Se alinean las celdas con las columnas antes de pintar.
 *
 * El servidor solo devuelve las competencias medidas de cada fila, así que sin
 * este paso la tercera columna de una fila podría ser la competencia 4 y la de
 * la fila siguiente la 6. `null` marca la que no se ha evaluado.
 */
const matrix = computed(() => {
  const report = data.value;
  if (!report) return [];

  return report.rows.map((row) => ({
    row,
    label: typeof row.name === 'string' ? row.name : localize(row.name, locale.value as never),
    cells: report.competencies.map(
      (competency) => row.cells.find((cell) => cell.competencyId === competency.id) ?? null,
    ),
  }));
});

function levelLabel(level: string): string {
  return t(`kmk.level${level}`);
}

function cellTitle(cell: BreakdownCell): string {
  return `${levelLabel(cell.level)} · ${cell.answerCount} ${t('kmk.answers')}`;
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <BaseSpinner v-if="loading" size="lg" />

    <EmptyState
      v-else-if="matrix.length === 0"
      :title="t('kmk.noBreakdown')"
      :description="t('kmk.breakdownHint')"
    />

    <template v-else-if="data">
      <!--
        La tabla desborda a lo ancho con seis competencias y se desplaza dentro
        de su contenedor. La primera columna queda fija: sin ella, al mirar la
        competencia 6 ya no se sabe de qué fila se trata.
      -->
      <div class="overflow-x-auto rounded-lg border border-border">
        <table class="w-full border-collapse bg-surface text-left text-sm">
          <thead>
            <tr class="border-b border-border bg-surface-muted">
              <th
                scope="col"
                class="sticky left-0 z-10 bg-surface-muted px-3 py-2 font-semibold text-ink"
              >
                {{ t(DIMENSION_LABEL[data.dimension]) }}
              </th>
              <th scope="col" class="px-3 py-2 text-right font-semibold text-ink">
                {{ t('kmk.overall') }}
              </th>
              <th
                v-for="competency in data.competencies"
                :key="competency.id"
                scope="col"
                class="px-3 py-2 text-center font-semibold text-ink"
                :title="localize(competency.name, locale as never)"
              >
                KMK {{ competency.code }}
              </th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="entry in matrix"
              :key="entry.row.id"
              class="border-b border-border last:border-0"
            >
              <th scope="row" class="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-normal">
                <button
                  type="button"
                  class="text-left font-medium text-ink hover:underline"
                  @click="emit('select', entry.row)"
                >
                  {{ entry.label }}
                </button>
                <span v-if="entry.row.context" class="block text-xs text-ink-subtle">
                  {{ entry.row.context }}
                </span>
              </th>

              <td class="px-3 py-2 text-right tabular-nums">
                <span class="font-medium">{{ n(entry.row.percentage / 100, 'percent') }}</span>
                <span class="block text-xs text-ink-subtle">
                  {{ entry.row.answerCount }} {{ t('kmk.answers') }}
                </span>
              </td>

              <td v-for="(cell, index) in entry.cells" :key="index" class="px-2 py-2 text-center">
                <span
                  v-if="cell"
                  class="inline-flex min-w-16 flex-col rounded-md px-2 py-1 tabular-nums"
                  :class="LEVEL_CLASS[cell.level] ?? ''"
                  :title="cellTitle(cell)"
                >
                  <span class="font-medium">{{ n(cell.percentage / 100, 'percent') }}</span>
                  <span class="text-xs leading-tight">{{ levelLabel(cell.level) }}</span>
                </span>

                <!--
                  Una competencia sin medir no se pinta como un cero: no es que
                  se haya hecho mal, es que no se ha evaluado. Confundir las dos
                  cosas es el error más caro que puede cometer esta tabla.
                -->
                <span v-else class="text-xs text-ink-subtle" :title="t('kmk.notMeasuredHint')">
                  {{ t('kmk.notMeasured') }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="text-xs text-ink-subtle">{{ t('kmk.levelScale') }}</p>

      <p v-if="data.truncated" class="text-xs text-warning">
        {{ t('kmk.truncated', { shown: data.coverage.measured, total: data.coverage.total }) }}
      </p>
    </template>
  </div>
</template>
