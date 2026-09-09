<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { http, ApiError } from '@/services/http';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import { useToast } from '@/composables/useToast';
import { useSignedUpload } from '@/composables/useSignedUpload';

/**
 * Adjuntar evidencia a una respuesta.
 *
 * La subida no pasa por nuestro servidor: se pide una URL firmada, el navegador
 * hace el `PUT` directamente al almacenamiento y después se confirma. Durante
 * un examen con treinta estudiantes subiendo fotos a la vez, la diferencia
 * entre eso y pasar por el backend es que en un caso el servidor mueve unos
 * kilobytes de metadatos y en el otro varios cientos de megabytes.
 *
 * El estudiante ve tres estados y no cinco: pendiente, subiendo y subido. Los
 * pasos intermedios son un detalle de implementación y contarlos solo añade
 * ruido a alguien que está en mitad de una evaluación.
 */

interface StoredFile {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

const props = defineProps<{
  attemptId: string;
  questionId: string;
  maxFiles: number;
  required: boolean;
  disabled?: boolean;
}>();

const { t, n } = useI18n();
const toast = useToast();

const files = ref<StoredFile[]>([]);
const input = ref<HTMLInputElement | null>(null);

const atLimit = computed(() => files.value.length >= props.maxFiles);
const missing = computed(() => props.required && files.value.length === 0);

async function load(): Promise<void> {
  files.value = await http.get<StoredFile[]>(`/files/evidence/${props.attemptId}`, {
    questionId: props.questionId,
  });
}

onMounted(load);

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${n(bytes / 1024 / 1024, 'decimal')} MB`;
}

const evidenceUpload = useSignedUpload<StoredFile>({
  request: '/files/evidence/upload-url',
  confirm: '/files/evidence/confirm',
  context: () => ({ attemptId: props.attemptId, questionId: props.questionId }),
});

async function upload(file: File): Promise<void> {
  try {
    const stored = await evidenceUpload.upload(file);
    files.value = [...files.value, stored];
    toast.success(t('evidence.uploaded', { name: file.name }));
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('evidence.uploadFailed'));
  } finally {
    if (input.value) input.value.value = '';
  }
}

async function onPick(event: Event): Promise<void> {
  const picked = (event.target as HTMLInputElement).files;
  if (!picked) return;

  // De uno en uno: subir cinco a la vez desde la red del colegio suele acabar
  // con las cinco lentas en lugar de una rápida.
  for (const file of Array.from(picked).slice(0, props.maxFiles - files.value.length)) {
    await upload(file);
  }
}

async function remove(fileId: string): Promise<void> {
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
  <section
    class="rounded-md border p-3"
    :class="missing ? 'border-warning/50 bg-warning/5' : 'border-border'"
    :aria-label="t('evidence.title')"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-2 text-sm font-medium">
        {{ t('evidence.title') }}
        <BaseBadge v-if="required" :tone="missing ? 'warning' : 'success'">
          {{ missing ? t('evidence.required') : t('common.yes') }}
        </BaseBadge>
      </h3>

      <p class="text-xs tabular-nums text-ink-subtle">{{ files.length }} / {{ maxFiles }}</p>
    </div>

    <ul v-if="files.length > 0" class="mt-3 flex flex-col gap-2">
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
          v-if="!disabled"
          type="button"
          class="shrink-0 rounded p-1 text-ink-subtle hover:text-danger"
          :aria-label="`${t('common.delete')}: ${file.originalName}`"
          @click="remove(file.id)"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </li>
    </ul>

    <p v-if="evidenceUpload.uploading.value" class="mt-3 text-sm text-ink-muted">
      {{ t('evidence.uploading', { name: evidenceUpload.currentName.value }) }}
    </p>

    <div v-if="!disabled && !atLimit" class="mt-3">
      <input
        :id="`evidence-${questionId}`"
        ref="input"
        type="file"
        multiple
        class="sr-only"
        :disabled="evidenceUpload.uploading.value"
        @change="onPick"
      />
      <BaseButton
        variant="secondary"
        size="sm"
        type="button"
        :loading="evidenceUpload.uploading.value"
        @click="input?.click()"
      >
        {{ t('evidence.add') }}
      </BaseButton>
      <p class="mt-1.5 text-xs text-ink-subtle">{{ t('evidence.hint') }}</p>
    </div>

    <p v-else-if="atLimit" class="mt-3 text-xs text-ink-subtle">
      {{ t('evidence.limitReached', { count: maxFiles }) }}
    </p>
  </section>
</template>
