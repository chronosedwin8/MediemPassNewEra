<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { QUESTION_TYPE, type Answer, type QuestionType } from '@medienpass/shared';

/**
 * Relacionar y agrupar.
 *
 * Ambas son la misma interacción: a cada elemento de una lista se le asigna un
 * valor de un conjunto cerrado. Se resuelve con listas desplegables nativas y
 * no con arrastrar y soltar, porque un desplegable funciona con teclado, con
 * lector de pantalla y con el dedo en una tablet, que es donde se van a
 * responder estas evaluaciones.
 */

interface Labelled {
  id: string;
  text?: string;
  label?: string;
}

const props = defineProps<{
  type: QuestionType;
  payload: {
    left?: Labelled[];
    right?: Labelled[];
    items?: Array<{ id: string; text: string }>;
    groups?: Labelled[];
  };
  modelValue: Answer | null;
}>();

const emit = defineEmits<{ 'update:modelValue': [Answer] }>();
const { t } = useI18n();

const isMatching = computed(() => props.type === QUESTION_TYPE.MATCHING);

/** Elementos a los que hay que asignar algo. */
const rows = computed<Labelled[]>(() =>
  isMatching.value ? (props.payload.left ?? []) : (props.payload.items ?? []),
);

/** Valores disponibles para asignar. */
const choices = computed<Labelled[]>(() =>
  isMatching.value ? (props.payload.right ?? []) : (props.payload.groups ?? []),
);

const assignments = computed<Map<string, string>>(() => {
  const answer = props.modelValue;
  if (!answer) return new Map();

  if ('pairs' in answer) {
    return new Map(answer.pairs.map((pair) => [pair.leftId, pair.rightId]));
  }
  if ('assignments' in answer) {
    return new Map(answer.assignments.map((entry) => [entry.itemId, entry.groupId]));
  }
  return new Map();
});

function assign(rowId: string, value: string): void {
  const next = new Map(assignments.value);
  if (value) next.set(rowId, value);
  else next.delete(rowId);

  if (isMatching.value) {
    emit('update:modelValue', {
      kind: QUESTION_TYPE.MATCHING,
      pairs: [...next.entries()].map(([leftId, rightId]) => ({ leftId, rightId })),
    });
    return;
  }

  emit('update:modelValue', {
    kind: QUESTION_TYPE.GROUPING,
    assignments: [...next.entries()].map(([itemId, groupId]) => ({ itemId, groupId })),
  });
}

const labelOf = (item: Labelled): string => item.text ?? item.label ?? '';
</script>

<template>
  <div class="flex flex-col gap-2">
    <div
      v-for="row in rows"
      :key="row.id"
      class="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center sm:gap-4"
    >
      <label class="flex-1 text-sm" :for="`pair-${row.id}`">{{ labelOf(row) }}</label>

      <select
        :id="`pair-${row.id}`"
        class="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500 sm:w-64"
        :value="assignments.get(row.id) ?? ''"
        @change="assign(row.id, ($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ t('common.none') }}</option>
        <option v-for="choice in choices" :key="choice.id" :value="choice.id">
          {{ labelOf(choice) }}
        </option>
      </select>
    </div>
  </div>
</template>
