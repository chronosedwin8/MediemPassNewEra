<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  EMBED_PLATFORMS,
  TRAINING_CONTENT_TYPE,
  TRAINING_CONTENT_TYPES,
  isEmbeddable,
  type LocalizedText,
} from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import LocalizedField from '@/design-system/LocalizedField.vue';
import { useToast } from '@/composables/useToast';
import { useSignedUpload } from '@/composables/useSignedUpload';
import BlockAttachments from './BlockAttachments.vue';

/**
 * Un bloque del material: título, cuerpo con formato, enlace y adjuntos.
 *
 * El tipo decide qué se pide, no qué se puede escribir: un bloque de vídeo
 * sigue admitiendo un texto que lo introduzca, porque un vídeo suelto sin una
 * línea que diga qué mirar es material a medias. Lo único que cambia es qué
 * campo se resalta y qué icono lo acompaña.
 *
 * Las imágenes van dentro del texto —se suben desde la barra del editor— y los
 * adjuntos van aparte. Es la misma distinción que hace cualquiera al escribir:
 * la foto que ilustra un párrafo no es lo mismo que el PDF que se descarga.
 */

interface StoredFile {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

interface ContentBlock {
  id: string;
  type: string;
  title: LocalizedText;
  body: LocalizedText | null;
  url: string | null;
  assessmentId: string | null;
  position: number;
  files: StoredFile[];
}

interface EvaluacionDocente {
  id: string;
  title: string;
}

const props = defineProps<{ block: ContentBlock; index: number; total: number }>();

const emit = defineEmits<{
  saved: [];
  removed: [];
  move: [direction: -1 | 1];
}>();

const { t } = useI18n();
const toast = useToast();

const open = ref(false);
const saving = ref(false);
const files = ref<StoredFile[]>([...props.block.files]);

const draft = reactive({
  type: props.block.type,
  title: { ...props.block.title } as Partial<LocalizedText>,
  body: { ...(props.block.body ?? {}) } as Partial<LocalizedText>,
  url: props.block.url ?? '',
  assessmentId: props.block.assessmentId ?? '',
});

const TYPES = TRAINING_CONTENT_TYPES;

const ICONS: Record<string, string> = {
  TEXT: '\u{1F4C4}',
  VIDEO: '\u{1F3AC}',
  AUDIO: '\u{1F3A7}',
  EMBED: '\u{1F9E9}',
  DOCUMENT: '\u{1F4CE}',
  LINK: '\u{1F517}',
  ACTIVITY: '\u{270D}\u{FE0F}',
  ASSESSMENT: '\u{1F4DD}',
};

/** Los tipos que sin dirección no son nada. */
const URL_TYPES: string[] = [
  TRAINING_CONTENT_TYPE.VIDEO,
  TRAINING_CONTENT_TYPE.AUDIO,
  TRAINING_CONTENT_TYPE.EMBED,
  TRAINING_CONTENT_TYPE.LINK,
];

const urlRequired = computed(() => URL_TYPES.includes(draft.type));
const esEvaluacion = computed(() => draft.type === TRAINING_CONTENT_TYPE.ASSESSMENT);

/** Las plataformas que sí se incrustan, para decirlo antes y no después. */
const plataformas = EMBED_PLATFORMS.map((plataforma) => plataforma.label).join(', ');

/*
 * Se avisa mientras se escribe, no al guardar. Una dirección de Genially
 * copiada de la barra del navegador se incrusta; la de «compartir» de algunas
 * plataformas, no, y enterarse al publicar significa volver a entrar.
 */
const incrustable = computed(
  () =>
    draft.type !== TRAINING_CONTENT_TYPE.EMBED ||
    draft.url.trim().length === 0 ||
    isEmbeddable(draft.url.trim()),
);

const evaluaciones = ref<EvaluacionDocente[]>([]);

watch(
  () => draft.type,
  async (tipo) => {
    if (tipo !== TRAINING_CONTENT_TYPE.ASSESSMENT || evaluaciones.value.length > 0) return;
    try {
      const resultado = await http.list<EvaluacionDocente>('/assessments', {
        audience: 'TEACHER',
        status: 'PUBLISHED',
        pageSize: 100,
      });
      evaluaciones.value = resultado.items;
    } catch {
      evaluaciones.value = [];
    }
  },
  { immediate: true },
);

const hasTitle = computed(() => Object.values(draft.title).some((value) => value?.trim()));
const canSave = computed(
  () =>
    hasTitle.value &&
    (!urlRequired.value || draft.url.trim().length > 0) &&
    incrustable.value &&
    (!esEvaluacion.value || draft.assessmentId !== ''),
);

/** La subida de las imágenes que van dentro del texto. */
const upload = useSignedUpload<StoredFile & { downloadUrl: string }>({
  request: '/files/training-media/upload-url',
  confirm: '/files/training-media/confirm',
  context: () => ({ contentId: props.block.id }),
});

/** Sube una imagen del cuerpo y devuelve su URL para incrustarla. */
async function uploadImage(file: File): Promise<string> {
  return (await upload.upload(file)).downloadUrl;
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await http.patch(`/training/admin/contents/${props.block.id}`, {
      type: draft.type,
      title: draft.title,
      // Un cuerpo vacío se envía como nulo: guardar `{}` dejaría un bloque con
      // un objeto sin idiomas que después hay que interpretar.
      body: Object.keys(draft.body).length > 0 ? draft.body : null,
      url: draft.url.trim() || null,
      assessmentId: esEvaluacion.value ? draft.assessmentId : null,
    });
    toast.success(t('common.saved'));
    emit('saved');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    saving.value = false;
  }
}

