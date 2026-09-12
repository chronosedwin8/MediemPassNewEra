import { MEDIA_MAX_SECONDS, QUESTION_TYPE, type QuestionType } from '@medienpass/shared';

/**
 * Contenido inicial mínimo y válido para cada tipo.
 *
 * Switch exhaustivo a propósito: si mañana se añade un tipo de pregunta y
 * nadie lo contempla aquí, TypeScript lo señala antes de que un docente se
 * encuentre con un formulario vacío.
 */
/* eslint-disable-next-line complexity */
export function seedPayload(questionType: QuestionType): Record<string, unknown> {
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

    // La duración por defecto es el tope del tipo: el docente la baja si
    // quiere respuestas más cortas, nunca la sube.
    case QUESTION_TYPE.SELFIE:
      return { kind: questionType };
    case QUESTION_TYPE.VIDEO_RESPONSE:
    case QUESTION_TYPE.AUDIO_RESPONSE:
      return { kind: questionType, maxSeconds: MEDIA_MAX_SECONDS[questionType] };
  }
}
