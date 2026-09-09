<script setup lang="ts">
import { computed } from 'vue';
import { QUESTION_TYPE, type Answer } from '@medienpass/shared';

/**
 * Completar espacios.
 *
 * El texto llega con marcadores `{{id}}` y se trocea para intercalar un campo
 * en cada hueco. Cada campo lleva su propia etiqueta accesible: sin ella, un
 * lector de pantalla anunciaría cuatro cuadros de texto indistinguibles.
 */

interface Blank {
  id: string;
}

const props = defineProps<{
  payload: { template?: string; blanks?: Blank[] };
  modelValue: Answer | null;
}>();

const emit = defineEmits<{ 'update:modelValue': [Answer] }>();

const values = computed<Map<string, string>>(() => {
  const answer = props.modelValue;
  if (!answer || !('blanks' in answer)) return new Map();
  return new Map(answer.blanks.map((blank) => [blank.id, blank.text]));
});

/** Trozos alternados de texto y hueco, en el orden en que aparecen. */
const segments = computed<Array<{ kind: 'text' | 'blank'; value: string; index?: number }>>(() => {
  const template = props.payload.template ?? '';
  const result: Array<{ kind: 'text' | 'blank'; value: string; index?: number }> = [];

  const pattern = /\{\{([^}]+)\}\}/g;
  let lastIndex = 0;
  let blankIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(template)) !== null) {
    if (match.index > lastIndex) {
      result.push({ kind: 'text', value: template.slice(lastIndex, match.index) });
    }
    blankIndex += 1;
    result.push({ kind: 'blank', value: match[1]!.trim(), index: blankIndex });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < template.length) {
    result.push({ kind: 'text', value: template.slice(lastIndex) });
  }

  return result;
});

function update(blankId: string, text: string): void {
  const next = new Map(values.value);
  next.set(blankId, text);

  emit('update:modelValue', {
    kind: QUESTION_TYPE.FILL_BLANK,
    blanks: (props.payload.blanks ?? []).map((blank) => ({
      id: blank.id,
      text: next.get(blank.id) ?? '',
    })),
  });
}
</script>

<template>
  <p class="flex flex-wrap items-baseline gap-x-1 gap-y-3 text-sm leading-loose">
    <template v-for="(segment, index) in segments" :key="index">
      <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
      <template v-else>
        <label class="sr-only" :for="`blank-${segment.value}`">
          {{ `Hueco ${segment.index}` }}
        </label>
        <input
          :id="`blank-${segment.value}`"
          type="text"
          :value="values.get(segment.value) ?? ''"
          class="inline-block h-9 w-32 rounded-md border-b-2 border-brand-400 bg-surface-muted px-2 text-center text-sm outline-none focus:border-brand-600"
          @input="update(segment.value, ($event.target as HTMLInputElement).value)"
        />
      </template>
    </template>
  </p>
</template>
