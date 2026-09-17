<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { http, ApiError } from '@/services/http';
import BaseButton from '@/design-system/BaseButton.vue';
import { useToast } from '@/composables/useToast';
import { useSignedUpload } from '@/composables/useSignedUpload';

/**
 * Lo que se descarga de un bloque, frente a las imágenes del texto.
 *
 * Es la misma distinción que hace cualquiera al escribir: la foto que ilustra
 * un párrafo va dentro del párrafo, y el PDF que hay que leer aparte va aparte.
 */

interface StoredFile {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

const props = defineProps<{ contentId: string; initial: StoredFile[] }>();

const { t, n } = useI18n();
const toast = useToast();

const files = ref<StoredFile[]>([...props.initial]);
const input = ref<HTMLInputElement | null>(null);

const upload = useSignedUpload<StoredFile & { downloadUrl: string }>({
  request: '/files/training-media/upload-url',
  confirm: '/files/training-media/confirm',
  context: () => ({ contentId: props.contentId }),
});

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${n(bytes / 1024 / 1024, 'decimal')} MB`;
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
    if (input.value) input.value.value = '';
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
</script>

<template>
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
      <input ref="input" type="file" class="sr-only" @change="attach" />
      <BaseButton
        variant="secondary"
        size="sm"
        type="button"
        :loading="upload.uploading.value"
        @click="input?.click()"
      >
        {{ t('training.admin.addAttachment') }}
      </BaseButton>
    </div>
  </section>
</template>
