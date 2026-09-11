<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { localize, type LocalizedText } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import ProgressBar from '@/design-system/ProgressBar.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import StarRating from '@/design-system/StarRating.vue';
import { useToast } from '@/composables/useToast';

/**
 * Resultado de un intento.
 *
 * Muestra la nota en la escala configurada, el desglose por competencia KMK y
 * la retroalimentación, siempre que la evaluación lo permita. Las estrellas
 * nunca aparecen solas: van con el número, la etiqueta y la explicación de que
 * la escala está invertida.
 */

interface CompetencyBreakdown {
  competencyId: string;
  code: string;
  name: LocalizedText;
  color: string;
  pointsEarned: number;
  pointsPossible: number;
  percentage: number;
  questionCount: number;
}

interface AttemptResult {
  attemptId: string;
  status: string;
  pointsEarned: number;
  pointsPossible: number;
  percentage: number;
  passed: boolean;
  passingPercentage: number;
  grade: { value: number; label: LocalizedText | null } | null;
  stars: { filled: number; total: number } | null;
  requiresManualGrading: boolean;
  durationSeconds: number | null;
  /** Lo decide el servidor: la evaluación emite diploma y este intento lo ganó. */
  certificateAvailable: boolean;
  competencyBreakdown: CompetencyBreakdown[];
  feedback: Array<{
    questionId: string;
    statement: string;
    isCorrect: boolean | null;
    pointsEarned: number;
    pointsPossible: number;
    feedback: string | null;
    explanation: string | null;
    teacherFeedback: string | null;
  }> | null;
}

const route = useRoute();
const { t, n, locale } = useI18n();
const toast = useToast();

const downloading = ref(false);

/**
 * Descarga del diploma.
 *
 * Se pide con la sesión puesta y se guarda desde un blob en lugar de abrir la
 * dirección en una pestaña: la API se autentica con la cabecera, no con una
 * cookie, así que un enlace directo llegaría sin identificar y el servidor
 * respondería que no existe.
 */
async function downloadCertificate(): Promise<void> {
  if (!result.value) return;

  downloading.value = true;
  try {
    const { blob, filename } = await http.download(
      `/attempts/${result.value.attemptId}/certificate`,
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename ?? 'diploma.pdf';
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    downloading.value = false;
  }
}

const result = ref<AttemptResult | null>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    result.value = await http.get<AttemptResult>(`/attempts/${route.params.attemptId}/result`);
  } finally {
    loading.value = false;
  }
});

