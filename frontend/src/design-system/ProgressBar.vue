<script setup lang="ts">
import { computed } from 'vue';

/** Barra de progreso accesible: expone su valor, no solo su anchura. */
const props = withDefaults(
  defineProps<{ value: number; max?: number; label?: string; tone?: 'brand' | 'success' }>(),
  { max: 100, tone: 'brand' },
);

const percentage = computed(() =>
  props.max > 0 ? Math.min(100, Math.max(0, (props.value / props.max) * 100)) : 0,
);
</script>

<template>
  <div
    class="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
    role="progressbar"
    :aria-valuenow="Math.round(percentage)"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-label="label"
  >
    <div
      class="h-full rounded-full transition-[width] duration-300"
      :class="tone === 'success' ? 'bg-success' : 'bg-brand-600'"
      :style="{ width: `${percentage}%` }"
    />
  </div>
</template>
