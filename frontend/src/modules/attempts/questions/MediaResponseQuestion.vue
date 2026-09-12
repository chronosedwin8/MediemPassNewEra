<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { QUESTION_TYPE, type Answer, type QuestionType } from '@medienpass/shared';
import { useMediaCapture } from '@/composables/useMediaCapture';
import BaseButton from '@/design-system/BaseButton.vue';
import { useToast } from '@/composables/useToast';

/**
 * Responder con una foto, un vídeo o una nota de voz.
 *
 * Un solo componente para los tres tipos porque el recorrido es el mismo
 * —permiso, vista previa, grabar, revisar, repetir— y solo cambia qué se
 * captura. Tres componentes casi iguales habrían significado arreglar tres
 * veces cada detalle del manejo de permisos, que es la parte que de verdad
 * cuesta.
 *
 * La respuesta que se guarda es el identificador del archivo, no el archivo:
 * la grabación viaja a S3 por su propio camino y el autoguardado solo lleva
 * una referencia.
 */

const props = defineProps<{
  attemptId: string;
  questionId: string;
  type: QuestionType;
  payload: Record<string, unknown>;
  modelValue: Answer | null;
}>();

const emit = defineEmits<{ 'update:modelValue': [Answer] }>();

const { t } = useI18n();
const toast = useToast();

const capture = useMediaCapture(props.type);
const videoRef = ref<HTMLVideoElement | null>(null);

const isSelfie = computed(() => props.type === QUESTION_TYPE.SELFIE);
const isAudio = computed(() => props.type === QUESTION_TYPE.AUDIO_RESPONSE);

/*
 * Sin intento no hay dónde guardar: es la previsualización del docente. Se
 * dice y se ocultan los botones, en vez de dejar que encienda la cámara y
 * descubra al soltar el botón que no se podía subir nada.
 */
const isPreview = computed(() => props.attemptId === '');

/** El docente puede haber pedido menos tiempo que el tope del tipo. */
const limitSeconds = computed(() => {
  const configured = props.payload['maxSeconds'];
  return typeof configured === 'number' && configured > 0 ? configured : capture.maxSeconds;
});

const guidance = computed(() =>
  typeof props.payload['guidance'] === 'string' ? props.payload['guidance'] : null,
);

/** Ya hay respuesta guardada: se llega así al volver a una pregunta resuelta. */
const savedFileId = computed(() => {
  const answer = props.modelValue;
  if (!answer || !('fileId' in answer)) return null;
  return answer.fileId;
});

const remaining = computed(() => Math.max(0, limitSeconds.value - capture.elapsedSeconds.value));

function formatSeconds(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// La vista previa en vivo se engancha al vídeo en cuanto hay flujo.
watch(
  () => capture.stream.value,
  (value) => {
    if (videoRef.value && value) videoRef.value.srcObject = value;
  },
);

async function persist(blob: Blob, durationSeconds: number | null): Promise<void> {
  try {
    const saved = await capture.upload(blob, {
      attemptId: props.attemptId,
      questionId: props.questionId,
      durationSeconds,
    });

    emit(
      'update:modelValue',
      isSelfie.value
        ? { kind: QUESTION_TYPE.SELFIE, fileId: saved.fileId }
        : ({
            kind: props.type,
            fileId: saved.fileId,
            durationSeconds: saved.durationSeconds,
          } as Answer),
    );

    capture.stop();
    toast.success(t('media.saved'));
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('errors.generic'));
  }
}

async function takePhoto(): Promise<void> {
  if (!videoRef.value) return;
  const blob = await capture.capturePhoto(videoRef.value);
  if (blob) await persist(blob, null);
}

function record(): void {
  capture.startRecording((blob, seconds) => void persist(blob, seconds));
}

