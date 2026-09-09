import { QUESTION_TYPE, type QuestionType } from '@medienpass/shared';

/**
 * La respuesta correcta de cada tipo de pregunta, en texto legible.
 *
 * Es un registro indexado por tipo y no una cadena de `case`, por el mismo
 * motivo que el registro de calificadores del backend: si mañana se añade un
 * tipo de pregunta y nadie lo contempla aquí, es un error de compilación. La
 * alternativa —un `default` que devuelve lista vacía— haría que la
 * previsualización mostrara «sin respuesta correcta» para un tipo que sí la
 * tiene, y el docente daría por defectuosa una pregunta que está bien.
 *
 * Devuelve varias líneas en lugar de una cadena para que relacionar o agrupar
 * se lean como lo que son —varias correspondencias— y no como un párrafo con
 * comas.
 */

interface Option {
  id: string;
  text?: string;
  correct?: boolean;
}

type Payload = Record<string, unknown>;

/** Etiquetas de «verdadero» y «falso», que dependen del idioma. */
export interface BooleanLabels {
  yes: string;
  no: string;
}

const pickCorrectOptions = (data: Payload): string[] => {
  const options = (data['options'] as Option[]) ?? [];
  return options.filter((option) => option.correct).map((option) => option.text ?? option.id);
};

const SOLUTION_TEXT: Record<QuestionType, (data: Payload, labels: BooleanLabels) => string[]> = {
  [QUESTION_TYPE.SINGLE_CHOICE]: pickCorrectOptions,
  [QUESTION_TYPE.MULTIPLE_CHOICE]: pickCorrectOptions,
  [QUESTION_TYPE.IMAGE_CHOICE]: pickCorrectOptions,

  [QUESTION_TYPE.TRUE_FALSE]: (data, labels) => [data['correct'] === true ? labels.yes : labels.no],

  [QUESTION_TYPE.SHORT_ANSWER]: (data) => (data['acceptedAnswers'] as string[]) ?? [],

  [QUESTION_TYPE.FILL_BLANK]: (data) => {
    const blanks = (data['blanks'] as Array<{ id: string; acceptedAnswers?: string[] }>) ?? [];
    return blanks.map((blank) => `${blank.id}: ${(blank.acceptedAnswers ?? []).join(' / ')}`);
  },

  [QUESTION_TYPE.MATCHING]: (data) => {
    const pairs = (data['pairs'] as Array<{ leftId: string; rightId: string }>) ?? [];
    const left = (data['left'] as Option[]) ?? [];
    const right = (data['right'] as Option[]) ?? [];
    const label = (list: Option[], id: string) => list.find((entry) => entry.id === id)?.text ?? id;
    return pairs.map((pair) => `${label(left, pair.leftId)} → ${label(right, pair.rightId)}`);
  },

  [QUESTION_TYPE.GROUPING]: (data) => {
    const groups = (data['groups'] as Array<{ id: string; label?: string }>) ?? [];
    const items = (data['items'] as Array<{ text?: string; groupId: string }>) ?? [];
    return groups.map((group) => {
      const belonging = items
        .filter((item) => item.groupId === group.id)
        .map((item) => item.text ?? '')
        .join(', ');
      return `${group.label ?? group.id}: ${belonging}`;
    });
  },

  [QUESTION_TYPE.ORDERING]: (data) => orderedItems(data),
  [QUESTION_TYPE.TIMELINE]: (data) => orderedItems(data),

  [QUESTION_TYPE.HOTSPOT]: (data) => {
    const regions = (data['regions'] as Array<{ label?: string; correct?: boolean }>) ?? [];
    return regions.filter((region) => region.correct).map((region) => region.label ?? '');
  },

  // Los corrige una persona: no hay clave que mostrar, y decir «sin respuesta
  // correcta» sería falso. La interfaz lo distingue con `MANUAL_TYPES`.
  [QUESTION_TYPE.OPEN_TEXT]: () => [],
  [QUESTION_TYPE.LONG_ANSWER]: () => [],
};

function orderedItems(data: Payload): string[] {
  const items = (data['items'] as Array<{ text?: string; correctPosition: number }>) ?? [];
  return [...items]
    .sort((a, b) => a.correctPosition - b.correctPosition)
    .map((item, index) => `${index + 1}. ${item.text ?? ''}`);
}

/** Tipos que no tienen clave porque los califica el docente. */
export const MANUAL_TYPES: readonly QuestionType[] = [
  QUESTION_TYPE.OPEN_TEXT,
  QUESTION_TYPE.LONG_ANSWER,
];

export function solutionText(
  type: QuestionType,
  payload: Payload,
  labels: BooleanLabels,
): string[] {
  return SOLUTION_TEXT[type](payload, labels);
}
