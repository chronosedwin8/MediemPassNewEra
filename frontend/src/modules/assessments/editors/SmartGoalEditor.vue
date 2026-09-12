<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { SMART_DIMENSIONS, SMART_LETTER, SMART_MAX_SCORE } from '@medienpass/shared';

/**
 * Ajustes de una pregunta de objetivo SMART.
 *
 * Hay poco que configurar porque la rúbrica no se configura: son las cinco
 * dimensiones de siempre, y dejar que cada docente las redefiniera acabaría
 * con cinco rúbricas distintas y una estadística que no se puede sumar. Lo
 * que sí decide el docente es el ámbito —eso va en el enunciado—, la extensión
 * mínima y si enseña un ejemplo.
 */

const props = defineProps<{ payload: Record<string, unknown> }>();

const emit = defineEmits<{ 'update:payload': [Record<string, unknown>] }>();

const { t } = useI18n();

const minChars = computed({
  get: () => (typeof props.payload['minChars'] === 'number' ? props.payload['minChars'] : 80),
  set: (value: number) =>
    emit('update:payload', { ...props.payload, minChars: Math.max(0, Math.round(value)) }),
});

const showRubric = computed({
  get: () => props.payload['showRubric'] !== false,
  set: (value: boolean) => emit('update:payload', { ...props.payload, showRubric: value }),
});

const example = computed({
  get: () => (typeof props.payload['example'] === 'string' ? props.payload['example'] : ''),
  set: (value: string) => emit('update:payload', { ...props.payload, example: value }),
});

const inputClass =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <div class="flex flex-col gap-4">
    <!--
      La rúbrica se enseña aquí para que quien escribe el enunciado sepa contra
      qué se va a puntuar. Es la diferencia entre pedir «un objetivo SMART» y
      pedir algo que pueda corregirse igual en dos cursos distintos.
    -->
    <section class="rounded-lg border border-border bg-surface-muted p-3">
      <p class="text-sm font-medium">{{ t('smart.rubricTitle') }}</p>
      <p class="mt-1 text-xs text-ink-subtle">
        {{ t('question.smart.rubricFixed', { max: SMART_MAX_SCORE }) }}
      </p>

      <ul class="mt-3 flex list-none flex-col gap-2 p-0">
        <li v-for="dimension in SMART_DIMENSIONS" :key="dimension" class="flex items-start gap-3">
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
        </li>
      </ul>
    </section>

    <label class="flex max-w-xs flex-col gap-1.5">
      <span class="text-sm font-medium">{{ t('question.smart.minChars') }}</span>
      <input v-model.number="minChars" type="number" min="0" max="2000" :class="inputClass" />
      <span class="text-xs text-ink-subtle">{{ t('question.smart.minCharsHint') }}</span>
    </label>

    <label class="flex items-start gap-3">
      <input
        v-model="showRubric"
        type="checkbox"
        class="mt-0.5 size-4 rounded border-border-strong"
      />
      <span class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ t('question.smart.showRubric') }}</span>
        <span class="text-xs text-ink-subtle">{{ t('question.smart.showRubricHint') }}</span>
      </span>
    </label>

    <label class="flex flex-col gap-1.5">
      <span class="text-sm font-medium">{{ t('question.smart.example') }}</span>
      <textarea
        v-model="example"
        rows="2"
        maxlength="500"
        class="resize-y rounded-md border border-border bg-surface p-3 text-sm outline-none focus:border-brand-500"
        :placeholder="t('question.smart.examplePlaceholder')"
      />
    </label>
  </div>
</template>