async function remove(): Promise<void> {
  try {
    await http.delete(`/training/admin/contents/${props.block.id}`);
    emit('removed');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  }
}

const inputClass =
  'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <BaseCard class="flex flex-col gap-3">
    <header class="flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2 text-left"
        :aria-expanded="open"
        @click="open = !open"
      >
        <span aria-hidden="true">{{ ICONS[draft.type] }}</span>
        <span class="truncate font-medium">
          {{
            Object.values(draft.title).find((value) => value?.trim()) ||
            t('training.admin.untitledBlock')
          }}
        </span>
        <BaseBadge tone="neutral">{{ t(`training.admin.type.${draft.type}`) }}</BaseBadge>
        <BaseBadge v-if="files.length > 0" tone="info">
          {{ t('training.admin.attachmentCount', { count: files.length }) }}
        </BaseBadge>
      </button>

      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          class="rounded p-1.5 text-ink-subtle hover:bg-surface-muted disabled:opacity-30"
          :disabled="index === 0"
          :aria-label="t('training.admin.moveUp')"
          @click="emit('move', -1)"
        >
          <span aria-hidden="true">&#8593;</span>
        </button>
        <button
          type="button"
          class="rounded p-1.5 text-ink-subtle hover:bg-surface-muted disabled:opacity-30"
          :disabled="index === total - 1"
          :aria-label="t('training.admin.moveDown')"
          @click="emit('move', 1)"
        >
          <span aria-hidden="true">&#8595;</span>
        </button>
        <button
          type="button"
          class="rounded p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-danger"
          :aria-label="t('common.delete')"
          @click="remove"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
    </header>

    <div v-if="open" class="flex flex-col gap-4 border-t border-border pt-3">
      <label class="flex max-w-xs flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t('training.admin.blockType') }}</span>
        <select v-model="draft.type" :class="inputClass">
          <option v-for="type in TYPES" :key="type" :value="type">
            {{ t(`training.admin.type.${type}`) }}
          </option>
        </select>
      </label>

      <LocalizedField v-model="draft.title" :label="t('training.admin.blockTitle')" />

      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">
          {{ t('training.admin.url') }}
          <span v-if="urlRequired" class="text-danger">*</span>
        </span>
        <input
          v-model="draft.url"
          type="url"
          placeholder="https://"
          :class="inputClass"
          :required="urlRequired"
        />
        <span v-if="draft.type === 'EMBED'" class="text-xs" :class="incrustable ? 'text-ink-subtle' : 'text-danger'">
          {{ t('training.admin.embedHint', { platforms: plataformas }) }}
        </span>
        <span v-else class="text-xs text-ink-subtle">{{ t('training.admin.urlHint') }}</span>
      </label>

      <!--
        La evaluación va dentro del material: quien acaba de leer la lección la
        hace ahí mismo. Buscarla en otra pantalla es donde se pierde la gente.
      -->
      <label v-if="esEvaluacion" class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t('training.admin.blockAssessment') }}</span>
        <select v-model="draft.assessmentId" :class="inputClass">
          <option value="">{{ t('common.none') }}</option>
          <option v-for="evaluacion in evaluaciones" :key="evaluacion.id" :value="evaluacion.id">
            {{ evaluacion.title }}
          </option>
        </select>
        <span class="text-xs text-ink-subtle">{{ t('training.admin.blockAssessmentHint') }}</span>
      </label>

      <LocalizedField
        v-model="draft.body"
        rich
        :label="t('training.admin.blockBody')"
        :hint="t('training.admin.blockBodyHint')"
        :upload-image="uploadImage"
      />

      <BlockAttachments :content-id="block.id" :initial="block.files" />

      <div class="flex gap-2">
        <BaseButton :disabled="!canSave" :loading="saving" @click="save">
          {{ t('common.save') }}
        </BaseButton>
        <BaseButton variant="secondary" @click="open = false">{{ t('common.close') }}</BaseButton>
      </div>
    </div>
  </BaseCard>
</template>
