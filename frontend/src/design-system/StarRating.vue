<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Representación por estrellas de la nota.
 *
 * **Ojo: esto no es una valoración convencional.** Refleja la escala alemana,
 * donde 1.0 es el mejor resultado y 6.0 el peor. Cinco estrellas significan
 * un 1.0, no «cinco de seis».
 *
 * Por eso el componente nunca muestra estrellas solas: siempre van
 * acompañadas del valor numérico y de la etiqueta textual, y llevan una
 * descripción accesible completa. Un lector de pantalla debe oír «Nota 1,0 de
 * 6,0 — Excelente», no «cinco estrellas», que induciría exactamente al
 * malentendido contrario.
 */

const props = withDefaults(
  defineProps<{
    filled: number;
    total: number;
    /** Valor de la nota, p. ej. 1.0. */
    value?: number | null;
    /** Etiqueta de la banda, p. ej. «Excelente». */
    label?: string | null;
    /** Nota peor posible de la escala, para dar contexto en el texto. */
    worstValue?: number | null;
    size?: 'md' | 'lg';
    showLegend?: boolean;
  }>(),
  { value: null, label: null, worstValue: null, size: 'md', showLegend: true },
);

const { t, n } = useI18n();

const stars = computed(() =>
  Array.from({ length: props.total }, (_, index) => index < props.filled),
);

const sizeClass = computed(() => (props.size === 'lg' ? 'size-9' : 'size-6'));

/**
 * Descripción completa para tecnologías de apoyo.
 *
 * Se construye con el valor y la etiqueta, no con el número de estrellas: es
 * la información que de verdad importa.
 */
const accessibleDescription = computed(() => {
  if (props.value === null) return t('grade.notAvailable');
  return t('grade.accessibleDescription', {
    value: n(props.value, 'grade'),
    worst: props.worstValue !== null ? n(props.worstValue, 'grade') : '6,0',
    label: props.label ?? '',
  });
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-3">
      <!--
        Las estrellas son decorativas: la información va en el texto contiguo
        y en la descripción accesible. Marcarlas como ocultas evita que un
        lector de pantalla enumere seis iconos sin sentido.
      -->
      <div class="flex items-center gap-0.5" aria-hidden="true">
        <svg
          v-for="(isFilled, index) in stars"
          :key="index"
          :class="[sizeClass, isFilled ? 'text-warning' : 'text-border-strong']"
          viewBox="0 0 24 24"
          :fill="isFilled ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M11.48 3.5a.56.56 0 011.04 0l2.12 5.11 5.52.44c.5.04.7.67.32 1l-4.2 3.6 1.28 5.39a.56.56 0 01-.84.6L12 16.72l-4.72 2.92a.56.56 0 01-.84-.6l1.28-5.4-4.2-3.6a.56.56 0 01.32-.99l5.52-.44 2.12-5.11z"
          />
        </svg>
      </div>

      <p v-if="value !== null" class="flex items-baseline gap-2">
        <span :class="size === 'lg' ? 'text-3xl' : 'text-xl'" class="font-semibold tabular-nums">
          {{ n(value, 'grade') }}
        </span>
        <span v-if="label" class="text-sm text-ink-muted">{{ label }}</span>
      </p>
    </div>

    <!-- Texto solo para lectores de pantalla, con el significado completo. -->
    <p class="sr-only" role="status">{{ accessibleDescription }}</p>

    <!--
      Leyenda visible: sin ella, cualquiera interpretaría más estrellas como
      «mejor valoración» en lugar de «mejor nota en una escala invertida».
    -->
    <p v-if="showLegend" class="text-xs text-ink-subtle">
      {{ t('grade.scaleLegend') }}
    </p>
  </div>
</template>
