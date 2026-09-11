<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { localize, type LocalizedText } from '@medienpass/shared';
import { http } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import ProgressBar from '@/design-system/ProgressBar.vue';
import KmkChart from '@/modules/statistics/KmkChart.vue';
import StatTile from './StatTile.vue';

/**
 * Panel del docente.
 *
 * Dos mitades separadas a propósito: lo que enseña y lo que aprende. La media
 * de un curso puede decir muchas cosas y casi ninguna es un juicio sobre quien
 * lo imparte; mezclarla con la capacitación propia —que sí es sobre él— las
 * haría leerse como la misma cosa.
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
  authoring: {
    assessmentsCreated: number;
    published: number;
    drafts: number;
    questionsWritten: number;
    competenciesCovered: number;
    competenciesTotal: number;
  };
  delivery: {
    assignmentsIssued: number;
    studentsReached: number;
    attemptsReceived: number;
    notStarted: number;
    completionRate: number;
  };
  grading: { pendingReview: number; oldestPendingDays: number | null; answersGraded: number };
  outcomes: {
    averagePercentage: number;
    passRate: number;
    byGroup: Array<{ groupId: string; code: string; attempts: number; averagePercentage: number }>;
  };
  competencies: Competency[];
  training: {
    totalModules: number;
    completedModules: number;
    certifiedModules: number;
    completionRate: number;
    averageAssessmentPercentage: number | null;
    byCompetency: Array<{
      competencyCode: string;
      competencyName: LocalizedText;
      status: string;
      assessmentPercentage: number | null;
      assessmentPassed: boolean | null;
    }>;
  };
}

const { t, locale, n } = useI18n();

const panel = ref<Panel | null>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    panel.value = await http.get<Panel>('/statistics/panel/teacher');
  } finally {
    loading.value = false;
  }
});

const measured = computed(() => panel.value?.competencies.filter((c) => c.answerCount > 0) ?? []);

/**
 * Estado de un módulo de capacitación.
 *
 * El mismo criterio y las mismas etiquetas que la lista de capacitación: que
 * un módulo aparezca «intentado» allí y «en curso» aquí sería el tipo de
 * discrepancia que hace dudar de las dos pantallas.
 */
function moduleState(entry: Panel['training']['byCompetency'][number]): {
  key: string;
  tone: 'success' | 'info' | 'warning' | 'neutral';
} {
  if (entry.assessmentPassed) return { key: 'certified', tone: 'success' };
  if (entry.assessmentPercentage !== null) return { key: 'attempted', tone: 'warning' };
  if (entry.status === 'COMPLETED' || entry.status === 'IN_PROGRESS') {
    return { key: 'inProgress', tone: 'info' };
  }
  return { key: 'notStarted', tone: 'neutral' };
}

