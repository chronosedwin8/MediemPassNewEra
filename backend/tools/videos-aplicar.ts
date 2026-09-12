import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/infrastructure/database/prisma.js';
import { GUIONES, type Guion } from './guiones-capacitacion.js';

/**
 * Coloca los vídeos ya generados al inicio de su módulo de capacitación.
 *
 *   npm run -w backend videos:aplicar
 *
 * Los vídeos se sirven desde la propia aplicación, no desde un enlace externo
 * ni desde el bucket. Es material que va a estar años en circulación y que se
 * proyecta en jornadas pedagógicas donde a veces la red del colegio va mal: un
 * archivo servido por el mismo sitio que sirve la plataforma no depende de que
 * una cuenta siga activa, de que un enlace siga compartido ni de que una URL
 * firmada no haya caducado.
 *
 * Quedan fuera del repositorio —`public/media/` está en .gitignore— porque seis
 * vídeos en alta definición no tienen por qué vivir en un historial de git. Se
 * despliegan como lo que son: material, no código.
 */

const ORIGEN = path.resolve(process.cwd(), '..', 'media', 'capacitacion');
const DESTINO = path.resolve(process.cwd(), '..', 'frontend', 'public', 'media', 'capacitacion');

/** La ruta pública, que es lo que se guarda en el contenido del módulo. */
function urlPublica(guion: Guion): string {
  return `/media/capacitacion/${guion.moduleCode.toLowerCase()}.mp4`;
}

/**
 * Copia el vídeo junto a la aplicación, si hace falta.
 *
 * En el servidor no hace falta: los ficheros ya viajan dentro de la imagen
 * web, construida desde el repositorio. Aquí solo existe el contenedor de la
 * API, sin la carpeta de origen ni la de destino, y eso no es un error —es el
 * caso normal en producción—, así que se salta la copia y se sigue con lo
 * único que queda por hacer allí: apuntar los módulos a su vídeo.
 */
async function copiar(guion: Guion): Promise<string | null> {
  const nombre = `${guion.moduleCode.toLowerCase()}.mp4`;
  const origen = path.join(ORIGEN, nombre);

  try {
    await stat(origen);
  } catch {
    console.warn(`  · ${nombre}: no está aquí; se da por servido desde la imagen.`);
    return urlPublica(guion);
  }

  await mkdir(DESTINO, { recursive: true });
  await copyFile(origen, path.join(DESTINO, nombre));
  return urlPublica(guion);
}

/**
 * Deja el vídeo como primer contenido del módulo.
 *
 * Primero porque es una presentación, y detrás del material ya no presenta
 * nada. Las posiciones se desplazan de mayor a menor para no chocar con la
 * unicidad de (módulo, posición): moviendo antes la de arriba, el hueco existe
 * siempre cuando llega la siguiente.
 */
async function colocar(guion: Guion, url: string): Promise<void> {
  const modulo = await prisma.trainingModule.findUnique({
    where: { code: guion.moduleCode },
    include: { contents: { orderBy: { position: 'desc' } } },
  });

  if (!modulo) {
    console.warn(`  ⚠ No existe el módulo ${guion.moduleCode}.`);
    return;
  }

  const existente = modulo.contents.find(
    (contenido) => contenido.type === 'VIDEO' && contenido.position === 0,
  );

  if (existente) {
    await prisma.trainingContent.update({ where: { id: existente.id }, data: { url } });
    console.warn(`  ↻ ${guion.moduleCode}: actualizado el vídeo que ya encabezaba el módulo.`);
    return;
  }

  const titulo = { es: guion.titulo, de: guion.titulo, en: guion.titulo };
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
        title: titulo,
        body: cuerpo,
        url,
        position: 0,
      },
    });
  });

  console.warn(`  ✓ ${guion.moduleCode}: colocado al inicio.`);
}

async function main(): Promise<void> {
  for (const guion of GUIONES) {
    const url = await copiar(guion);
    if (url) await colocar(guion, url);
  }

  console.warn('\nHecho. Los vídeos encabezan sus módulos de capacitación.');
}

main()
  .catch((error: unknown) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
