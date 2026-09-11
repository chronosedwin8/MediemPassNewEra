<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { LocalizedText } from '@medienpass/shared';
import { http } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import KmkChart from '@/modules/statistics/KmkChart.vue';
import StatTile from './StatTile.vue';

/**
 * Panel del estudiante.
 *
 * Todas las cifras salen de una única llamada al servidor. La versión anterior
 * las sumaba aquí a partir de la lista de asignaciones, y eso hacía que el
 * promedio del panel pudiera no coincidir con el de la pantalla de
 * estadísticas: dos cifras distintas del mismo dato, que es exactamente lo que
 * hace que nadie vuelva a fiarse de ninguna.
 */

interface Competency {
  competencyId: string;
  code: string;
  name: LocalizedText;
  color: string;
  percentage: number;
  answerCount: number;
}

interface Panel {
  assignments: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    expired: number;
    completionRate: number;
  };
  attempts: {
    submitted: number;
    averagePercentage: number;
    averageGrade: number | null;
    passRate: number;
    pendingReview: number;
  };
  time: { totalSeconds: number; averageSecondsPerAttempt: number | null; measuredAttempts: number };
  standing: {
    groupCode: string;
    groupSize: number;
    rankedStudents: number;
    position: number;
    studentAverage: number;
    groupAverage: number;
    percentile: number;
  } | null;
  competencies: Competency[];
  recent: Array<{
    attemptId: string;
    title: string;
    percentage: number;
    gradeValue: number | null;
    passed: boolean;
    submittedAt: string | null;
    durationSeconds: number | null;
  }>;
}

const { t, n, d } = useI18n();

const panel = ref<Panel | null>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    panel.value = await http.get<Panel>('/statistics/panel/student');
  } finally {
    loading.value = false;
  }
});

/**
 * Duración en palabras.
 *
 * En horas y minutos, no en «5400 s»: nadie mide su tarde en segundos. Por
 * debajo de un minuto se dice «menos de un minuto» en lugar de «0 min», que
 * parece un fallo.
 */
function humanDuration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '—';
  if (seconds < 60) return `< 1 min`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Cómo va respecto al grupo, en una frase y no solo en un número. */
const standingTone = computed(() => {
  const standing = panel.value?.standing;
  if (!standing) return null;

  const difference = standing.studentAverage - standing.groupAverage;
  // Un punto porcentual arriba o abajo no es «ir por encima»: es ruido.
  if (Math.abs(difference) < 1) return { key: 'atGroup', tone: 'info' as const };
  return difference > 0
    ? { key: 'aboveGroup', tone: 'success' as const }
    : { key: 'belowGroup', tone: 'warning' as const };
});

