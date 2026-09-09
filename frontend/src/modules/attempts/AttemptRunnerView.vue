<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { localize, type Answer, type LocalizedText } from '@medienpass/shared';
import { useAttemptStore } from './attempt.store';
import QuestionRenderer from './questions/QuestionRenderer.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import ProgressBar from '@/design-system/ProgressBar.vue';
import { useToast } from '@/composables/useToast';

/**
 * Realización de una evaluación.
 *
 * Ocupa toda la pantalla y sin navegación lateral: durante una evaluación no
 * debe haber enlaces que inviten a salir sin querer. El diseño está pensado
 * primero para tablet, que es donde se responderá la mayoría de las veces.
 */

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const store = useAttemptStore();
const toast = useToast();

const showFinishDialog = ref(false);
const finishDialogRef = ref<HTMLElement | null>(null);

const attemptId = computed(() => route.params.attemptId as string);

onMounted(async () => {
  try {
    await store.load(attemptId.value);
  } catch {
    toast.error(t('errors.ATTEMPT_NOT_FOUND'));
    await router.replace({ name: 'my-assessments' });
  }
});

onBeforeUnmount(() => store.reset());

/**
 * Aviso al abandonar la página.
 *
 * Las respuestas están guardadas, pero salir a media evaluación consume
 * tiempo del cronómetro sin que el estudiante lo pretenda.
 */
function warnOnUnload(event: BeforeUnloadEvent): void {
  if (store.attempt && !store.expired) event.preventDefault();
}

onMounted(() => window.addEventListener('beforeunload', warnOnUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnOnUnload));

onBeforeRouteLeave(async () => {
  // Se vacía la cola de autoguardado antes de irse: lo escrito en el último
  // segundo no debe perderse por navegar.
  await store.flush().catch(() => undefined);
  return true;
});

const timeDisplay = computed(() => {
  const seconds = store.remainingSeconds;
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
});

const timeIsCritical = computed(
  () => store.remainingSeconds !== null && store.remainingSeconds <= 60,
);

const competencyName = computed(() => {
  const question = store.currentQuestion;
  if (!question) return '';
  return localize(question.competency.name as unknown as LocalizedText, locale.value as never);
});

function onAnswer(answer: Answer): void {
  const question = store.currentQuestion;
  if (question) store.setAnswer(question.id, answer);
}

/** El tiempo agotado cierra el intento y lleva al resultado. */
watch(
  () => store.expired,
  async (isExpired) => {
    if (!isExpired) return;
    toast.info(t('attempt.expiredHint'));
    try {
      await store.submit();
    } catch {
      // El servidor ya lo cerró por su cuenta: no hay nada más que hacer.
    }
    await router.replace({ name: 'attempt-result', params: { attemptId: attemptId.value } });
  },
);

async function confirmFinish(): Promise<void> {
  try {
    await store.submit();
    showFinishDialog.value = false;
    await router.replace({ name: 'attempt-result', params: { attemptId: attemptId.value } });
  } catch (error) {
    showFinishDialog.value = false;
    toast.error(error instanceof Error ? error.message : t('errors.generic'));
  }
}

// El diálogo recibe el foco al abrirse, para que el teclado no quede detrás.
watch(showFinishDialog, async (open) => {
  if (open) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    finishDialogRef.value?.focus();
  }
});
</script>

