<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { QUESTION_TYPE } from '@medienpass/shared';
import BaseButton from '@/design-system/BaseButton.vue';

/**
 * Editor de preguntas sobre una zona de imagen.
 *
 * Las zonas se colocan haciendo clic sobre la vista previa, que es lo natural,
 * y sus coordenadas quedan además editables a mano: dibujar a ojo sirve para
 * empezar, pero ajustar un par de puntos es más rápido escribiendo el número.
 *
 * Las coordenadas se guardan en porcentaje, no en píxeles, para que la
 * pregunta funcione igual en un móvil y en una pantalla grande.
 */

interface Region {
  id: string;
  label: string;
  shape: 'rect' | 'circle';
  x: number;
  y: number;
  width?: number;
  height?: number;
  correct: boolean;
}

const props = defineProps<{ payload: Record<string, unknown> }>();
const emit = defineEmits<{ 'update:payload': [Record<string, unknown>] }>();
const { t } = useI18n();

const regions = computed<Region[]>(() => (props.payload.regions as Region[]) ?? []);
const imageUrl = computed(() => (props.payload.imageUrl as string) ?? '');

function update(patch: Record<string, unknown>): void {
  emit('update:payload', { ...props.payload, ...patch });
}

/** Un clic en la imagen crea una zona centrada en ese punto. */
function addRegionAt(event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement;
  const bounds = target.getBoundingClientRect();
  const x = Math.round(((event.clientX - bounds.left) / bounds.width) * 100);
  const y = Math.round(((event.clientY - bounds.top) / bounds.height) * 100);

  update({
    regions: [
      ...regions.value,
      {
        id: `r${regions.value.length + 1}`,
        label: '',
        shape: 'rect' as const,
        x: Math.max(0, x - 5),
        y: Math.max(0, y - 5),
        width: 10,
        height: 10,
        correct: regions.value.length === 0,
      },
    ],
  });
}

function patchRegion(id: string, patch: Partial<Region>): void {
  update({
    regions: regions.value.map((region) => (region.id === id ? { ...region, ...patch } : region)),
  });
}

function removeRegion(id: string): void {
  update({ regions: regions.value.filter((region) => region.id !== id) });
}

const inputClass =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="hotspot-url">{{ t('editor.imageUrl') }}</label>
        <input
          id="hotspot-url"
          type="url"
          :value="imageUrl"
          placeholder="https://…"
          :class="inputClass"
          @input="update({ imageUrl: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="hotspot-alt">
          {{ t('editor.altText') }} <span class="text-danger">*</span>
        </label>
        <input
          id="hotspot-alt"
          type="text"
          :value="(payload.alt as string) ?? ''"
          required
          :class="inputClass"
          @input="update({ alt: ($event.target as HTMLInputElement).value })"
        />
      </div>
    </div>

    <label class="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        class="size-4 accent-brand-600"
        :checked="payload.multiple === true"
        @change="update({ multiple: ($event.target as HTMLInputElement).checked })"
      />
      {{ t('editor.allowMultiple') }}
    </label>

    <div v-if="imageUrl" class="flex flex-col gap-2">
      <p class="text-xs text-ink-subtle">{{ t('editor.hotspotHint') }}</p>
      <div
        class="relative cursor-crosshair overflow-hidden rounded-lg border border-border"
        @click="addRegionAt"
      >
        <img :src="imageUrl" :alt="(payload.alt as string) ?? ''" class="w-full" />
        <div
          v-for="region in regions"
          :key="region.id"
          class="absolute border-2"
          :class="
            region.correct ? 'border-success bg-success/20' : 'border-border-strong bg-ink/10'
          "
          :style="{
            left: `${region.x}%`,
            top: `${region.y}%`,
            width: `${region.width ?? 10}%`,
            height: `${region.height ?? 10}%`,
          }"
        />
      </div>
    </div>

    <div v-for="region in regions" :key="region.id" class="flex flex-wrap items-center gap-2">
      <input
        type="checkbox"
        class="size-4 accent-brand-600"
        :checked="region.correct"
        :aria-label="t('question.markCorrect')"
        @change="patchRegion(region.id, { correct: ($event.target as HTMLInputElement).checked })"
      />
      <input
        type="text"
        :value="region.label"
        :placeholder="t('editor.hotspotLabel')"
        :class="[inputClass, 'min-w-40 flex-1']"
        @input="patchRegion(region.id, { label: ($event.target as HTMLInputElement).value })"
      />
      <input
        v-for="field in ['x', 'y', 'width', 'height'] as const"
        :key="field"
        type="number"
        min="0"
        max="100"
        :value="region[field] ?? 0"
        :aria-label="field"
        :class="[inputClass, 'w-20']"
        @input="
          patchRegion(region.id, { [field]: Number(($event.target as HTMLInputElement).value) })
        "
      />
      <button
        type="button"
        class="rounded-md p-2 text-ink-subtle hover:text-danger"
        :aria-label="t('common.delete')"
        @click="removeRegion(region.id)"
      >
        <svg
          class="size-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>

    <BaseButton
      v-if="!imageUrl"
      variant="secondary"
      size="sm"
      type="button"
      @click="update({ kind: QUESTION_TYPE.HOTSPOT, regions: [] })"
    >
      {{ t('common.retry') }}
    </BaseButton>
  </div>
</template>
