<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { http } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import { useToast } from '@/composables/useToast';
import RolePermissionsPanel from './RolePermissionsPanel.vue';
import AcademicYearPanel from './AcademicYearPanel.vue';
import StoragePanel from './StoragePanel.vue';
import PhidiasPanel from './PhidiasPanel.vue';
import CalendarPanel from './CalendarPanel.vue';

/**
 * Administración de la plataforma.
 *
 * Reúne lo que hasta ahora solo podía hacerse tocando la base de datos o
 * desplegando: qué puede cada rol, si la IA está activa, cómo se abre un año
 * lectivo nuevo y cómo se alinean los correos institucionales.
 *
 * Todas son operaciones poco frecuentes y de mucho alcance. Por eso la página
 * está organizada en secciones separadas y cada acción destructiva dice antes
 * qué va a pasar: no se optimiza para hacerlas rápido, se optimiza para
 * hacerlas con conocimiento de causa.
 */

type TabKey = 'roles' | 'settings' | 'calendar' | 'year' | 'phidias' | 'storage' | 'data';

interface SettingsPayload {
  [key: string]: unknown;
}

interface BackfillResult {
  domain: string;
  updated: number;
  unchanged: number;
  withoutCode: number;
  conflicts: Array<{ studentId: string; code: string; email: string }>;
}

const { t } = useI18n();
const toast = useToast();

const tab = ref<TabKey>('roles');
const loading = ref(true);
const savingSettings = ref(false);
const settings = ref<SettingsPayload>({});

const backfill = ref<BackfillResult | null>(null);
const backfillRunning = ref(false);

const TABS: Array<{ key: TabKey; labelKey: string }> = [
  { key: 'roles', labelKey: 'admin.tabs.roles' },
  { key: 'settings', labelKey: 'admin.tabs.settings' },
  { key: 'calendar', labelKey: 'admin.tabs.calendar' },
  { key: 'year', labelKey: 'admin.tabs.year' },
  { key: 'phidias', labelKey: 'admin.tabs.phidias' },
  { key: 'storage', labelKey: 'admin.tabs.storage' },
  { key: 'data', labelKey: 'admin.tabs.data' },
];

const aiEnabled = computed({
  get: () => settings.value['ai.enabled'] === true,
  set: (value: boolean) => {
    settings.value = { ...settings.value, 'ai.enabled': value };
  },
});

const aiMaxQuestions = computed({
  get: () => Number(settings.value['ai.max_questions_per_request'] ?? 30),
  set: (value: number) => {
    settings.value = { ...settings.value, 'ai.max_questions_per_request': value };
  },
});

const studentEmailDomain = computed({
  get: () => String(settings.value['platform.student_email_domain'] ?? ''),
  set: (value: string) => {
    settings.value = { ...settings.value, 'platform.student_email_domain': value };
  },
});

onMounted(async () => {
  try {
    settings.value = await http.get<SettingsPayload>('/settings');
  } finally {
    loading.value = false;
  }
});

async function saveSettings(): Promise<void> {
  savingSettings.value = true;
  try {
    await http.patch('/settings', {
      'ai.enabled': aiEnabled.value,
      'ai.max_questions_per_request': aiMaxQuestions.value,
      'platform.student_email_domain': studentEmailDomain.value,
    });
    toast.success(t('common.saved'));
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('errors.generic'));
  } finally {
    savingSettings.value = false;
  }
}

/**
 * El relleno se ejecuta primero en seco, siempre.
 *
 * Cambia el usuario con el que entran mil estudiantes. Ver el recuento y los
 * conflictos antes de aplicarlo no es una cortesía: es la diferencia entre un
 * cambio controlado y una mañana de lunes con el soporte colapsado.
 */
async function runBackfill(apply: boolean): Promise<void> {
  backfillRunning.value = true;
  try {
    backfill.value = await http.post<BackfillResult>('/students/backfill-emails', { apply });
    if (apply) toast.success(t('admin.data.applied', { count: backfill.value.updated }));
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('errors.generic'));
  } finally {
    backfillRunning.value = false;
  }
}

