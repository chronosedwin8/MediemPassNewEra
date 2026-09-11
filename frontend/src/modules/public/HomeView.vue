<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Language } from '@medienpass/shared';
import { publicContent } from './content';
import HeroSection from './sections/HeroSection.vue';
import WhySection from './sections/WhySection.vue';
import FrameworksSection from './sections/FrameworksSection.vue';
import CrosswalkSection from './sections/CrosswalkSection.vue';
import IbLevelsSection from './sections/IbLevelsSection.vue';
import AccessSection from './sections/AccessSection.vue';

/**
 * Portada del proyecto.
 *
 * Explica por qué existe la plataforma antes de ofrecer entrar en ella. El
 * orden es deliberado: el argumento (por qué hay que evaluar los medios
 * digitales), los marcos que lo sostienen, cómo se cruzan entre sí, cómo
 * recorre eso las etapas del IB y, al final, la puerta.
 *
 * Todo el texto sale de `content/`, no de los catálogos de i18n: son párrafos
 * y no etiquetas de interfaz. La explicación larga está en `content/types.ts`.
 */

const { locale } = useI18n();

const content = computed(() => publicContent(locale.value as Language).home);
</script>

<template>
  <div>
    <HeroSection :hero="content.hero" />
    <WhySection :why="content.why" />
    <FrameworksSection :frameworks="content.frameworks" />
    <CrosswalkSection :crosswalk="content.crosswalk" />
    <IbLevelsSection :ib-levels="content.ibLevels" />
    <AccessSection :access="content.access" />
  </div>
</template>
