<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { localize, type LocalizedText } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';
import LocalizedField from '@/design-system/LocalizedField.vue';
import { useToast } from '@/composables/useToast';

/**
 * El material de capacitación, visto por quien lo escribe.
 *
 * Es la contraparte del listado que ve el profesorado: aquel muestra lo
 * publicado con el avance de cada uno; este muestra todo, con su estado, para
 * decidir qué falta por escribir y qué está listo para publicar.
 */

interface ModuleRow {
  id: string;
  code: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  title: LocalizedText;
  description: LocalizedText;
  contentCount: number;
  hasAssessment: boolean;
  estimatedMinutes: number | null;
  competency: { code: string; name: LocalizedText; color: string };
}

interface Competency {
  id: string;
  code: string;
  name: LocalizedText;
}

const { t, locale } = useI18n();
const router = useRouter();
const toast = useToast();

const modules = ref<ModuleRow[]>([]);
const competencies = ref<Competency[]>([]);
const loading = ref(true);
const creating = ref(false);
const showForm = ref(false);

const form = reactive({
  code: '',
  kmkCompetencyId: '',
  title: {} as Partial<LocalizedText>,
  description: {} as Partial<LocalizedText>,
});

const canCreate = computed(
  () =>
    /^[A-Z0-9-]{2,20}$/.test(form.code.trim()) &&
    form.kmkCompetencyId !== '' &&
    Object.values(form.title).some((value) => value?.trim()) &&
    Object.values(form.description).some((value) => value?.trim()),
);

const published = computed(() => modules.value.filter((m) => m.status === 'PUBLISHED').length);

async function load(): Promise<void> {
  const [rows, kmk] = await Promise.all([
    http.get<ModuleRow[]>('/training/admin/modules'),
    http.get<Competency[]>('/kmk/competencies'),
  ]);
  modules.value = rows;
  competencies.value = kmk;
  form.kmkCompetencyId ||= kmk[0]?.id ?? '';
}

onMounted(async () => {
  try {
    await load();
  } finally {
    loading.value = false;
  }
});

async function create(): Promise<void> {
  creating.value = true;
  try {
    const module = await http.post<{ id: string }>('/training/admin/modules', {
      code: form.code.trim().toUpperCase(),
      kmkCompetencyId: form.kmkCompetencyId,
      title: form.title,
      description: form.description,
    });
    // Se va directo al editor: crear un módulo vacío y quedarse en la lista
    // deja a medias justo lo que se venía a hacer.
    await router.push(`/admin/training/${module.id}`);
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    creating.value = false;
  }
}

function toneFor(status: ModuleRow['status']): 'success' | 'warning' | 'neutral' {
  if (status === 'PUBLISHED') return 'success';
  return status === 'DRAFT' ? 'warning' : 'neutral';
}

const inputClass =
  'h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else class="flex flex-col gap-5">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">{{ t('training.admin.title') }}</h1>
        <p class="mt-1 max-w-2xl text-sm text-ink-muted">{{ t('training.admin.intro') }}</p>
        <p class="mt-1 text-sm text-ink-subtle">
          {{ t('training.admin.summary', { published, total: modules.length }) }}
        </p>
      </div>

      <BaseButton @click="showForm = !showForm">{{ t('training.admin.newModule') }}</BaseButton>
    </header>

    <!-- Alta de módulo -->
    <BaseCard v-if="showForm" class="flex flex-col gap-4">
      <h2 class="text-lg font-semibold">{{ t('training.admin.newModule') }}</h2>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('training.admin.code') }}</span>
          <input
            v-model="form.code"
            type="text"
            placeholder="KMK-M7"
            :class="inputClass"
            @input="form.code = form.code.toUpperCase()"
          />
          <span class="text-xs text-ink-subtle">{{ t('training.admin.codeHint') }}</span>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('kmk.competency') }}</span>
          <select v-model="form.kmkCompetencyId" :class="inputClass">
            <option v-for="competency in competencies" :key="competency.id" :value="competency.id">
              KMK {{ competency.code }} — {{ localize(competency.name, locale as never) }}
            </option>
          </select>
        </label>
      </div>

      <LocalizedField v-model="form.title" :label="t('training.admin.moduleTitle')" />
      <LocalizedField
        v-model="form.description"
        rich
        :label="t('training.admin.moduleDescription')"
      />

      <div class="flex gap-2">
        <BaseButton :disabled="!canCreate" :loading="creating" @click="create">
          {{ t('common.create') }}
        </BaseButton>
        <BaseButton variant="secondary" @click="showForm = false">
          {{ t('common.cancel') }}
        </BaseButton>
      </div>
    </BaseCard>

    <EmptyState v-if="modules.length === 0" :title="t('training.admin.empty')" />

    <div v-else class="flex flex-col gap-3">
      <BaseCard v-for="module in modules" :key="module.id" class="relative">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="size-3 shrink-0 rounded-full"
                :style="{ backgroundColor: module.competency.color }"
                aria-hidden="true"
              />
              <RouterLink
                :to="`/admin/training/${module.id}`"
                class="font-semibold hover:underline"
              >
                <span class="absolute inset-0" aria-hidden="true" />
                {{ localize(module.title, locale as never) || module.code }}
              </RouterLink>
              <BaseBadge :tone="toneFor(module.status)">
                {{ t(`training.admin.status.${module.status}`) }}
              </BaseBadge>
            </div>

            <p class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-subtle">
              <span>{{ module.code }}</span>
              <span>KMK {{ module.competency.code }}</span>
              <span>{{ t('training.contents', { count: module.contentCount }) }}</span>
              <span v-if="module.estimatedMinutes">
                {{ t('training.estimatedMinutes', { count: module.estimatedMinutes }) }}
              </span>
              <span v-if="!module.hasAssessment" class="text-warning">
                {{ t('training.admin.withoutAssessment') }}
              </span>
            </p>
          </div>
        </div>
      </BaseCard>
    </div>
  </div>
</template>
