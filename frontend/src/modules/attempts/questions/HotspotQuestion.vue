<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { QUESTION_TYPE, type Answer } from '@medienpass/shared';

/**
 * Seleccionar una zona de una imagen.
 *
 * Las zonas son botones reales superpuestos a la imagen, con su etiqueta
 * accesible. Además se ofrece una lista equivalente debajo: quien no pueda ver
 * la imagen, o no pueda apuntar con precisión, responde exactamente lo mismo
 * desde ahí. Una pregunta que solo se puede contestar señalando con el ratón
 * excluye a parte del alumnado.
 */

interface Region {
  id: string;
  label: string;
  shape: 'rect' | 'circle';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
}

const props = defineProps<{
  payload: { imageUrl?: string; alt?: string; regions?: Region[]; multiple?: boolean };
  modelValue: Answer | null;
}>();

const emit = defineEmits<{ 'update:modelValue': [Answer] }>();
const { t } = useI18n();

const selected = computed<string[]>(() =>
  props.modelValue && 'regionIds' in props.modelValue ? props.modelValue.regionIds : [],
);

function toggle(regionId: string): void {
  const next = props.payload.multiple
    ? selected.value.includes(regionId)
      ? selected.value.filter((id) => id !== regionId)
      : [...selected.value, regionId]
    : [regionId];

  emit('update:modelValue', { kind: QUESTION_TYPE.HOTSPOT, regionIds: next });
}

/** Las coordenadas llegan en porcentaje, así que no dependen del tamaño. */
function regionStyle(region: Region): Record<string, string> {
  if (region.shape === 'circle') {
    const diameter = (region.radius ?? 5) * 2;
    return {
      left: `${region.x - (region.radius ?? 5)}%`,
      top: `${region.y - (region.radius ?? 5)}%`,
      width: `${diameter}%`,
      height: `${diameter}%`,
      borderRadius: '9999px',
    };
  }

  return {
    left: `${region.x}%`,
    top: `${region.y}%`,
    width: `${region.width ?? 10}%`,
    height: `${region.height ?? 10}%`,
    borderRadius: '0.375rem',
  };
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="relative overflow-hidden rounded-lg border border-border">
      <img :src="payload.imageUrl" :alt="payload.alt ?? ''" class="w-full" />

      <button
        v-for="region in payload.regions ?? []"
        :key="region.id"
        type="button"
        class="absolute border-2 transition-colors"
        :class="
          selected.includes(region.id)
            ? 'border-brand-600 bg-brand-500/30'
            : 'border-transparent hover:border-brand-400 hover:bg-brand-500/10'
        "
        :style="regionStyle(region)"
        :aria-pressed="selected.includes(region.id)"
        :aria-label="region.label"
        @click="toggle(region.id)"
      />
    </div>

    <!-- Alternativa textual, equivalente en funcionamiento. -->
    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1 text-xs text-ink-subtle">{{ t('question.options') }}</legend>
      <label
        v-for="region in payload.regions ?? []"
        :key="region.id"
        class="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors"
        :class="
          selected.includes(region.id)
            ? 'border-brand-500 bg-brand-50'
            : 'border-border bg-surface hover:border-border-strong'
        "
      >
        <input
          :type="payload.multiple ? 'checkbox' : 'radio'"
          name="hotspot-region"
          :checked="selected.includes(region.id)"
          class="size-4 accent-brand-600"
          @change="toggle(region.id)"
        />
        {{ region.label }}
      </label>
    </fieldset>
  </div>
</template>
