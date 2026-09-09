<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/design-system/BaseButton.vue';

/**
 * Editor de «completar espacios».
 *
 * Se separa del editor de listas porque su modelo es distinto: aquí los huecos
 * no son filas independientes, sino marcas dentro de un texto. Añadir un hueco
 * significa insertar su marcador en el enunciado, y por eso el texto y la lista
 * tienen que cambiar a la vez; mezclarlo con los editores de filas invitaba a
 * modificar uno sin el otro y dejar marcadores huérfanos en el enunciado.
 */

interface Blank {
  id: string;
  acceptedAnswers: string[];
  caseSensitive: boolean;
  ignoreAccents: boolean;
}

const props = defineProps<{ payload: Record<string, unknown> }>();
const emit = defineEmits<{ 'update:payload': [Record<string, unknown>] }>();

const { t } = useI18n();

const blanks = computed(() => (props.payload.blanks as Blank[]) ?? []);

const inputClass =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';

function update(patch: Record<string, unknown>): void {
  emit('update:payload', { ...props.payload, ...patch });
}

/** Crea el hueco y, a la vez, deja su marcador al final del enunciado. */
function addBlank(): void {
  const current = blanks.value;
  const id = `b${current.length + 1}`;
  update({
    blanks: [...current, { id, acceptedAnswers: [], caseSensitive: false, ignoreAccents: true }],
    template: `${(props.payload.template as string) ?? ''} {{${id}}}`.trim(),
  });
}

function patchBlank(id: string, answers: string): void {
  update({
    blanks: blanks.value.map((blank) =>
      blank.id === id
        ? {
            ...blank,
            acceptedAnswers: answers
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
          }
        : blank,
    ),
  });
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-medium" for="template">{{ t('editor.textWithBlanks') }}</label>
      <textarea
        id="template"
        rows="3"
        :value="(payload.template as string) ?? ''"
        class="resize-y rounded-md border border-border bg-surface p-3 text-sm outline-none focus:border-brand-500"
        @input="update({ template: ($event.target as HTMLTextAreaElement).value })"
      />
      <p class="text-xs text-ink-subtle">{{ t('editor.blankHint') }}</p>
    </div>

    <div v-for="blank in blanks" :key="blank.id" class="flex items-center gap-3">
      <span class="w-16 shrink-0 font-mono text-xs text-ink-subtle">{{ blank.id }}</span>
      <input
        type="text"
        :value="blank.acceptedAnswers.join(', ')"
        :placeholder="t('editor.answerVariants')"
        :class="[inputClass, 'flex-1']"
        @input="patchBlank(blank.id, ($event.target as HTMLInputElement).value)"
      />
    </div>

    <BaseButton variant="secondary" size="sm" type="button" @click="addBlank">
      {{ t('question.addOption') }}
    </BaseButton>
  </div>
</template>
