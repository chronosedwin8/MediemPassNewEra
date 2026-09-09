<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { QUESTION_TYPE, richTextToPlain, type Answer, type QuestionType } from '@medienpass/shared';
import RichTextEditor from '@/design-system/RichTextEditor.vue';

/**
 * Respuestas escritas: corta, abierta y larga.
 *
 * La respuesta corta es un campo de texto plano a propósito: se corrige
 * comparándola con una lista de respuestas admitidas, y permitir negritas ahí
 * solo serviría para que «París» y «<b>París</b>» dejaran de coincidir.
 *
 * Las abiertas y largas sí admiten formato, porque las lee y califica una
 * persona: un estudiante que responde con una lista ordenada o resaltando un
 * término está comunicando mejor, no decorando.
 */

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

const isRich = computed(
  () => props.type === QUESTION_TYPE.OPEN_TEXT || props.type === QUESTION_TYPE.LONG_ANSWER,
);

// Sobre el HTML, contar palabras exige quitar antes las etiquetas: si no,
// «<p>hola</p>» contaría como una palabra rarísima o como tres.
const wordCount = computed(() => richTextToPlain(text.value).split(/\s+/).filter(Boolean).length);

function update(event: Event): void {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  emit('update:modelValue', { kind: props.type, text: value } as Answer);
}

function updateRich(value: string): void {
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

    <RichTextEditor
      v-else-if="isRich"
      :model-value="text"
      :aria-label="t('attempt.yourAnswer')"
      :placeholder="t('attempt.typeYourAnswer')"
      @update:model-value="updateRich"
    />

    <textarea
      v-else
      :id="`answer-${type}`"
      :value="text"
      :rows="6"
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
