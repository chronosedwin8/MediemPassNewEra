import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);

/**
 * Dónde está ffmpeg.
 *
 * Se busca en lugar de confiar en el PATH porque winget lo instala y avisa de
 * que hay que reiniciar la consola para verlo. Quien acaba de instalarlo y
 * lanza el comando en la misma ventana se encontraría un «no se reconoce
 * ffmpeg» que no significa que falte, sino que la consola es anterior a la
 * instalación.
 */
const RUTAS_FFMPEG = [
  'ffmpeg',
  path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
  'C:/ProgramData/chocolatey/bin/ffmpeg.exe',
];

let rutaFfmpeg: string | null = null;

export function buscarFfmpeg(): string {
  if (rutaFfmpeg) return rutaFfmpeg;

  for (const candidato of RUTAS_FFMPEG) {
    // El primero es el nombre a secas: vale si el PATH ya lo tiene.
    if (candidato === 'ffmpeg' || existsSync(candidato)) {
      try {
        execFileSync(candidato, ['-version'], { stdio: 'ignore' });
        rutaFfmpeg = candidato;
        return candidato;
      } catch {
        continue;
      }
    }
  }

  throw new Error(
    'No se encontró ffmpeg. Instálelo una vez con: winget install --id Gyan.FFmpeg -e --scope user',
  );
}

/**
 * El montaje final, con ffmpeg.
 *
 * Cada escena es una imagen fija con su narración encima. No hay animación, y
 * es una decisión, no una limitación: el movimiento en una diapositiva de
 * formación compite con lo que se está explicando, y además multiplica el peso
 * del archivo sin añadir nada que enseñar.
 *
 * Los subtítulos se **queman** en la imagen en lugar de ir como pista aparte.
 * Una pista aparte depende de que el reproductor la ofrezca y de que quien lo
 * ve sepa activarla; quemados se ven siempre, que es lo que hace falta cuando
 * el vídeo se abre sin sonido en un pasillo.
 */

export interface EscenaMontaje {
  png: string;
  mp3: string;
  srt: string;
}

/*
 * El filtro de subtítulos recibe el **nombre** del archivo, y ffmpeg se
 * ejecuta dentro de su carpeta.
 *
 * Escapar la ruta completa no funciona en Windows: los dos puntos de la unidad
 * de disco los lee el analizador del filtro como el separador de la siguiente
 * opción, y acaba intentando interpretar «/Users/...» como un tamaño de
 * imagen. Quitarle los dos puntos de en medio es más fiable que cualquier
 * combinación de barras invertidas.
 */

/**
 * Un fragmento por escena.
 *
 * Se codifica escena a escena y se unen después, en lugar de construir un
 * filtro único con todas: si una escena falla, se ve cuál, y volver a generar
 * el vídeo tras retocar un titular no obliga a recodificarlo entero.
 */
export async function montarEscena(
  escena: EscenaMontaje,
  destino: string,
  duracion: number,
): Promise<void> {
  const carpeta = path.dirname(escena.srt);
  const estilo =
    'FontName=Segoe UI,FontSize=15,PrimaryColour=&H00FFFFFF&,' +
    'BackColour=&H30000000&,BorderStyle=4,Outline=0,Shadow=0,MarginV=48';
  const subtitulos = `subtitles=${path.basename(escena.srt)}:force_style='${estilo}'`;

  await ejecutar(
    buscarFfmpeg(),
    [
      '-y',
      '-loglevel',
      'error',
      '-loop',
      '1',
      '-i',
      escena.png,
      '-i',
      escena.mp3,
      '-vf',
      subtitulos,
      // Medio segundo de cola: cortar en el instante en que acaba la última
      // sílaba se percibe como un tirón.
      '-t',
      String(duracion + 0.5),
      '-r',
      '25',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      // Una imagen fija con un CRF alto se ve con bloques alrededor del texto.
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-shortest',
      destino,
    ],
    { cwd: carpeta },
  );
}

/** Une los fragmentos sin recodificar: son el mismo formato, basta con copiar. */
export async function unir(fragmentos: string[], carpeta: string, destino: string): Promise<void> {
  const lista = path.join(carpeta, 'fragmentos.txt');
  const contenido = fragmentos
    .map((fragmento) => `file '${fragmento.replace(/\\/g, '/')}'`)
    .join('\n');

  await writeFile(lista, contenido, 'utf8');

  await ejecutar(
    buscarFfmpeg(),
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      lista,
      '-c',
      'copy',
      // Necesario para reproducir en el navegador antes de descargar el archivo
      // entero: sin esto el índice queda al final y el vídeo no empieza hasta
      // que ha llegado todo.
      '-movflags',
      '+faststart',
      destino,
    ],
    { cwd: carpeta },
  );
}
