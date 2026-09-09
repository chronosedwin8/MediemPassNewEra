<script setup lang="ts">
import { computed } from 'vue';
import { QUESTION_TYPE, type Answer, type QuestionType } from '@medienpass/shared';
import ChoiceQuestion from './ChoiceQuestion.vue';
import TextQuestion from './TextQuestion.vue';
import OrderingQuestion from './OrderingQuestion.vue';
import PairingQuestion from './PairingQuestion.vue';
import FillBlankQuestion from './FillBlankQuestion.vue';
import HotspotQuestion from './HotspotQuestion.vue';

/**
 * Selecciona el componente que corresponde a cada tipo de pregunta.
 *
 * Es el equivalente en la interfaz al registro de calificadores del backend:
 * un único punto donde se decide qué se dibuja. Añadir un tipo de pregunta es
 * añadir su componente y una entrada en este mapa.
 */

defineProps<{
  questionId: string;
  type: QuestionType;
  payload: Record<string, unknown>;
  modelValue: Answer | null;
}>();

defineEmits<{ 'update:modelValue': [Answer] }>();

const CHOICE_TYPES: QuestionType[] = [
  QUESTION_TYPE.SINGLE_CHOICE,
  QUESTION_TYPE.MULTIPLE_CHOICE,
  QUESTION_TYPE.TRUE_FALSE,
  QUESTION_TYPE.IMAGE_CHOICE,
];

const TEXT_TYPES: QuestionType[] = [
  QUESTION_TYPE.SHORT_ANSWER,
  QUESTION_TYPE.OPEN_TEXT,
  QUESTION_TYPE.LONG_ANSWER,
];

const SEQUENCE_TYPES: QuestionType[] = [QUESTION_TYPE.ORDERING, QUESTION_TYPE.TIMELINE];

const PAIRING_TYPES: QuestionType[] = [QUESTION_TYPE.MATCHING, QUESTION_TYPE.GROUPING];

const component = computed(() => ({ CHOICE_TYPES, TEXT_TYPES, SEQUENCE_TYPES, PAIRING_TYPES }));
</script>

<template>
  <ChoiceQuestion
    v-if="component.CHOICE_TYPES.includes(type)"
    :question-id="questionId"
    :type="type"
    :payload="payload"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  />

  <TextQuestion
    v-else-if="component.TEXT_TYPES.includes(type)"
    :type="type"
    :payload="payload"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  />

  <OrderingQuestion
    v-else-if="component.SEQUENCE_TYPES.includes(type)"
    :type="type"
    :payload="payload"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  />

  <PairingQuestion
    v-else-if="component.PAIRING_TYPES.includes(type)"
    :type="type"
    :payload="payload"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  />

  <FillBlankQuestion
    v-else-if="type === QUESTION_TYPE.FILL_BLANK"
    :payload="payload"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  />

  <HotspotQuestion
    v-else-if="type === QUESTION_TYPE.HOTSPOT"
    :payload="payload"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
