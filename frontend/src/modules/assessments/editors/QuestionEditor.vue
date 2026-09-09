<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  QUESTION_TYPE,
  localize,
  safeParseQuestionPayload,
  type LocalizedText,
  type QuestionType,
} from '@medienpass/shared';
import ChoiceEditor from './ChoiceEditor.vue';
import ListEditor from './ListEditor.vue';
import HotspotEditor from './HotspotEditor.vue';
import BaseButton from '@/design-system/BaseButton.vue';

/**
 * Editor de una pregunta.
 *
 * Reúne los campos comunes —enunciado, puntos, competencia KMK,
 * retroalimentación— y delega el contenido específico en el editor de su
 * familia, igual que el backend delega la corrección en el calificador de su
 * tipo.
 *
 * El contenido se valida **con el mismo esquema Zod que usa el servidor**
 * antes de enviarlo. Así el docente ve el problema mientras edita, y no
 * después de pulsar guardar.
 */

interface Competency {
  id: string;
  code: string;
  name: LocalizedText;
  subcompetencies: Array<{ id: string; code: string; name: LocalizedText }>;
}

const props = defineProps<{
  competencies: Competency[];
  saving?: boolean;
}>();

const emit = defineEmits<{
  save: [payload: Record<string, unknown>];
  cancel: [];
}>();

const { t, locale } = useI18n();

const type = ref<QuestionType>(QUESTION_TYPE.SINGLE_CHOICE);
const statement = ref('');
const points = ref(1);
const kmkCompetencyId = ref('');
const kmkSubcompetencyId = ref('');
const feedbackCorrect = ref('');
const feedbackIncorrect = ref('');
const payload = ref<Record<string, unknown>>({ kind: QUESTION_TYPE.SINGLE_CHOICE, options: [] });

const CHOICE_FAMILY: QuestionType[] = [
  QUESTION_TYPE.SINGLE_CHOICE,
  QUESTION_TYPE.MULTIPLE_CHOICE,
  QUESTION_TYPE.TRUE_FALSE,
  QUESTION_TYPE.IMAGE_CHOICE,
];

const LIST_FAMILY: QuestionType[] = [
  QUESTION_TYPE.SHORT_ANSWER,
  QUESTION_TYPE.OPEN_TEXT,
  QUESTION_TYPE.LONG_ANSWER,
  QUESTION_TYPE.ORDERING,
  QUESTION_TYPE.TIMELINE,
  QUESTION_TYPE.MATCHING,
  QUESTION_TYPE.GROUPING,
  QUESTION_TYPE.FILL_BLANK,
];

/**
 * Contenido inicial mínimo y válido para cada tipo.
 *
 * Switch exhaustivo a propósito: si mañana se añade un tipo de pregunta y
 * nadie lo contempla aquí, TypeScript lo señala antes de que un docente se
 * encuentre con un formulario vacío.
 */
/* eslint-disable-next-line complexity */
function seedPayload(questionType: QuestionType): Record<string, unknown> {
  switch (questionType) {
    case QUESTION_TYPE.SINGLE_CHOICE:
    case QUESTION_TYPE.MULTIPLE_CHOICE:
      return {
        kind: questionType,
        options: [
          { id: 'a', text: '', correct: false },
          { id: 'b', text: '', correct: false },
        ],
      };
    case QUESTION_TYPE.TRUE_FALSE:
      return { kind: questionType, correct: true };
    case QUESTION_TYPE.IMAGE_CHOICE:
      return { kind: questionType, multiple: false, options: [] };
    case QUESTION_TYPE.SHORT_ANSWER:
      return { kind: questionType, acceptedAnswers: [], caseSensitive: false, ignoreAccents: true };
    case QUESTION_TYPE.OPEN_TEXT:
    case QUESTION_TYPE.LONG_ANSWER:
      return { kind: questionType };
    case QUESTION_TYPE.ORDERING:
    case QUESTION_TYPE.TIMELINE:
      return { kind: questionType, partialCredit: true, items: [] };
    case QUESTION_TYPE.MATCHING:
      return { kind: questionType, partialCredit: true, left: [], right: [], pairs: [] };
    case QUESTION_TYPE.GROUPING:
      return { kind: questionType, partialCredit: true, groups: [], items: [] };
    case QUESTION_TYPE.FILL_BLANK:
      return { kind: questionType, template: '', blanks: [] };
    case QUESTION_TYPE.HOTSPOT:
      return { kind: questionType, imageUrl: '', alt: '', multiple: false, regions: [] };
  }
}

// Cambiar de tipo reinicia el contenido: el de un tipo no sirve para otro.
watch(type, (next) => {
  payload.value = seedPayload(next);
});

