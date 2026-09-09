<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { LocalizedText } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import LocalizedField from '@/design-system/LocalizedField.vue';
import { useToast } from '@/composables/useToast';
import { useSignedUpload } from '@/composables/useSignedUpload';

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
  type: 'TEXT' | 'VIDEO' | 'DOCUMENT' | 'LINK' | 'ACTIVITY';
  title: LocalizedText;
  body: LocalizedText | null;
  url: string | null;
  position: number;
  files: StoredFile[];
}

const props = defineProps<{ block: ContentBlock; index: number; total: number }>();

const emit = defineEmits<{
  saved: [];
  removed: [];
  move: [direction: -1 | 1];
}>();

const { t, n } = useI18n();
const toast = useToast();

const open = ref(false);
const saving = ref(false);
const files = ref<StoredFile[]>([...props.block.files]);
const attachmentInput = ref<HTMLInputElement | null>(null);

const draft = reactive({
  type: props.block.type,
  title: { ...props.block.title } as Partial<LocalizedText>,
  body: { ...(props.block.body ?? {}) } as Partial<LocalizedText>,
  url: props.block.url ?? '',
});

const TYPES = ['TEXT', 'VIDEO', 'DOCUMENT', 'LINK', 'ACTIVITY'] as const;

const ICONS: Record<string, string> = {
  TEXT: '\u{1F4C4}',
  VIDEO: '\u{1F3AC}',
  DOCUMENT: '\u{1F4CE}',
  LINK: '\u{1F517}',
  ACTIVITY: '\u{270D}\u{FE0F}',
};

/** El enlace es lo esencial en vídeo y enlace; en los demás, un extra. */
const urlRequired = computed(() => draft.type === 'VIDEO' || draft.type === 'LINK');

const hasTitle = computed(() => Object.values(draft.title).some((value) => value?.trim()));
const canSave = computed(
  () => hasTitle.value && (!urlRequired.value || draft.url.trim().length > 0),
);

/*
 * Una sola subida para los dos usos.
 *
 * Las imágenes del texto y los adjuntos van al mismo sitio y con el mismo
 * procedimiento; lo único que cambia es qué se hace con el resultado. Tener dos
 * instancias idénticas solo garantizaba que un cambio se aplicara a una.
 */
const upload = useSignedUpload<StoredFile & { downloadUrl: string }>({
  request: '/files/training-media/upload-url',
  confirm: '/files/training-media/confirm',
  context: () => ({ contentId: props.block.id }),
});

/** Sube una imagen del cuerpo y devuelve su URL para incrustarla. */
async function uploadImage(file: File): Promise<string> {
  return (await upload.upload(file)).downloadUrl;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${n(bytes / 1024 / 1024, 'decimal')} MB`;
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

async function attach(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    files.value = [...files.value, await upload.upload(file)];
    toast.success(t('evidence.uploaded', { name: file.name }));
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('evidence.uploadFailed'));
  } finally {
    if (attachmentInput.value) attachmentInput.value.value = '';
  }
}

async function detach(fileId: string): Promise<void> {
  try {
    await http.delete(`/files/${fileId}`);
    files.value = files.value.filter((file) => file.id !== fileId);
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  }
}

async function download(fileId: string): Promise<void> {
  const { url } = await http.get<{ url: string }>(`/files/${fileId}/download-url`);
  window.open(url, '_blank', 'noopener,noreferrer');
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
        <span class="text-xs text-ink-subtle">{{ t('training.admin.urlHint') }}</span>
      </label>

      <LocalizedField
        v-model="draft.body"
        rich
        :label="t('training.admin.blockBody')"
        :hint="t('training.admin.blockBodyHint')"
        :upload-image="uploadImage"
      />

      <!-- Adjuntos: lo que se descarga, frente a las imágenes del texto. -->
      <section class="flex flex-col gap-2">
        <h4 class="text-sm font-medium">{{ t('training.admin.attachments') }}</h4>

        <ul v-if="files.length > 0" class="flex flex-col gap-1.5">
          <li
            v-for="file in files"
            :key="file.id"
            class="flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-sm"
          >
            <button
              type="button"
              class="min-w-0 flex-1 truncate text-left hover:underline"
              @click="download(file.id)"
            >
              {{ file.originalName }}
            </button>
            <span class="shrink-0 text-xs tabular-nums text-ink-subtle">
              {{ humanSize(file.sizeBytes) }}
            </span>
            <button
              type="button"
              class="shrink-0 rounded p-1 text-ink-subtle hover:text-danger"
              :aria-label="`${t('common.delete')}: ${file.originalName}`"
              @click="detach(file.id)"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </li>
        </ul>

        <div>
          <input ref="attachmentInput" type="file" class="sr-only" @change="attach" />
          <BaseButton
            variant="secondary"
            size="sm"
            type="button"
            :loading="upload.uploading.value"
            @click="attachmentInput?.click()"
          >
            {{ t('training.admin.addAttachment') }}
          </BaseButton>
        </div>
      </section>

      <div class="flex gap-2">
        <BaseButton :disabled="!canSave" :loading="saving" @click="save">
          {{ t('common.save') }}
        </BaseButton>
        <BaseButton variant="secondary" @click="open = false">{{ t('common.close') }}</BaseButton>
      </div>
    </div>
  </BaseCard>
</template>
