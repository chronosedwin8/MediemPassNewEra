import type { LocalizedText, QuestionType } from '@medienpass/shared';

/**
 * Una pregunta tal como la devuelve la API.
 *
 * Vive aquí y no dentro de cada componente porque tres de ellos la manejan —el
 * detalle, el listado y el editor— y tenerla escrita tres veces significaba
 * que ampliar la respuesta del servidor obligaba a acordarse de los tres. La
 * primera vez que pasó, el listado quedó sin `payload` y editar una pregunta
 * abría el formulario vacío.
 */
export interface Question {
  id: string;
  type: QuestionType;
  statement: string;
  points: number;
  position: number;
  payload: Record<string, unknown>;
  feedbackCorrect: string | null;
  feedbackIncorrect: string | null;
  kmkCompetency: { id: string; code: string; name: LocalizedText; color: string };
  kmkSubcompetency?: { id: string } | null;
}
