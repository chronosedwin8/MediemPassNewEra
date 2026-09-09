<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { QuestionType } from '@medienpass/shared';
import RichTextView from '@/design-system/RichTextView.vue';
import { MANUAL_TYPES, solutionText } from './solution-text';

/**
 * La respuesta correcta y la retroalimentación, para el docente.
 *
 * Va en un bloque separado y visualmente distinto del enunciado, no intercalado
 * en él. Es lo que permite mirar la pregunta como la verá la clase y, en un
 * segundo movimiento de ojos, comprobar si la solución es la que debe ser.
 * Mezclarlos convertiría la previsualización en algo que ya no se parece al
 * examen.
 *
 * Sirve sobre todo para revisar lo que ha escrito la IA: una pregunta puede ser
 * impecable de forma y tener marcada como correcta la opción equivocada, y eso
 * no lo detecta ninguna validación automática.
 */

interface Solution {
  payload: Record<string, unknown>;
  feedbackCorrect: string | null;
  feedbackIncorrect: string | null;
  explanation: string | null;
}

const props = defineProps<{ type: QuestionType; solution: Solution }>();

const { t } = useI18n();

/**
 * La respuesta correcta, en texto.
 *
 * La traducción de cada tipo vive en `solution-text.ts`, indexada por tipo:
 * así, añadir un tipo de pregunta sin contemplarlo aquí es un error de
 * compilación y no una previsualización que dice «sin respuesta correcta»
 * sobre una pregunta que sí la tiene.
 */
const correctAnswer = computed(() =>
  solutionText(props.type, props.solution.payload, { yes: t('common.yes'), no: t('common.no') }),
);

const isManual = computed(() => MANUAL_TYPES.includes(props.type));
</script>

<template>
  <section class="rounded-md border border-success/40 bg-success-soft/40 p-3">
    <h4 class="text-xs font-semibold uppercase tracking-wide text-success">
      {{ t('preview.solution') }}
    </h4>

    <p v-if="isManual" class="mt-2 text-sm text-ink-muted">{{ t('preview.manualGrading') }}</p>

    <ul v-else-if="correctAnswer.length > 0" class="mt-2 flex flex-col gap-1 text-sm">
      <li v-for="(line, index) in correctAnswer" :key="index">{{ line }}</li>
    </ul>

    <!--
      Sin respuesta correcta marcada, la pregunta no se puede calificar. Es el
      fallo más probable de una pregunta generada, así que se señala en rojo en
      lugar de dejar el hueco vacío.
    -->
    <p v-else class="mt-2 text-sm font-medium text-danger">{{ t('preview.noSolution') }}</p>

    <dl class="mt-3 flex flex-col gap-2 text-sm">
      <div v-if="solution.feedbackCorrect">
        <dt class="text-xs text-ink-subtle">{{ t('question.feedbackCorrect') }}</dt>
        <dd><RichTextView :html="solution.feedbackCorrect" compact /></dd>
      </div>
      <div v-if="solution.feedbackIncorrect">
        <dt class="text-xs text-ink-subtle">{{ t('question.feedbackIncorrect') }}</dt>
        <dd><RichTextView :html="solution.feedbackIncorrect" compact /></dd>
      </div>
      <div v-if="solution.explanation">
        <dt class="text-xs text-ink-subtle">{{ t('question.explanation') }}</dt>
        <dd><RichTextView :html="solution.explanation" compact /></dd>
      </div>
    </dl>
  </section>
</template>