const inputClass =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else class="flex flex-col gap-5">
    <header>
      <h1 class="text-2xl font-semibold">{{ t('admin.title') }}</h1>
      <p class="mt-1 text-sm text-ink-muted">{{ t('admin.intro') }}</p>
    </header>

    <div class="flex flex-wrap gap-1 border-b border-border" role="tablist">
      <button
        v-for="entry in TABS"
        :key="entry.key"
        type="button"
        role="tab"
        :aria-selected="tab === entry.key"
        class="-mb-px border-b-2 px-3 py-2 text-sm font-medium"
        :class="
          tab === entry.key
            ? 'border-brand-500 text-brand-700'
            : 'border-transparent text-ink-muted hover:text-ink'
        "
        @click="tab = entry.key"
      >
        {{ t(entry.labelKey) }}
      </button>
    </div>

    <RolePermissionsPanel v-if="tab === 'roles'" />

    <!-- Ajustes -->
    <div v-else-if="tab === 'settings'" class="flex flex-col gap-4">
      <BaseCard class="flex flex-col gap-4">
        <h2 class="text-lg font-semibold">{{ t('admin.settings.ai') }}</h2>

        <label class="flex items-start gap-3">
          <input v-model="aiEnabled" type="checkbox" class="mt-1 size-4 accent-brand-600" />
          <span>
            <span class="block text-sm font-medium">{{ t('admin.settings.aiEnabled') }}</span>
            <span class="block text-xs text-ink-subtle">
              {{ t('admin.settings.aiEnabledHint') }}
            </span>
          </span>
        </label>

        <label class="flex max-w-xs flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('admin.settings.aiMaxQuestions') }}</span>
          <input
            v-model.number="aiMaxQuestions"
            type="number"
            min="1"
            max="50"
            :class="inputClass"
          />
        </label>
      </BaseCard>

      <BaseCard class="flex flex-col gap-4">
        <h2 class="text-lg font-semibold">{{ t('admin.settings.identity') }}</h2>

        <label class="flex max-w-sm flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('admin.settings.studentEmailDomain') }}</span>
          <input v-model="studentEmailDomain" type="text" :class="inputClass" />
          <span class="text-xs text-ink-subtle">
            {{ t('admin.settings.studentEmailDomainHint') }}
          </span>
        </label>
      </BaseCard>

      <div>
        <BaseButton :loading="savingSettings" @click="saveSettings">
          {{ t('common.save') }}
        </BaseButton>
      </div>
    </div>

    <CalendarPanel v-else-if="tab === 'calendar'" />

    <AcademicYearPanel v-else-if="tab === 'year'" />

    <PhidiasPanel v-else-if="tab === 'phidias'" />

    <StoragePanel v-else-if="tab === 'storage'" />

    <!-- Datos -->
    <div v-else class="flex flex-col gap-4">
      <BaseCard class="flex flex-col gap-4">
        <div>
          <h2 class="text-lg font-semibold">{{ t('admin.data.backfillTitle') }}</h2>
          <p class="mt-1 max-w-2xl text-sm text-ink-muted">{{ t('admin.data.backfillIntro') }}</p>
        </div>

        <div class="flex flex-wrap gap-3">
          <BaseButton variant="secondary" :loading="backfillRunning" @click="runBackfill(false)">
            {{ t('admin.data.simulate') }}
          </BaseButton>
          <BaseButton
            v-if="backfill && backfill.updated > 0"
            :loading="backfillRunning"
            @click="runBackfill(true)"
          >
            {{ t('admin.data.apply', { count: backfill.updated }) }}
          </BaseButton>
        </div>

        <div v-if="backfill" class="flex flex-col gap-2 text-sm">
          <p class="flex flex-wrap items-center gap-2">
            <BaseBadge tone="brand">{{ backfill.domain }}</BaseBadge>
            <span>{{ t('admin.data.willUpdate', { count: backfill.updated }) }}</span>
            <span class="text-ink-subtle">
              {{ t('admin.data.unchanged', { count: backfill.unchanged }) }}
            </span>
          </p>

          <p v-if="backfill.withoutCode > 0" class="text-ink-muted">
            {{ t('admin.data.withoutCode', { count: backfill.withoutCode }) }}
          </p>

          <!--
            Los conflictos se muestran uno a uno con su código. Un recuento
            agregado no sirve: para arreglarlos hay que saber qué códigos están
            duplicados en la matrícula.
          -->
          <div v-if="backfill.conflicts.length > 0" class="rounded-md border border-danger/40 p-3">
            <p class="text-sm font-medium">
              {{ t('admin.data.conflicts', { count: backfill.conflicts.length }) }}
            </p>
            <ul class="mt-2 flex flex-col gap-1 font-mono text-xs">
              <li v-for="conflict in backfill.conflicts" :key="conflict.studentId">
                {{ conflict.code }} &#8594; {{ conflict.email }}
              </li>
            </ul>
          </div>
        </div>
      </BaseCard>
    </div>
  </div>
</template>
