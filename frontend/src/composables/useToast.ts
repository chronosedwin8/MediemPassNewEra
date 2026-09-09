import { readonly, ref } from 'vue';

/**
 * Avisos efímeros.
 *
 * Un único almacén compartido, no uno por componente: dos pantallas no deben
 * poder mostrar dos pilas de avisos superpuestas.
 */

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const toasts = ref<Toast[]>([]);
let nextId = 0;

/** Los errores duran más: hay que poder leerlos antes de que desaparezcan. */
const DURATIONS: Record<ToastTone, number> = { success: 3000, info: 4000, error: 7000 };

function push(tone: ToastTone, message: string): void {
  const id = (nextId += 1);
  toasts.value.push({ id, tone, message });
  setTimeout(() => dismiss(id), DURATIONS[tone]);
}

function dismiss(id: number): void {
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
    info: (message: string) => push('info', message),
    dismiss,
  };
}
