import { QUESTION_TYPE } from '@medienpass/shared';
import { EMPTY_OUTCOME, PENDING_MANUAL_OUTCOME, type GradeOutcome, type Grader } from './types.js';

/**
 * Calificación de las respuestas grabadas.
 *
 * Las tres se comportan igual y como una redacción: el motor no puede decidir
 * si una nota de voz responde a lo que se preguntaba, así que la deja
 * pendiente y el intento queda en revisión hasta que alguien la escucha.
 *
 * La única decisión automática es la respuesta vacía. No hay archivo, no hay
 * nada que mirar, y cero es una calificación correcta que además evita dejar
 * en la cola de corrección preguntas que nadie contestó. Es exactamente el
 * mismo criterio que se aplica a una respuesta abierta en blanco.
 */
function gradeRecording(fileId: string | null): GradeOutcome {
  return fileId === null ? EMPTY_OUTCOME : PENDING_MANUAL_OUTCOME;
}

export const selfieGrader: Grader<typeof QUESTION_TYPE.SELFIE> = {
  type: QUESTION_TYPE.SELFIE,
  requiresManualGrading: true,
  grade: (_payload, answer): GradeOutcome => gradeRecording(answer.fileId),
};

export const videoResponseGrader: Grader<typeof QUESTION_TYPE.VIDEO_RESPONSE> = {
  type: QUESTION_TYPE.VIDEO_RESPONSE,
  requiresManualGrading: true,
  grade: (_payload, answer): GradeOutcome => gradeRecording(answer.fileId),
};

export const audioResponseGrader: Grader<typeof QUESTION_TYPE.AUDIO_RESPONSE> = {
  type: QUESTION_TYPE.AUDIO_RESPONSE,
  requiresManualGrading: true,
  grade: (_payload, answer): GradeOutcome => gradeRecording(answer.fileId),
};
