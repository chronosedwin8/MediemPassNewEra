import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GUIONES, findGuion, type Guion } from './guiones-capacitacion.js';
import { buscarChrome, renderizar } from './video/diapositiva.js';
import { montarEscena, unir } from './video/montaje.js';
import { construirSrt } from './video/subtitulos.js';
import { duracionSegundos, guardarMp3, leerApiKey, narrar } from './video/voz.js';

/**
 * Genera los vídeos de la capacitación docente.
 *
 *   npm run -w backend videos                  # los seis
 *   npm run -w backend videos -- --modulo KMK-M1
 *
 * Voz de ElevenLabs, diapositivas dibujadas con Chrome, montaje con ffmpeg.
 * Ninguna de las tres piezas necesita un plan especial ni una cuenta nueva: la
 * clave de ElevenLabs ya existe, Chrome está instalado y ffmpeg se instala una
 * vez con winget.
 *
 * Un comando, y el mismo resultado cada vez. Es lo que lo diferencia de pedir
 * el vídeo en una conversación: cuando se reescriba un módulo habrá que volver
 * a grabar su vídeo, y quien lo haga dentro de dos años no habrá estado en la
 * conversación donde se generó el primero.
 *
 * Los archivos quedan en `media/capacitacion/`, fuera del repositorio: seis
 * vídeos en alta definición no caben en un historial de git, y no tienen por
 * qué estar ahí.
 */

const SALIDA = path.resolve(process.cwd(), '..', 'media', 'capacitacion');

/**
 * Voz por defecto: colombiana.
 *
 * El colegio está en Barranquilla y quien ve esto es su profesorado. Una voz
 * peninsular o mexicana se entiende igual, pero suena a material comprado
 * fuera; ésta suena a material de la casa.
 */
const VOZ_POR_DEFECTO = 'qHkrJuifPpn95wK3rm2A';

async function generar(guion: Guion, apiKey: string, chrome: string): Promise<string> {
  const carpeta = path.join(SALIDA, guion.moduleCode.toLowerCase());
  await mkdir(carpeta, { recursive: true });

  const voz = process.env['ELEVENLABS_VOICE_ID']?.trim() || VOZ_POR_DEFECTO;
  const fragmentos: string[] = [];

  console.warn(`\n▶ ${guion.moduleCode} — ${guion.titulo}`);

  for (const [indice, escena] of guion.escenas.entries()) {
    const nombre = `escena-${indice + 1}`;
    const paso = `${indice + 1} / ${guion.escenas.length}`;

    const narracion = await narrar(apiKey, voz, escena.texto);
    const mp3 = path.join(carpeta, `${nombre}.mp3`);
    const srt = path.join(carpeta, `${nombre}.srt`);
    await guardarMp3(narracion, mp3);
    await writeFile(srt, construirSrt(narracion.alineacion), 'utf8');

    const png = await renderizar(
      chrome,
      { competencia: guion.competencia, modulo: guion.titulo, titular: escena.titular, paso },
      carpeta,
      nombre,
    );

    const fragmento = path.join(carpeta, `${nombre}.mp4`);
    await montarEscena({ png, mp3, srt }, fragmento, duracionSegundos(narracion));
    fragmentos.push(fragmento);

    console.warn(`  ${paso}  ${escena.titular}  (${duracionSegundos(narracion).toFixed(1)} s)`);
  }

  const destino = path.join(SALIDA, `${guion.moduleCode.toLowerCase()}.mp4`);
  await unir(fragmentos, carpeta, destino);
  console.warn(`  ✓ ${destino}`);
  return destino;
}

function seleccionar(args: string[]): Guion[] {
  const indice = args.indexOf('--modulo');
  if (indice === -1) return GUIONES;

  const guion = findGuion(args[indice + 1] ?? '');
  if (!guion) {
    throw new Error('No se reconoció el módulo. Códigos válidos: KMK-M1 … KMK-M6.');
  }
  return [guion];
}

async function main(): Promise<void> {
  const pedidos = seleccionar(process.argv.slice(2));
  const apiKey = leerApiKey();
  const chrome = buscarChrome();

  await mkdir(SALIDA, { recursive: true });

  for (const guion of pedidos) {
    await generar(guion, apiKey, chrome);
  }

  console.warn(
    `\nHecho. Los vídeos están en ${SALIDA}.` +
      '\nPara colocarlos en los módulos: npm run -w backend videos:aplicar',
  );
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
