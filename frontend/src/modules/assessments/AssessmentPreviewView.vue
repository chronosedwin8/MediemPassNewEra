<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { localize, type Answer, type LocalizedText, type QuestionType } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';
import RichTextView from '@/design-system/RichTextView.vue';
import QuestionRenderer from '@/modules/attempts/questions/QuestionRenderer.vue';
import SolutionPanel from './SolutionPanel.vue';

/**
 * Previsualización de una evaluación antes de publicarla.
 *
 * Entre escribir una evaluación y publicarla no había ningún momento en que el
 * docente viera lo que va a ver su clase. Con las generadas por IA hace más
 * falta todavía: nadie escribió esas preguntas y alguien tiene que leerlas
 * antes de que lleguen a un estudiante.
 *
 * Dos decisiones sostienen que esto diga la verdad:
 *
 *  1. **Se usa `QuestionRenderer`**, el mismo componente del examen real. Una
 *     previsualización dibujada con componentes propios se parecería al
 *     principio y dejaría de parecerse en la primera corrección que solo se
 *     aplicara a uno de los dos.
 *  2. **El servidor poda las soluciones con la misma función que el motor.** No
 *     hay aquí ninguna idea propia sobre qué ocultar.
 *
 * Las respuestas que se escriban aquí no se guardan en ninguna parte: el estado
 * vive en memoria y se pierde al salir. Es una prueba, no un intento.
 */

interface PreviewQuestion {
  id: string;
  type: QuestionType;
  statement: string;
  instructions: string | null;
  points: number;
  position: number;
  mediaUrl: string | null;
  payload: Record<string, unknown>;
  allowsEvidence: boolean;
  requiresEvidence: boolean;
  maxEvidenceFiles: number;
  competency: { id: string; code: string; name: LocalizedText; color: string };
  solution: {
    payload: Record<string, unknown>;
    feedbackCorrect: string | null;
    feedbackIncorrect: string | null;
    explanation: string | null;
  } | null;
}

interface Preview {
  assessmentId: string;
  versionId: string;
  versionNumber: number;
  status: string;
  title: string;
  name: string;
  instructions: string | null;
  timeLimitMinutes: number | null;
  questionCount: number;
  totalPoints: number;
  questions: PreviewQuestion[];
}

const route = useRoute();
const { t, locale } = useI18n();

const preview = ref<Preview | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const showSolutions = ref(false);

/**
 * Las respuestas de prueba, solo en memoria.
 *
 * Poder responder importa: es la única forma de comprobar que una pregunta de
 * ordenar se puede arrastrar de verdad o que un desplegable tiene las opciones
 * que debe. Nada de esto se envía a ningún sitio.
 */
const answers = ref<Map<string, Answer>>(new Map());

const versionId = computed(() => route.params['versionId'] as string);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;

  try {
    preview.value = await http.get<Preview>(`/assessments/versions/${versionId.value}/preview`, {
      withSolutions: showSolutions.value,
    });
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : t('errors.generic');
  } finally {
    loading.value = false;
  }
}

// Cambiar de modo vuelve a pedir los datos: las soluciones no están en el
// cliente esperando a que alguien las muestre, se piden cuando se necesitan.
watch([versionId, showSolutions], load, { immediate: true });

function onAnswer(questionId: string, answer: Answer): void {
  answers.value = new Map(answers.value).set(questionId, answer);
}

const statusTone = (status: string): 'success' | 'warning' | 'neutral' =>
  status === 'PUBLISHED' ? 'success' : status === 'DRAFT' ? 'warning' : 'neutral';
</script>

