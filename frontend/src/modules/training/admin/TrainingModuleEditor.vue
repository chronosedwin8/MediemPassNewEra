<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { localize, type LocalizedText } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';
import LocalizedField from '@/design-system/LocalizedField.vue';
import { useToast } from '@/composables/useToast';
import ContentBlockEditor from './ContentBlockEditor.vue';

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
  type: 'TEXT' | 'VIDEO' | 'DOCUMENT' | 'LINK' | 'ACTIVITY';
  title: LocalizedText;
  body: LocalizedText | null;
  url: string | null;
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
}

interface Competency {
  id: string;
  code: string;
  name: LocalizedText;
}

const route = useRoute();
const router = useRouter();
const { t, locale, d } = useI18n();
const toast = useToast();

const module = ref<ModuleDetail | null>(null);
const competencies = ref<Competency[]>([]);
const loading = ref(true);
const savingModule = ref(false);
const busy = ref(false);

const draft = reactive({
  title: {} as Partial<LocalizedText>,
  description: {} as Partial<LocalizedText>,
  kmkCompetencyId: '',
  estimatedMinutes: 0,
});

const moduleId = computed(() => route.params['id'] as string);
const isPublished = computed(() => module.value?.status === 'PUBLISHED');
const canPublish = computed(() => (module.value?.contents.length ?? 0) > 0);

async function load(): Promise<void> {
  const [detail, kmk] = await Promise.all([
    http.get<ModuleDetail>(`/training/admin/modules/${moduleId.value}`),
    http.get<Competency[]>('/kmk/competencies'),
  ]);
  module.value = detail;
  competencies.value = kmk;

  draft.title = { ...detail.title };
  draft.description = { ...detail.description };
  draft.kmkCompetencyId = detail.kmkCompetencyId;
  draft.estimatedMinutes = detail.estimatedMinutes ?? 0;
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

async function saveModule(): Promise<void> {
  savingModule.value = true;
  try {
    await http.patch(`/training/admin/modules/${moduleId.value}`, {
      title: draft.title,
      description: draft.description,
      kmkCompetencyId: draft.kmkCompetencyId,
      // Cero significa «sin estimación», no «cero minutos».
      estimatedMinutes: draft.estimatedMinutes > 0 ? draft.estimatedMinutes : null,
    });
    await load();
    toast.success(t('common.saved'));
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    savingModule.value = false;
  }
}

const addBlock = () =>
  run(() =>
    http.post(`/training/admin/modules/${moduleId.value}/contents`, {
      type: 'TEXT',
      title: { [locale.value]: t('training.admin.newBlock') },
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

    <!-- Datos del módulo -->
    <BaseCard class="flex flex-col gap-4">
      <h2 class="text-lg font-semibold">{{ t('training.admin.moduleData') }}</h2>

      <LocalizedField v-model="draft.title" :label="t('training.admin.moduleTitle')" />
      <LocalizedField
        v-model="draft.description"
        rich
        :label="t('training.admin.moduleDescription')"
        :hint="t('training.admin.moduleDescriptionHint')"
      />

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('kmk.competency') }}</span>
          <select v-model="draft.kmkCompetencyId" :class="inputClass">
            <option v-for="competency in competencies" :key="competency.id" :value="competency.id">
              KMK {{ competency.code }} — {{ localize(competency.name, locale as never) }}
            </option>
          </select>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('training.admin.estimatedMinutes') }}</span>
          <input
            v-model.number="draft.estimatedMinutes"
            type="number"
            min="0"
            max="600"
            :class="inputClass"
          />
          <span class="text-xs text-ink-subtle">{{ t('training.admin.estimatedHint') }}</span>
        </label>
      </div>

      <div>
        <BaseButton :loading="savingModule" @click="saveModule">{{ t('common.save') }}</BaseButton>
      </div>
    </BaseCard>

    <!-- Material -->
    <section class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-semibold">{{ t('training.material') }}</h2>
        <BaseButton size="sm" :loading="busy" @click="addBlock">
          {{ t('training.admin.addBlock') }}
        </BaseButton>
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

    <!-- Evaluación vinculada -->
    <BaseCard>
      <h2 class="text-lg font-semibold">{{ t('training.assessment') }}</h2>
      <p v-if="module.assessment" class="mt-1 text-sm text-ink-muted">
        {{ module.assessment.title }}
      </p>
      <p v-else class="mt-1 text-sm text-ink-muted">{{ t('training.admin.noAssessment') }}</p>
    </BaseCard>
  </div>
</template>
