<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { QUESTION_TYPE, localize, type LocalizedText, type QuestionType } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';
import RichTextView from '@/design-system/RichTextView.vue';
import { useToast } from '@/composables/useToast';

/**
 * Cola de corrección.
 *
 * Antes de esta pantalla el servidor sabía puntuar una respuesta abierta pero
 * no había forma de encontrarla: las redacciones se quedaban pendientes para
 * siempre. Con las preguntas grabadas eso pasaba de incómodo a inservible, así
 * que la cola llega con ellas.
 *
 * Se corrige en el sitio, sin abrir el intento entero: lo que hace falta para
 * puntuar es el enunciado, la respuesta y los puntos en juego, y obligar a
 * navegar por cada intento convierte treinta correcciones en una tarde.
 */

interface PendingAnswer {
  attemptId: string;
  questionId: string;
  answeredAt: string;
  student: { name: string; code: string | null };
  assessment: { id: string; title: string };
  question: {
    statement: string;
    type: QuestionType;
    pointsPossible: number;
    competency: { code: string; name: LocalizedText } | null;
  };
  response: Record<string, unknown> | null;
  media: { fileId: string; contentType: string; sizeBytes: number; url: string } | null;
}

const { t, locale, d, n } = useI18n();
const toast = useToast();

const pending = ref<PendingAnswer[]>([]);
const loading = ref(true);
const savingKey = ref<string | null>(null);

/** Puntos y comentario que el docente está escribiendo, por respuesta. */
const drafts = ref<Map<string, { points: number; feedback: string }>>(new Map());

const keyOf = (item: PendingAnswer): string => `${item.attemptId}:${item.questionId}`;

async function load(): Promise<void> {
  loading.value = true;
  try {
    pending.value = await http.get<PendingAnswer[]>('/attempts/review/pending');
    drafts.value = new Map(pending.value.map((item) => [keyOf(item), { points: 0, feedback: '' }]));
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function draftFor(item: PendingAnswer): { points: number; feedback: string } {
  return drafts.value.get(keyOf(item)) ?? { points: 0, feedback: '' };
}

function updateDraft(item: PendingAnswer, patch: Partial<{ points: number; feedback: string }>) {
  drafts.value.set(keyOf(item), { ...draftFor(item), ...patch });
}

async function submit(item: PendingAnswer): Promise<void> {
  const draft = draftFor(item);
  savingKey.value = keyOf(item);

  try {
    await http.post(`/attempts/${item.attemptId}/answers/${item.questionId}/grade`, {
      points: draft.points,
      feedback: draft.feedback.trim() || null,
    });

    // Se retira de la lista en lugar de recargarla entera: recargar movería
    // de sitio lo que el docente estaba mirando.
    pending.value = pending.value.filter((entry) => keyOf(entry) !== keyOf(item));
    toast.success(t('review.graded'));
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    savingKey.value = null;
  }
}

/** El texto escrito, cuando la respuesta es de las que se escriben. */
function writtenAnswer(item: PendingAnswer): string | null {
  const text = item.response?.['text'];
  return typeof text === 'string' && text.trim().length > 0 ? text : null;
}

const isVideo = (item: PendingAnswer): boolean =>
  item.question.type === QUESTION_TYPE.VIDEO_RESPONSE;
const isAudio = (item: PendingAnswer): boolean =>
  item.question.type === QUESTION_TYPE.AUDIO_RESPONSE;
const isPhoto = (item: PendingAnswer): boolean => item.question.type === QUESTION_TYPE.SELFIE;

const inputClass =
  'h-9 w-24 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <div class="flex flex-col gap-5">
    <BaseSpinner v-if="loading" size="lg" />

    <EmptyState
      v-else-if="pending.length === 0"
      :title="t('review.empty')"
      :description="t('review.emptyHint')"
    />

    <template v-else>
      <p class="text-sm text-ink-muted">{{ t('review.intro', { count: pending.length }) }}</p>

      <BaseCard v-for="item in pending" :key="keyOf(item)">
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p class="font-medium">{{ item.student.name }}</p>
              <p class="text-xs text-ink-subtle">
                {{ item.assessment.title }} · {{ d(new Date(item.answeredAt), 'short') }}
              </p>
            </div>
            <BaseBadge v-if="item.question.competency" tone="info">
              KMK {{ item.question.competency.code }} ·
              {{ localize(item.question.competency.name, locale as never) }}
            </BaseBadge>
          </div>

          <RichTextView :html="item.question.statement" class="text-sm" />

          <!-- La respuesta. Una grabación se reproduce aquí mismo. -->
          <div class="rounded-lg border border-border bg-surface-muted p-3">
            <video
              v-if="isVideo(item) && item.media"
              :src="item.media.url"
              controls
              playsinline
              class="max-h-80 w-full rounded-md bg-ink"
            />
            <audio
              v-else-if="isAudio(item) && item.media"
              :src="item.media.url"
              controls
              class="w-full"
            />
            <img
              v-else-if="isPhoto(item) && item.media"
              :src="item.media.url"
              :alt="t('review.studentPhoto')"
              class="max-h-80 rounded-md"
            />
            <RichTextView v-else-if="writtenAnswer(item)" :html="writtenAnswer(item)!" />
            <p v-else class="text-sm text-ink-subtle">{{ t('review.noAnswer') }}</p>

            <p v-if="item.media" class="mt-2 text-xs text-ink-subtle">
              {{ n(item.media.sizeBytes / (1024 * 1024), 'decimal') }} MB ·
              {{ item.media.contentType }}
            </p>
          </div>

          <div class="flex flex-wrap items-end gap-3">
            <label class="flex flex-col gap-1.5">
              <span class="text-xs font-medium text-ink-muted">
                {{ t('review.points', { max: item.question.pointsPossible }) }}
              </span>
              <input
                type="number"
                min="0"
                :max="item.question.pointsPossible"
                step="0.5"
                :class="inputClass"
                :value="draftFor(item).points"
                @input="
                  updateDraft(item, { points: Number(($event.target as HTMLInputElement).value) })
                "
              />
            </label>

            <label class="flex min-w-60 flex-1 flex-col gap-1.5">
              <span class="text-xs font-medium text-ink-muted">{{ t('review.feedback') }}</span>
              <input
                type="text"
                maxlength="2000"
                class="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
                :placeholder="t('review.feedbackHint')"
                :value="draftFor(item).feedback"
                @input="updateDraft(item, { feedback: ($event.target as HTMLInputElement).value })"
              />
            </label>

            <BaseButton :loading="savingKey === keyOf(item)" @click="submit(item)">
              {{ t('review.save') }}
            </BaseButton>
          </div>
        </div>
      </BaseCard>
    </template>
  </div>
</template>
