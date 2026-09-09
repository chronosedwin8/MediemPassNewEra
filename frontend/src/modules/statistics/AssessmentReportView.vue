<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';
import ProgressBar from '@/design-system/ProgressBar.vue';

/**
 * Resultados de una evaluación, grupo por grupo.
 *
 * Responde a lo que un docente se pregunta al día siguiente de aplicar algo:
 * cómo fue en 10A frente a 10B, y qué pregunta falló todo el mundo. El panel
 * general responde a «cómo va el colegio», que es otra pregunta y no sirve para
 * decidir qué repasar mañana.
 *
 * La columna que más importa es «sin empezar»: una media del 40 % con la mitad
 * del curso sin abrir la evaluación no dice nada sobre la clase, y sin ese dato
 * cualquiera leería la media como si lo dijera.
 */

interface GroupResult {
  groupId: string;
  code: string;
  assigned: number;
  submitted: number;
  pendingReview: number;
  inProgress: number;
  notStarted: number;
  averagePercentage: number;
  passRate: number;
  bands: Array<{ label: string; count: number }>;
}

interface HardQuestion {
  questionId: string;
  versionNumber: number;
  position: number;
  statement: string;
  competencyCode: string;
  correctRate: number;
  answered: number;
}

interface Report {
  assessmentId: string;
  title: string;
  versions: Array<{ id: string; versionNumber: number; status: string }>;
  totals: { assigned: number; submitted: number; averagePercentage: number; passRate: number };
  groups: GroupResult[];
  hardestQuestions: HardQuestion[];
}

const route = useRoute();
const { t, n } = useI18n();

const report = ref<Report | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    report.value = await http.get<Report>(`/statistics/assessments/${route.params['id']}`);
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : t('errors.generic');
  } finally {
    loading.value = false;
  }
});

const hasResults = computed(() => (report.value?.totals.submitted ?? 0) > 0);

/**
 * Si hay más de una versión con resultados.
 *
 * Solo entonces se muestra el número de versión junto a la pregunta: con una
 * sola versión sería una columna de «v1» repetida que no informa de nada.
 */
const hasSeveralVersions = computed(
  () => new Set(report.value?.hardestQuestions.map((q) => q.versionNumber)).size > 1,
);

/**
 * Color de la tasa de aprobación.
 *
 * Nunca es la única señal: el número siempre está al lado. Un docente con
 * daltonismo tiene que poder leer la tabla igual de bien.
 */
