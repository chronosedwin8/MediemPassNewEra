<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { Question } from './types';
import EmptyState from '@/design-system/EmptyState.vue';

/**
 * Las preguntas de una versión, en orden.
 *
 * Solo presenta: editar y borrar se emiten hacia arriba, donde vive el estado
 * de la versión. Los botones desaparecen cuando la versión ya está publicada,
 * que es la misma regla que aplica el servidor.
 */

const { questions, editable } = defineProps<{
  questions: Question[];
  editable: boolean;
  showingEditor: boolean;
}>();

const emit = defineEmits<{
  edit: [question: Question];
  remove: [questionId: string];
  move: [questionId: string, direccion: -1 | 1];
}>();

const { t } = useI18n();
</script>

<template>
  <EmptyState v-if="questions.length === 0 && !showingEditor" :title="t('question.empty')" />

  <ol v-else class="flex flex-col gap-3">
    <li
      v-for="(question, index) in questions"
      :key="question.id"
      class="flex items-start gap-3 rounded-md border border-border p-3"
    >
      <!--
        Flechas y no arrastrar: una lista de treinta preguntas en una tableta
        se reordena mejor a toques que arrastrando, y con teclado también.
      -->
      <span class="mt-0.5 flex w-6 shrink-0 flex-col items-center gap-0.5">
        <button
          v-if="editable"
          type="button"
          class="text-ink-subtle hover:text-ink disabled:opacity-30"
          :disabled="index === 0"
          :aria-label="t('question.moveUp')"
          @click="emit('move', question.id, -1)"
        >
          ↑
        </button>
        <span class="text-xs tabular-nums text-ink-subtle">{{ index + 1 }}</span>
        <button
          v-if="editable"
          type="button"
          class="text-ink-subtle hover:text-ink disabled:opacity-30"
          :disabled="index === questions.length - 1"
          :aria-label="t('question.moveDown')"
          @click="emit('move', question.id, 1)"
        >
          ↓
        </button>
      </span>

      <div class="min-w-0 flex-1">
        <p class="text-sm">{{ question.statement }}</p>
        <p class="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <span
            class="rounded-full px-2 py-0.5 font-medium"
            :style="{
              backgroundColor: `${question.kmkCompetency.color}1a`,
              color: question.kmkCompetency.color,
            }"
          >
            KMK {{ question.kmkCompetency.code }}
          </span>
          <span class="text-ink-subtle">{{ t(`question.types.${question.type}`) }}</span>
          <span class="text-ink-subtle">
            {{ t('assessment.totalPoints', { points: question.points }) }}
          </span>
        </p>
      </div>

      <button
        v-if="editable"
        type="button"
        class="shrink-0 rounded-md p-2 text-ink-subtle hover:bg-surface-muted hover:text-brand-600"
        :aria-label="`${t('common.edit')}: ${question.statement}`"
        @click="emit('edit', question)"
      >
        <svg
          class="size-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.86 4.49a1.75 1.75 0 012.47 2.47L8.6 17.7l-3.3.83.83-3.3L16.86 4.49z"
          />
        </svg>
      </button>

      <button
        v-if="editable"
        type="button"
        class="shrink-0 rounded-md p-2 text-ink-subtle hover:bg-surface-muted hover:text-danger"
        :aria-label="`${t('common.delete')}: ${question.statement}`"
        @click="emit('remove', question.id)"
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
    </li>
  </ol>
</template>
