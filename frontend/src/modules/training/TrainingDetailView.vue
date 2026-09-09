<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { localize, type LocalizedText } from '@medienpass/shared';
import { http } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import ProgressBar from '@/design-system/ProgressBar.vue';
import { useToast } from '@/composables/useToast';

/**
 * Un módulo de capacitación: su material y su evaluación.
 *
 * El avance se registra al abrir cada contenido, no al pulsar «ya terminé». Lo
 * segundo mide buena voluntad; lo primero, al menos, que el material se abrió.
 * Ninguno de los dos demuestra la competencia: eso lo hace la evaluación, y
 * por eso el módulo no se certifica hasta superarla.
 */

interface Content {
  id: string;
  type: 'TEXT' | 'VIDEO' | 'DOCUMENT' | 'LINK' | 'ACTIVITY';
  title: LocalizedText;
  body: LocalizedText | null;
  url: string | null;
  position: number;
}

interface ModuleDetail {
  id: string;
  code: string;
  title: LocalizedText;
  description: LocalizedText;
  estimatedMinutes: number | null;
  contents: Content[];
  assessmentId: string | null;
  kmkCompetency: { code: string; name: LocalizedText; color: string };
  assessment: {
    id: string;
    title: string;
    versions: Array<{ id: string; questionCount: number; totalPoints: number }>;
  } | null;
  progress: { contentsSeen: number; status: string; completedAt: string | null } | null;
  assessmentOutcome: { percentage: number | null; passed: boolean | null };
}

const CONTENT_ICONS: Record<Content['type'], string> = {
  TEXT: '\u{1F4C4}',
  VIDEO: '\u{1F3AC}',
  DOCUMENT: '\u{1F4CE}',
  LINK: '\u{1F517}',
  ACTIVITY: '\u{270D}\u{FE0F}',
};

const route = useRoute();
const router = useRouter();
const { t, locale, n } = useI18n();
const toast = useToast();

const module = ref<ModuleDetail | null>(null);
const loading = ref(true);
const starting = ref(false);
const openContentIds = ref<Set<string>>(new Set());

const seenCount = computed(() =>
  Math.max(module.value?.progress?.contentsSeen ?? 0, openContentIds.value.size),
);

const materialProgress = computed(() => {
  const total = module.value?.contents.length ?? 0;
  return total === 0 ? 0 : Math.round((seenCount.value / total) * 100);
});

const publishedVersion = computed(() => module.value?.assessment?.versions[0] ?? null);

onMounted(async () => {
  try {
    module.value = await http.get<ModuleDetail>(
      `/training/modules/${route.params['id'] as string}`,
    );
  } finally {
    loading.value = false;
  }
});

/**
 * Abrir un contenido cuenta como visto.
 *
 * El envío no bloquea la interfaz ni avisa si falla: es telemetría de avance,
 * no un dato del que dependa nada. Interrumpir la lectura con un error porque
 * no se pudo guardar un contador sería desproporcionado.
 */
async function markSeen(contentId: string): Promise<void> {
  if (openContentIds.value.has(contentId)) return;
  openContentIds.value = new Set(openContentIds.value).add(contentId);

  try {
    await http.put(`/training/modules/${module.value!.id}/progress`, {
      contentsSeen: seenCount.value,
    });
  } catch {
    // Sin ruido: el avance se reintentará al abrir el siguiente contenido.
  }
}

async function startAssessment(): Promise<void> {
  starting.value = true;
  try {
    const { recipientId } = await http.post<{ recipientId: string }>(
      `/training/modules/${module.value!.id}/assessment`,
    );
    const attempt = await http.post<{ id: string }>('/attempts', { recipientId });
    await router.push(`/attempt/${attempt.id}`);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('errors.generic'));
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else-if="module" class="flex flex-col gap-6">
    <header>
      <RouterLink to="/training" class="text-sm text-ink-muted hover:underline">
        &#8592; {{ t('training.title') }}
      </RouterLink>

      <div class="mt-1 flex flex-wrap items-center gap-2">
        <span
          class="size-3 shrink-0 rounded-full"
          :style="{ backgroundColor: module.kmkCompetency.color }"
          aria-hidden="true"
        />
        <span class="text-xs font-medium text-ink-muted">
          KMK {{ module.kmkCompetency.code }} &#183;
          {{ localize(module.kmkCompetency.name, locale as never) }}
        </span>
      </div>

      <h1 class="mt-1 text-2xl font-semibold">{{ localize(module.title, locale as never) }}</h1>
      <p class="mt-2 max-w-2xl text-sm text-ink-muted">
        {{ localize(module.description, locale as never) }}
      </p>
    </header>

    <ProgressBar
      v-if="module.contents.length > 0"
      :value="materialProgress"
      :label="t('training.materialProgress')"
    />

    <section class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">{{ t('training.material') }}</h2>

      <BaseCard v-for="content in module.contents" :key="content.id">
        <details @toggle="markSeen(content.id)">
          <summary class="cursor-pointer list-none">
            <span class="flex flex-wrap items-center gap-2 font-medium">
              <span aria-hidden="true">{{ CONTENT_ICONS[content.type] }}</span>
              {{ localize(content.title, locale as never) }}
              <BaseBadge v-if="openContentIds.has(content.id)" tone="success">
                {{ t('training.seen') }}
              </BaseBadge>
            </span>
          </summary>

          <div class="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-ink-muted">
            <p v-if="content.body" class="whitespace-pre-line">
              {{ localize(content.body, locale as never) }}
            </p>
            <!--
              `rel="noopener"` no es opcional: sin él la página de destino puede
              manipular esta pestaña a través de `window.opener`.
            -->
            <a
              v-if="content.url"
              :href="content.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-brand-600 underline"
            >
              {{ t('training.openResource') }}
            </a>
          </div>
        </details>
      </BaseCard>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">{{ t('training.assessment') }}</h2>

      <BaseCard v-if="publishedVersion">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="font-medium">{{ module.assessment?.title }}</p>
            <p class="mt-1 text-sm text-ink-muted">
              {{ t('assessment.questions') }}: {{ publishedVersion.questionCount }} &#183;
              {{ t('result.points') }}: {{ publishedVersion.totalPoints }}
            </p>

            <p
              v-if="module.assessmentOutcome.percentage !== null"
              class="mt-2 flex items-center gap-2 text-sm"
            >
              <BaseBadge :tone="module.assessmentOutcome.passed ? 'success' : 'warning'">
                {{
                  module.assessmentOutcome.passed
                    ? t('training.state.certified')
                    : t('training.state.attempted')
                }}
              </BaseBadge>
              <span class="tabular-nums">
                {{ n(module.assessmentOutcome.percentage / 100, 'percent') }}
              </span>
            </p>
          </div>

          <BaseButton :loading="starting" @click="startAssessment">
            {{
              module.assessmentOutcome.percentage === null
                ? t('training.startAssessment')
                : t('training.retryAssessment')
            }}
          </BaseButton>
        </div>

        <!--
          El umbral del docente es más exigente que el del estudiante, y decirlo
          antes de empezar evita la sensación de que la regla cambió al final.
        -->
        <p class="mt-3 text-xs text-ink-subtle">{{ t('training.passingHint') }}</p>
      </BaseCard>

      <BaseCard v-else>
        <p class="text-sm text-ink-muted">{{ t('training.noAssessment') }}</p>
      </BaseCard>
    </section>
  </div>
</template>