const selectedCompetency = computed(() =>
  props.competencies.find((competency) => competency.id === kmkCompetencyId.value),
);

watch(kmkCompetencyId, () => {
  kmkSubcompetencyId.value = '';
});

/**
 * Validación en vivo con el esquema del servidor.
 *
 * Devuelve el primer problema encontrado, que es el que conviene mostrar:
 * volcar doce mensajes a la vez no ayuda a corregir ninguno.
 */
const payloadError = computed<string | null>(() => {
  const result = safeParseQuestionPayload(type.value, payload.value);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? t('errors.QUESTION_PAYLOAD_INVALID');
});

const canSave = computed(
  () =>
    statement.value.trim().length >= 3 &&
    kmkCompetencyId.value !== '' &&
    points.value > 0 &&
    payloadError.value === null,
);

function save(): void {
  emit('save', {
    type: type.value,
    statement: statement.value.trim(),
    points: points.value,
    kmkCompetencyId: kmkCompetencyId.value,
    kmkSubcompetencyId: kmkSubcompetencyId.value || null,
    feedbackCorrect: feedbackCorrect.value.trim() || null,
    feedbackIncorrect: feedbackIncorrect.value.trim() || null,
    payload: payload.value,
  });
}

const inputClass =
  'h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="save">
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="question-type">{{ t('question.type') }}</label>
        <select id="question-type" v-model="type" :class="inputClass">
          <option v-for="value in Object.values(QUESTION_TYPE)" :key="value" :value="value">
            {{ t(`question.types.${value}`) }}
          </option>
        </select>
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="question-points">{{ t('question.points') }}</label>
        <input
          id="question-points"
          v-model.number="points"
          type="number"
          min="0.25"
          step="0.25"
          :class="[inputClass, 'w-32']"
        />
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-medium" for="statement">{{ t('question.statement') }}</label>
      <textarea
        id="statement"
        v-model="statement"
        rows="2"
        required
        class="resize-y rounded-md border border-border bg-surface p-3 text-sm outline-none focus:border-brand-500"
      />
    </div>

    <!-- La competencia es obligatoria: sin ella no hay analítica KMK. -->
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="competency">
          {{ t('question.competency') }} <span class="text-danger">*</span>
        </label>
        <select id="competency" v-model="kmkCompetencyId" required :class="inputClass">
          <option value="">{{ t('common.none') }}</option>
          <option v-for="competency in competencies" :key="competency.id" :value="competency.id">
            KMK {{ competency.code }} · {{ localize(competency.name, locale as never) }}
          </option>
        </select>
        <p v-if="!kmkCompetencyId" class="text-xs text-ink-subtle">
          {{ t('question.competencyRequired') }}
        </p>
      </div>

      <div v-if="selectedCompetency?.subcompetencies.length" class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="subcompetency">{{ t('question.subcompetency') }}</label>
        <select id="subcompetency" v-model="kmkSubcompetencyId" :class="inputClass">
          <option value="">{{ t('common.none') }}</option>
          <option v-for="sub in selectedCompetency.subcompetencies" :key="sub.id" :value="sub.id">
            {{ sub.code }} · {{ localize(sub.name, locale as never) }}
          </option>
        </select>
      </div>
    </div>

    <!-- Contenido específico del tipo. -->
    <div class="rounded-lg border border-border bg-surface-muted p-4">
      <ChoiceEditor
        v-if="CHOICE_FAMILY.includes(type)"
        :type="type"
        :payload="payload"
        @update:payload="payload = $event"
      />
      <ListEditor
        v-else-if="LIST_FAMILY.includes(type)"
        :type="type"
        :payload="payload"
        @update:payload="payload = $event"
      />
      <HotspotEditor v-else :payload="payload" @update:payload="payload = $event" />

      <p v-if="payloadError" class="mt-3 text-sm text-danger" role="alert">{{ payloadError }}</p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="fb-correct">{{ t('question.feedbackCorrect') }}</label>
        <input id="fb-correct" v-model="feedbackCorrect" type="text" :class="inputClass" />
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="fb-incorrect">{{ t('question.feedbackIncorrect') }}</label>
        <input id="fb-incorrect" v-model="feedbackIncorrect" type="text" :class="inputClass" />
      </div>
    </div>

    <div class="flex justify-end gap-2">
      <BaseButton variant="secondary" type="button" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </BaseButton>
      <BaseButton type="submit" :disabled="!canSave" :loading="saving">
        {{ t('common.save') }}
      </BaseButton>
    </div>
  </form>
</template>
