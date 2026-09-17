<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { http } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';

/**
 * Cuántos estudiantes aprobaron cada evaluación.
 *
 * El desglose por competencia dice en qué se falla, que es otra pregunta: un
 * curso puede ir razonable en todas las competencias y tener media clase
 * suspendida, porque aprobar depende del conjunto y no de cada parte.
 *
 * Se ordena de menor a mayor porcentaje a propósito. Quien abre esta tabla
 * busca la evaluación que salió mal, y ponerla la primera ahorra el recorrido.
 */

interface PassRate {
  assessmentId: string;
  title: string;
  subject: string | null;
  period: string | null;
  students: number;
  passed: number;
  passRate: number;
  averagePercentage: number;
}

const props = defineProps<{ filters: Record<string, string | undefined> }>();

const { t, n } = useI18n();

const filas = ref<PassRate[]>([]);
const cargando = ref(true);

async function cargar(): Promise<void> {
  cargando.value = true;
  try {
    filas.value = await http.get<PassRate[]>('/statistics/assessments/pass-rates', props.filters);
  } catch {
    filas.value = [];
  } finally {
    cargando.value = false;
  }
}

watch(() => props.filters, cargar, { deep: true, immediate: true });

/** Rojo por debajo de la mitad, ámbar hasta tres cuartos, verde arriba. */
function tono(rate: number): 'danger' | 'warning' | 'success' {
  if (rate < 50) return 'danger';
  if (rate < 75) return 'warning';
  return 'success';
}
</script>

<template>
  <BaseCard :title="t('statistics.passRates')">
    <BaseSpinner v-if="cargando" size="sm" />

    <EmptyState v-else-if="filas.length === 0" :title="t('statistics.noPassRates')" />

    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-left text-xs uppercase tracking-wide text-ink-subtle">
          <tr>
            <th class="py-2 pr-3 font-medium">{{ t('assessment.titleField') }}</th>
            <th class="py-2 pr-3 font-medium">{{ t('assessment.subject') }}</th>
            <th class="py-2 pr-3 font-medium">{{ t('statistics.period') }}</th>
            <th class="py-2 pr-3 text-right font-medium">{{ t('statistics.students') }}</th>
            <th class="py-2 pr-3 text-right font-medium">{{ t('result.passed') }}</th>
            <th class="py-2 text-right font-medium">{{ t('statistics.average') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="fila in filas" :key="fila.assessmentId" class="border-t border-border">
            <td class="py-2 pr-3">
              <RouterLink :to="`/assessments/${fila.assessmentId}`" class="hover:underline">
                {{ fila.title }}
              </RouterLink>
            </td>
            <td class="py-2 pr-3 text-ink-muted">{{ fila.subject ?? '—' }}</td>
            <td class="py-2 pr-3 text-ink-muted">{{ fila.period ?? '—' }}</td>
            <td class="py-2 pr-3 text-right tabular-nums">{{ fila.students }}</td>
            <td class="py-2 pr-3 text-right">
              <span class="flex items-center justify-end gap-2">
                <span class="tabular-nums text-ink-muted">
                  {{ fila.passed }}/{{ fila.students }}
                </span>
                <BaseBadge :tone="tono(fila.passRate)">
                  {{ n(fila.passRate / 100, 'percent') }}
                </BaseBadge>
              </span>
            </td>
            <td class="py-2 text-right tabular-nums">
              {{ n(fila.averagePercentage / 100, 'percent') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </BaseCard>
</template>
