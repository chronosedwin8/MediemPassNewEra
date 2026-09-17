<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { resolveEmbed } from '@medienpass/shared';

/**
 * El material audiovisual de la capacitación, reproducido dentro del módulo.
 *
 * Antes un contenido de vídeo era un enlace que abría otra pestaña. El
 * problema no era estético: quien sale de la plataforma para ver el material a
 * menudo no vuelve, y el avance del módulo se quedaba a medias aunque la
 * persona hubiera visto el vídeo entero.
 *
 * La URL **no se incrusta tal cual**. Un `<iframe>` apuntando a donde diga una
 * cadena de la base de datos es una vía directa para colar contenido ajeno en
 * una página autenticada, así que solo se incrusta lo que está en la lista
 * blanca del paquete compartido —la misma que aplica el servidor al guardar—.
 * Un archivo servido por HTTPS se reproduce con `<video>` o `<audio>`, que no
 * ejecutan nada. Lo que no encaja en ninguno de los dos casos sigue siendo un
 * enlace: degradar a enlace es seguro, incrustar a ciegas no.
 */

const props = defineProps<{ url: string; title: string }>();

const { t } = useI18n();

/*
 * El origen propio cuenta como material de la plataforma: los vídeos de la
 * capacitación viven ahí y se sirven sin extensión reconocible.
 */
const recurso = computed(() => resolveEmbed(props.url, window.location.origin));
</script>

<template>
  <!--
    Proporción fija y ancho completo: sin ella el reproductor salta de tamaño
    al cargar y empuja el resto del módulo hacia abajo.
  -->
  <div
    v-if="recurso.kind === 'iframe'"
    class="aspect-video w-full max-w-full overflow-hidden rounded-lg bg-black"
  >
    <iframe
      :src="recurso.src"
      :title="title"
      class="size-full"
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
      allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
      allowfullscreen
    />
  </div>

  <video
    v-else-if="recurso.kind === 'video'"
    :src="recurso.src"
    controls
    preload="metadata"
    class="aspect-video w-full max-w-full rounded-lg bg-black"
  />

  <audio
    v-else-if="recurso.kind === 'audio'"
    :src="recurso.src"
    controls
    preload="metadata"
    class="w-full"
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
