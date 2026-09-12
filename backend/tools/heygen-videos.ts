import { prisma } from '../src/infrastructure/database/prisma.js';
import { GUIONES, findGuion, type Guion } from './guiones-capacitacion.js';
import {
  consultarEstado,
  generarVideo,
  listarAvatares,
  listarVoces,
  type HeyGenStatus,
} from './heygen.client.js';

/**
 * Genera los vídeos de la capacitación docente y los coloca en sus módulos.
 *
 * Un comando, un resultado igual cada vez. Es lo que diferencia esto de pedir
 * el vídeo en una conversación: cuando se reescriba un módulo habrá que volver
 * a grabarlo, y quien lo haga dentro de dos años no habrá estado en la charla
 * donde se generó el primero.
 *
 *   npm run videos:avatares          # qué avatares y voces hay disponibles
 *   npm run videos -- --modulo KMK-M1
 *   npm run videos -- --todos --aplicar
 *
 * La clave va en `.env` como HEYGEN_API_KEY y no se imprime nunca. El avatar y
 * la voz también se fijan ahí, para que los seis salgan con el mismo
 * presentador: seis distintos se leen como seis materiales sueltos.
 */

const FONDO = '#F4F6FB';
const ESPERA_MS = 15_000;
const INTENTOS_MAX = 60;

interface Ajustes {
  apiKey: string;
  avatarId: string;
  voiceId: string;
}

function leerAjustes(): Ajustes {
  const apiKey = process.env['HEYGEN_API_KEY'];
  if (!apiKey) {
    throw new Error(
      'Falta HEYGEN_API_KEY en .env. Se crea en HeyGen → Settings → API → New API key.',
    );
  }

  const avatarId = process.env['HEYGEN_AVATAR_ID'];
  const voiceId = process.env['HEYGEN_VOICE_ID'];
  if (!avatarId || !voiceId) {
    throw new Error(
      'Faltan HEYGEN_AVATAR_ID y HEYGEN_VOICE_ID en .env. Ejecute «npm run videos:avatares» para elegirlos.',
    );
  }

  return { apiKey, avatarId, voiceId };
}

/** Lista lo que hay en la cuenta, filtrando las voces por idioma español. */
async function mostrarCatalogo(): Promise<void> {
  const apiKey = process.env['HEYGEN_API_KEY'];
  if (!apiKey) throw new Error('Falta HEYGEN_API_KEY en .env.');

  const [avatares, voces] = await Promise.all([listarAvatares(apiKey), listarVoces(apiKey)]);

  console.warn(`\nAVATARES (${avatares.length})`);
  for (const avatar of avatares.slice(0, 40)) {
    console.warn(`  ${avatar.avatar_id}  ${avatar.avatar_name} (${avatar.gender ?? '—'})`);
  }

  const español = voces.filter((voz) => (voz.language ?? '').toLowerCase().includes('spanish'));
  console.warn(`\nVOCES EN ESPAÑOL (${español.length} de ${voces.length})`);
  for (const voz of español.slice(0, 40)) {
    console.warn(`  ${voz.voice_id}  ${voz.name} — ${voz.language} (${voz.gender ?? '—'})`);
  }

  console.warn('\nCopie un avatar_id y un voice_id a HEYGEN_AVATAR_ID y HEYGEN_VOICE_ID en .env.');
}

/** Espera a que el vídeo esté renderizado, informando del avance. */
async function esperar(apiKey: string, videoId: string, etiqueta: string): Promise<HeyGenStatus> {
  for (let intento = 1; intento <= INTENTOS_MAX; intento += 1) {
    const estado = await consultarEstado(apiKey, videoId);

    if (estado.status === 'completed') return estado;
    if (estado.status === 'failed') {
      const motivo = estado.error?.message ?? estado.error?.detail ?? 'sin detalle';
      throw new Error(`${etiqueta}: HeyGen falló al renderizar (${motivo})`);
    }

    process.stdout.write(`\r  ${etiqueta}: ${estado.status} (${intento}/${INTENTOS_MAX})   `);
    await new Promise((resolve) => setTimeout(resolve, ESPERA_MS));
  }

  throw new Error(`${etiqueta}: el vídeo sigue sin terminar tras ${INTENTOS_MAX} consultas`);
}

