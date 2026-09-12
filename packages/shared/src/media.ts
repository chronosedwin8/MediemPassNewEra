import { QUESTION_TYPE, type QuestionType } from './enums.js';

/**
 * Límites de la captura de cámara y micrófono.
 *
 * Viven en el paquete compartido porque los usan los dos lados y tienen que
 * coincidir: el navegador configura la grabación con estos valores y el
 * servidor rechaza lo que los supere. Si cada lado tuviera los suyos, el
 * primer vídeo un poco largo se subiría entero para que lo rechazaran al
 * confirmarlo, después de gastar los datos del estudiante.
 */

/** Tipos de pregunta que se responden grabando o haciendo una foto. */
export const MEDIA_RESPONSE_QUESTION_TYPES: readonly QuestionType[] = [
  QUESTION_TYPE.SELFIE,
  QUESTION_TYPE.VIDEO_RESPONSE,
  QUESTION_TYPE.AUDIO_RESPONSE,
];

export function isMediaResponseType(type: QuestionType): boolean {
  return MEDIA_RESPONSE_QUESTION_TYPES.includes(type);
}

/**
 * Duración máxima por tipo.
 *
 * Tres minutos de vídeo y cinco de audio son los topes que pidió el colegio.
 * El cronómetro del navegador corta al llegar, y el servidor vuelve a
 * comprobar la duración declarada: un cliente modificado no puede colar media
 * hora de grabación.
 */
export const MEDIA_MAX_SECONDS: Record<string, number> = {
  [QUESTION_TYPE.VIDEO_RESPONSE]: 180,
  [QUESTION_TYPE.AUDIO_RESPONSE]: 300,
};

/**
 * Tamaño máximo aceptado por tipo, en bytes.
 *
 * Son topes holgados sobre lo que produce la configuración de abajo, no
 * objetivos: sirven para que un cliente manipulado no suba un vídeo de alta
 * calidad de doscientos megas. Con los ajustes reales, tres minutos de vídeo
 * rondan los quince megas y cinco de audio poco más de uno.
 */
export const MEDIA_MAX_BYTES: Record<string, number> = {
  [QUESTION_TYPE.SELFIE]: 4 * 1024 * 1024,
  [QUESTION_TYPE.VIDEO_RESPONSE]: 40 * 1024 * 1024,
  [QUESTION_TYPE.AUDIO_RESPONSE]: 10 * 1024 * 1024,
};

/**
 * Cómo se graba.
 *
 * La resolución y los bitrates están elegidos para que se entienda quién
 * habla y qué dice, que es para lo que sirve la respuesta, y no para archivar
 * vídeo en alta definición. Un curso de treinta estudiantes respondiendo tres
 * minutos ocupa medio giga con estos valores; en 1080p ocuparía diez veces
 * más sin que nadie corrigiera mejor.
 */
export const VIDEO_CAPTURE = {
  width: 640,
  height: 480,
  frameRate: 24,
  videoBitsPerSecond: 600_000,
  audioBitsPerSecond: 64_000,
} as const;

export const AUDIO_CAPTURE = {
  /** Voz hablada en opus: por encima de esto no se gana inteligibilidad. */
  audioBitsPerSecond: 32_000,
} as const;

export const SELFIE_CAPTURE = {
  /** Lado mayor en píxeles. Suficiente para reconocer a una persona. */
  maxDimension: 1280,
  jpegQuality: 0.82,
} as const;

/**
 * Formatos que se aceptan al confirmar la subida.
 *
 * Los navegadores no coinciden: Chrome y Firefox graban WebM, Safari produce
 * MP4. Se admiten los dos en lugar de exigir uno y dejar fuera a media clase.
 */
export const MEDIA_CONTENT_TYPES: Record<string, readonly string[]> = {
  [QUESTION_TYPE.SELFIE]: ['image/jpeg', 'image/png', 'image/webp'],
  [QUESTION_TYPE.VIDEO_RESPONSE]: ['video/webm', 'video/mp4'],
  [QUESTION_TYPE.AUDIO_RESPONSE]: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'],
};
