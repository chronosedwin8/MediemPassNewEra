<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { QUESTION_TYPE, type QuestionType } from '@medienpass/shared';
import BaseButton from '@/design-system/BaseButton.vue';

/**
 * Editor de preguntas de opción.
 *
 * Cubre respuesta única, múltiple, verdadero/falso y selección con imágenes.
 * El texto alternativo de las imágenes es obligatorio en el formulario, igual
 * que lo es en el esquema del servidor: una pregunta con imágenes sin
 * describir es inaccesible para parte del alumnado, y descubrirlo al publicar
 * sería tarde.
 */

interface Option {
  id: string;
  text?: string;
  imageUrl?: string;
  alt?: string;
  correct: boolean;
}

const props = defineProps<{
  type: QuestionType;
  payload: Record<string, unknown>;
}>();

const emit = defineEmits<{ 'update:payload': [Record<string, unknown>] }>();
const { t } = useI18n();

const isImage = computed(() => props.type === QUESTION_TYPE.IMAGE_CHOICE);
const isMultiple = computed(() => props.type === QUESTION_TYPE.MULTIPLE_CHOICE);
const isTrueFalse = computed(() => props.type === QUESTION_TYPE.TRUE_FALSE);

const options = computed<Option[]>(() => (props.payload.options as Option[]) ?? []);

function update(patch: Record<string, unknown>): void {
  emit('update:payload', { ...props.payload, ...patch });
}

function nextId(): string {
  const used = new Set(options.value.map((option) => option.id));
  const letters = 'abcdefghijkl';
  return [...letters].find((letter) => !used.has(letter)) ?? `o${options.value.length + 1}`;
}

function addOption(): void {
  update({
    options: [...options.value, { id: nextId(), text: '', ...(isImage.value ? { imageUrl: '', alt: '' } : {}), correct: false }],
  });
}

function removeOption(id: string): void {
  update({ options: options.value.filter((option) => option.id !== id) });
}

function patchOption(id: string, patch: Partial<Option>): void {
  update({
    options: options.value.map((option) => (option.id === id ? { ...option, ...patch } : option)),
  });
}

/**
 * Marca la opción correcta.
 *
 * En respuesta única, marcar una desmarca el resto: dejar dos correctas
 * produciría un contenido que el servidor rechazaría al guardar.
 */
function setCorrect(id: string, correct: boolean): void {
  if (isMultiple.value || (isImage.value && props.payload.multiple === true)) {
    patchOption(id, { correct });
    return;
  }
  update({
    options: options.value.map((option) => ({ ...option, correct: option.id === id && correct })),
  });
}
</script>

<template>
  <!-- Verdadero o falso: la única elección es cuál de las dos es correcta. -->
  <fieldset v-if="isTrueFalse" class="flex flex-col gap-2">
    <legend class="mb-1 text-sm font-medium">{{ t('question.markCorrect') }}</legend>
    <label v-for="value in [true, false]" :key="String(value)" class="flex items-center gap-2 text-sm">
      <input
        type="radio"
        name="tf-correct"
        class="size-4 accent-brand-600"
        :checked="payload.correct === value"
        @change="update({ correct: value })"
      />
      {{ value ? t('attempt.trueLabel') : t('attempt.falseLabel') }}
    </label>
  </fieldset>

  <div v-else class="flex flex-col gap-3">
    <label v-if="isImage" class="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        class="size-4 accent-brand-600"
        :checked="payload.multiple === true"
        @change="update({ multiple: ($event.target as HTMLInputElement).checked })"
      />
      {{ t('question.types.MULTIPLE_CHOICE') }}
    </label>

    <div v-for="option in options" :key="option.id" class="flex flex-col gap-2 rounded-md border border-border p-3">
      <div class="flex items-center gap-3">
        <input
          :type="isMultiple || (isImage && payload.multiple === true) ? 'checkbox' : 'radio'"
          name="option-correct"
          class="size-4 shrink-0 accent-brand-600"
          :checked="option.correct"
          :aria-label="t('question.markCorrect')"
          @change="setCorrect(option.id, ($event.target as HTMLInputElement).checked)"
        />

        <input
          v-if="!isImage"
          type="text"
          :value="option.text"
          :placeholder="`${t('question.options')} ${option.id.toUpperCase()}`"
          class="h-9 flex-1 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
          @input="patchOption(option.id, { text: ($event.target as HTMLInputElement).value })"
        />

        <button
          type="button"
          class="shrink-0 rounded-md p-2 text-ink-subtle hover:bg-surface-muted hover:text-danger"
          :aria-label="t('common.delete')"
          @click="removeOption(option.id)"
        >
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div v-if="isImage" class="flex flex-col gap-2 pl-7">
        <input
          type="url"
          :value="option.imageUrl"
          placeholder="https://…"
          class="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
          @input="patchOption(option.id, { imageUrl: ($event.target as HTMLInputElement).value })"
        />
        <input
          type="text"
          :value="option.alt"
          :placeholder="`${t('common.required')}: texto alternativo`"
          required
          class="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
          @input="patchOption(option.id, { alt: ($event.target as HTMLInputElement).value })"
        />
      </div>
    </div>

    <BaseButton variant="secondary" size="sm" type="button" @click="addOption">
      {{ t('question.addOption') }}
    </BaseButton>
  </div>
</template>
