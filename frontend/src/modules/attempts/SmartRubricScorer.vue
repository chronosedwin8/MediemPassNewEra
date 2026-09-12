<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  SMART_DIMENSIONS,
  SMART_LETTER,
  SMART_LEVEL_MAX,
  SMART_MAX_SCORE,
  isSmartScoreComplete,
  resolveSmartBand,
  smartScoreToPoints,
  totalSmartScore,
  type SmartDimension,
  type SmartScores,
} from '@medienpass/shared';

/**
 * Puntuar un objetivo con la rúbrica SMART.
 *
 * Cinco dimensiones de 0 a 4 y el total, la banda y los puntos calculados en
 * vivo. El cálculo se hace con las mismas funciones del paquete compartido que
 * usa el servidor: la pantalla enseña lo que se va a guardar, no una
 * aproximación suya.
 *
 * El botón de guardar queda bloqueado hasta que están las cinco. Permitir
 * enviar cuatro haría que la estadística por dimensión mezclara objetivos
 * valorados enteros con otros a medias, y la media de una dimensión dejaría de
 * significar nada.
 */

const props = defineProps<{ scores: SmartScores; questionPoints: number }>();

const emit = defineEmits<{ 'update:scores': [SmartScores] }>();

const { t } = useI18n();

const total = computed(() => totalSmartScore(props.scores));
const complete = computed(() => isSmartScoreComplete(props.scores));
const band = computed(() => resolveSmartBand(total.value));
const points = computed(() => smartScoreToPoints(props.scores, props.questionPoints));

const LEVELS = Array.from({ length: SMART_LEVEL_MAX + 1 }, (_, index) => index);

const BAND_TONE: Record<string, string> = {
  EXCELENTE: 'bg-success-soft text-ink',
  ALTO: 'bg-info-soft text-ink',
  BASICO: 'bg-warning-soft text-ink',
  BAJO: 'bg-danger-soft text-ink',
  INICIAL: 'bg-danger-soft text-ink',
};

function setLevel(dimension: SmartDimension, level: number): void {
  emit('update:scores', { ...props.scores, [dimension]: level });
}
</script>

<template>
  <section class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <p class="text-sm font-medium">{{ t('smart.rubricTitle') }}</p>
      <p class="text-xs text-ink-subtle">{{ t('smart.levelLegend') }}</p>
    </div>

    <div v-for="dimension in SMART_DIMENSIONS" :key="dimension" class="flex flex-col gap-1">
      <div class="flex items-start gap-2">
        <span
          class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-100 text-xs font-bold text-brand-700"
          aria-hidden="true"
        >
          {{ SMART_LETTER[dimension] }}
        </span>
        <span class="text-sm">
          <span class="font-medium">{{ t(`smart.dimension.${dimension}.name`) }}</span>
          <span class="block text-xs text-ink-muted">
            {{ t(`smart.dimension.${dimension}.indicator`) }}
          </span>
        </span>
      </div>

      <div class="ml-8 flex flex-wrap gap-1" role="group">
        <button
          v-for="level in LEVELS"
          :key="level"
          type="button"
          :aria-pressed="scores[dimension] === level"
          :title="t(`smart.level.${level}`)"
          :class="[
            'h-8 w-8 rounded-md border text-sm font-medium transition-colors',
            scores[dimension] === level
              ? 'border-brand-600 bg-brand-600 text-ink-inverse'
              : 'border-border-strong bg-surface text-ink-muted hover:bg-surface-muted',
          ]"
          @click="setLevel(dimension, level)"
        >
          {{ level }}
        </button>
      </div>
    </div>

    <!--
      El total, la banda y los puntos, calculados con las mismas funciones que
      usa el servidor: lo que se ve aquí es lo que se va a guardar.
    -->
    <div class="flex flex-wrap items-center gap-3 border-t border-border pt-3">
      <span class="text-sm">
        <span class="text-ink-muted">{{ t('smart.total') }}:</span>
        <span class="font-semibold tabular-nums"> {{ total }} / {{ SMART_MAX_SCORE }}</span>
      </span>

      <span
        class="rounded-md px-2 py-1 text-xs font-medium"
        :class="BAND_TONE[band] ?? 'bg-surface-muted'"
      >
        {{ t(`smart.band.${band}`) }}
      </span>

      <span class="text-sm text-ink-muted">
        {{ t('smart.pointsFromRubric', { points, max: questionPoints }) }}
      </span>

      <span v-if="!complete" class="text-xs text-warning">{{ t('smart.incomplete') }}</span>
    </div>
  </section>
</template>
