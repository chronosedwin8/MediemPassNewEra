import { z } from 'zod';

/**
 * Cliente de HeyGen para generar los vídeos de la capacitación.
 *
 * Va por la API REST y no por el conector MCP a propósito. El conector sirve
 * para pedir un vídeo suelto en una conversación; esto tiene que poder
 * repetirse. Cuando se reescriba un módulo habrá que volver a grabar su vídeo,
 * y eso debe ser un comando con un resultado igual cada vez, no una sesión de
 * chat que alguien recuerde haber tenido.
 *
 * La clave se lee del entorno y **no se registra nunca**, ni siquiera al
 * fallar: los errores de la API pueden reflejar la petición entera.
 */

const BASE = 'https://api.heygen.com';

/** Lo que HeyGen responde al aceptar una generación. */
const generateResponse = z.object({
  error: z.unknown().nullish(),
  data: z.object({ video_id: z.string().min(1) }),
});

const statusResponse = z.object({
  data: z.object({
    status: z.enum(['pending', 'processing', 'completed', 'failed', 'waiting']),
    video_url: z.string().url().nullish(),
    duration: z.number().nullish(),
    error: z.object({ message: z.string().nullish(), detail: z.string().nullish() }).nullish(),
  }),
});

const avatarsResponse = z.object({
  data: z.object({
    avatars: z.array(
      z.object({
        avatar_id: z.string(),
        avatar_name: z.string(),
        gender: z.string().nullish(),
      }),
    ),
  }),
});

const voicesResponse = z.object({
  data: z.object({
    voices: z.array(
      z.object({
        voice_id: z.string(),
        name: z.string(),
        language: z.string().nullish(),
        gender: z.string().nullish(),
      }),
    ),
  }),
});

export type HeyGenStatus = z.infer<typeof statusResponse>['data'];
export type HeyGenAvatar = z.infer<typeof avatarsResponse>['data']['avatars'][number];
export type HeyGenVoice = z.infer<typeof voicesResponse>['data']['voices'][number];

export interface EscenaVideo {
  texto: string;
}

export interface PeticionVideo {
  titulo: string;
  escenas: EscenaVideo[];
  avatarId: string;
  voiceId: string;
  /** Fondo liso: el material de formación no necesita decorado. */
  fondo: string;
}

/**
 * Una llamada a la API, con el error traducido a algo legible.
 *
 * El cuerpo del error no se imprime entero: HeyGen devuelve a veces la
 * petición recibida, y la petición lleva la clave en las cabeceras. Se informa
 * del código y del mensaje, que es lo que sirve para diagnosticar.
 */
async function call<T>(
  apiKey: string,
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'x-api-key': apiKey, 'content-type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const detalle = await response.text().catch(() => '');
    const recorte = detalle.slice(0, 300);
    throw new Error(`HeyGen respondió ${response.status} en ${path}: ${recorte}`);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`La respuesta de ${path} no tenía la forma esperada`);
  }
  return parsed.data;
}

export async function listarAvatares(apiKey: string): Promise<HeyGenAvatar[]> {
  const result = await call(apiKey, '/v2/avatars', avatarsResponse);
  return result.data.avatars;
}

export async function listarVoces(apiKey: string): Promise<HeyGenVoice[]> {
  const result = await call(apiKey, '/v2/voices', voicesResponse);
  return result.data.voices;
}

/** Encola la generación y devuelve el identificador con el que se consulta. */
export async function generarVideo(apiKey: string, peticion: PeticionVideo): Promise<string> {
  const body = {
    title: peticion.titulo,
    // 1920x1080: es como se incrusta en el módulo y como se proyecta en una
    // jornada pedagógica.
    dimension: { width: 1920, height: 1080 },
    video_inputs: peticion.escenas.map((escena) => ({
      character: { type: 'avatar', avatar_id: peticion.avatarId, avatar_style: 'normal' },
      voice: { type: 'text', input_text: escena.texto, voice_id: peticion.voiceId, speed: 1 },
      background: { type: 'color', value: peticion.fondo },
    })),
  };

  const result = await call(apiKey, '/v2/video/generate', generateResponse, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return result.data.video_id;
}

export async function consultarEstado(apiKey: string, videoId: string): Promise<HeyGenStatus> {
  const result = await call(
    apiKey,
    `/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
    statusResponse,
  );
  return result.data;
}
