<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { QUESTION_TYPE, type QuestionType } from '@medienpass/shared';
import BaseButton from '@/design-system/BaseButton.vue';

/**
 * Editor de las preguntas que se construyen a partir de listas.
 *
 * Cubre respuesta corta, texto abierto, ordenamiento, línea de tiempo,
 * relacionar, agrupar y completar espacios. Todas ellas se editan igual desde
 * el punto de vista del docente —añadir filas, escribir textos y decir cuál
 * corresponde con cuál—, así que compartir el componente evita seis
 * variaciones del mismo formulario.
 */

const props = defineProps<{
  type: QuestionType;
  payload: Record<string, unknown>;
}>();

const emit = defineEmits<{ 'update:payload': [Record<string, unknown>] }>();
const { t } = useI18n();

type Kind = 'text' | 'shortAnswer' | 'sequence' | 'matching' | 'grouping' | 'fillBlank';

const kind = computed<Kind>(() => {
  switch (props.type) {
    case QUESTION_TYPE.SHORT_ANSWER:
      return 'shortAnswer';
    case QUESTION_TYPE.ORDERING:
    case QUESTION_TYPE.TIMELINE:
      return 'sequence';
    case QUESTION_TYPE.MATCHING:
      return 'matching';
    case QUESTION_TYPE.GROUPING:
      return 'grouping';
    case QUESTION_TYPE.FILL_BLANK:
      return 'fillBlank';
    default:
      return 'text';
  }
});

function update(patch: Record<string, unknown>): void {
  emit('update:payload', { ...props.payload, ...patch });
}

function readArray<T>(key: string): T[] {
  return (props.payload[key] as T[]) ?? [];
}

function generateId(prefix: string, existing: Array<{ id: string }>): string {
  return `${prefix}${existing.length + 1}`;
}

// --- Respuesta corta ---------------------------------------------------------

const acceptedAnswers = computed(() => readArray<string>('acceptedAnswers'));

function setAcceptedAnswers(raw: string): void {
  update({
    acceptedAnswers: raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  });
}

// --- Secuencia ---------------------------------------------------------------

interface SequenceItem {
  id: string;
  text: string;
  correctPosition: number;
  dateLabel?: string;
}

const sequenceItems = computed(() => readArray<SequenceItem>('items'));

function addSequenceItem(): void {
  const items = sequenceItems.value;
  update({
    items: [...items, { id: generateId('i', items), text: '', correctPosition: items.length }],
  });
}

function patchSequenceItem(id: string, patch: Partial<SequenceItem>): void {
  update({
    items: sequenceItems.value.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  });
}

/**
 * Al borrar un elemento se renumeran las posiciones.
 *
 * El esquema exige que sean consecutivas desde cero; dejar un hueco haría que
 * el servidor rechazara la pregunta al guardar.
 */
function removeSequenceItem(id: string): void {
  update({
    items: sequenceItems.value
      .filter((item) => item.id !== id)
      .map((item, index) => ({ ...item, correctPosition: index })),
  });
}

// --- Relacionar y agrupar ----------------------------------------------------

interface Labelled {
  id: string;
  text?: string;
  label?: string;
}

const left = computed(() => readArray<Labelled>('left'));
const right = computed(() => readArray<Labelled>('right'));
const groups = computed(() => readArray<Labelled>('groups'));
const groupItems = computed(() => readArray<{ id: string; text: string; groupId: string }>('items'));
const pairs = computed(() => readArray<{ leftId: string; rightId: string }>('pairs'));

function addTo(key: 'left' | 'right' | 'groups'): void {
  const current = readArray<Labelled>(key);
  const prefix = key === 'left' ? 'l' : key === 'right' ? 'r' : 'g';
  const entry: Labelled =
    key === 'groups'
      ? { id: generateId(prefix, current), label: '' }
      : { id: generateId(prefix, current), text: '' };
  update({ [key]: [...current, entry] });
}

function patchIn(key: 'left' | 'right' | 'groups', id: string, value: string): void {
  const field = key === 'groups' ? 'label' : 'text';
  update({
    [key]: readArray<Labelled>(key).map((entry) =>
      entry.id === id ? { ...entry, [field]: value } : entry,
    ),
  });
}

function setPair(leftId: string, rightId: string): void {
  const others = pairs.value.filter((pair) => pair.leftId !== leftId);
  update({ pairs: rightId ? [...others, { leftId, rightId }] : others });
}

