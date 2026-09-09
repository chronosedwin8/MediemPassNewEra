<script setup lang="ts">
import { useI18n } from 'vue-i18n';

/**
 * Criterios de una pregunta de texto abierto.
 *
 * Vive aparte del editor de listas porque no comparte nada con él: aquí no se
 * añaden ni se ordenan filas, solo se fijan dos criterios con los que el
 * docente corregirá a mano —una extensión mínima y la rúbrica—. Ninguno de los
 * dos se usa para calificar automáticamente; la rúbrica es lo que el docente
 * tendrá delante al puntuar.
 */

const props = defineProps<{ payload: Record<string, unknown> }>();
const emit = defineEmits<{ 'update:payload': [Record<string, unknown>] }>();

const { t } = useI18n();

function update(patch: Record<string, unknown>): void {
  emit('update:payload', { ...props.payload, ...patch });
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-medium" for="min-words">{{ t('editor.minWords') }}</label>
      <input
        id="min-words"
        type="number"
        min="0"
        :value="payload.minWords ?? ''"
        class="h-9 w-28 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
        @input="
          update({ minWords: Number(($event.target as HTMLInputElement).value) || undefined })
        "
      />
    </div>

    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-medium" for="rubric">{{ t('editor.rubric') }}</label>
      <textarea
        id="rubric"
        rows="3"
        :value="(payload.rubric as string) ?? ''"
        class="resize-y rounded-md border border-border bg-surface p-3 text-sm outline-none focus:border-brand-500"
        @input="update({ rubric: ($event.target as HTMLTextAreaElement).value })"
      />
    </div>
  </div>
</template>
