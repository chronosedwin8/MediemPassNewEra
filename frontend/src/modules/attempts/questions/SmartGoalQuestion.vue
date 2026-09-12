<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  QUESTION_TYPE,
  SMART_DIMENSIONS,
  SMART_LETTER,
  type Answer,
  type SmartDimension,
} from '@medienpass/shared';

/**
 * Redactar un objetivo SMART.
 *
 * La rúbrica se enseña mientras se escribe, y es la decisión que define este
 * componente. Esconderla convertiría el ejercicio en adivinar qué se espera,
 * que es exactamente lo contrario de formular un objetivo claro: el marco es
 * lo que se está enseñando, no un secreto del examen.
 *
 * Las marcas de cada dimensión son una ayuda de redacción, no una nota. Lo que
 * puntúa es una persona con la rúbrica delante, y por eso el aviso lo dice: un
 * objetivo puede contener una fecha y seguir sin tener plazo real.
 */

const props = defineProps<{
  payload: Record<string, unknown>;
  modelValue: Answer | null;
}>();

const emit = defineEmits<{ 'update:modelValue': [Answer] }>();

const { t } = useI18n();

const text = computed(() => {
  const answer = props.modelValue;
  return answer && 'text' in answer && typeof answer.text === 'string' ? answer.text : '';
});

const minChars = computed(() =>
  typeof props.payload['minChars'] === 'number' ? props.payload['minChars'] : 80,
);

const showRubric = computed(() => props.payload['showRubric'] !== false);

const example = computed(() =>
  typeof props.payload['example'] === 'string' && props.payload['example'].length > 0
    ? props.payload['example']
    : null,
);

function onInput(event: Event): void {
  emit('update:modelValue', {
    kind: QUESTION_TYPE.SMART_GOAL,
    text: (event.target as HTMLTextAreaElement).value,
  });
}

/**
 * Pistas de redacción, no evaluación.
 *
 * Son heurísticas deliberadamente sencillas —¿hay un número?, ¿aparece una
 * unidad de tiempo?— para que el estudiante note lo que le falta mientras
 * escribe. No deciden nada: la puntuación real la pone quien corrige, y por
 * eso las marcas son grises y no verdes.
 */
const HINT_PATTERNS: Record<SmartDimension, RegExp> = {
  SPECIFIC: /\b(en|de|sobre|para)\b/i,
  MEASURABLE: /\d/,
  ACHIEVABLE: /\b(diari|semanal|cada|practicar|estudiar|dedicar)/i,
  RELEVANT: /\b(porque|para|me permitir|necesito|así)/i,
  TIME_BOUND: /\b(semana|mes|día|dias|días|antes de|hasta|plazo|para el)\b/i,
};

const hints = computed(() =>
  SMART_DIMENSIONS.map((dimension) => ({
    dimension,
    letter: SMART_LETTER[dimension],
    present: HINT_PATTERNS[dimension].test(text.value),
  })),
);

const remaining = computed(() => Math.max(0, minChars.value - text.value.trim().length));
</script>

<template>
  <div class="flex flex-col gap-4">
    <textarea
      :value="text"
      rows="5"
      maxlength="2000"
      class="w-full resize-y rounded-md border border-border bg-surface p-3 text-sm outline-none focus:border-brand-500"
      :placeholder="t('smart.placeholder')"
      @input="onInput"
    />

    <p class="text-xs text-ink-subtle">
      {{ remaining > 0 ? t('smart.charsRemaining', { count: remaining }) : t('smart.longEnough') }}
    </p>

    <section v-if="showRubric" class="rounded-lg border border-border bg-surface-muted p-3">
      <p class="text-sm font-medium">{{ t('smart.rubricTitle') }}</p>
      <p class="mt-1 text-xs text-ink-subtle">{{ t('smart.rubricHint') }}</p>

      <ul class="mt-3 flex list-none flex-col gap-2 p-0">
        <li v-for="hint in hints" :key="hint.dimension" class="flex items-start gap-3">
          <span
            class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold"
            :class="hint.present ? 'bg-brand-100 text-brand-700' : 'bg-surface text-ink-subtle'"
            aria-hidden="true"
          >
            {{ hint.letter }}
          </span>
          <span class="text-sm">
            <span class="font-medium">{{ t(`smart.dimension.${hint.dimension}.name`) }}</span>
            <span class="block text-xs text-ink-muted">
              {{ t(`smart.dimension.${hint.dimension}.indicator`) }}
            </span>
          </span>
        </li>
      </ul>
    </section>

    <p v-if="example" class="rounded-md border border-info/30 bg-info-soft px-3 py-2 text-sm">
      <span class="font-medium">{{ t('smart.example') }}:</span> {{ example }}
    </p>
  </div>
</template>
