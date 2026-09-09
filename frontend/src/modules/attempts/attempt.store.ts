import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { emptyAnswer, isAnswerEmpty, type Answer, type QuestionType } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';

/**
 * Estado del intento en curso.
 *
 * Se ocupa del autoguardado y del temporizador. Dos decisiones importantes:
 *
 *  - **El guardado se agrupa por pregunta.** Escribir en una respuesta abierta
 *    dispara un guardado por pulsación si no se agrupa; con retardo, se manda
 *    uno cuando la persona deja de escribir.
 *  - **El tiempo lo dicta el servidor.** El contador local existe para que el
 *    estudiante vea algo que avanza, pero se resincroniza con cada respuesta
 *    del servidor y el envío lo valida el backend de todos modos.
 */

const AUTOSAVE_DELAY_MS = 800;

export interface AttemptQuestion {
  id: string;
  type: QuestionType;
  statement: string;
  instructions: string | null;
  points: number;
  position: number;
  mediaUrl: string | null;
  payload: Record<string, unknown>;
  competency: { id: string; code: string; name: Record<string, string>; color: string };
}

export interface AttemptData {
  id: string;
  status: string;
  attemptNumber: number;
  startedAt: string;
  deadlineAt: string | null;
  remainingSeconds: number | null;
  assessment: {
    id: string;
    versionId: string;
    title: string;
    instructions: string | null;
    questionCount: number;
    totalPoints: number;
  };
  questions: AttemptQuestion[];
  answers: Array<{ questionId: string; response: Answer | null; answeredAt: string }>;
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export const useAttemptStore = defineStore('attempt', () => {
  const attempt = ref<AttemptData | null>(null);
  const answers = ref<Map<string, Answer>>(new Map());
  const currentIndex = ref(0);
  const loading = ref(false);
  const submitting = ref(false);
  const saveState = ref<SaveState>('idle');
  const remainingSeconds = ref<number | null>(null);
  const expired = ref(false);

  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let ticker: ReturnType<typeof setInterval> | null = null;

  const questions = computed(() => attempt.value?.questions ?? []);
  const currentQuestion = computed(() => questions.value[currentIndex.value] ?? null);
  const total = computed(() => questions.value.length);

  const answeredCount = computed(
    () => [...answers.value.values()].filter((answer) => !isAnswerEmpty(answer)).length,
  );

  const unansweredCount = computed(() => total.value - answeredCount.value);

  const progressPercentage = computed(() =>
    total.value > 0 ? (answeredCount.value / total.value) * 100 : 0,
  );

  function isAnswered(questionId: string): boolean {
    const answer = answers.value.get(questionId);
    return answer !== undefined && !isAnswerEmpty(answer);
  }

  /** Contador local. Solo para mostrar: la autoridad es el servidor. */
  function startTicker(): void {
    stopTicker();
    if (remainingSeconds.value === null) return;

    ticker = setInterval(() => {
      if (remainingSeconds.value === null) return;
      remainingSeconds.value = Math.max(0, remainingSeconds.value - 1);
      if (remainingSeconds.value === 0) {
        expired.value = true;
        stopTicker();
      }
    }, 1000);
  }

  function stopTicker(): void {
    if (ticker) clearInterval(ticker);
    ticker = null;
  }

  async function load(attemptId: string): Promise<void> {
    loading.value = true;
    try {
      const data = await http.get<AttemptData>(`/attempts/${attemptId}`);
      attempt.value = data;

      // Se parte de una respuesta vacía por pregunta y se superponen las ya
      // guardadas: así el componente siempre recibe una forma válida.
      const restored = new Map<string, Answer>();
      for (const question of data.questions) {
        restored.set(question.id, emptyAnswer(question.type));
      }
      for (const saved of data.answers) {
        if (saved.response) restored.set(saved.questionId, saved.response);
      }
      answers.value = restored;

      remainingSeconds.value = data.remainingSeconds;
      expired.value = data.remainingSeconds === 0;
      startTicker();
    } finally {
      loading.value = false;
    }
  }

  async function persistAnswer(questionId: string, answer: Answer): Promise<void> {
    saveState.value = 'saving';
    try {
      await http.put(`/attempts/${attempt.value!.id}/answers/${questionId}`, { response: answer });
      saveState.value = 'saved';
    } catch (error) {
      // Si se agotó el tiempo, no es un fallo de guardado: el intento se
      // cerró en el servidor y hay que decirlo con claridad.
      if (error instanceof ApiError && error.code === 'TIME_LIMIT_EXCEEDED') {
        expired.value = true;
        stopTicker();
        return;
      }
      saveState.value = 'error';
      throw error;
    }
  }

  /**
   * Registra la respuesta y programa su guardado.
   *
   * El estado local se actualiza al instante para que la interfaz responda sin
   * esperar a la red; el envío se agrupa.
   */
  function setAnswer(questionId: string, answer: Answer): void {
    answers.value.set(questionId, answer);
    answers.value = new Map(answers.value);

    const existing = pendingTimers.get(questionId);
    if (existing) clearTimeout(existing);

    pendingTimers.set(
      questionId,
      setTimeout(() => {
        pendingTimers.delete(questionId);
        void persistAnswer(questionId, answer).catch(() => {
          // El estado de error ya quedó reflejado; se reintentará al
          // siguiente cambio o al finalizar.
        });
      }, AUTOSAVE_DELAY_MS),
    );
  }

  /** Vacía la cola de guardados pendientes. Se llama antes de finalizar. */
  async function flush(): Promise<void> {
    const pending = [...pendingTimers.entries()];
    for (const [questionId, timer] of pending) {
      clearTimeout(timer);
      pendingTimers.delete(questionId);
      const answer = answers.value.get(questionId);
      if (answer) await persistAnswer(questionId, answer);
    }
  }

  function goTo(index: number): void {
    if (index < 0 || index >= total.value) return;
    currentIndex.value = index;
  }

  const goNext = (): void => goTo(currentIndex.value + 1);
  const goPrevious = (): void => goTo(currentIndex.value - 1);

  async function submit(): Promise<string> {
    submitting.value = true;
    try {
      // Nada se envía a medias: primero se vacía la cola de autoguardado.
      await flush();
      await http.post(`/attempts/${attempt.value!.id}/submit`);
      stopTicker();
      return attempt.value!.id;
    } finally {
      submitting.value = false;
    }
  }

  function reset(): void {
    stopTicker();
    for (const timer of pendingTimers.values()) clearTimeout(timer);
    pendingTimers.clear();
    attempt.value = null;
    answers.value = new Map();
    currentIndex.value = 0;
    saveState.value = 'idle';
    remainingSeconds.value = null;
    expired.value = false;
  }

  return {
    attempt,
    answers,
    currentIndex,
    currentQuestion,
    questions,
    total,
    loading,
    submitting,
    saveState,
    remainingSeconds,
    expired,
    answeredCount,
    unansweredCount,
    progressPercentage,
    isAnswered,
    load,
    setAnswer,
    flush,
    goTo,
    goNext,
    goPrevious,
    submit,
    reset,
  };
});
