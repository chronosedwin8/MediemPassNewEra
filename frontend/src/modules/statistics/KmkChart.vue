<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { RadarChart } from 'echarts/charts';
import { LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { localize, type LocalizedText } from '@medienpass/shared';

/**
 * Desempeño por competencia, en radar.
 *
 * El radar es la forma adecuada aquí porque las seis competencias son
 * dimensiones comparables de una misma cosa: se lee de un vistazo dónde está
 * el hueco. Una barra por competencia diría lo mismo pero invitaría a
 * ordenarlas, y no hay un orden natural entre ellas.
 *
 * El gráfico nunca va solo: debajo se repite la misma información en una
 * tabla, que es lo que un lector de pantalla puede recorrer.
 */

interface CompetencyStat {
  competencyId: string;
  code: string;
  name: LocalizedText;
  color: string;
  percentage: number;
  answerCount: number;
}

const props = defineProps<{ competencies: CompetencyStat[]; height?: string }>();

// Registro de los módulos de ECharts que usa este gráfico. Importar solo lo
// necesario mantiene el paquete pequeño: la biblioteca completa pesa el doble.
use([RadarChart, TooltipComponent, LegendComponent, CanvasRenderer]);

const { t, locale, n } = useI18n();

const measured = computed(() => props.competencies.filter((entry) => entry.answerCount > 0));

const option = computed(() => ({
  tooltip: {
    trigger: 'item',
    formatter: (params: { value: number[] }) =>
      measured.value
        .map((entry, index) => `KMK ${entry.code}: ${params.value[index]} %`)
        .join('<br/>'),
  },
  radar: {
    indicator: measured.value.map((entry) => ({
      name: `KMK ${entry.code}`,
      max: 100,
    })),
    radius: '65%',
    splitNumber: 4,
    axisName: { color: 'currentColor', fontSize: 11 },
    splitLine: { lineStyle: { color: 'rgba(128,128,128,0.25)' } },
    splitArea: { show: false },
    axisLine: { lineStyle: { color: 'rgba(128,128,128,0.25)' } },
  },
  series: [
    {
      type: 'radar',
      data: [
        {
          value: measured.value.map((entry) => entry.percentage),
          name: t('result.byCompetency'),
          areaStyle: { opacity: 0.18 },
          lineStyle: { width: 2 },
          itemStyle: { color: '#2563eb' },
        },
      ],
    },
  ],
}));
</script>

<template>
  <div class="flex flex-col gap-4">
    <VChart
      v-if="measured.length >= 3"
      :option="option"
      :style="{ height: height ?? '320px' }"
      autoresize
      aria-hidden="true"
    />

    <!--
      La misma información en texto. No es un añadido opcional: es la versión
      que funciona con lector de pantalla, y también la que se puede leer
      cuando el gráfico no aporta —con menos de tres competencias medidas, un
      radar no dice nada—.
    -->
    <table class="w-full text-sm">
      <caption class="sr-only">
        {{
          t('result.byCompetency')
        }}
      </caption>
      <thead>
        <tr
          class="border-b border-border text-left text-xs uppercase tracking-wide text-ink-subtle"
        >
          <th class="pb-2 pr-4 font-medium">{{ t('kmk.competency') }}</th>
          <th class="pb-2 pr-4 text-right font-medium">{{ t('result.percentage') }}</th>
          <th class="pb-2 text-right font-medium">{{ t('assessment.questions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="entry in competencies"
          :key="entry.competencyId"
          class="border-b border-border/50"
        >
          <td class="py-2 pr-4">
            <span class="inline-flex items-center gap-2">
              <span
                class="size-2.5 shrink-0 rounded-full"
                :style="{ backgroundColor: entry.color }"
                aria-hidden="true"
              />
              <span class="text-ink-muted">KMK {{ entry.code }}</span>
              {{ localize(entry.name, locale as never) }}
            </span>
          </td>
          <td class="py-2 pr-4 text-right tabular-nums">
            <span v-if="entry.answerCount > 0">{{ n(entry.percentage / 100, 'percent') }}</span>
            <span v-else class="text-ink-subtle">{{ t('kmk.noData') }}</span>
          </td>
          <td class="py-2 text-right tabular-nums text-ink-muted">{{ entry.answerCount }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
