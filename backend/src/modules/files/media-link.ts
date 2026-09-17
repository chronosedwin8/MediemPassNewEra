import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Un enlace estable para el material que se incrusta en el contenido.
 *
 * Las URL firmadas del almacenamiento caducan en cinco minutos, y eso está
 * bien para descargar un archivo: se pide, se usa y se olvida. Pero el HTML de
 * una lección **guarda** la dirección de cada imagen y cada vídeo, así que con
 * una URL firmada dentro, el material se veía mientras se escribía y aparecía
 * roto al día siguiente. Es el tipo de fallo que hace que nadie vuelva a
 * confiar en el editor.
 *
 * Aquí la dirección que se guarda es nuestra y no caduca: apunta a la
 * plataforma, que redirige a una URL firmada recién hecha cada vez que el
 * navegador la pide. Redirigir en lugar de retransmitir el archivo importa en
 * un servidor pequeño: un curso entero viendo un vídeo no pasa por nuestra
 * memoria.
 *
 * La firma existe porque la ruta no lleva sesión —una etiqueta `<img>` no
 * manda la cabecera de autenticación—, así que el identificador por sí solo
 * abriría la puerta a recorrer archivos probando identificadores. Con la firma
 * hace falta conocer el enlace exacto, y el enlace solo aparece dentro del
 * material que ya se está viendo.
 *
 * **Solo vale para material didáctico.** Las evidencias de estudiantes nunca
 * se sirven por aquí: son trabajo de menores y siguen exigiendo sesión y
 * alcance, como antes.
 */

/** Los tipos de archivo que pueden tener enlace estable. */
export const LINKABLE_FILE_KINDS = ['TRAINING_MEDIA', 'QUESTION_MEDIA'] as const;

export function isLinkableKind(kind: string): boolean {
  return (LINKABLE_FILE_KINDS as readonly string[]).includes(kind);
}

/**
 * La firma del identificador.
 *
 * Se deriva del secreto de los tokens con un propósito propio: si algún día se
 * usara el mismo secreto tal cual para dos cosas distintas, una firma válida
 * en un sitio podría valer en el otro.
 */
function sign(fileId: string): string {
  return createHmac('sha256', `${env.JWT_SECRET}:file-media`).update(fileId).digest('base64url');
}

export function buildMediaUrl(fileId: string): string {
  return `${env.APP_URL.replace(/\/$/, '')}/api/files/${fileId}/media?s=${sign(fileId)}`;
}

/** Compara en tiempo constante: una comparación normal filtra la firma. */
export function verifyMediaSignature(fileId: string, signature: string): boolean {
  const esperada = Buffer.from(sign(fileId));
  const recibida = Buffer.from(signature);

  if (esperada.length !== recibida.length) return false;
  return timingSafeEqual(esperada, recibida);
}
