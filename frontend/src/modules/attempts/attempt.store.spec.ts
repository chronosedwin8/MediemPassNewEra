import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { QUESTION_TYPE, type QuestionType } from '@medienpass/shared';
import type * as httpModule from '@/services/http';
import { ApiError } from '@/services/http';
import { useAttemptStore, type AttemptData } from './attempt.store';

type HttpModule = typeof httpModule;

/**
 * El estado del intento en curso.
 *
 * Es la parte del cliente donde un fallo tiene consecuencias reales para un
 * estudiante: si el autoguardado no agrupa, se satura la red escribiendo una
 * respuesta larga; si no vacía la cola antes de enviar, la última respuesta se
 * pierde; y si al recargar no se restauran las respuestas, el trabajo hecho
 * desaparece. Cada uno de esos tres casos tiene aquí su prueba.
 */

const { getMock, putMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('@/services/http', async (importOriginal) => {
  const actual = await importOriginal<HttpModule>();
  return {
    ...actual,
    http: { get: getMock, put: putMock, post: postMock },
  };
});

function question(id: string, type: QuestionType = QUESTION_TYPE.SINGLE_CHOICE) {
  return {
    id,
    type,
    statement: `Pregunta ${id}`,
    instructions: null,
    points: 1,
    position: 1,
    mediaUrl: null,
    payload: {
      options: [
        { id: 'o1', text: 'A' },
        { id: 'o2', text: 'B' },
      ],
    },
    allowsEvidence: false,
    requiresEvidence: false,
    maxEvidenceFiles: 3,
    competency: { id: 'k1', code: '1.1', name: { es: 'Buscar' }, color: '#000' },
  };
}

function attemptData(overrides: Partial<AttemptData> = {}): AttemptData {
  return {
    id: 'attempt-1',
    status: 'IN_PROGRESS',
    attemptNumber: 1,
    startedAt: new Date().toISOString(),
    deadlineAt: null,
    remainingSeconds: null,
    canSaveForLater: true,
    assessment: {
      id: 'a1',
      versionId: 'v1',
      title: 'Competencias digitales',
      instructions: null,
      questionCount: 2,
      totalPoints: 2,
    },
    questions: [question('q1'), question('q2')],
    answers: [],
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  getMock.mockReset();
  putMock.mockReset().mockResolvedValue(undefined);
  postMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('carga', () => {
  it('parte de una respuesta vacía por pregunta', async () => {
    getMock.mockResolvedValueOnce(attemptData());
    const store = useAttemptStore();

    await store.load('attempt-1');

    expect(store.total).toBe(2);
    expect(store.answers.has('q1')).toBe(true);
    expect(store.answers.has('q2')).toBe(true);
    expect(store.answeredCount).toBe(0);
  });

  /**
   * El caso que de verdad importa: el estudiante recarga la página a mitad de
   * una evaluación. Lo ya respondido tiene que seguir ahí; si no, habría
   * perdido su trabajo sin haber hecho nada mal.
   */
  it('restaura lo ya respondido al recargar', async () => {
    getMock.mockResolvedValueOnce(
      attemptData({
        answers: [
          {
            questionId: 'q1',
            response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'o2' },
            answeredAt: '2026-01-01',
          },
        ],
      }),
    );
    const store = useAttemptStore();

    await store.load('attempt-1');

    expect(store.answers.get('q1')).toEqual({ kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'o2' });
    expect(store.isAnswered('q1')).toBe(true);
    expect(store.isAnswered('q2')).toBe(false);
    expect(store.answeredCount).toBe(1);
    expect(store.progressPercentage).toBe(50);
  });

  it('marca como agotado un intento que llega sin tiempo restante', async () => {
    getMock.mockResolvedValueOnce(attemptData({ remainingSeconds: 0 }));
    const store = useAttemptStore();

    await store.load('attempt-1');

    expect(store.expired).toBe(true);
  });
});

describe('autoguardado', () => {
  it('agrupa las pulsaciones seguidas en un único guardado', async () => {
    // Con una pregunta abierta, que es donde el problema se manifiesta.
    getMock.mockResolvedValueOnce(
      attemptData({ questions: [question('q1', QUESTION_TYPE.OPEN_TEXT), question('q2')] }),
    );
    const store = useAttemptStore();
    await store.load('attempt-1');

    // Alguien escribiendo: seis cambios en menos de un segundo.
    for (const text of ['H', 'Ho', 'Hol', 'Hola', 'Hola ', 'Hola m']) {
      store.setAnswer('q1', { kind: QUESTION_TYPE.OPEN_TEXT, text });
    }

    // La interfaz refleja el último valor de inmediato, sin esperar a la red.
    expect(store.answers.get('q1')).toEqual({ kind: QUESTION_TYPE.OPEN_TEXT, text: 'Hola m' });
    expect(putMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(putMock).toHaveBeenCalledOnce();
    expect(putMock).toHaveBeenCalledWith('/attempts/attempt-1/answers/q1', {
      response: { kind: QUESTION_TYPE.OPEN_TEXT, text: 'Hola m' },
    });
  });

  it('guarda cada pregunta por separado', async () => {
    getMock.mockResolvedValueOnce(attemptData());
    const store = useAttemptStore();
    await store.load('attempt-1');

    store.setAnswer('q1', { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'o1' });
    store.setAnswer('q2', { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'o2' });
    await vi.advanceTimersByTimeAsync(1000);

    expect(putMock).toHaveBeenCalledTimes(2);
    expect(store.saveState).toBe('saved');
  });

  it('refleja el fallo de guardado sin perder la respuesta local', async () => {
    getMock.mockResolvedValueOnce(attemptData());
    putMock.mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', 500, 'ups'));
    const store = useAttemptStore();
    await store.load('attempt-1');

    store.setAnswer('q1', { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'o1' });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.saveState).toBe('error');
    // Lo escrito sigue en pantalla: reintentar es cosa del siguiente cambio.
    expect(store.answers.get('q1')).toEqual({ kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'o1' });
  });

  /**
   * Que se acabe el tiempo no es un fallo de guardado. Mostrar «error al
   * guardar» a quien simplemente agotó el plazo le haría pensar que perdió
   * respuestas ya enviadas.
   */
  it('distingue el tiempo agotado de un error de guardado', async () => {
    getMock.mockResolvedValueOnce(attemptData());
    putMock.mockRejectedValueOnce(new ApiError('TIME_LIMIT_EXCEEDED', 409, 'tiempo'));
    const store = useAttemptStore();
    await store.load('attempt-1');

    store.setAnswer('q1', { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'o1' });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.expired).toBe(true);
    expect(store.saveState).not.toBe('error');
  });
});

describe('envío', () => {
  /**
   * Sin este vaciado, responder la última pregunta y pulsar «Enviar» antes de
   * que venza el retardo perdería esa respuesta. Es el fallo más caro posible
   * en una evaluación calificada.
   */
  it('vacía la cola pendiente antes de enviar', async () => {
    getMock.mockResolvedValueOnce(attemptData());
    const store = useAttemptStore();
    await store.load('attempt-1');

    store.setAnswer('q2', { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'o1' });
    // Sin dejar pasar el retardo: se envía inmediatamente después de responder.
    await store.submit();

    expect(putMock).toHaveBeenCalledWith('/attempts/attempt-1/answers/q2', {
      response: { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'o1' },
    });

    const putOrder = putMock.mock.invocationCallOrder[0]!;
    const postOrder = postMock.mock.invocationCallOrder[0]!;
    expect(putOrder).toBeLessThan(postOrder);
    expect(postMock).toHaveBeenCalledWith('/attempts/attempt-1/submit');
  });

  it('no deja el indicador de envío encendido si el servidor rechaza', async () => {
    getMock.mockResolvedValueOnce(attemptData());
    postMock.mockRejectedValueOnce(new ApiError('ATTEMPT_NOT_IN_PROGRESS', 409, 'no'));
    const store = useAttemptStore();
    await store.load('attempt-1');

    await expect(store.submit()).rejects.toBeInstanceOf(ApiError);
    expect(store.submitting).toBe(false);
  });
});

describe('navegación', () => {
  it('no se sale del rango de preguntas', async () => {
    getMock.mockResolvedValueOnce(attemptData());
    const store = useAttemptStore();
    await store.load('attempt-1');

    store.goPrevious();
    expect(store.currentIndex).toBe(0);

    store.goNext();
    store.goNext();
    expect(store.currentIndex).toBe(1);
    expect(store.currentQuestion?.id).toBe('q2');
  });
});

describe('reinicio', () => {
  it('cancela los guardados pendientes al salir del intento', async () => {
    getMock.mockResolvedValueOnce(attemptData());
    const store = useAttemptStore();
    await store.load('attempt-1');

    store.setAnswer('q1', { kind: QUESTION_TYPE.SINGLE_CHOICE, optionId: 'o1' });
    store.reset();
    await vi.advanceTimersByTimeAsync(2000);

    // El temporizador pendiente no debe disparar una petición sobre un intento
    // que ya no está cargado.
    expect(putMock).not.toHaveBeenCalled();
    expect(store.attempt).toBeNull();
    expect(store.total).toBe(0);
  });
});
