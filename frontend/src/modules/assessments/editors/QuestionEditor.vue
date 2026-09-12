<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Question } from '../types';
import { isRichTextEmpty } from '@medienpass/shared';
import { ApiError } from '@/services/http';
import RichTextEditor from '@/design-system/RichTextEditor.vue';
import EvidenceSettings from './EvidenceSettings.vue';
import { seedPayload } from './seed-payload';
import { CHOICE_FAMILY, LIST_FAMILY, MEDIA_FAMILY } from './question-families';
import { useSignedUpload } from '@/composables/useSignedUpload';
import { useToast } from '@/composables/useToast';
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
import MediaResponseEditor from './MediaResponseEditor.vue';
import SmartGoalEditor from './SmartGoalEditor.vue';
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

/**
 * Pregunta existente que se está editando.
 *
 * Cuando llega, el formulario se abre con sus valores; cuando es `null`, se
 * abre vacío para una nueva. El componente padre fuerza el remontado con una
 * `key`, así que basta con sembrar el estado una vez y no hace falta observar
 * el prop.
 */
const props = defineProps<{
  competencies: Competency[];
  question?: Question | null;
  /** Necesaria para subir imágenes: la clave del archivo cuelga de la versión. */
  versionId?: string;
  saving?: boolean;
}>();

const emit = defineEmits<{
  save: [payload: Record<string, unknown>];
  cancel: [];
}>();

const { t, locale } = useI18n();
const toast = useToast();

const type = ref<QuestionType>(QUESTION_TYPE.SINGLE_CHOICE);
const statement = ref('');
const points = ref(1);
const kmkCompetencyId = ref('');
const kmkSubcompetencyId = ref('');
const feedbackCorrect = ref('');
const feedbackIncorrect = ref('');
const payload = ref<Record<string, unknown>>({ kind: QUESTION_TYPE.SINGLE_CHOICE, options: [] });

const allowsEvidence = ref(false);
const requiresEvidence = ref(false);
const maxEvidenceFiles = ref(3);
const editorRef = ref<InstanceType<typeof RichTextEditor> | null>(null);
const imageInput = ref<HTMLInputElement | null>(null);

// Prellenado al editar. Se hace aquí, en la creación del componente, porque el
// padre lo remonta con una `key` distinta por pregunta.
if (props.question) {
  type.value = props.question.type;
  statement.value = props.question.statement;
  points.value = props.question.points;
  kmkCompetencyId.value = props.question.kmkCompetency.id;
  kmkSubcompetencyId.value = props.question.kmkSubcompetency?.id ?? '';
  feedbackCorrect.value = props.question.feedbackCorrect ?? '';
  feedbackIncorrect.value = props.question.feedbackIncorrect ?? '';
  payload.value = { ...props.question.payload };
  allowsEvidence.value = props.question.allowsEvidence ?? false;
  requiresEvidence.value = props.question.requiresEvidence ?? false;
  maxEvidenceFiles.value = props.question.maxEvidenceFiles ?? 3;
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
    !isRichTextEmpty(statement.value) &&
    kmkCompetencyId.value !== '' &&
    points.value > 0 &&
    payloadError.value === null,
);

/**
 * Subida de imágenes del enunciado.
 *
 * Solo tiene sentido con la versión ya creada: la clave del archivo cuelga de
 * ella, y hasta que existe no hay dónde guardarla.
 */
const imageUpload = useSignedUpload<{ downloadUrl: string }>({
  request: '/files/question-media/upload-url',
  confirm: '/files/question-media/confirm',
  context: () => ({ versionId: props.versionId }),
});

async function uploadImage(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file || !props.versionId) return;

  try {
    const stored = await imageUpload.upload(file);
    editorRef.value?.insertImage(stored.downloadUrl, file.name);
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    if (imageInput.value) imageInput.value.value = '';
  }
}

function save(): void {
  emit('save', {
    type: type.value,
    statement: statement.value.trim(),
    allowsEvidence: allowsEvidence.value,
    // Exigir sin admitir bloquearía al estudiante, así que se corrige aquí
    // además de en el servidor: la interfaz no debe poder pedir lo imposible.
    requiresEvidence: allowsEvidence.value && requiresEvidence.value,
    maxEvidenceFiles: maxEvidenceFiles.value,
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
      <span class="text-sm font-medium">{{ t('question.statement') }}</span>
      <RichTextEditor ref="editorRef" v-model="statement" :aria-label="t('question.statement')">
        <template #toolbar-extra>
          <span class="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <input
            ref="imageInput"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            class="sr-only"
            @change="uploadImage"
          />
          <button
            type="button"
            class="h-8 rounded px-2 text-xs text-ink-muted hover:bg-surface-muted"
            :disabled="imageUpload.uploading.value || !versionId"
            :title="t('editor.insertImage')"
            @click="imageInput?.click()"
          >
            {{ imageUpload.uploading.value ? t('common.saving') : t('editor.insertImage') }}
          </button>
        </template>
      </RichTextEditor>
    </div>

    <EvidenceSettings
      v-model:allows="allowsEvidence"
      v-model:requires="requiresEvidence"
      v-model:max-files="maxEvidenceFiles"
    />

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
        <label class="text-sm font-medium" for="subcompetency">{{
          t('question.subcompetency')
        }}</label>
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
      <SmartGoalEditor
        v-else-if="type === QUESTION_TYPE.SMART_GOAL"
        :payload="payload"
        @update:payload="payload = $event"
      />

      <MediaResponseEditor
        v-else-if="MEDIA_FAMILY.includes(type)"
        :type="type"
        :payload="payload"
        @update:payload="payload = $event"
      />

      <HotspotEditor v-else :payload="payload" @update:payload="payload = $event" />

      <p v-if="payloadError" class="mt-3 text-sm text-danger" role="alert">{{ payloadError }}</p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="fb-correct">{{
          t('question.feedbackCorrect')
        }}</label>
        <input id="fb-correct" v-model="feedbackCorrect" type="text" :class="inputClass" />
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="fb-incorrect">{{
          t('question.feedbackIncorrect')
        }}</label>
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