<template>
  <BaseSpinner v-if="loading && !preview" size="lg" />

  <EmptyState v-else-if="error" :title="error" />

  <div v-else-if="preview" class="flex flex-col gap-5">
    <header class="flex flex-col gap-3">
      <RouterLink
        :to="`/assessments/${preview.assessmentId}`"
        class="text-sm text-ink-muted hover:underline"
      >
        &#8592; {{ t('assessment.backToDetail') }}
      </RouterLink>

      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-2xl font-semibold">{{ preview.title }}</h1>
            <BaseBadge :tone="statusTone(preview.status)">
              {{
                preview.status === 'PUBLISHED' ? t('assessment.published') : t('assessment.draft')
              }}
            </BaseBadge>
            <BaseBadge tone="neutral">
              {{ t('assessment.version', { number: preview.versionNumber }) }}
            </BaseBadge>
          </div>

          <p class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span>{{ t('assessment.questionCount', { count: preview.questionCount }) }}</span>
            <span>{{ t('assessment.totalPoints', { points: preview.totalPoints }) }}</span>
            <span>
              {{
                preview.timeLimitMinutes
                  ? t('assessment.timeLimitMinutes', { minutes: preview.timeLimitMinutes })
                  : t('assessment.noTimeLimit')
              }}
            </span>
          </p>
        </div>

        <!--
          El interruptor es lo que hace útil esta pantalla para revisar lo que
          escribió la IA: sin él se ve cómo queda, pero no si está bien.
        -->
        <label
          class="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2"
        >
          <input v-model="showSolutions" type="checkbox" class="size-4 accent-brand-600" />
          <span class="text-sm font-medium">{{ t('preview.showSolutions') }}</span>
        </label>
      </div>

      <p class="rounded-md border border-info/30 bg-info-soft px-3 py-2 text-sm text-info">
        {{ t('preview.notice') }}
      </p>

      <RichTextView
        v-if="preview.instructions"
        :html="preview.instructions"
        class="text-sm text-ink-muted"
      />
    </header>

    <EmptyState v-if="preview.questions.length === 0" :title="t('question.empty')" />

    <ol v-else class="flex flex-col gap-5">
      <li v-for="(question, index) in preview.questions" :key="question.id">
        <BaseCard class="flex flex-col gap-4">
          <header class="flex flex-col gap-2">
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="font-medium text-ink-subtle">
                {{ t('preview.questionNumber', { number: index + 1 }) }}
              </span>
              <span
                class="rounded-full px-2 py-0.5 font-medium"
                :style="{
                  backgroundColor: `${question.competency.color}1a`,
                  color: question.competency.color,
                }"
              >
                KMK {{ question.competency.code }} ·
                {{ localize(question.competency.name, locale as never) }}
              </span>
              <span class="text-ink-subtle">
                {{ t('assessment.totalPoints', { points: question.points }) }}
              </span>
              <BaseBadge v-if="question.allowsEvidence" tone="info">
                {{ question.requiresEvidence ? t('evidence.required') : t('evidence.title') }}
              </BaseBadge>
            </div>

            <RichTextView :html="question.statement" class="text-lg font-medium" />

            <RichTextView
              v-if="question.instructions"
              :html="question.instructions"
              compact
              class="text-sm text-ink-muted"
            />

            <img
              v-if="question.mediaUrl"
              :src="question.mediaUrl"
              alt=""
              class="max-h-80 rounded-lg border border-border object-contain"
            />
          </header>

          <!--
            El mismo componente que dibuja el examen real. Es lo que hace que
            esta pantalla sirva para algo: si aquí se ve bien, allí también.
          -->
          <QuestionRenderer
            :question-id="question.id"
            :type="question.type"
            :payload="question.payload"
            :model-value="answers.get(question.id) ?? null"
            @update:model-value="onAnswer(question.id, $event)"
          />

          <p v-if="question.allowsEvidence" class="text-xs text-ink-subtle">
            {{ t('preview.evidenceHint', { count: question.maxEvidenceFiles }) }}
          </p>

          <SolutionPanel
            v-if="question.solution"
            :type="question.type"
            :solution="question.solution"
          />
        </BaseCard>
      </li>
    </ol>
  </div>
</template>
