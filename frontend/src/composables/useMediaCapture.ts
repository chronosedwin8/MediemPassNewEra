import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import {
  AUDIO_CAPTURE,
  MEDIA_MAX_SECONDS,
  QUESTION_TYPE,
  SELFIE_CAPTURE,
  VIDEO_CAPTURE,
  type QuestionType,
} from '@medienpass/shared';
import { http } from '@/services/http';

/**
 * Cámara y micrófono para las preguntas que se responden grabando.
 *
 * Concentra las tres cosas que hacen difícil esto en un navegador:
 *
 *  1. **El contexto seguro.** `getUserMedia` solo existe en HTTPS o en
 *     `localhost`. Abierta la plataforma por la IP de la red sin certificado,
 *     la cámara no es que falle: la API no está. Se detecta antes de pedir
 *     permiso para poder explicarlo en lugar de mostrar un error genérico.
 *  2. **El permiso.** Se pide al empezar y no al cargar la pregunta: una
 *     página que enciende la cámara sola es intrusiva, y el navegador recuerda
 *     la negativa, de modo que un rechazo por sorpresa deja al estudiante sin
 *     poder responder hasta que sepa reabrirlo en la configuración.
 *  3. **El peso.** Se graba con los ajustes del paquete compartido —640×480 y
 *     bitrates de voz— para que tres minutos ocupen unos quince megas y no
 *     doscientos. Corregir no mejora con más resolución.
 */

export type CaptureState = 'idle' | 'ready' | 'recording' | 'processing' | 'done';

export interface CapturedMedia {
  fileId: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number | null;
}

