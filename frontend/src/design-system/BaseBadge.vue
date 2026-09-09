<script setup lang="ts">
import { computed } from 'vue';

/**
 * Insignia de estado.
 *
 * El color nunca es la única señal: siempre acompaña a un texto. Un usuario
 * con daltonismo debe poder distinguir «aprobado» de «no aprobado».
 */
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const props = withDefaults(defineProps<{ tone?: Tone }>(), { tone: 'neutral' });

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-ink-muted border-border',
  success: 'bg-success-soft text-success border-success/30',
  warning: 'bg-warning-soft text-warning border-warning/30',
  danger: 'bg-danger-soft text-danger border-danger/30',
  info: 'bg-info-soft text-info border-info/30',
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
};

const classes = computed(() => toneClasses[props.tone]);
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
    :class="classes"
  >
    <slot />
  </span>
</template>