function passTone(rate: number): 'success' | 'warning' | 'danger' {
  if (rate >= 70) return 'success';
  if (rate >= 50) return 'warning';
  return 'danger';
}
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <EmptyState v-else-if="error" :title="error" />

  <div v-else-if="report" class="flex flex-col gap-5">
    <header>
      <RouterLink
        :to="`/assessments/${report.assessmentId}`"
        class="text-sm text-ink-muted hover:underline"
      >
        &#8592; {{ t('assessment.backToDetail') }}
      </RouterLink>
      <h1 class="mt-1 text-2xl font-semibold">{{ report.title }}</h1>
      <p class="mt-1 text-sm text-ink-muted">{{ t('report.intro') }}</p>
    </header>

    <!-- Totales -->
    <BaseCard>
      <dl class="grid gap-4 sm:grid-cols-4">
        <div>
          <dt class="text-xs text-ink-subtle">{{ t('report.assigned') }}</dt>
          <dd class="text-2xl font-semibold tabular-nums">{{ report.totals.assigned }}</dd>
        </div>
        <div>
          <dt class="text-xs text-ink-subtle">{{ t('report.submitted') }}</dt>
          <dd class="text-2xl font-semibold tabular-nums">{{ report.totals.submitted }}</dd>
        </div>
        <div>
          <dt class="text-xs text-ink-subtle">{{ t('report.average') }}</dt>
          <dd class="text-2xl font-semibold tabular-nums">
            {{ n(report.totals.averagePercentage / 100, 'percent') }}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-ink-subtle">{{ t('report.passRate') }}</dt>
          <dd class="text-2xl font-semibold tabular-nums">
            {{ n(report.totals.passRate / 100, 'percent') }}
          </dd>
        </div>
      </dl>
    </BaseCard>

    <EmptyState v-if="!hasResults" :title="t('report.noResults')" />

    <template v-else>
      <!-- Por grupo -->
      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">{{ t('report.byGroup') }}</h2>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[46rem] text-sm">
            <caption class="sr-only">
              {{
                t('report.byGroup')
              }}
            </caption>
            <thead>
              <tr
                class="border-b border-border text-left text-xs uppercase tracking-wide text-ink-subtle"
              >
                <th class="pb-2 pr-4 font-medium">{{ t('group.title') }}</th>
                <th class="pb-2 pr-4 text-right font-medium">{{ t('report.assigned') }}</th>
                <th class="pb-2 pr-4 text-right font-medium">{{ t('report.submitted') }}</th>
                <th class="pb-2 pr-4 text-right font-medium">{{ t('report.notStarted') }}</th>
                <th class="pb-2 pr-4 text-right font-medium">{{ t('report.pending') }}</th>
                <th class="pb-2 pr-4 text-right font-medium">{{ t('report.average') }}</th>
                <th class="pb-2 font-medium">{{ t('report.passRate') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="group in report.groups"
                :key="group.groupId"
                class="border-b border-border/50"
              >
                <td class="py-2 pr-4 font-medium">
                  <RouterLink :to="`/groups/${group.groupId}`" class="hover:underline">
                    {{ group.code }}
                  </RouterLink>
                </td>
                <td class="py-2 pr-4 text-right tabular-nums">{{ group.assigned }}</td>
                <td class="py-2 pr-4 text-right tabular-nums">{{ group.submitted }}</td>
                <td
                  class="py-2 pr-4 text-right tabular-nums"
                  :class="group.notStarted > 0 ? 'font-medium text-warning' : 'text-ink-subtle'"
                >
                  {{ group.notStarted }}
                </td>
                <td class="py-2 pr-4 text-right tabular-nums text-ink-muted">
                  {{ group.pendingReview }}
                </td>
                <td class="py-2 pr-4 text-right tabular-nums">
                  {{ n(group.averagePercentage / 100, 'percent') }}
                </td>
                <td class="py-2">
                  <span class="flex items-center gap-2">
                    <BaseBadge :tone="passTone(group.passRate)">
                      {{ n(group.passRate / 100, 'percent') }}
                    </BaseBadge>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!--
          La distribución por banda muestra la forma del curso. Dos grupos con
          la misma media pueden ser uno homogéneo y otro partido en dos, y eso
          se enseña de maneras distintas.
        -->
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <BaseCard v-for="group in report.groups" :key="`bands-${group.groupId}`">
            <h3 class="text-sm font-semibold">{{ group.code }}</h3>
            <ul v-if="group.bands.length > 0" class="mt-2 flex flex-col gap-1.5">
              <li v-for="band in group.bands" :key="band.label" class="flex items-center gap-2">
                <span class="w-28 shrink-0 truncate text-xs text-ink-muted">{{ band.label }}</span>
                <ProgressBar
                  class="flex-1"
                  :value="band.count"
                  :max="group.submitted"
                  :label="band.label"
                />
                <span class="w-6 shrink-0 text-right text-xs tabular-nums">{{ band.count }}</span>
              </li>
            </ul>
            <p v-else class="mt-2 text-xs text-ink-subtle">{{ t('report.noResults') }}</p>
          </BaseCard>
        </div>
      </section>

      <!-- Preguntas más falladas -->
      <section v-if="report.hardestQuestions.length > 0" class="flex flex-col gap-3">
        <div>
          <h2 class="text-lg font-semibold">{{ t('report.hardest') }}</h2>
          <p class="mt-1 max-w-2xl text-sm text-ink-muted">{{ t('report.hardestHint') }}</p>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[40rem] text-sm">
            <caption class="sr-only">
              {{
                t('report.hardest')
              }}
            </caption>
            <thead>
              <tr
                class="border-b border-border text-left text-xs uppercase tracking-wide text-ink-subtle"
              >
                <th class="pb-2 pr-4 font-medium">#</th>
                <th class="pb-2 pr-4 font-medium">{{ t('question.statement') }}</th>
                <th class="pb-2 pr-4 font-medium">{{ t('kmk.competency') }}</th>
                <th class="pb-2 pr-4 text-right font-medium">{{ t('report.correctRate') }}</th>
                <th class="pb-2 text-right font-medium">{{ t('report.answered') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="question in report.hardestQuestions"
                :key="question.questionId"
                class="border-b border-border/50"
              >
                <td class="py-2 pr-4 tabular-nums text-ink-subtle">
                  {{ question.position }}
                  <span v-if="hasSeveralVersions" class="text-xs">
                    · v{{ question.versionNumber }}
                  </span>
                </td>
                <td class="max-w-md py-2 pr-4">
                  <span class="line-clamp-2">{{ question.statement }}</span>
                </td>
                <td class="py-2 pr-4 text-ink-muted">{{ question.competencyCode }}</td>
                <td class="py-2 pr-4 text-right tabular-nums">
                  <BaseBadge :tone="passTone(question.correctRate)">
                    {{ n(question.correctRate / 100, 'percent') }}
                  </BaseBadge>
                </td>
                <td class="py-2 text-right tabular-nums text-ink-muted">{{ question.answered }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
