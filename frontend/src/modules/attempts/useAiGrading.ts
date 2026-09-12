import { onMounted, ref } from 'vue';
import { QUESTION_TYPE, type QuestionType, type SmartScores } from '@medienpass/shared';
import { http } from '@/services/http';

/**
 * Corrección asistida en la cola.
 *
 * Vive fuera de la pantalla porque es una política, no una interacción: qué se
 * le puede pedir al modelo, cuándo se ofrece y cómo se marca lo que propuso.
 * La pantalla solo dibuja lo que esto decide.
 *
 * Lo que devuelve nunca se guarda solo. Rellena el formulario y quien corrige
 * pulsa guardar, que es el paso donde una persona se hace responsable de la
 * nota de un menor.
 */

export interface GradeSuggestion {
  points: number;
  feedback: string;
  rubricScores: SmartScores | null;
}

/**
 * Lo que el modelo puede corregir: lo que puede leer.
 *
 * Una nota de voz o un vídeo quedan fuera. No los ha oído ni visto, y lo que
 * devolvería sería una valoración inventada sobre algo que no conoce.
 */
const GRADABLE: readonly string[] = [
  QUESTION_TYPE.OPEN_TEXT,
  QUESTION_TYPE.LONG_ANSWER,
  QUESTION_TYPE.SHORT_ANSWER,
  QUESTION_TYPE.SMART_GOAL,
];

export function useAiGrading() {
  const enabled = ref(false);
  const pendingKey = ref<string | null>(null);
  /** Las respuestas cuya nota propuso el modelo, para poder marcarlas. */
  const suggestedKeys = ref<Set<string>>(new Set());

  onMounted(async () => {
    /*
     * Si la IA no está disponible, el botón no aparece. Uno que al pulsarlo
     * explica por qué no funciona es peor que no tenerlo: promete algo y
     * después lo niega.
     */
    try {
      const capabilities = await http.get<{ enabled: boolean }>('/ai/capabilities');
      enabled.value = capabilities.enabled;
    } catch {
      enabled.value = false;
    }
  });

  function canSuggest(type: QuestionType): boolean {
    return enabled.value && GRADABLE.includes(type);
  }

  async function suggest(
    key: string,
    attemptId: string,
    questionId: string,
  ): Promise<GradeSuggestion> {
    pendingKey.value = key;
    try {
      const result = await http.post<GradeSuggestion>('/ai/grade', { attemptId, questionId });
      suggestedKeys.value = new Set([...suggestedKeys.value, key]);
      return result;
    } finally {
      pendingKey.value = null;
    }
  }

  return { enabled, pendingKey, suggestedKeys, canSuggest, suggest };
}
