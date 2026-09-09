<script setup lang="ts">
import { computed } from 'vue';

/**
 * Botón base.
 *
 * Toda acción de la aplicación pasa por aquí. Concentrarlas garantiza que el
 * tamaño de zona táctil, el estado de foco y el comportamiento durante la
 * carga sean idénticos en toda la plataforma, en lugar de depender de que
 * cada pantalla se acuerde.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const props = withDefaults(
  defineProps<{
    variant?: Variant;
    size?: Size;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    block?: boolean;
  }>(),
  { variant: 'primary', size: 'md', type: 'button', disabled: false, loading: false, block: false },
);

const emit = defineEmits<{ click: [MouseEvent] }>();

const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand-600 text-ink-inverse hover:bg-brand-700 active:bg-brand-800',
  secondary:
    'bg-surface text-ink border border-border-strong hover:bg-surface-muted active:bg-surface-muted',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-muted hover:text-ink',
  danger: 'bg-danger text-ink-inverse hover:opacity-90 active:opacity-80',
};

// Alturas mínimas de 36/40/44 px: la última cumple el objetivo táctil
// recomendado, y es la que se usa en el runner de evaluación en tablet.
const sizeClasses: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
};

const classes = computed(() => [
  'inline-flex items-center justify-center rounded-md font-medium transition-colors',
  'disabled:opacity-50 disabled:pointer-events-none',
  variantClasses[props.variant],
  sizeClasses[props.size],
  props.block ? 'w-full' : '',
]);
</script>

<template>
  <button
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
    :aria-busy="loading"
    @click="emit('click', $event)"
  >
    <!--
      El indicador de carga se anuncia también por texto: un lector de
      pantalla no percibe una rueda girando.
    -->
    <svg
      v-if="loading"
      class="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
      <path
        class="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
    <slot />
  </button>
</template>
