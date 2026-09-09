<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { localize, type LocalizedText } from '@medienpass/shared';
import { http } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';

/**
 * Marco de competencias digitales KMK.
 *
 * Los nombres vienen de la base de datos en los tres idiomas, no del catálogo
 * de la interfaz: son datos del dominio, no textos de la aplicación.
 */

interface Competency {
  id: string;
  code: string;
  name: LocalizedText;
  description: LocalizedText;
  color: string;
  subcompetencies: Array<{ id: string; code: string; name: LocalizedText }>;
}

const { t, locale } = useI18n();
const competencies = ref<Competency[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    competencies.value = await http.get<Competency[]>('/kmk/competencies');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else class="flex flex-col gap-4">
    <BaseCard v-for="competency in competencies" :key="competency.id">
      <div class="flex items-start gap-4">
        <span
          class="flex size-10 shrink-0 items-center justify-center rounded-lg text-lg font-bold"
          :style="{ backgroundColor: `${competency.color}1a`, color: competency.color }"
          aria-hidden="true"
        >
          {{ competency.code }}
        </span>

        <div class="min-w-0">
          <h3 class="font-semibold">
            <span class="sr-only">{{ t('kmk.competency') }} {{ competency.code }}:</span>
            {{ localize(competency.name, locale as never) }}
          </h3>
          <p class="mt-1 text-sm leading-relaxed text-ink-muted">
            {{ localize(competency.description, locale as never) }}
          </p>

          <ul v-if="competency.subcompetencies.length" class="mt-3 flex flex-wrap gap-1.5">
            <li
              v-for="sub in competency.subcompetencies"
              :key="sub.id"
              class="rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs text-ink-muted"
            >
              {{ sub.code }} · {{ localize(sub.name, locale as never) }}
            </li>
          </ul>
        </div>
      </div>
    </BaseCard>
  </div>
</template>