/** Primer formato que el navegador sepa grabar, de los que el servidor acepta. */
function pickMimeType(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

export function useMediaCapture(type: QuestionType) {
  const state = ref<CaptureState>('idle');
  const error = ref<string | null>(null);
  const elapsedSeconds = ref(0);
  const uploading = ref(false);

  /** Vista previa local de lo grabado, para revisarlo antes de entregarlo. */
  const previewUrl = ref<string | null>(null);

  const stream = shallowRef<MediaStream | null>(null);
  const recorder = shallowRef<MediaRecorder | null>(null);
  const chunks: Blob[] = [];
  let ticker: ReturnType<typeof setInterval> | null = null;

  const needsVideo = type !== QUESTION_TYPE.AUDIO_RESPONSE;
  const needsAudio = type !== QUESTION_TYPE.SELFIE;
  const maxSeconds = MEDIA_MAX_SECONDS[type] ?? 0;

  /**
   * `undefined` mientras no se sabe, que solo ocurre fuera del navegador.
   * En una página servida por HTTP sin ser localhost esto es `false`, y es la
   * causa más habitual de que «la cámara no funcione».
   */
  const secureContextAvailable = computed(
    () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
  );

  function stopTicker(): void {
    if (ticker) clearInterval(ticker);
    ticker = null;
  }

  function releaseStream(): void {
    stream.value?.getTracks().forEach((track) => track.stop());
    stream.value = null;
  }

  function revokePreview(): void {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
  }

  /** Enciende la cámara o el micrófono y deja la vista previa en marcha. */
  async function start(): Promise<void> {
    error.value = null;

    if (!secureContextAvailable.value) {
      error.value = 'insecure-context';
      return;
    }

    try {
      stream.value = await navigator.mediaDevices.getUserMedia({
        video: needsVideo
          ? {
              width: { ideal: VIDEO_CAPTURE.width },
              height: { ideal: VIDEO_CAPTURE.height },
              frameRate: { ideal: VIDEO_CAPTURE.frameRate },
              // Cámara frontal: es una selfie o alguien hablando a cámara.
              facingMode: 'user',
            }
          : false,
        audio: needsAudio,
      });
      state.value = 'ready';
    } catch (cause) {
      // `NotAllowedError` es la negativa del usuario; el resto suele ser que
      // no hay cámara. Se distinguen porque la salida es distinta: una se
      // arregla en la configuración del navegador y la otra no.
      error.value =
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'denied'
          : 'unavailable';
    }
  }

  function stop(): void {
    stopTicker();
    if (recorder.value?.state === 'recording') recorder.value.stop();
    releaseStream();
    state.value = 'idle';
  }

  /** Empieza a grabar y programa el corte automático al llegar al límite. */
  function startRecording(onReady: (blob: Blob, seconds: number) => void): void {
    if (!stream.value) return;

    const mimeType = pickMimeType(needsVideo ? VIDEO_MIME_CANDIDATES : AUDIO_MIME_CANDIDATES);
    chunks.length = 0;

    const instance = new MediaRecorder(stream.value, {
      ...(mimeType ? { mimeType } : {}),
      ...(needsVideo ? { videoBitsPerSecond: VIDEO_CAPTURE.videoBitsPerSecond } : {}),
      audioBitsPerSecond: needsVideo
        ? VIDEO_CAPTURE.audioBitsPerSecond
        : AUDIO_CAPTURE.audioBitsPerSecond,
    });

    instance.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    instance.onstop = () => {
      stopTicker();
      const blob = new Blob(chunks, { type: instance.mimeType || mimeType || 'video/webm' });
      revokePreview();
      previewUrl.value = URL.createObjectURL(blob);
      state.value = 'done';
      onReady(blob, elapsedSeconds.value);
    };

    elapsedSeconds.value = 0;
    instance.start(1000);
    recorder.value = instance;
    state.value = 'recording';

    ticker = setInterval(() => {
      elapsedSeconds.value += 1;
      // El corte lo hace el navegador, pero el servidor vuelve a comprobarlo:
      // este temporizador es una comodidad, no la garantía del límite.
      if (maxSeconds > 0 && elapsedSeconds.value >= maxSeconds) stopRecording();
    }, 1000);
  }

  function stopRecording(): void {
    if (recorder.value?.state === 'recording') recorder.value.stop();
  }

  /**
   * Congela un fotograma como JPEG.
   *
   * Se reescala al lado mayor del paquete compartido: una cámara de portátil
   * entrega 1920×1080 y guardar eso multiplica por seis el peso sin que se
   * reconozca mejor a nadie.
   */
  async function capturePhoto(video: HTMLVideoElement): Promise<Blob | null> {
    const ratio = Math.min(
      1,
      SELFIE_CAPTURE.maxDimension / Math.max(video.videoWidth, video.videoHeight),
    );

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * ratio);
    canvas.height = Math.round(video.videoHeight * ratio);

    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', SELFIE_CAPTURE.jpegQuality),
    );

    if (blob) {
      revokePreview();
      previewUrl.value = URL.createObjectURL(blob);
      state.value = 'done';
    }
    return blob;
  }

  /**
   * Sube la grabación por el camino firmado de siempre.
   *
   * El `PUT` va con `fetch` desnudo: la URL apunta a S3 y adjuntarle la
   * cabecera de sesión entregaría el token a un tercero.
   */
  async function upload(
    blob: Blob,
    context: { attemptId: string; questionId: string; durationSeconds: number | null },
  ): Promise<CapturedMedia> {
    uploading.value = true;
    state.value = 'processing';

    const descriptor = {
      ...context,
      contentType: blob.type,
      sizeBytes: blob.size,
    };

    try {
      const ticket = await http.post<{ uploadUrl: string; storageKey: string }>(
        '/files/response-media/upload-url',
        descriptor,
      );

      const put = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type },
        body: blob,
      });
      if (!put.ok) throw new Error(`Error ${put.status}`);

      const saved = await http.post<CapturedMedia>('/files/response-media/confirm', {
        ...descriptor,
        storageKey: ticket.storageKey,
      });

      state.value = 'done';
      return saved;
    } finally {
      uploading.value = false;
    }
  }

  onBeforeUnmount(() => {
    stopTicker();
    releaseStream();
    revokePreview();
  });

  return {
    state,
    error,
    elapsedSeconds,
    maxSeconds,
    uploading,
    previewUrl,
    stream,
    secureContextAvailable,
    needsVideo,
    start,
    stop,
    startRecording,
    stopRecording,
    capturePhoto,
    upload,
  };
}
