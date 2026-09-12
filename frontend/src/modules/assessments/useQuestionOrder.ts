import type { Ref } from 'vue';
import { http } from '@/services/http';
import type { Question } from './types';

/**
 * Cambiar preguntas de sitio.
 *
 * Vive fuera de la pantalla porque es una política con dos decisiones que
 * conviene poder leer juntas, no una interacción.
 *
 * **Se manda la lista entera**, no «esta va en la cuarta posición». Lo segundo
 * obliga a resolver los empates en el servidor, y dos docentes reordenando a
 * la vez dejarían un orden que ninguno de los dos pidió.
 *
 * **Se pinta antes de confirmar.** Esperar la respuesta en cada flecha hace la
 * tarea insoportable justo cuando hay treinta preguntas que mover. Si el
 * servidor rechaza, quien llama recarga y el orden vuelve solo.
 */
export function useQuestionOrder(questions: Ref<Question[]>) {
  /**
   * Devuelve la lista reordenada, o `null` si el movimiento no cabe.
   *
   * Null y no la lista sin cambios: quien llama necesita distinguir «no había
   * nada que hacer» de «ya está hecho» para no enviar una petición inútil.
   */
  function reordenar(questionId: string, direccion: -1 | 1): Question[] | null {
    const siguiente = [...questions.value];
    const desde = siguiente.findIndex((question) => question.id === questionId);
    const hasta = desde + direccion;

    if (desde === -1 || hasta < 0 || hasta >= siguiente.length) return null;

    const [movida] = siguiente.splice(desde, 1);
    if (!movida) return null;
    siguiente.splice(hasta, 0, movida);
    return siguiente;
  }

  async function guardar(versionId: string, orden: Question[]): Promise<void> {
    await http.put(`/assessments/versions/${versionId}/questions/reorder`, {
      questionIds: orden.map((question) => question.id),
    });
  }

  return { reordenar, guardar };
}
