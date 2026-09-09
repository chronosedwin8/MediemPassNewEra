<script setup lang="ts">
import { useI18n } from 'vue-i18n';

/**
 * Si la pregunta admite evidencia, y en qué condiciones.
 *
 * Es una decisión del docente y no del sistema: pedir un archivo cuando no
 * hace falta es fricción para el estudiante y almacenamiento que alguien
 * tendrá que borrar después. Por eso viene apagado.
 *
 * «Exigir» solo aparece cuando «admitir» está activo. Exigir sin admitir
 * dejaría al estudiante sin poder adjuntar nada y sin poder terminar, así que
 * la interfaz ni siquiera ofrece la combinación —y el servidor la rechaza
 * también, porque una regla que solo vive en el formulario no es una regla.
 */

defineProps<{ allows: boolean; requires: boolean; maxFiles: number }>();

const emit = defineEmits<{
  'update:allows': [value: boolean];
  'update:requires': [value: boolean];
  'update:maxFiles': [value: number];
}>();

const { t } = useI18n();
</script>

<template>
  <fieldset class="flex flex-col gap-2 rounded-md border border-border p-3">
    <legend class="px-1 text-sm font-medium">{{ t('evidence.settings') }}</legend>

    <label class="flex items-start gap-3">
      <input
        type="checkbox"
        class="mt-1 size-4 accent-brand-600"
        :checked="allows"
        @change="emit('update:allows', ($event.target as HTMLInputElement).checked)"
      />
      <span>
        <span class="block text-sm">{{ t('evidence.allow') }}</span>
        <span class="block text-xs text-ink-subtle">{{ t('evidence.allowHint') }}</span>
      </span>
    </label>

    <label v-if="allows" class="flex items-center gap-3">
      <input
        type="checkbox"
        class="size-4 accent-brand-600"
        :checked="requires"
        @change="emit('update:requires', ($event.target as HTMLInputElement).checked)"
      />
      <span class="text-sm">{{ t('evidence.require') }}</span>
    </label>

    <label v-if="allows" class="flex items-center gap-3">
      <span class="text-sm">{{ t('evidence.maxFiles') }}</span>
      <input
        type="number"
        min="1"
        max="10"
        :value="maxFiles"
        class="h-9 w-20 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
        @input="emit('update:maxFiles', Number(($event.target as HTMLInputElement).value))"
      />
    </label>
  </fieldset>
</template>
