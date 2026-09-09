<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { QUESTION_TYPE, type Answer, type QuestionType } from '@medienpass/shared';

/** Respuestas escritas: corta, abierta y larga. */

const props = defineProps<{
  type: QuestionType;
  payload: { minWords?: number; maxWords?: number };
  modelValue: Answer | null;
}>();

const emit = defineEmits<{ 'update:modelValue': [Answer] }>();
const { t } = useI18n();

const text = computed<string>(() =>
  props.modelValue && 'text' in props.modelValue ? props.modelValue.text : '',
);

const isShort = computed(() => props.type === QUESTION_TYPE.SHORT_ANSWER);

const wordCount = computed(() => text.value.trim().split(/\s+/).filter(Boolean).length);

function update(event: Event): void {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  emit('update:modelValue', { kind: props.type, text: value } as Answer);
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <label class="sr-only" :for="`answer-${type}`">{{ t('attempt.yourAnswer') }}</label>

    <input
      v-if="isShort"
      :id="`answer-${type}`"
      type="text"
      :value="text"
      :placeholder="t('attempt.typeYourAnswer')"
      class="h-11 rounded-lg border border-border bg-surface px-4 text-sm outline-none focus:border-brand-500"
      @input="update"
    />

    <textarea
      v-else
      :id="`answer-${type}`"
      :value="text"
      :rows="type === QUESTION_TYPE.LONG_ANSWER ? 12 : 6"
      :placeholder="t('attempt.typeYourAnswer')"
      class="resize-y rounded-lg border border-border bg-surface p-4 text-sm leading-relaxed outline-none focus:border-brand-500"
      @input="update"
    />

    <!--
      El recuento se anuncia de forma cortés: interrumpir en cada pulsación
      sería insoportable con un lector de pantalla.
    -->
    <p v-if="!isShort" class="text-right text-xs text-ink-subtle" aria-live="polite">
      {{ t('attempt.wordCount', { count: wordCount }) }}
      <span v-if="payload.minWords">· {{ t('common.required') }}: {{ payload.minWords }}+</span>
    </p>
  </div>
</template>
