<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Answer, QuestionType } from '@medienpass/shared';

/**
 * Ordenar una secuencia. Sirve a `ORDERING` y a `TIMELINE`.
 *
 * El reordenamiento se hace con **botones**, no solo arrastrando. Arrastrar
 * es cómodo con ratón e imposible con teclado o con lector de pantalla, y
 * esta pregunta debe poder responderse sin ratón.
 */

interface OrderItem {
  id: string;
  text: string;
}

const props = defineProps<{
  type: QuestionType;
  payload: { items?: OrderItem[] };
  modelValue: Answer | null;
}>();

const emit = defineEmits<{ 'update:modelValue': [Answer] }>();
const { t } = useI18n();

const items = computed(() => props.payload.items ?? []);

/** Orden actual: el elegido por el estudiante o el de presentación. */
const order = computed<string[]>(() => {
  const answer = props.modelValue;
  if (answer && 'order' in answer && answer.order.length > 0) return answer.order;
  return items.value.map((item) => item.id);
});

const orderedItems = computed(() =>
  order.value
    .map((id) => items.value.find((item) => item.id === id))
    .filter((item): item is OrderItem => item !== undefined),
);

function emitOrder(next: string[]): void {
  emit('update:modelValue', { kind: props.type, order: next } as Answer);
}

function move(index: number, delta: number): void {
  const target = index + delta;
  if (target < 0 || target >= order.value.length) return;

  const next = [...order.value];
  [next[index], next[target]] = [next[target]!, next[index]!];
  emitOrder(next);

  // El foco sigue al elemento movido: sin esto, quien navega con teclado
  // pierde su sitio en cada pulsación.
  requestAnimationFrame(() => {
    document.getElementById(`order-item-${next[target]}`)?.focus();
  });
}

/**
 * Se registra el orden inicial como respuesta.
 *
 * Sin esto, un estudiante que considere correcto el orden mostrado no
 * enviaría nada y su respuesta contaría como en blanco.
 */
onMounted(() => {
  if (!props.modelValue || !('order' in props.modelValue) || props.modelValue.order.length === 0) {
    emitOrder(items.value.map((item) => item.id));
  }
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="text-xs text-ink-subtle">{{ t('attempt.dragToOrder') }}</p>

    <ol class="flex flex-col gap-2">
      <li
        v-for="(item, index) in orderedItems"
        :id="`order-item-${item.id}`"
        :key="item.id"
        tabindex="-1"
        class="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
      >
        <span
          class="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold tabular-nums"
          aria-hidden="true"
        >
          {{ index + 1 }}
        </span>

        <span class="flex-1 text-sm">{{ item.text }}</span>

        <div class="flex shrink-0 gap-1">
          <button
            type="button"
            class="rounded-md border border-border p-2 text-ink-muted transition-colors hover:bg-surface-muted disabled:opacity-30"
            :disabled="index === 0"
            :aria-label="`${t('attempt.moveUp')}: ${item.text}`"
            @click="move(index, -1)"
          >
            <svg
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            class="rounded-md border border-border p-2 text-ink-muted transition-colors hover:bg-surface-muted disabled:opacity-30"
            :disabled="index === orderedItems.length - 1"
            :aria-label="`${t('attempt.moveDown')}: ${item.text}`"
            @click="move(index, 1)"
          >
            <svg
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </li>
    </ol>
  </div>
</template>