<template>
  <div class="flex min-h-screen flex-col bg-canvas">
    <BaseSpinner v-if="store.loading" size="lg" />

    <template v-else-if="store.attempt">
      <!-- Cabecera fija: progreso y tiempo siempre visibles. -->
      <header class="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div class="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:px-6">
          <div class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ store.attempt.assessment.title }}</p>
              <p class="text-xs text-ink-muted">
                {{ t('attempt.questionOf', { current: store.currentIndex + 1, total: store.total }) }}
              </p>
            </div>

            <div class="flex shrink-0 items-center gap-4">
              <!--
                El tiempo se anuncia de forma cortés y solo cuando cambia de
                minuto sería lo ideal; se marca como región activa para que un
                lector de pantalla pueda consultarlo bajo demanda.
              -->
              <p
                v-if="timeDisplay"
                class="flex items-center gap-1.5 font-mono text-sm tabular-nums"
                :class="timeIsCritical ? 'font-semibold text-danger' : 'text-ink-muted'"
                role="timer"
                aria-live="off"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path stroke-linecap="round" d="M12 7v5l3 2" />
                </svg>
                <span class="sr-only">{{ t('attempt.timeRemaining') }}:</span>
                {{ timeDisplay }}
              </p>

              <p class="text-xs" :class="store.saveState === 'error' ? 'text-danger' : 'text-ink-subtle'" aria-live="polite">
                <span v-if="store.saveState === 'saving'">{{ t('attempt.saving') }}</span>
                <span v-else-if="store.saveState === 'saved'">{{ t('common.saved') }}</span>
                <span v-else-if="store.saveState === 'error'">{{ t('attempt.saveFailed') }}</span>
              </p>
            </div>
          </div>

          <ProgressBar
            :value="store.progressPercentage"
            :label="t('attempt.progress')"
          />
        </div>
      </header>

      <p v-if="timeIsCritical" class="bg-danger-soft py-2 text-center text-sm font-medium text-danger" role="alert">
        {{ t('attempt.timeAlmostUp') }}
      </p>

      <main class="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
        <article v-if="store.currentQuestion" class="flex flex-col gap-6">
          <header class="flex flex-col gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                :style="{
                  backgroundColor: `${store.currentQuestion.competency.color}1a`,
                  color: store.currentQuestion.competency.color,
                }"
              >
                KMK {{ store.currentQuestion.competency.code }} · {{ competencyName }}
              </span>
              <span class="text-xs text-ink-subtle">
                {{ t('assessment.totalPoints', { points: store.currentQuestion.points }) }}
              </span>
            </div>

            <h2 class="text-lg font-medium leading-relaxed">{{ store.currentQuestion.statement }}</h2>
            <p v-if="store.currentQuestion.instructions" class="text-sm text-ink-muted">
              {{ store.currentQuestion.instructions }}
            </p>
          </header>

          <QuestionRenderer
            :key="store.currentQuestion.id"
            :question-id="store.currentQuestion.id"
            :type="store.currentQuestion.type"
            :payload="store.currentQuestion.payload"
            :model-value="store.answers.get(store.currentQuestion.id) ?? null"
            @update:model-value="onAnswer"
          />
        </article>
      </main>

      <!-- Navegación y mapa de preguntas. -->
      <footer class="sticky bottom-0 border-t border-border bg-surface/95 backdrop-blur">
        <div class="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:px-6">
          <nav :aria-label="t('attempt.questionMap')" class="flex flex-wrap gap-1.5">
            <button
              v-for="(question, index) in store.questions"
              :key="question.id"
              type="button"
              class="size-8 rounded-md border text-xs font-medium tabular-nums transition-colors"
              :class="[
                index === store.currentIndex
                  ? 'border-brand-600 bg-brand-600 text-ink-inverse'
                  : store.isAnswered(question.id)
                    ? 'border-success/40 bg-success-soft text-success'
                    : 'border-border bg-surface text-ink-muted hover:border-border-strong',
              ]"
              :aria-label="`${t('attempt.goToQuestion', { number: index + 1 })} — ${store.isAnswered(question.id) ? t('attempt.answered') : t('attempt.unanswered')}`"
              :aria-current="index === store.currentIndex ? 'step' : undefined"
              @click="store.goTo(index)"
            >
              {{ index + 1 }}
            </button>
          </nav>

          <div class="flex items-center justify-between gap-3">
            <BaseButton
              variant="secondary"
              :disabled="store.currentIndex === 0"
              @click="store.goPrevious"
            >
              {{ t('common.previous') }}
            </BaseButton>

            <BaseButton
              v-if="store.currentIndex < store.total - 1"
              @click="store.goNext"
            >
              {{ t('common.next') }}
            </BaseButton>

            <BaseButton v-else @click="showFinishDialog = true">
              {{ t('common.finish') }}
            </BaseButton>
          </div>
        </div>
      </footer>

      <!-- Confirmación antes de finalizar. -->
      <div
        v-if="showFinishDialog"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
        @click.self="showFinishDialog = false"
      >
        <div
          ref="finishDialogRef"
          tabindex="-1"
          class="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finish-title"
          @keydown.esc="showFinishDialog = false"
        >
          <h2 id="finish-title" class="text-lg font-semibold">{{ t('attempt.finishTitle') }}</h2>
          <p class="mt-2 text-sm text-ink-muted">{{ t('attempt.finishWarning') }}</p>

          <p
            v-if="store.unansweredCount > 0"
            class="mt-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning"
          >
            {{ t('attempt.finishWithUnanswered', { count: store.unansweredCount }) }}
          </p>

          <div class="mt-6 flex justify-end gap-2">
            <BaseButton variant="secondary" @click="showFinishDialog = false">
              {{ t('common.cancel') }}
            </BaseButton>
            <BaseButton :loading="store.submitting" @click="confirmFinish">
              {{ t('attempt.finishConfirm') }}
            </BaseButton>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