/** Volver a intentarlo: la toma anterior la descarta el servidor al confirmar. */
async function retake(): Promise<void> {
  capture.stop();
  await capture.start();
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p v-if="guidance" class="rounded-md border border-info/30 bg-info-soft px-3 py-2 text-sm">
      {{ guidance }}
    </p>

    <!--
      El motivo por el que no hay cámara se dice con precisión. «No se pudo
      acceder» manda a revisar el equipo cuando el problema es que la página
      no se abrió por HTTPS, y ahí nadie lo encuentra solo.
    -->
    <p
      v-if="capture.error.value === 'insecure-context'"
      class="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm"
      role="alert"
    >
      {{ t('media.insecureContext') }}
    </p>
    <p
      v-else-if="capture.error.value === 'denied'"
      class="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
      role="alert"
    >
      {{ t('media.permissionDenied') }}
    </p>
    <p
      v-else-if="capture.error.value === 'unavailable'"
      class="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
      role="alert"
    >
      {{ isAudio ? t('media.noMicrophone') : t('media.noCamera') }}
    </p>

    <!-- Visor: en vivo mientras se graba, y la toma guardada después. -->
    <div
      v-if="!isAudio"
      class="relative overflow-hidden rounded-lg border border-border bg-ink/90"
      :class="capture.state.value === 'idle' && !savedFileId ? 'hidden' : ''"
    >
      <video
        v-show="capture.state.value !== 'done'"
        ref="videoRef"
        class="aspect-video w-full object-cover"
        autoplay
        playsinline
        muted
      />

      <img
        v-if="capture.state.value === 'done' && isSelfie && capture.previewUrl.value"
        :src="capture.previewUrl.value"
        :alt="t('media.yourPhoto')"
        class="aspect-video w-full object-contain"
      />

      <video
        v-else-if="capture.state.value === 'done' && capture.previewUrl.value"
        :src="capture.previewUrl.value"
        class="aspect-video w-full object-contain"
        controls
        playsinline
      />

      <span
        v-if="capture.state.value === 'recording'"
        class="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-danger px-3 py-1 text-xs font-medium text-ink-inverse"
      >
        <span class="size-2 animate-pulse rounded-full bg-ink-inverse" aria-hidden="true" />
        {{ formatSeconds(capture.elapsedSeconds.value) }} · {{ t('media.remaining') }}
        {{ formatSeconds(remaining) }}
      </span>
    </div>

    <!-- El audio no tiene visor: un contador y la reproducción de la toma. -->
    <div v-else-if="capture.state.value !== 'idle' || savedFileId" class="flex flex-col gap-3">
      <p
        v-if="capture.state.value === 'recording'"
        class="flex items-center gap-2 text-sm font-medium text-danger"
      >
        <span class="size-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />
        {{ formatSeconds(capture.elapsedSeconds.value) }} · {{ t('media.remaining') }}
        {{ formatSeconds(remaining) }}
      </p>
      <audio
        v-if="capture.previewUrl.value"
        :src="capture.previewUrl.value"
        controls
        class="w-full"
      />
    </div>

    <p
      v-if="isPreview"
      class="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-ink-muted"
    >
      {{ t('media.previewOnly') }}
    </p>

    <div v-else class="flex flex-wrap items-center gap-2">
      <BaseButton v-if="capture.state.value === 'idle'" @click="capture.start">
        {{ isAudio ? t('media.enableMicrophone') : t('media.enableCamera') }}
      </BaseButton>

      <template v-else-if="capture.state.value === 'ready'">
        <BaseButton v-if="isSelfie" @click="takePhoto">{{ t('media.takePhoto') }}</BaseButton>
        <BaseButton v-else @click="record">{{ t('media.startRecording') }}</BaseButton>
        <BaseButton variant="ghost" @click="capture.stop">{{ t('common.cancel') }}</BaseButton>
      </template>

      <BaseButton
        v-else-if="capture.state.value === 'recording'"
        variant="danger"
        @click="capture.stopRecording"
      >
        {{ t('media.stopRecording') }}
      </BaseButton>

      <BaseButton v-else-if="capture.state.value === 'processing'" loading>
        {{ t('media.saving') }}
      </BaseButton>

      <template v-else-if="capture.state.value === 'done'">
        <BaseButton variant="secondary" @click="retake">{{ t('media.retake') }}</BaseButton>
      </template>

      <span v-if="!isSelfie && limitSeconds > 0" class="text-xs text-ink-subtle">
        {{ t('media.maxDuration', { minutes: Math.round(limitSeconds / 60) }) }}
      </span>
    </div>

    <p v-if="savedFileId" class="text-sm text-success">{{ t('media.answerSaved') }}</p>
  </div>
</template>