function duration(seconds: number | null): string {
  if (seconds === null) return '—';
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${seconds % 60} s`;
}

const localizedLabel = (text: LocalizedText | null): string =>
  text ? localize(text, locale.value as never) : '';
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else-if="result" class="flex flex-col gap-6">
    <!-- Resultado principal -->
    <BaseCard>
      <div class="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-3">
            <h2 class="text-2xl font-semibold">{{ t('result.title') }}</h2>
            <BaseBadge :tone="result.passed ? 'success' : 'danger'">
              {{ result.passed ? t('result.passed') : t('result.notPassed') }}
            </BaseBadge>
          </div>

          <!--
            El diploma solo aparece cuando de verdad se puede descargar. Un
            botón que al pulsarlo explica por qué no se puede es peor que no
            tener botón: promete algo y luego lo niega.
          -->
          <div v-if="result.certificateAvailable" class="flex flex-col gap-1">
            <BaseButton class="w-fit" :loading="downloading" @click="downloadCertificate">
              {{ t('result.downloadCertificate') }}
            </BaseButton>
            <span class="text-xs text-ink-subtle">{{ t('result.certificateHint') }}</span>
          </div>

          <dl class="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <dt class="text-ink-muted">{{ t('result.score') }}</dt>
              <dd class="font-medium tabular-nums">
                {{
                  t('result.pointsOf', {
                    earned: result.pointsEarned,
                    possible: result.pointsPossible,
                  })
                }}
              </dd>
            </div>
            <div>
              <dt class="text-ink-muted">{{ t('result.percentage') }}</dt>
              <dd class="font-medium tabular-nums">{{ n(result.percentage / 100, 'percent') }}</dd>
            </div>
            <div>
              <dt class="text-ink-muted">{{ t('result.duration') }}</dt>
              <dd class="font-medium tabular-nums">{{ duration(result.durationSeconds) }}</dd>
            </div>
          </dl>
        </div>

        <!--
          La escala alemana: estrellas acompañadas del valor, la etiqueta y la
          leyenda que aclara que menos es mejor.
        -->
        <div v-if="result.grade" class="sm:text-right">
          <StarRating
            :filled="result.stars?.filled ?? 0"
            :total="result.stars?.total ?? 5"
            :value="result.grade.value"
            :label="localizedLabel(result.grade.label)"
            :worst-value="6"
            size="lg"
          />
        </div>

        <!-- Escala porcentual (docentes): sin estrellas, el porcentaje es la nota. -->
        <div v-else class="sm:text-right">
          <p class="text-4xl font-semibold tabular-nums">
            {{ n(result.percentage / 100, 'percent') }}
          </p>
          <p class="mt-1 text-xs text-ink-subtle">
            {{ t('result.passed') }} ≥ {{ n(result.passingPercentage / 100, 'percent') }}
          </p>
        </div>
      </div>

      <p
        v-if="result.requiresManualGrading"
        class="mt-5 rounded-md border border-info/30 bg-info-soft px-3 py-2 text-sm text-info"
      >
        <strong>{{ t('result.pendingReview') }}.</strong> {{ t('result.pendingReviewHint') }}
      </p>
    </BaseCard>

    <!-- Desglose por competencia KMK -->
    <BaseCard :title="t('result.byCompetency')">
      <ul class="flex flex-col gap-4">
        <li
          v-for="entry in result.competencyBreakdown"
          :key="entry.competencyId"
          class="flex flex-col gap-1.5"
        >
          <div class="flex items-baseline justify-between gap-4">
            <p class="text-sm font-medium">
              <span class="text-ink-muted">KMK {{ entry.code }}</span>
              · {{ localize(entry.name, locale as never) }}
            </p>
            <p class="shrink-0 text-sm tabular-nums">
              {{ n(entry.percentage / 100, 'percent') }}
              <span class="text-ink-subtle">
                ({{ entry.pointsEarned }}/{{ entry.pointsPossible }})
              </span>
            </p>
          </div>
          <ProgressBar
            :value="entry.percentage"
            :tone="entry.percentage >= result.passingPercentage ? 'success' : 'brand'"
            :label="`KMK ${entry.code}`"
          />
        </li>
      </ul>
    </BaseCard>

    <!-- Retroalimentación pregunta a pregunta -->
    <BaseCard v-if="result.feedback" :title="t('result.feedback')">
      <ol class="flex flex-col gap-5">
        <li
          v-for="(item, index) in result.feedback"
          :key="item.questionId"
          class="flex flex-col gap-2 border-l-2 pl-4"
          :class="
            item.isCorrect === true
              ? 'border-success'
              : item.isCorrect === false
                ? 'border-danger'
                : 'border-border-strong'
          "
        >
          <div class="flex items-start justify-between gap-4">
            <p class="text-sm font-medium">{{ index + 1 }}. {{ item.statement }}</p>
            <BaseBadge
              class="shrink-0"
              :tone="
                item.isCorrect === true
                  ? 'success'
                  : item.isCorrect === false
                    ? 'danger'
                    : 'neutral'
              "
            >
              {{ item.pointsEarned }}/{{ item.pointsPossible }}
            </BaseBadge>
          </div>

          <p v-if="item.feedback" class="text-sm text-ink-muted">{{ item.feedback }}</p>
          <p v-if="item.explanation" class="text-sm text-ink-subtle">{{ item.explanation }}</p>

          <p v-if="item.teacherFeedback" class="rounded-md bg-surface-muted px-3 py-2 text-sm">
            <span class="font-medium">{{ t('result.teacherFeedback') }}:</span>
            {{ item.teacherFeedback }}
          </p>
        </li>
      </ol>
    </BaseCard>

    <RouterLink to="/my-assessments" class="text-sm text-brand-600 hover:underline">
      ← {{ t('nav.myAssessments') }}
    </RouterLink>
  </div>
</template>