const measured = computed(() => panel.value?.competencies.filter((c) => c.answerCount > 0) ?? []);
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else-if="panel" class="flex flex-col gap-6">
    <!-- Qué llevo hecho y qué me falta. -->
    <section class="flex flex-col gap-3">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-ink-subtle">
        {{ t('dashboard.student.activity') }}
      </h3>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          :label="t('dashboard.student.completionRate')"
          :value="n(panel.assignments.completionRate / 100, 'percent')"
          :hint="`${panel.assignments.completed} / ${panel.assignments.total}`"
        />
        <StatTile
          :label="t('dashboard.student.notStarted')"
          :value="panel.assignments.notStarted"
          :tone="panel.assignments.notStarted > 0 ? 'warning' : 'default'"
        />
        <StatTile
          :label="t('dashboard.student.inProgress')"
          :value="panel.assignments.inProgress"
        />
        <StatTile
          :label="t('dashboard.student.expired')"
          :value="panel.assignments.expired"
          :tone="panel.assignments.expired > 0 ? 'danger' : 'default'"
        />
      </div>
    </section>

    <!-- Cómo me ha ido. -->
    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        :label="t('dashboard.student.gradeAverage')"
        :value="
          panel.attempts.averageGrade === null ? '—' : n(panel.attempts.averageGrade, 'grade')
        "
        :hint="t('dashboard.student.gradeAverageHint')"
      />
      <StatTile
        :label="t('dashboard.student.average')"
        :value="n(panel.attempts.averagePercentage / 100, 'percent')"
      />
      <StatTile
        :label="t('dashboard.student.passRate')"
        :value="n(panel.attempts.passRate / 100, 'percent')"
        :hint="`${panel.attempts.submitted} ${t('dashboard.student.completed').toLowerCase()}`"
      />
      <StatTile
        :label="t('dashboard.student.pendingReview')"
        :value="panel.attempts.pendingReview"
        :tone="panel.attempts.pendingReview > 0 ? 'warning' : 'default'"
      />
    </section>

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Tiempo. Se dice exactamente qué se está midiendo. -->
      <BaseCard :title="t('dashboard.student.timeTitle')">
        <div class="grid gap-4 sm:grid-cols-2">
          <StatTile
            :label="t('dashboard.student.timeTotal')"
            :value="humanDuration(panel.time.totalSeconds)"
          />
          <StatTile
            :label="t('dashboard.student.timeAverage')"
            :value="humanDuration(panel.time.averageSecondsPerAttempt)"
          />
        </div>
        <p class="mt-3 text-xs text-ink-subtle">{{ t('dashboard.student.timeHint') }}</p>
      </BaseCard>

      <!-- Puesto en el grupo. -->
      <BaseCard :title="t('dashboard.student.standing')">
        <template v-if="panel.standing">
          <p class="text-2xl font-semibold tabular-nums">
            {{
              t('dashboard.student.position', {
                position: panel.standing.position,
                total: panel.standing.rankedStudents,
              })
            }}
          </p>
          <!--
            Se dice sobre cuánta gente se calcula el puesto. «Puesto 6 de 6» en
            un curso de treinta y dos suena a último de la clase, y lo que dice
            en realidad es que solo seis han entregado algo todavía.
          -->
          <p class="mt-1 text-sm text-ink-muted">
            {{ panel.standing.groupCode }} ·
            {{
              t('dashboard.student.standingBase', {
                ranked: panel.standing.rankedStudents,
                size: panel.standing.groupSize,
              })
            }}
          </p>
          <p class="mt-1 text-xs text-ink-subtle">{{ t('dashboard.student.positionHint') }}</p>

          <div class="mt-4 flex flex-wrap items-center gap-4">
            <span class="text-sm">
              {{ t('dashboard.student.yourAverage') }}:
              <span class="font-medium tabular-nums">
                {{ n(panel.standing.studentAverage / 100, 'percent') }}
              </span>
            </span>
            <span class="text-sm">
              {{ t('dashboard.student.groupAverage') }}:
              <span class="font-medium tabular-nums">
                {{ n(panel.standing.groupAverage / 100, 'percent') }}
              </span>
            </span>
            <BaseBadge v-if="standingTone" :tone="standingTone.tone">
              {{ t(`dashboard.student.${standingTone.key}`) }}
            </BaseBadge>
          </div>
        </template>

        <p v-else class="text-sm text-ink-muted">{{ t('dashboard.student.noStanding') }}</p>
      </BaseCard>
    </div>

    <!-- Competencias: lo que de verdad se está midiendo aquí. -->
    <BaseCard v-if="measured.length > 0" :title="t('result.byCompetency')">
      <KmkChart :competencies="panel.competencies" />
    </BaseCard>

    <BaseCard :title="t('dashboard.student.recent')">
      <p v-if="panel.recent.length === 0" class="text-sm text-ink-muted">
        {{ t('dashboard.student.noRecent') }}
      </p>

      <ul v-else class="flex flex-col divide-y divide-border">
        <li
          v-for="entry in panel.recent"
          :key="entry.attemptId"
          class="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
        >
          <RouterLink
            :to="`/results/${entry.attemptId}`"
            class="text-sm font-medium hover:underline"
          >
            {{ entry.title }}
          </RouterLink>
          <span class="flex items-center gap-3 text-sm">
            <span v-if="entry.submittedAt" class="text-xs text-ink-subtle">
              {{ d(new Date(entry.submittedAt), 'short') }}
            </span>
            <span class="text-xs text-ink-subtle">
              {{ humanDuration(entry.durationSeconds) }}
            </span>
            <span class="tabular-nums">{{ n(entry.percentage / 100, 'percent') }}</span>
            <BaseBadge :tone="entry.passed ? 'success' : 'danger'">
              {{ entry.gradeValue === null ? '—' : n(entry.gradeValue, 'grade') }}
            </BaseBadge>
          </span>
        </li>
      </ul>
    </BaseCard>
  </div>
</template>