async function generarUno(ajustes: Ajustes, guion: Guion): Promise<string> {
  console.warn(`\n▶ ${guion.moduleCode} — ${guion.titulo}`);

  const videoId = await generarVideo(ajustes.apiKey, {
    titulo: `Medienpass · ${guion.moduleCode}`,
    escenas: guion.escenas.map((texto) => ({ texto })),
    avatarId: ajustes.avatarId,
    voiceId: ajustes.voiceId,
    fondo: FONDO,
  });

  const estado = await esperar(ajustes.apiKey, videoId, guion.moduleCode);
  const url = estado.video_url;
  if (!url) throw new Error(`${guion.moduleCode}: terminó sin URL de vídeo`);

  console.warn(`\r  ${guion.moduleCode}: listo (${Math.round(estado.duration ?? 0)} s)      `);
  console.warn(`  ${url}`);
  return url;
}

/**
 * Coloca el vídeo como primer contenido del módulo.
 *
 * Primero porque es una presentación: detrás del material ya no presenta nada.
 * Las posiciones se desplazan de mayor a menor para no chocar con la unicidad
 * de (módulo, posición) — moviendo antes la de arriba, el hueco siempre existe
 * cuando llega la siguiente.
 */
async function aplicar(guion: Guion, url: string): Promise<void> {
  const modulo = await prisma.trainingModule.findUnique({
    where: { code: guion.moduleCode },
    include: { contents: { orderBy: { position: 'desc' } } },
  });

  if (!modulo) {
    console.warn(`  ⚠ No existe el módulo ${guion.moduleCode}; no se aplicó.`);
    return;
  }

  const existente = modulo.contents.find(
    (contenido) => contenido.type === 'VIDEO' && contenido.position === 0,
  );

  if (existente) {
    await prisma.trainingContent.update({ where: { id: existente.id }, data: { url } });
    console.warn(`  ↻ Actualizado el vídeo que ya encabezaba ${guion.moduleCode}.`);
    return;
  }

  const texto = { es: guion.titulo, de: guion.titulo, en: guion.titulo };
  const cuerpo = { es: guion.resumen, de: guion.resumen, en: guion.resumen };

  await prisma.$transaction(async (tx) => {
    for (const contenido of modulo.contents) {
      await tx.trainingContent.update({
        where: { id: contenido.id },
        data: { position: contenido.position + 1 },
      });
    }

    await tx.trainingContent.create({
      data: {
        moduleId: modulo.id,
        type: 'VIDEO',
        title: texto,
        body: cuerpo,
        url,
        position: 0,
      },
    });
  });

  console.warn(`  ✓ Colocado al inicio de ${guion.moduleCode}.`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--avatares') || args.includes('--voces')) {
    await mostrarCatalogo();
    return;
  }

  const indiceModulo = args.indexOf('--modulo');
  const pedidos =
    indiceModulo >= 0
      ? [findGuion(args[indiceModulo + 1] ?? '')].filter((guion): guion is Guion => Boolean(guion))
      : GUIONES;

  if (pedidos.length === 0) {
    throw new Error('No se reconoció el módulo. Códigos válidos: KMK-M1 … KMK-M6.');
  }

  const ajustes = leerAjustes();
  const debeAplicar = args.includes('--aplicar');

  for (const guion of pedidos) {
    const url = await generarUno(ajustes, guion);
    if (debeAplicar) await aplicar(guion, url);
  }

  console.warn(
    debeAplicar
      ? '\nHecho. Los vídeos ya encabezan sus módulos.'
      : '\nHecho. Vuelva a ejecutar con --aplicar para colocarlos en los módulos.',
  );
}

main()
  .catch((error: unknown) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
