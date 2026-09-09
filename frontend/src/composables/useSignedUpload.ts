import { ref } from 'vue';
import { http } from '@/services/http';

/**
 * Subida en tres pasos contra el almacenamiento externo.
 *
 * El baile es siempre el mismo: pedir una URL firmada, hacer el `PUT`
 * directamente al almacenamiento y confirmar contra nuestra API. Lo hacen dos
 * pantallas distintas —las evidencias del estudiante y las imágenes del
 * enunciado— con endpoints diferentes pero idéntica secuencia, y tenerlo dos
 * veces significaba que el día que se añadiera un reintento o una barra de
 * progreso habría que acordarse de los dos sitios.
 *
 * El detalle que no puede perderse al reutilizarlo: el `PUT` va con `fetch`
 * desnudo y no con nuestro cliente HTTP. La URL firmada apunta a otro dominio,
 * y adjuntarle la cabecera `Authorization` de la aplicación entregaría el token
 * de sesión a un tercero.
 */

interface UploadTicket {
  storageKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
  maxBytes: number;
}

export interface SignedUploadEndpoints {
  /** Ruta que firma la subida. */
  request: string;
  /** Ruta que la confirma una vez el archivo está arriba. */
  confirm: string;
  /** Datos propios de cada caso: el intento y la pregunta, o la versión. */
  context: () => Record<string, unknown>;
}

export function useSignedUpload<TResult>(endpoints: SignedUploadEndpoints) {
  const uploading = ref(false);
  const currentName = ref('');

  async function upload(file: File): Promise<TResult> {
    uploading.value = true;
    currentName.value = file.name;

    const descriptor = {
      ...endpoints.context(),
      contentType: file.type,
      originalName: file.name,
      sizeBytes: file.size,
    };

    try {
      const ticket = await http.post<UploadTicket>(endpoints.request, descriptor);

      const put = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      /*
       * Un 403 aquí casi siempre significa que el archivo no coincide con lo
       * que se firmó —otro tipo, otro tamaño— y no que falten permisos. Se
       * distingue porque el mensaje genérico mandaría a revisar los permisos
       * del usuario, que es exactamente donde no está el problema.
       */
      if (!put.ok) {
        throw new Error(
          put.status === 403 ? 'El archivo no coincide con lo autorizado' : `Error ${put.status}`,
        );
      }

      return await http.post<TResult>(endpoints.confirm, {
        ...descriptor,
        storageKey: ticket.storageKey,
      });
    } finally {
      uploading.value = false;
      currentName.value = '';
    }
  }

  return { upload, uploading, currentName };
}
