import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);

/**
 * Las diapositivas del vídeo, dibujadas con el navegador.
 *
 * Se componen en HTML y se fotografían con Chrome en modo headless en lugar de
 * dibujarlas con filtros de ffmpeg. El motivo es práctico: el texto de estos
 * titulares tiene tildes, comillas angulares y longitudes muy distintas, y
 * conseguir que ffmpeg los parta bien y los centre cuesta más que escribir el
 * HTML. Además así comparten tipografía y color con la plataforma, en lugar de
 * parecerse a ella.
 *
 * Chrome ya está en las máquinas del colegio, de modo que no añade nada que
 * instalar.
 */

const ANCHO = 1920;
const ALTO = 1080;

/** Los colores de cada competencia, los mismos que usa la plataforma. */
const COLORES: Record<string, string> = {
  '1': '#2563eb',
  '2': '#059669',
  '3': '#c026d3',
  '4': '#d97706',
  '5': '#7c3aed',
  '6': '#0891b2',
};

const RUTAS_CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];

export function buscarChrome(): string {
  const encontrado = RUTAS_CHROME.find((ruta) => existsSync(ruta));
  if (!encontrado) {
    throw new Error('No se encontró Chrome, que es lo que dibuja las diapositivas.');
  }
  return encontrado;
}

export interface Diapositiva {
  competencia: string;
  /** Nombre del módulo, arriba y pequeño. */
  modulo: string;
  titular: string;
  /** «1 / 3», para que se vea que el vídeo avanza. */
  paso: string;
}

function escapar(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * El HTML de una diapositiva.
 *
 * Deliberadamente sobria: un titular, el distintivo de la competencia y el pie.
 * Lo que sostiene el vídeo es la voz; la pantalla está para que quien lo vea
 * sin sonido se lleve la frase, no para competir con lo que se está diciendo.
 */
function componerHtml(diapositiva: Diapositiva): string {
  const color = COLORES[diapositiva.competencia] ?? '#2563eb';

  return `<!doctype html>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${ANCHO}px; height: ${ALTO}px;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 96px 120px;
    background: #ffffff;
    font-family: 'Segoe UI', Inter, system-ui, sans-serif;
    color: #1f2733;
  }
  .barra { position: fixed; inset: 0 0 auto 0; height: 12px; background: ${color}; }
  header { display: flex; align-items: center; gap: 24px; }
  .kmk {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 132px; padding: 12px 28px; border-radius: 999px;
    background: ${color}; color: #fff;
    font-size: 34px; font-weight: 700; letter-spacing: .04em;
  }
  .modulo { font-size: 34px; color: #5b6675; font-weight: 500; }
  h1 {
    font-size: 104px; line-height: 1.12; font-weight: 700;
    letter-spacing: -0.02em; max-width: 1500px;
  }
  footer { display: flex; justify-content: space-between; align-items: flex-end;
           font-size: 28px; color: #8590a0; }
  .marca { font-weight: 600; color: #5b6675; }
</style>
<div class="barra"></div>
<header>
  <span class="kmk">KMK ${escapar(diapositiva.competencia)}</span>
  <span class="modulo">${escapar(diapositiva.modulo)}</span>
</header>
<h1>${escapar(diapositiva.titular)}</h1>
<footer>
  <span class="marca">Medienpass · Colegio Alemán de Barranquilla</span>
  <span>${escapar(diapositiva.paso)}</span>
</footer>`;
}

/**
 * Fotografía la diapositiva y devuelve la ruta del PNG.
 *
 * `--headless=new` con `--hide-scrollbars`: sin eso aparece una barra gris de
 * quince píxeles en el borde derecho de todos los fotogramas.
 */
export async function renderizar(
  chrome: string,
  diapositiva: Diapositiva,
  carpeta: string,
  nombre: string,
): Promise<string> {
  const html = path.join(carpeta, `${nombre}.html`);
  const png = path.join(carpeta, `${nombre}.png`);

  await writeFile(html, componerHtml(diapositiva), 'utf8');

  await ejecutar(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--default-background-color=ffffff',
    `--window-size=${ANCHO},${ALTO}`,
    `--screenshot=${png}`,
    `file:///${html.replace(/\\/g, '/')}`,
  ]);

  if (!existsSync(png)) {
    throw new Error(`Chrome no produjo la diapositiva ${nombre}`);
  }
  return png;
}
