<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Un vídeo de capacitación, reproducido dentro del módulo.
 *
 * Antes un contenido de tipo VIDEO era un enlace que abría otra pestaña. El
 * problema no era estético: quien sale de la plataforma para ver el material
 * a menudo no vuelve, y el avance del módulo se quedaba a medias aunque la
 * persona hubiera visto el vídeo entero.
 *
 * La URL **no se incrusta tal cual**. Un `<iframe>` apuntando a donde diga una
 * cadena de la base de datos es una vía directa para colar contenido ajeno en
 * una página autenticada, así que solo se incrusta lo que está en la lista de
 * plataformas conocidas. Un archivo de vídeo servido por HTTPS se reproduce
 * con `<video>`, que no ejecuta nada. Lo que no encaja en ninguno de los dos
 * casos sigue siendo un enlace: degradar a enlace es seguro, incrustar a
 * ciegas no.
 */

const props = defineProps<{ url: string; title: string }>();

const { t } = useI18n();

/** Un archivo que el navegador sabe reproducir por sí solo. */
const FILE_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.ogv', '.m4v'];

/**
 * Plataformas cuya página de reproducción se puede incrustar.
 *
 * Cada entrada traduce la URL que una persona copia del navegador a la que de
 * verdad sirve el reproductor. Son cosas distintas: pegar la de compartir en
 * un `<iframe>` no funciona en ninguna de las tres.
 */
const PLATFORMS: Array<{ hosts: string[]; embed: (url: URL) => string | null }> = [
  {
    // HeyGen: app.heygen.com/share/<id> → .../embeds/<id>
    hosts: ['app.heygen.com'],
    embed: (url) => {
      const id = url.pathname.split('/').filter(Boolean).pop();
      return id ? `https://app.heygen.com/embeds/${id}` : null;
    },
  },
  {
    hosts: ['www.youtube.com', 'youtube.com', 'youtu.be'],
    embed: (url) => {
      // youtu.be lleva el identificador en la ruta; youtube.com, en ?v=
      const id =
        url.hostname === 'youtu.be'
          ? url.pathname.slice(1)
          : (url.searchParams.get('v') ?? url.pathname.split('/').pop());
      // El dominio sin cookies: el material de formación no tiene por qué
      // dejar rastro publicitario en el navegador de quien lo ve.
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    },
  },
  {
    hosts: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'],
    embed: (url) => {
      const id = url.pathname.split('/').filter(Boolean).pop();
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    },
  },
];

/**
 * La URL, si es una que se puede reproducir.
 *
 * Una ruta que empieza por una sola barra es material servido por la propia
 * plataforma —los vídeos de la capacitación viven ahí— y se resuelve contra
 * el origen actual. Es el caso más seguro de todos: mismo origen, nada de
 * terceros. Se excluye «//» porque no es una ruta local sino una URL sin
 * esquema, que apunta fuera.
 *
 * Para lo demás se exige HTTPS: un vídeo por HTTP en una página segura no
 * carga, y un `javascript:` no debe llegar nunca a un atributo `src`.
 */
const parsed = computed<URL | null>(() => {
  const bruta = props.url.trim();

  try {
    if (bruta.startsWith('/') && !bruta.startsWith('//')) {
      return new URL(bruta, window.location.origin);
    }
    const url = new URL(bruta);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
});

/** Lo servido por la propia plataforma se reproduce aunque no lleve extensión. */
const esPropio = computed(
  () => parsed.value !== null && parsed.value.origin === window.location.origin,
);

const fileUrl = computed(() => {
  const url = parsed.value;
  if (!url) return null;
  const path = url.pathname.toLowerCase();
  const esArchivo = FILE_EXTENSIONS.some((extension) => path.endsWith(extension));
  return esArchivo || esPropio.value ? url.href : null;
});

const embedUrl = computed(() => {
  const url = parsed.value;
  if (!url || fileUrl.value) return null;

  const platform = PLATFORMS.find((candidate) => candidate.hosts.includes(url.hostname));
  return platform ? platform.embed(url) : null;
});
</script>

<template>
  <!--
    Proporción fija y ancho completo: sin ella el reproductor salta de tamaño
    al cargar y empuja el resto del módulo hacia abajo.
  -->
  <div v-if="embedUrl" class="aspect-video w-full max-w-full overflow-hidden rounded-lg bg-black">
    <iframe
      :src="embedUrl"
      :title="title"
      class="size-full"
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
      allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
      allowfullscreen
    />
  </div>

  <video
    v-else-if="fileUrl"
    :src="fileUrl"
    controls
    preload="metadata"
    class="aspect-video w-full max-w-full rounded-lg bg-black"
  />

  <!--
    Ni archivo ni plataforma conocida. Se conserva el enlace para no perder el
    material, con `rel="noopener"`: sin él la página de destino puede manipular
    esta pestaña a través de `window.opener`.
  -->
  <a v-else :href="url" target="_blank" rel="noopener noreferrer" class="text-brand-600 underline">
    {{ t('training.openResource') }}
  </a>
</template>
