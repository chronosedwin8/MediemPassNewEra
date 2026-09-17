<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { TRAINING_CONTENT_TYPES, localize, type LocalizedText } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';
import { useToast } from '@/composables/useToast';
import ContentBlockEditor from './ContentBlockEditor.vue';
import ModuleAssessmentLink from './ModuleAssessmentLink.vue';
import ModuleDataForm from './ModuleDataForm.vue';
import TrainingAudiencePanel from './TrainingAudiencePanel.vue';

/**
 * Redacción de un módulo de capacitación.
 *
 * El módulo se escribe por bloques —texto, vídeo, documento, enlace,
 * actividad— y no como un único campo enorme, por dos razones prácticas: el
 * docente lo recorre desplegando uno a uno, y el avance se mide por cuántos
 * abrió. Un solo bloque de diez páginas convertiría ese avance en un
 * interruptor.
 *
 * Nada de esto se ve hasta publicarlo. Un módulo a medio escribir en la
 * pantalla de quien está formándose es peor que no tener módulo: lo abre, no
 * entiende nada y no vuelve.
 */

interface StoredFile {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

interface ContentBlock {
  id: string;
  type: string;
  title: LocalizedText;
  body: LocalizedText | null;
  url: string | null;
  assessmentId: string | null;
  position: number;
  files: StoredFile[];
}

interface ModuleDetail {
  id: string;
  code: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  title: LocalizedText;
  description: LocalizedText;
  estimatedMinutes: number | null;
  kmkCompetencyId: string;
  kmkCompetency: { id: string; code: string; name: LocalizedText; color: string };
  contents: ContentBlock[];
  assessment: { id: string; title: string } | null;
  academicPeriodId: string | null;
  audienceMode: string;
  audience: Array<{ userId: string; dueDate: string | null }>;
}

const route = useRoute();
const router = useRouter();
const { t, locale, d } = useI18n();
const toast = useToast();

const module = ref<ModuleDetail | null>(null);
const loading = ref(true);
const busy = ref(false);

/** Tipo del próximo bloque: se elige antes de crearlo, como en un editor. */
const nuevoTipo = ref<string>('TEXT');
const TYPES = TRAINING_CONTENT_TYPES;

const moduleId = computed(() => route.params['id'] as string);
const isPublished = computed(() => module.value?.status === 'PUBLISHED');
const canPublish = computed(() => (module.value?.contents.length ?? 0) > 0);

async function load(): Promise<void> {
  module.value = await http.get<ModuleDetail>(`/training/admin/modules/${moduleId.value}`);
}

onMounted(async () => {
  try {
    await load();
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    loading.value = false;
  }
});

async function run(action: () => Promise<unknown>, successKey?: string): Promise<void> {
  busy.value = true;
  try {
    await action();
    await load();
    if (successKey) toast.success(t(successKey));
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    busy.value = false;
  }
}

const addBlock = () =>
  run(() =>
    http.post(`/training/admin/modules/${moduleId.value}/contents`, {
      type: nuevoTipo.value,
      title: { [locale.value]: t(`training.admin.type.${nuevoTipo.value}`) },
      // Los tipos que exigen dirección nacen con una de relleno; el servidor
      // la pide, y un bloque que no se puede crear no se puede empezar.
      ...(['VIDEO', 'AUDIO', 'EMBED', 'LINK'].includes(nuevoTipo.value)
        ? { url: 'https://example.org' }
        : {}),
      ...(nuevoTipo.value === 'ASSESSMENT' ? { assessmentId: null } : {}),
    }),
  );

const publish = () =>
  run(
    () => http.post(`/training/admin/modules/${moduleId.value}/publish`),
    'training.admin.published',
  );

const unpublish = (archive: boolean) =>
  run(
    () => http.post(`/training/admin/modules/${moduleId.value}/unpublish`, { archive }),
    'training.admin.unpublished',
  );

/**
 * Mueve un bloque y guarda el orden completo.
 *
 * Se envía la lista entera y no «este sube una posición»: con la lista, el
 * servidor comprueba que están todos y no queda margen para que dos bloques
 * acaben en la misma posición si dos pestañas hacen lo suyo a la vez.
 */
async function moveBlock(index: number, direction: -1 | 1): Promise<void> {
  const blocks = [...(module.value?.contents ?? [])];
  const target = index + direction;
  if (target < 0 || target >= blocks.length) return;

  [blocks[index], blocks[target]] = [blocks[target]!, blocks[index]!];

  await run(() =>
    http.put(`/training/admin/modules/${moduleId.value}/contents/order`, {
      ids: blocks.map((block) => block.id),
    }),
  );
}

async function removeModule(): Promise<void> {
  try {
    await http.delete(`/training/admin/modules/${moduleId.value}`);
    toast.success(t('training.admin.deleted'));
    await router.push('/admin/training');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  }
}

const inputClass =
  'h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else-if="module" class="flex flex-col gap-5">
    <header class="flex flex-col gap-3">
      <RouterLink to="/admin/training" class="text-sm text-ink-muted hover:underline">
        &#8592; {{ t('training.admin.title') }}
      </RouterLink>

      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-2xl font-semibold">
              {{ localize(module.title, locale as never) || module.code }}
            </h1>
            <BaseBadge
              :tone="isPublished ? 'success' : module.status === 'ARCHIVED' ? 'neutral' : 'warning'"
            >
              {{ t(`training.admin.status.${module.status}`) }}
            </BaseBadge>
            <BaseBadge tone="neutral">{{ module.code }}</BaseBadge>
          </div>
          <p v-if="module.publishedAt" class="mt-1 text-xs text-ink-subtle">
            {{ t('training.admin.publishedAt') }}: {{ d(new Date(module.publishedAt), 'long') }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <RouterLink :to="`/training/${module.id}`">
            <BaseButton variant="secondary">{{ t('preview.action') }}</BaseButton>
          </RouterLink>

          <BaseButton v-if="!isPublished" :disabled="!canPublish" :loading="busy" @click="publish">
            {{ t('training.admin.publish') }}
          </BaseButton>

          <template v-else>
            <BaseButton variant="secondary" :loading="busy" @click="unpublish(false)">
              {{ t('training.admin.unpublish') }}
            </BaseButton>
            <BaseButton variant="secondary" :loading="busy" @click="unpublish(true)">
              {{ t('training.admin.archive') }}
            </BaseButton>
          </template>

          <BaseButton variant="danger" @click="removeModule">{{ t('common.delete') }}</BaseButton>
        </div>
      </div>

      <p
        v-if="!isPublished"
        class="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning"
      >
        {{ canPublish ? t('training.admin.draftNotice') : t('training.admin.needsContent') }}
      </p>
    </header>

    <ModuleDataForm
      :module-id="module.id"
      :title="module.title"
      :description="module.description"
      :kmk-competency-id="module.kmkCompetencyId"
      :estimated-minutes="module.estimatedMinutes"
      :academic-period-id="module.academicPeriodId"
      @saved="load()"
    />

    <!-- Material -->
    <section class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-semibold">{{ t('training.material') }}</h2>
        <!--
          Se elige el tipo antes de crear el bloque, no después: quien va a
          poner un vídeo no quiere un bloque de texto que luego hay que
          convertir.
        -->
        <div class="flex items-center gap-2">
          <select v-model="nuevoTipo" :class="inputClass" :aria-label="t('training.admin.blockType')">
            <option v-for="type in TYPES" :key="type" :value="type">
              {{ t(`training.admin.type.${type}`) }}
            </option>
          </select>
          <BaseButton size="sm" :loading="busy" @click="addBlock">
            {{ t('training.admin.addBlock') }}
          </BaseButton>
        </div>
      </div>

      <EmptyState v-if="module.contents.length === 0" :title="t('training.admin.noBlocks')" />

      <ContentBlockEditor
        v-for="(block, index) in module.contents"
        :key="block.id"
        :block="block"
        :index="index"
        :total="module.contents.length"
        @saved="load"
        @removed="load"
        @move="moveBlock(index, $event)"
      />
    </section>

    <!-- A quién va dirigida -->
    <BaseCard class="flex flex-col gap-3">
      <div>
        <h2 class="text-lg font-semibold">{{ t('training.admin.audience') }}</h2>
        <p class="mt-1 text-sm text-ink-muted">{{ t('training.admin.audienceHint') }}</p>
      </div>
      <TrainingAudiencePanel
        :key="module.audienceMode + module.audience.length"
        :module-id="module.id"
        :mode="module.audienceMode"
        :selected="module.audience"
        @changed="load()"
      />
    </BaseCard>

    <!-- Evaluación vinculada -->
    <BaseCard class="flex flex-col gap-3">
      <div>
        <h2 class="text-lg font-semibold">{{ t('training.assessment') }}</h2>
        <p class="mt-1 text-sm text-ink-muted">{{ t('training.admin.assessmentHint') }}</p>
      </div>
      <ModuleAssessmentLink
        :module-id="module.id"
        :vinculada="module.assessment"
        @changed="load()"
      />
    </BaseCard>
  </div>
</template>
