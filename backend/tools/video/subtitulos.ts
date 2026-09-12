import type { Alineacion } from './voz.js';

/**
 * Subtítulos construidos con las marcas de tiempo reales de la narración.
 *
 * Van siempre, no como opción de accesibilidad marcada aparte: estos vídeos se
 * ven en salas de profesores y en el móvil entre clase y clase, a menudo sin
 * sonido. Un vídeo de formación sin subtítulos es un vídeo que la mitad de la
 * gente no va a ver.
 */

/** Caracteres por línea. Más largo obliga a mover los ojos; más corto, a saltar. */
const MAX_CARACTERES_LINEA = 46;

export interface Cue {
  inicio: number;
  fin: number;
  texto: string;
}

/** `1,500` — el separador decimal del formato SRT es la coma. */
function marca(segundos: number): string {
  const total = Math.max(0, segundos);
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const resto = total % 60;
  const enteros = Math.floor(resto);
  const milis = Math.round((resto - enteros) * 1000);

  const dos = (valor: number): string => String(valor).padStart(2, '0');
  return `${dos(horas)}:${dos(minutos)}:${dos(enteros)},${String(milis).padStart(3, '0')}`;
}

/**
 * Reparte la narración en líneas cortadas donde termina una palabra.
 *
 * Se corta preferentemente después de un signo de puntuación: una línea que
 * termina en coma se lee como una unidad, una que termina a mitad de sintagma
 * obliga a esperar a la siguiente para entenderla.
 */
export function construirCues(alineacion: Alineacion): Cue[] {
  const cues: Cue[] = [];
  const { caracteres, finSegundos } = alineacion;

  let texto = '';
  let inicio = 0;

  for (let indice = 0; indice < caracteres.length; indice += 1) {
    const caracter = caracteres[indice] ?? '';
    texto += caracter;

    const esPuntuacion = /[.,;:!?…]/.test(caracter);
    const largoSuficiente = texto.length >= MAX_CARACTERES_LINEA;

    const debeCortar =
      indice === caracteres.length - 1 || (largoSuficiente && (esPuntuacion || caracter === ' '));

    if (!debeCortar) continue;

    const limpio = texto.trim();
    if (limpio.length > 0) {
      cues.push({ inicio, fin: finSegundos[indice] ?? inicio, texto: limpio });
    }

    inicio = finSegundos[indice] ?? inicio;
    texto = '';
  }

  return cues;
}

export function construirSrt(alineacion: Alineacion): string {
  return construirCues(alineacion)
    .map(
      (cue, indice) => `${indice + 1}\n${marca(cue.inicio)} --> ${marca(cue.fin)}\n${cue.texto}\n`,
    )
    .join('\n');
}
