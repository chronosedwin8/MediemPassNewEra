<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { QUESTION_TYPE, type Answer, type QuestionType } from '@medienpass/shared';

/**
 * Preguntas de opción: respuesta única, múltiple, verdadero/falso e imágenes.
 *
 * Se usan controles nativos de tipo radio y casilla, no divisiones con
 * atributos de rol. Los nativos ya traen navegación por teclado, agrupación y
 * anuncio correcto en lectores de pantalla; reimplementarlos siempre sale
 * peor y se descubre tarde.
 */

interface ChoiceOption {
  id: string;
  text?: string;
  label?: string;
  imageUrl?: string;
  alt?: string;
}

const props = defineProps<{
  questionId: string;
  type: QuestionType;
  payload: { options?: ChoiceOption[]; multiple?: boolean };
  modelValue: Answer | null;
}>();

const emit = defineEmits<{ 'update:modelValue': [Answer] }>();
const { t } = useI18n();

const isMultiple = computed(
  () =>
    props.type === QUESTION_TYPE.MULTIPLE_CHOICE ||
    (props.type === QUESTION_TYPE.IMAGE_CHOICE && props.payload.multiple === true),
);

const isImage = computed(() => props.type === QUESTION_TYPE.IMAGE_CHOICE);

const selectedIds = computed<string[]>(() => {
  const answer = props.modelValue;
  if (!answer) return [];
  if ('optionIds' in answer) return answer.optionIds;
  if ('optionId' in answer && answer.optionId) return [answer.optionId];
  return [];
});

const booleanValue = computed<boolean | null>(() =>
  props.modelValue && 'value' in props.modelValue ? props.modelValue.value : null,
);

function selectSingle(optionId: string): void {
  if (props.type === QUESTION_TYPE.IMAGE_CHOICE) {
    emit('update:modelValue', { kind: QUESTION_TYPE.IMAGE_CHOICE, optionIds: [optionId] });
    return;
  }
  emit('update:modelValue', { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId });
}

function toggleMultiple(optionId: string): void {
  const next = selectedIds.value.includes(optionId)
    ? selectedIds.value.filter((id) => id !== optionId)
    : [...selectedIds.value, optionId];

  emit('update:modelValue', {
    kind: isImage.value ? QUESTION_TYPE.IMAGE_CHOICE : QUESTION_TYPE.MULTIPLE_CHOICE,
    optionIds: next,
  } as Answer);
}

function setBoolean(value: boolean): void {
  emit('update:modelValue', { kind: QUESTION_TYPE.TRUE_FALSE, value });
}
</script>

<template>
  <fieldset v-if="type === QUESTION_TYPE.TRUE_FALSE" class="flex flex-col gap-2">
    <legend class="sr-only">{{ t('question.options') }}</legend>
    <label
      v-for="option in [true, false]"
      :key="String(option)"
      class="flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors"
      :class="
        booleanValue === option
          ? 'border-brand-500 bg-brand-50'
          : 'border-border bg-surface hover:border-border-strong'
      "
    >
      <input
        type="radio"
        :name="`q-${questionId}`"
        :checked="booleanValue === option"
        class="size-4 accent-brand-600"
        @change="setBoolean(option)"
      />
      <span class="text-sm">{{ option ? t('attempt.trueLabel') : t('attempt.falseLabel') }}</span>
    </label>
  </fieldset>

  <fieldset v-else-if="isImage" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
    <legend class="sr-only">{{ t('question.options') }}</legend>
    <label
      v-for="option in payload.options ?? []"
      :key="option.id"
      class="flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors"
      :class="
        selectedIds.includes(option.id)
          ? 'border-brand-500 bg-brand-50'
          : 'border-border bg-surface hover:border-border-strong'
      "
    >
      <img
        :src="option.imageUrl"
        :alt="option.alt ?? ''"
        class="aspect-video w-full rounded object-cover"
      />
      <div class="flex items-center gap-2">
        <input
          :type="isMultiple ? 'checkbox' : 'radio'"
          :name="`q-${questionId}`"
          :checked="selectedIds.includes(option.id)"
          class="size-4 accent-brand-600"
          @change="isMultiple ? toggleMultiple(option.id) : selectSingle(option.id)"
        />
        <span class="text-sm">{{ option.label ?? option.alt }}</span>
      </div>
    </label>
  </fieldset>

  <fieldset v-else class="flex flex-col gap-2">
    <legend class="sr-only">{{ t('question.options') }}</legend>
    <label
      v-for="option in payload.options ?? []"
      :key="option.id"
      class="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors"
      :class="
        selectedIds.includes(option.id)
          ? 'border-brand-500 bg-brand-50'
          : 'border-border bg-surface hover:border-border-strong'
      "
    >
      <input
        :type="isMultiple ? 'checkbox' : 'radio'"
        :name="`q-${questionId}`"
        :checked="selectedIds.includes(option.id)"
        class="mt-0.5 size-4 shrink-0 accent-brand-600"
        @change="isMultiple ? toggleMultiple(option.id) : selectSingle(option.id)"
      />
      <span class="text-sm leading-relaxed">{{ option.text }}</span>
    </label>
  </fieldset>
</template>
