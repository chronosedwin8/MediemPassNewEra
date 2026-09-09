<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import { useToast } from '@/composables/useToast';

/**
 * Archivos guardados fuera de la base: evidencias e imágenes de enunciados.
 *
 * Borrar aquí es irreversible y de verdad: el bucket no tiene versionado, así
 * que lo que se elimina no deja copia. Por eso el flujo es siempre el mismo
 * —ver qué hay, simular, y solo entonces borrar— y la confirmación viaja con
 * el número exacto de archivos: si entre la previsualización y la confirmación
 * alguien sube algo, el número deja de cuadrar y la operación se detiene en
 * lugar de llevarse por delante lo que acaba de entrar.
 */

interface Usage {
  total: { files: number; bytes: number };
  byKind: Array<{ kind: string; files: number; bytes: number }>;
  byYear: Array<{ academicYearId: string | null; code: string; files: number; bytes: number }>;
}

interface PurgePreview {
  files: number;
  bytes: number;
}

const { t, n } = useI18n();
const toast = useToast();

const usage = ref<Usage | null>(null);
const loading = ref(true);
const busy = ref(false);
const preview = ref<PurgePreview | null>(null);

const scope = reactive({
  academicYearId: '',
  kind: '' as '' | 'EVIDENCE' | 'QUESTION_MEDIA' | 'TRAINING_MEDIA',
});
const reason = ref('');

const canApply = computed(
  () => preview.value !== null && preview.value.files > 0 && reason.value.trim().length >= 3,
);

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${n(bytes / 1024 / 1024, 'decimal')} MB`;
  return `${n(bytes / 1024 / 1024 / 1024, 'decimal')} GB`;
}

function scopePayload(): Record<string, unknown> {
  return {
    ...(scope.academicYearId ? { academicYearId: scope.academicYearId } : {}),
    ...(scope.kind ? { kind: scope.kind } : {}),
  };
}

async function load(): Promise<void> {
  usage.value = await http.get<Usage>('/files/usage');
}

onMounted(async () => {
  try {
    await load();
  } finally {
    loading.value = false;
  }
});

async function simulate(): Promise<void> {
  busy.value = true;
  try {
    preview.value = await http.post<PurgePreview>('/files/purge/preview', scopePayload());
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    busy.value = false;
  }
}

async function apply(): Promise<void> {
  if (!preview.value) return;
  busy.value = true;

  try {
    const result = await http.post<{ applied: boolean; files?: number; actual?: number }>(
      '/files/purge',
      { ...scopePayload(), expectedFiles: preview.value.files, reason: reason.value.trim() },
    );

    if (!result.applied) {
      // El recuento cambió entre simular y aplicar. Se rehace la
      // previsualización en lugar de insistir con un número obsoleto.
      toast.error(t('admin.storage.countChanged', { count: result.actual ?? 0 }));
      await simulate();
      return;
    }

    toast.success(t('admin.storage.deleted', { count: result.files ?? 0 }));
    preview.value = null;
    reason.value = '';
    await load();
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    busy.value = false;
  }
}

const inputClass =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else class="flex flex-col gap-4">
    <BaseCard>
      <h2 class="text-lg font-semibold">{{ t('admin.storage.title') }}</h2>
      <p class="mt-1 max-w-2xl text-sm text-ink-muted">{{ t('admin.storage.intro') }}</p>

      <dl v-if="usage" class="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt class="text-xs text-ink-subtle">{{ t('admin.storage.totalFiles') }}</dt>
          <dd class="text-2xl font-semibold tabular-nums">{{ usage.total.files }}</dd>
        </div>
        <div>
          <dt class="text-xs text-ink-subtle">{{ t('admin.storage.totalSize') }}</dt>
          <dd class="text-2xl font-semibold tabular-nums">{{ humanBytes(usage.total.bytes) }}</dd>
        </div>
      </dl>

      <div v-if="usage && usage.byYear.length > 0" class="mt-4 overflow-x-auto">
        <table class="w-full text-sm">
          <caption class="sr-only">
            {{
              t('admin.storage.byYear')
            }}
          </caption>
          <thead>
            <tr class="border-b border-border text-left text-xs uppercase text-ink-subtle">
              <th class="pb-2 pr-4 font-medium">{{ t('admin.year.code') }}</th>
              <th class="pb-2 pr-4 text-right font-medium">{{ t('admin.storage.files') }}</th>
              <th class="pb-2 text-right font-medium">{{ t('admin.storage.size') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in usage.byYear"
              :key="row.academicYearId ?? 'none'"
              class="border-b border-border/50"
            >
              <td class="py-2 pr-4">{{ row.code }}</td>
              <td class="py-2 pr-4 text-right tabular-nums">{{ row.files }}</td>
              <td class="py-2 text-right tabular-nums">{{ humanBytes(row.bytes) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="usage && usage.byKind.length > 0" class="mt-4 flex flex-wrap gap-2">
        <BaseBadge v-for="row in usage.byKind" :key="row.kind" tone="neutral">
          {{ t(`admin.storage.kind.${row.kind}`) }}: {{ row.files }} ·
          {{ humanBytes(row.bytes) }}
        </BaseBadge>
      </div>
    </BaseCard>

    <BaseCard class="flex flex-col gap-4">
      <div>
        <h2 class="text-lg font-semibold">{{ t('admin.storage.purgeTitle') }}</h2>
        <p class="mt-1 max-w-2xl text-sm text-ink-muted">{{ t('admin.storage.purgeIntro') }}</p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('admin.storage.scopeYear') }}</span>
          <select v-model="scope.academicYearId" :class="inputClass" @change="preview = null">
            <option value="">{{ t('admin.storage.allYears') }}</option>
            <option
              v-for="row in usage?.byYear ?? []"
              :key="row.academicYearId ?? 'none'"
              :value="row.academicYearId ?? ''"
              :disabled="!row.academicYearId"
            >
              {{ row.code }} ({{ row.files }})
            </option>
          </select>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('admin.storage.scopeKind') }}</span>
          <select v-model="scope.kind" :class="inputClass" @change="preview = null">
            <option value="">{{ t('admin.storage.allKinds') }}</option>
            <option value="EVIDENCE">{{ t('admin.storage.kind.EVIDENCE') }}</option>
            <option value="QUESTION_MEDIA">{{ t('admin.storage.kind.QUESTION_MEDIA') }}</option>
            <option value="TRAINING_MEDIA">{{ t('admin.storage.kind.TRAINING_MEDIA') }}</option>
          </select>
        </label>
      </div>

      <div>
        <BaseButton variant="secondary" :loading="busy" @click="simulate">
          {{ t('admin.data.simulate') }}
        </BaseButton>
      </div>

      <div v-if="preview" class="rounded-md border border-danger/40 bg-danger/5 p-3">
        <p class="text-sm">
          {{
            t('admin.storage.willDelete', { count: preview.files, size: humanBytes(preview.bytes) })
          }}
        </p>
        <p class="mt-1 text-xs text-ink-muted">{{ t('admin.storage.irreversible') }}</p>

        <label v-if="preview.files > 0" class="mt-3 flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('admin.storage.reason') }}</span>
          <input
            v-model="reason"
            type="text"
            :placeholder="t('admin.storage.reasonPlaceholder')"
            class="h-9 max-w-md rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-danger"
          />
        </label>

        <div v-if="preview.files > 0" class="mt-3">
          <BaseButton variant="danger" :disabled="!canApply" :loading="busy" @click="apply">
            {{ t('admin.storage.deleteAction', { count: preview.files }) }}
          </BaseButton>
        </div>
      </div>
    </BaseCard>
  </div>
</template>
