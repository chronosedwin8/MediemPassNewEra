import { randomUUID } from 'node:crypto';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ERROR_CODE } from '@medienpass/shared';
import { env } from '../../config/env.js';
import { AppError, ExternalServiceError } from '../../shared/errors/app-error.js';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('storage');

/**
 * Almacenamiento de archivos.
 *
 * Dos decisiones de fondo:
 *
 *  1. **El archivo no pasa por el backend.** El navegador sube directamente a
 *     S3 con una URL firmada de corta duración. Hacerlo pasar por aquí
 *     significaría que subir treinta evidencias de 20 MB durante un examen
 *     ocupa treinta veces la memoria del servidor y su ancho de banda, y no
 *     aporta nada: la validación de tipo y tamaño va **dentro de la firma**,
 *     de modo que S3 rechaza lo que no cuadre aunque alguien manipule el
 *     formulario.
 *  2. **La credencial nunca sale del backend.** Lo que viaja al navegador es
 *     una URL que caduca en minutos y solo sirve para una clave concreta.
 *
 * La interfaz permite además un almacenamiento en memoria para desarrollo y
 * pruebas, por el mismo motivo que existe el proveedor simulado de IA: la
 * suite de integración no debe depender de la red ni de una cuenta de AWS.
 */

export interface UploadTarget {
  /** Clave definitiva dentro del bucket. */
  key: string;
  /** URL a la que el navegador hace PUT. Caduca pronto. */
  uploadUrl: string;
  expiresInSeconds: number;
}

export interface StoredObjectInfo {
  contentType: string;
  sizeBytes: number;
}

export interface Storage {
  readonly id: string;
  isConfigured(): boolean;
  /** Firma una subida para una clave concreta. */
  createUploadTarget(key: string, contentType: string): Promise<UploadTarget>;
  /** Comprueba qué se subió realmente. */
  head(key: string): Promise<StoredObjectInfo | null>;
  /**
   * URL temporal de lectura.
   *
   * `inline` decide si el navegador lo muestra o lo descarga. Solo se usa con
   * imágenes: un PDF o un HTML servidos en línea se abren en el dominio del
   * bucket, y aunque no sea nuestro origen, no hay motivo para permitirlo.
   */
  createDownloadUrl(key: string, filename: string, inline?: boolean): Promise<string>;
  /** Borra en bloque. Devuelve cuántas claves se eliminaron. */
  remove(keys: string[]): Promise<number>;
}

/**
 * Tipos admitidos.
 *
 * Lista blanca y no negra: enumerar lo prohibido garantiza olvidarse de algo.
 * No se admite SVG aunque sea una imagen —puede llevar scripts dentro— ni
 * nada ejecutable.
 */
export const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  // Lo que produce MediaRecorder en Chrome y Firefox al grabar solo voz.
  'audio/webm': 'weba',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export function extensionFor(contentType: string): string {
  const extension = ALLOWED_CONTENT_TYPES[contentType];
  if (!extension) {
    throw AppError.validation([
      {
        path: 'contentType',
        rule: 'unsupported_type',
        message: `Tipo de archivo no admitido: ${contentType}`,
      },
    ]);
  }
  return extension;
}

/**
 * Compone la clave de un archivo.
 *
 * La ruta es sobre todo para que un humano se oriente en la consola de AWS; el
 * borrado selectivo se resuelve por la tabla `stored_files`, no por prefijo.
 * Aun así se ordena de lo general a lo concreto para que recorrer el bucket a
 * mano tenga sentido.
 */
export function buildEvidenceKey(input: {
  academicYearCode: string;
  assessmentId: string;
  attemptId: string;
  contentType: string;
}): string {
  const extension = extensionFor(input.contentType);
  return `evidence/${input.academicYearCode}/${input.assessmentId}/${input.attemptId}/${randomUUID()}.${extension}`;
}

export function buildTrainingMediaKey(input: {
  moduleCode: string;
  contentId: string;
  contentType: string;
}): string {
  const extension = extensionFor(input.contentType);
  return `training/${input.moduleCode}/${input.contentId}/${randomUUID()}.${extension}`;
}

/**
 * Clave de una grabación que responde una pregunta.
 *
 * Cuelga del intento y de la pregunta, no de una carpeta común de evidencias:
 * mirando el bucket a mano se ve de quién es cada archivo y a qué contestaba,
 * que es justo lo que hace falta el día que alguien pregunta qué se guardó.
 */
export function buildResponseMediaKey(input: {
  academicYearCode: string;
  assessmentId: string;
  attemptId: string;
  questionId: string;
  contentType: string;
}): string {
  const extension = extensionFor(baseContentType(input.contentType));
  return `response/${input.academicYearCode}/${input.assessmentId}/${input.attemptId}/${input.questionId}-${randomUUID()}.${extension}`;
}

/** `video/webm;codecs=vp8` → `video/webm`. Los navegadores anuncian su códec. */
export function baseContentType(contentType: string): string {
  return contentType.split(';')[0]!.trim().toLowerCase();
}

export function buildQuestionMediaKey(input: {
  assessmentId: string;
  versionId: string;
  contentType: string;
}): string {
  const extension = extensionFor(input.contentType);
  return `question-media/${input.assessmentId}/${input.versionId}/${randomUUID()}.${extension}`;
}