/** El texto de la espera más larga por corregir, o nada si no hay nada. */
const oldestPending = computed(() => {
  const grading = panel.value?.grading;
  if (!grading || grading.pendingReview === 0) return null;

  const days = grading.oldestPendingDays ?? 0;
  return days < 1
    ? t('dashboard.teacher.oldestPendingToday')
    : t('dashboard.teacher.oldestPending', { days });
});
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else-if="panel" class="flex flex-col gap-6">
    <!-- Lo que ha escrito. -->
    <section class="flex flex-col gap-3">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-ink-subtle">
        {{ t('dashboard.teacher.authoring') }}
      </h3>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          :label="t('dashboard.teacher.assessmentsCreated')"
          :value="panel.authoring.assessmentsCreated"
        />
        <StatTile
          :label="t('dashboard.teacher.publishedVersions')"
          :value="panel.authoring.published"
        />
        <StatTile
          :label="t('dashboard.teacher.questionsWritten')"
          :value="panel.authoring.questionsWritten"
        />
        <!--
          La cobertura de competencias es la cifra que más cambia la práctica:
          enseña de un vistazo que llevas el año midiendo solo dos de las seis.
        -->
        <StatTile
          :label="t('dashboard.teacher.competenciesCovered')"
          :value="
            t('dashboard.teacher.competenciesCoveredValue', {
              covered: panel.authoring.competenciesCovered,
              total: panel.authoring.competenciesTotal,
            })
          "
          :tone="
            panel.authoring.competenciesCovered < panel.authoring.competenciesTotal
              ? 'warning'
              : 'success'
          "
        />
      </div>
    </section>

    <!-- Lo que ha repartido y su corrección. -->
    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        :label="t('dashboard.teacher.studentsReached')"
        :value="panel.delivery.studentsReached"
        :hint="`${panel.delivery.assignmentsIssued} ${t('dashboard.teacher.assignmentsIssued').toLowerCase()}`"
      />
      <StatTile
        :label="t('dashboard.teacher.completionRate')"
        :value="n(panel.delivery.completionRate / 100, 'percent')"
        :hint="`${panel.delivery.attemptsReceived} ${t('dashboard.teacher.attemptsReceived').toLowerCase()}`"
      />
      <StatTile
        :label="t('dashboard.teacher.notStarted')"
        :value="panel.delivery.notStarted"
        :tone="panel.delivery.notStarted > 0 ? 'warning' : 'default'"
      />
      <StatTile
        :label="t('dashboard.teacher.pendingAnswers')"
        :value="panel.grading.pendingReview"
        :hint="oldestPending ?? undefined"
        :tone="panel.grading.pendingReview > 0 ? 'warning' : 'default'"
      />
    </section>

    <!-- Resultados del alumnado. -->
    <BaseCard :title="t('dashboard.teacher.outcomes')">
      <div class="grid gap-4 sm:grid-cols-2">
        <StatTile
          :label="t('dashboard.teacher.average')"
          :value="n(panel.outcomes.averagePercentage / 100, 'percent')"
        />
        <StatTile
          :label="t('dashboard.teacher.passRate')"
          :value="n(panel.outcomes.passRate / 100, 'percent')"
        />
      </div>

      <p class="mt-5 text-sm font-medium">{{ t('dashboard.teacher.byGroup') }}</p>
      <p v-if="panel.outcomes.byGroup.length === 0" class="mt-2 text-sm text-ink-muted">
        {{ t('dashboard.teacher.noGroups') }}
      </p>
      <ul v-else class="mt-2 flex flex-col gap-3">
        <li
          v-for="group in panel.outcomes.byGroup"
          :key="group.groupId"
          class="flex flex-col gap-1"
        >
          <div class="flex items-center justify-between text-sm">
            <RouterLink :to="`/groups/${group.groupId}`" class="font-medium hover:underline">
              {{ group.code }}
            </RouterLink>
            <span class="tabular-nums text-ink-muted">
              {{ n(group.averagePercentage / 100, 'percent') }} · {{ group.attempts }}
            </span>
          </div>
          <ProgressBar :value="group.averagePercentage" :max="100" />
        </li>
      </ul>
    </BaseCard>

    <BaseCard v-if="measured.length > 0" :title="t('result.byCompetency')">
      <KmkChart :competencies="panel.competencies" />
    </BaseCard>

    <!-- Su propia capacitación: la evaluación del docente. -->
    <BaseCard :title="t('dashboard.teacher.training')">
      <p class="text-sm text-ink-muted">{{ t('dashboard.teacher.trainingHint') }}</p>

      <div class="mt-4 grid gap-4 sm:grid-cols-3">
        <StatTile
          :label="t('dashboard.teacher.certified')"
          :value="`${panel.training.certifiedModules} / ${panel.training.totalModules}`"
        />
        <StatTile
          :label="t('training.completionRate')"
          :value="n(panel.training.completionRate / 100, 'percent')"
        />
        <StatTile
          :label="t('dashboard.teacher.trainingAverage')"
          :value="
            panel.training.averageAssessmentPercentage === null
              ? '—'
              : n(panel.training.averageAssessmentPercentage / 100, 'percent')
          "
        />
      </div>

      <p
        v-if="panel.training.averageAssessmentPercentage === null"
        class="mt-3 text-sm text-ink-muted"
      >
        {{ t('dashboard.teacher.trainingPending') }}
      </p>

      <ul class="mt-4 flex flex-col divide-y divide-border">
        <li
          v-for="entry in panel.training.byCompetency"
          :key="entry.competencyCode"
          class="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
        >
          <span class="text-sm">
            <span class="text-ink-muted">KMK {{ entry.competencyCode }}</span>
            · {{ localize(entry.competencyName, locale as never) }}
          </span>
          <span class="flex items-center gap-3 text-sm">
            <span v-if="entry.assessmentPercentage !== null" class="tabular-nums text-ink-muted">
              {{ n(entry.assessmentPercentage / 100, 'percent') }}
            </span>
            <BaseBadge :tone="moduleState(entry).tone">
              {{ t(`training.state.${moduleState(entry).key}`) }}
            </BaseBadge>
          </span>
        </li>
      </ul>

      <RouterLink
        to="/training"
        class="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline"
      >
        {{ t('dashboard.teacher.openTraining') }}
      </RouterLink>
    </BaseCard>
  </div>
</template>
