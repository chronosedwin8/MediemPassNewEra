import { writeFile } from 'node:fs/promises';

/**
 * Narración con ElevenLabs.
 *
 * Se pide el audio **con marcas de tiempo por carácter**. Podría pedirse solo
 * el MP3 y repartir los subtítulos a ojo por número de palabras, pero eso
 * produce el desfase que todo el mundo ha visto alguna vez: el texto va medio
 * segundo por delante al principio y dos segundos por detrás al final. Si la
 * API sabe cuándo se dijo cada carácter, no hay razón para adivinarlo.
 *
 * La clave se lee del entorno y **no se imprime nunca**, ni siquiera truncada
 * ni al fallar.
 */

const API = 'https://api.elevenlabs.io/v1';

/** Tope de la API por petición. Ninguna escena se acerca, pero conviene saberlo. */
const MAX_CARACTERES = 5000;

export interface Alineacion {
  caracteres: string[];
  finSegundos: number[];
}

export interface Narracion {
  mp3: Buffer;
  alineacion: Alineacion;
}

interface RespuestaConMarcas {
  audio_base64: string;
  normalized_alignment?: {
    characters: string[];
    character_end_times_seconds: number[];
  } | null;
  alignment?: {
    characters: string[];
    character_end_times_seconds: number[];
  } | null;
}

export function leerApiKey(): string {
  const key = process.env['ELEVENLABS_API_KEY']?.trim();
  if (!key) {
    throw new Error(
      'Falta ELEVENLABS_API_KEY en .env. Es lo único que hace falta para generar los vídeos.',
    );
  }
  return key;
}

/**
 * Convierte un texto en audio narrado.
 *
 * `eleven_multilingual_v2` y no un modelo rápido: esto se genera una vez y lo
 * van a oír docentes durante años. La diferencia de calidad entre ambos se
 * nota en los nombres propios y en la entonación de las frases largas, que es
 * justo de lo que están hechos estos guiones.
 */
export async function narrar(apiKey: string, voiceId: string, texto: string): Promise<Narracion> {
  if (texto.length > MAX_CARACTERES) {
    throw new Error(`La escena tiene ${texto.length} caracteres y el tope es ${MAX_CARACTERES}`);
  }

  const response = await fetch(
    `${API}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: texto,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          // Estable y poco expresiva: es material de formación, no una
          // narración dramatizada. Una voz que sube y baja distrae de lo que
          // se está diciendo.
          stability: 0.55,
          similarity_boost: 0.75,
          style: 0.1,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!response.ok) {
    // No se propaga el cuerpo entero: puede reflejar la petición, y la
    // petición viaja con la clave en las cabeceras.
    throw new Error(`ElevenLabs respondió ${response.status} al narrar`);
  }

  const payload = (await response.json()) as RespuestaConMarcas;
  const marcas = payload.normalized_alignment ?? payload.alignment;

  if (!payload.audio_base64 || !marcas) {
    throw new Error('ElevenLabs devolvió una respuesta sin audio o sin marcas de tiempo');
  }

  return {
    mp3: Buffer.from(payload.audio_base64, 'base64'),
    alineacion: {
      caracteres: marcas.characters,
      finSegundos: marcas.character_end_times_seconds,
    },
  };
}

export async function guardarMp3(narracion: Narracion, destino: string): Promise<void> {
  await writeFile(destino, narracion.mp3);
}

/** Cuánto dura la escena, según la última marca de tiempo. */
export function duracionSegundos(narracion: Narracion): number {
  const fin = narracion.alineacion.finSegundos;
  return fin.length > 0 ? (fin[fin.length - 1] ?? 0) : 0;
}