// --- S3 ----------------------------------------------------------------------

class S3Storage implements Storage {
  readonly id = 's3';

  private client: S3Client | null = null;

  isConfigured(): boolean {
    return Boolean(env.S3_BUCKET && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
  }

  private get s3(): S3Client {
    if (!this.isConfigured()) {
      throw new AppError(ERROR_CODE.BAD_REQUEST, 'S3 storage is not configured');
    }
    this.client ??= new S3Client({
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    return this.client;
  }

  async createUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
    /*
     * `ContentType` y `ContentLength` van firmados.
     *
     * Es lo que convierte el límite de tamaño en una regla del servidor en
     * lugar de una sugerencia del navegador: si el archivo real no coincide con
     * lo firmado, S3 devuelve 403 y no llega a escribirse nada.
     */
    const command = new PutObjectCommand({
      Bucket: env.S3_BUCKET!,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: env.S3_UPLOAD_URL_TTL_SECONDS,
      signableHeaders: new Set(['content-type', 'content-length']),
    });

    return { key, uploadUrl, expiresInSeconds: env.S3_UPLOAD_URL_TTL_SECONDS };
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const result = await this.s3.send(
        new HeadObjectCommand({ Bucket: env.S3_BUCKET!, Key: key }),
      );
      return {
        contentType: result.ContentType ?? 'application/octet-stream',
        sizeBytes: Number(result.ContentLength ?? 0),
      };
    } catch (error) {
      // Que no esté no es un fallo: significa que la subida no llegó a
      // completarse, y quien llama debe poder distinguirlo de un error real.
      if (error instanceof Error && (error.name === 'NotFound' || error.name === 'NoSuchKey')) {
        return null;
      }
      throw new ExternalServiceError(
        's3',
        ERROR_CODE.EXTERNAL_SERVICE_ERROR,
        'No se pudo comprobar el archivo',
        { cause: error },
      );
    }
  }

  async createDownloadUrl(key: string, filename: string, inline = false): Promise<string> {
    const safeName = filename.replace(/["\\]/g, '');

    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET!,
      Key: key,
      /*
       * Por defecto fuerza la descarga en lugar de abrirlo en la pestaña.
       *
       * `inline` existe para las imágenes incrustadas en un enunciado o en el
       * material de capacitación: con `attachment`, el navegador se niega a
       * pintarlas y quien redactó ve un hueco roto donde puso una foto. Se
       * limita a imágenes; un PDF o un HTML servidos en línea se abrirían en
       * el dominio del bucket, y no hay motivo para permitirlo.
       */
      ResponseContentDisposition: inline
        ? `inline; filename="${safeName}"`
        : `attachment; filename="${safeName}"`,
    });

    return getSignedUrl(this.s3, command, { expiresIn: env.S3_DOWNLOAD_URL_TTL_SECONDS });
  }

  async remove(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;

    let deleted = 0;
    // S3 acepta mil claves por petición.
    for (let index = 0; index < keys.length; index += 1000) {
      const batch = keys.slice(index, index + 1000);
      const result = await this.s3.send(
        new DeleteObjectsCommand({
          Bucket: env.S3_BUCKET!,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: false },
        }),
      );

      deleted += result.Deleted?.length ?? 0;

      if (result.Errors?.length) {
        // Se registra y se sigue: un objeto que no se pudo borrar no debe
        // impedir borrar los otros novecientos.
        log.error(
          { errors: result.Errors.map((entry) => ({ key: entry.Key, code: entry.Code })) },
          'algunas claves no se pudieron borrar',
        );
      }
    }

    return deleted;
  }
}

// --- En memoria --------------------------------------------------------------

/**
 * Almacenamiento simulado para desarrollo y pruebas.
 *
 * Devuelve URLs que no llevan a ninguna parte, y es lo correcto: las pruebas
 * de integración comprueban que se registra el archivo, que se aplica el
 * alcance y que el borrado limpia lo que debe, no que Amazon funcione.
 */
export class MemoryStorage implements Storage {
  readonly id = 'memory';

  private readonly objects = new Map<string, StoredObjectInfo>();

  isConfigured(): boolean {
    return true;
  }

  createUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
    this.objects.set(key, { contentType, sizeBytes: 1024 });
    return Promise.resolve({
      key,
      uploadUrl: `memory://upload/${encodeURIComponent(key)}`,
      expiresInSeconds: 300,
    });
  }

  head(key: string): Promise<StoredObjectInfo | null> {
    return Promise.resolve(this.objects.get(key) ?? null);
  }

  createDownloadUrl(key: string, _filename: string, inline = false): Promise<string> {
    return Promise.resolve(`memory://${inline ? 'inline' : 'download'}/${encodeURIComponent(key)}`);
  }

  remove(keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.objects.delete(key)) deleted += 1;
    }
    return Promise.resolve(deleted);
  }

  /** Solo para pruebas: cuántos objetos quedan. */
  size(): number {
    return this.objects.size;
  }
}

let instance: Storage | null = null;

export function getStorage(): Storage {
  instance ??= env.STORAGE_DRIVER === 's3' ? new S3Storage() : new MemoryStorage();
  return instance;
}

/** Permite sustituirlo en pruebas. */
export function setStorage(storage: Storage | null): void {
  instance = storage;
}
