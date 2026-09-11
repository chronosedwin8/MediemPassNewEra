<script setup lang="ts">
/**
 * Una cifra con su etiqueta.
 *
 * Existe porque un panel es sobre todo repetición de esto, y hacerlo a mano en
 * cada tarjeta acaba dando ocho tamaños de número ligeramente distintos. El
 * pie es opcional y es donde va lo que evita malinterpretar la cifra —de qué
 * total se trata, sobre qué se calcula—, que en un panel es la mitad del
 * trabajo.
 */

withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    hint?: string;
    tone?: 'default' | 'success' | 'warning' | 'danger';
  }>(),
  { tone: 'default' },
);

const TONE_CLASS: Record<string, string> = {
  default: 'text-ink',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};
</script>

<template>
  <div class="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
    <p class="text-sm text-ink-muted">{{ label }}</p>
    <p class="text-2xl font-semibold tabular-nums" :class="TONE_CLASS[tone]">{{ value }}</p>
    <p v-if="hint" class="text-xs text-ink-subtle">{{ hint }}</p>
  </div>
</template>