function addGroupItem(): void {
  const items = groupItems.value;
  update({
    items: [...items, { id: generateId('it', items), text: '', groupId: groups.value[0]?.id ?? '' }],
  });
}

function patchGroupItem(id: string, patch: Partial<{ text: string; groupId: string }>): void {
  update({
    items: groupItems.value.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  });
}

// --- Completar espacios ------------------------------------------------------

interface Blank {
  id: string;
  acceptedAnswers: string[];
  caseSensitive: boolean;
  ignoreAccents: boolean;
}

const blanks = computed(() => readArray<Blank>('blanks'));

function addBlank(): void {
  const current = blanks.value;
  const id = generateId('b', current);
  update({
    blanks: [...current, { id, acceptedAnswers: [], caseSensitive: false, ignoreAccents: true }],
    template: `${(props.payload.template as string) ?? ''} {{${id}}}`.trim(),
  });
}

function patchBlank(id: string, answers: string): void {
  update({
    blanks: blanks.value.map((blank) =>
      blank.id === id
        ? { ...blank, acceptedAnswers: answers.split(',').map((value) => value.trim()).filter(Boolean) }
        : blank,
    ),
  });
}

const inputClass =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <!-- Respuesta corta: formas admitidas, una por línea. -->
  <div v-if="kind === 'shortAnswer'" class="flex flex-col gap-2">
    <label class="text-sm font-medium" for="accepted">{{ t('result.correctAnswer') }}</label>
    <textarea
      id="accepted"
      rows="3"
      :value="acceptedAnswers.join('\n')"
      class="resize-y rounded-md border border-border bg-surface p-3 text-sm outline-none focus:border-brand-500"
      @input="setAcceptedAnswers(($event.target as HTMLTextAreaElement).value)"
    />
    <div class="flex gap-4 text-sm">
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          class="size-4 accent-brand-600"
          :checked="payload.ignoreAccents !== false"
          @change="update({ ignoreAccents: ($event.target as HTMLInputElement).checked })"
        />
        Ignorar tildes
      </label>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          class="size-4 accent-brand-600"
          :checked="payload.caseSensitive === true"
          @change="update({ caseSensitive: ($event.target as HTMLInputElement).checked })"
        />
        Distinguir mayúsculas
      </label>
    </div>
  </div>

  <!-- Texto abierto: solo criterios de extensión y rúbrica. -->
  <div v-else-if="kind === 'text'" class="flex flex-col gap-3">
    <div class="flex gap-3">
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="min-words">Mínimo de palabras</label>
        <input
          id="min-words"
          type="number"
          min="0"
          :value="payload.minWords ?? ''"
          class="h-9 w-28 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
          @input="update({ minWords: Number(($event.target as HTMLInputElement).value) || undefined })"
        />
      </div>
    </div>
    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-medium" for="rubric">Criterios de corrección</label>
      <textarea
        id="rubric"
        rows="3"
        :value="(payload.rubric as string) ?? ''"
        class="resize-y rounded-md border border-border bg-surface p-3 text-sm outline-none focus:border-brand-500"
        @input="update({ rubric: ($event.target as HTMLTextAreaElement).value })"
      />
    </div>
  </div>

  <!-- Secuencia: el orden en que se escriben es el correcto. -->
  <div v-else-if="kind === 'sequence'" class="flex flex-col gap-2">
    <p class="text-xs text-ink-subtle">Escribe los elementos en su orden correcto.</p>
    <div v-for="(item, index) in sequenceItems" :key="item.id" class="flex items-center gap-2">
      <span class="w-6 shrink-0 text-center text-xs tabular-nums text-ink-subtle">{{ index + 1 }}</span>
      <input
        type="text"
        :value="item.text"
        :class="[inputClass, 'flex-1']"
        @input="patchSequenceItem(item.id, { text: ($event.target as HTMLInputElement).value })"
      />
      <input
        v-if="type === QUESTION_TYPE.TIMELINE"
        type="text"
        :value="item.dateLabel ?? ''"
        placeholder="1969"
        :class="[inputClass, 'w-24']"
        @input="patchSequenceItem(item.id, { dateLabel: ($event.target as HTMLInputElement).value })"
      />
      <button
        type="button"
        class="rounded-md p-2 text-ink-subtle hover:text-danger"
        :aria-label="t('common.delete')"
        @click="removeSequenceItem(item.id)"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
    <BaseButton variant="secondary" size="sm" type="button" @click="addSequenceItem">
      {{ t('question.addOption') }}
    </BaseButton>
  </div>

  <!-- Relacionar: dos columnas y la correspondencia entre ellas. -->
  <div v-else-if="kind === 'matching'" class="flex flex-col gap-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-2">
        <p class="text-sm font-medium">Columna izquierda</p>
        <input
          v-for="entry in left"
          :key="entry.id"
          type="text"
          :value="entry.text"
          :class="inputClass"
          @input="patchIn('left', entry.id, ($event.target as HTMLInputElement).value)"
        />
        <BaseButton variant="secondary" size="sm" type="button" @click="addTo('left')">+</BaseButton>
      </div>
      <div class="flex flex-col gap-2">
        <p class="text-sm font-medium">Columna derecha</p>
        <input
          v-for="entry in right"
          :key="entry.id"
          type="text"
          :value="entry.text"
          :class="inputClass"
          @input="patchIn('right', entry.id, ($event.target as HTMLInputElement).value)"
        />
        <BaseButton variant="secondary" size="sm" type="button" @click="addTo('right')">+</BaseButton>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <p class="text-sm font-medium">{{ t('result.correctAnswer') }}</p>
      <div v-for="entry in left" :key="entry.id" class="flex items-center gap-3">
        <span class="flex-1 text-sm">{{ entry.text || entry.id }}</span>
        <select
          :class="[inputClass, 'w-56']"
          :value="pairs.find((pair) => pair.leftId === entry.id)?.rightId ?? ''"
          @change="setPair(entry.id, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ t('common.none') }}</option>
          <option v-for="option in right" :key="option.id" :value="option.id">
            {{ option.text || option.id }}
          </option>
        </select>
      </div>
    </div>
  </div>

  <!-- Agrupar: grupos y a cuál pertenece cada elemento. -->
  <div v-else-if="kind === 'grouping'" class="flex flex-col gap-4">
    <div class="flex flex-col gap-2">
      <p class="text-sm font-medium">Grupos</p>
      <input
        v-for="group in groups"
        :key="group.id"
        type="text"
        :value="group.label"
        :class="inputClass"
        @input="patchIn('groups', group.id, ($event.target as HTMLInputElement).value)"
      />
      <BaseButton variant="secondary" size="sm" type="button" @click="addTo('groups')">+</BaseButton>
    </div>

    <div class="flex flex-col gap-2">
      <p class="text-sm font-medium">Elementos</p>
      <div v-for="item in groupItems" :key="item.id" class="flex items-center gap-2">
        <input
          type="text"
          :value="item.text"
          :class="[inputClass, 'flex-1']"
          @input="patchGroupItem(item.id, { text: ($event.target as HTMLInputElement).value })"
        />
        <select
          :class="[inputClass, 'w-48']"
          :value="item.groupId"
          @change="patchGroupItem(item.id, { groupId: ($event.target as HTMLSelectElement).value })"
        >
          <option v-for="group in groups" :key="group.id" :value="group.id">
            {{ group.label || group.id }}
          </option>
        </select>
      </div>
      <BaseButton variant="secondary" size="sm" type="button" @click="addGroupItem">+</BaseButton>
    </div>
  </div>

  <!-- Completar espacios: texto con marcadores y respuestas por hueco. -->
  <div v-else-if="kind === 'fillBlank'" class="flex flex-col gap-3">
    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-medium" for="template">Texto con huecos</label>
      <textarea
        id="template"
        rows="3"
        :value="(payload.template as string) ?? ''"
        class="resize-y rounded-md border border-border bg-surface p-3 text-sm outline-none focus:border-brand-500"
        @input="update({ template: ($event.target as HTMLTextAreaElement).value })"
      />
      <p class="text-xs text-ink-subtle">Cada hueco se escribe como una marca entre llaves dobles.</p>
    </div>

    <div v-for="blank in blanks" :key="blank.id" class="flex items-center gap-3">
      <span class="w-16 shrink-0 font-mono text-xs text-ink-subtle">{{ blank.id }}</span>
      <input
        type="text"
        :value="blank.acceptedAnswers.join(', ')"
        placeholder="respuesta, variante"
        :class="[inputClass, 'flex-1']"
        @input="patchBlank(blank.id, ($event.target as HTMLInputElement).value)"
      />
    </div>

    <BaseButton variant="secondary" size="sm" type="button" @click="addBlank">
      {{ t('question.addOption') }}
    </BaseButton>
  </div>
</template>
