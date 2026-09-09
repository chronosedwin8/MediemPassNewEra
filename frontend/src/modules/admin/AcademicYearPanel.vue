<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { http } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import { useToast } from '@/composables/useToast';

/**
 * Apertura de un año lectivo nuevo.
 *
 * Replica la estructura de grupos del año anterior —mismo código, mismo grado,
 * mismo director de curso— **vacíos de estudiantes**, y deja el año anterior
 * intacto con todas sus notas.
 *
 * Los grupos nacen vacíos a propósito. Arrastrar la matrícula del año pasado
 * sería más vistoso y estaría mal: al día siguiente habría alumnos en cursos
 * donde no están, repitentes promovidos por error y retirados que reaparecen.
 * La matrícula buena entra con la sincronización de Phidias.
 */

interface Preview {
  sourceYear: { id: string; code: string; name: string } | null;
  groupsToCreate: number;
  inactiveGroupsSkipped: number;
  evidenceFiles: number;
  evidenceBytes: number;
}

interface RolloverResult {
  academicYearId: string;
  code: string;
  groupsCreated: number;
  filesDeleted: number;
}

const { t } = useI18n();
const toast = useToast();

const preview = ref<Preview | null>(null);
const loading = ref(true);
const running = ref(false);
const result = ref<RolloverResult | null>(null);

const form = reactive({
  code: '',
  name: '',
  startDate: '',
  endDate: '',
  copyHomeroomTeachers: true,
  purgeSourceYearEvidence: false,
});

/** El código del año es lo que se escribe para confirmar. */
const confirmation = ref('');

const canSubmit = computed(
  () =>
    form.code.trim().length >= 4 &&
    form.name.trim().length >= 4 &&
    form.startDate !== '' &&
    form.endDate !== '' &&
    form.endDate > form.startDate &&
    confirmation.value.trim() === form.code.trim() &&
    !running.value,
);

onMounted(async () => {
  try {
    preview.value = await http.get<Preview>('/academic/rollover/preview');

    // Se propone el año siguiente al actual, que es lo que se va a escribir en
    // el 99 % de los casos. Sigue siendo editable.
    const source = preview.value.sourceYear?.code ?? '';
    const years = source.match(/(\d{4})\D+(\d{4})/);
    if (years) {
      const next = `${Number(years[1]) + 1}-${Number(years[2]) + 1}`;
      form.code = next;
      form.name = `Año escolar ${Number(years[1]) + 1} – ${Number(years[2]) + 1}`;
    }
  } finally {
    loading.value = false;
  }
});

async function run(): Promise<void> {
  running.value = true;
  try {
    result.value = await http.post<RolloverResult>('/academic/rollover', {
      code: form.code.trim(),
      name: form.name.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      copyHomeroomTeachers: form.copyHomeroomTeachers,
      purgeSourceYearEvidence: form.purgeSourceYearEvidence,
      confirm: true,
    });
    toast.success(t('admin.year.done', { count: result.value.groupsCreated }));
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('errors.generic'));
  } finally {
    running.value = false;
  }
}

const inputClass =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else class="flex max-w-2xl flex-col gap-4">
    <BaseCard v-if="result" class="border-success/40 bg-success/5">
      <h2 class="text-lg font-semibold">{{ t('admin.year.doneTitle') }}</h2>
      <p class="mt-1 text-sm">
        {{ t('admin.year.doneDetail', { code: result.code, count: result.groupsCreated }) }}
      </p>
      <p v-if="result.filesDeleted > 0" class="mt-2 text-sm">
        {{ t('admin.year.evidenceDeleted', { count: result.filesDeleted }) }}
      </p>
      <p class="mt-2 text-sm text-ink-muted">{{ t('admin.year.nextStep') }}</p>
    </BaseCard>

    <template v-else>
      <BaseCard class="flex flex-col gap-2">
        <h2 class="text-lg font-semibold">{{ t('admin.year.title') }}</h2>
        <p class="text-sm text-ink-muted">{{ t('admin.year.intro') }}</p>

        <dl v-if="preview?.sourceYear" class="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-xs text-ink-subtle">{{ t('admin.year.sourceYear') }}</dt>
            <dd class="font-medium">{{ preview.sourceYear.code }}</dd>
          </div>
          <div>
            <dt class="text-xs text-ink-subtle">{{ t('admin.year.groupsToCreate') }}</dt>
            <dd class="font-medium tabular-nums">{{ preview.groupsToCreate }}</dd>
          </div>
        </dl>

        <p v-else class="text-sm text-warning">{{ t('admin.year.noSource') }}</p>
      </BaseCard>

      <BaseCard class="flex flex-col gap-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ t('admin.year.code') }}</span>
            <input v-model="form.code" type="text" :class="inputClass" />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ t('admin.year.name') }}</span>
            <input v-model="form.name" type="text" :class="inputClass" />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ t('admin.year.startDate') }}</span>
            <input v-model="form.startDate" type="date" :class="inputClass" />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ t('admin.year.endDate') }}</span>
            <input v-model="form.endDate" type="date" :class="inputClass" />
          </label>
        </div>

        <label class="flex items-start gap-3">
          <input
            v-model="form.copyHomeroomTeachers"
            type="checkbox"
            class="mt-1 size-4 accent-brand-600"
          />
          <span>
            <span class="block text-sm font-medium">{{ t('admin.year.copyTeachers') }}</span>
            <span class="block text-xs text-ink-subtle">{{
              t('admin.year.copyTeachersHint')
            }}</span>
          </span>
        </label>

        <!--
          Borrar las evidencias del año que se cierra está apagado por defecto,
          y conviene entender por qué antes de encenderlo: el año anterior
          conserva sus notas, y una nota puesta sobre una evidencia que ya no
          existe es una nota que nadie puede volver a justificar.
        -->
        <label
          v-if="(preview?.evidenceFiles ?? 0) > 0"
          class="flex items-start gap-3 rounded-md border border-danger/40 bg-danger/5 p-3"
        >
          <input
            v-model="form.purgeSourceYearEvidence"
            type="checkbox"
            class="mt-1 size-4 accent-danger"
          />
          <span>
            <span class="block text-sm font-medium">
              {{ t('admin.year.purgeEvidence', { count: preview?.evidenceFiles ?? 0 }) }}
            </span>
            <span class="block text-xs text-ink-subtle">{{
              t('admin.year.purgeEvidenceHint')
            }}</span>
          </span>
        </label>

        <!--
          Escribir el código del año no es burocracia: cambia el año en el que
          trabaja todo el colegio, y un botón de «confirmar» se pulsa por
          inercia mientras que un código hay que leerlo y teclearlo.
        -->
        <div class="rounded-md border border-warning/40 bg-warning/5 p-3">
          <p class="text-sm">{{ t('admin.year.confirmHint', { code: form.code }) }}</p>
          <input
            v-model="confirmation"
            type="text"
            class="mt-2 h-9 w-full max-w-xs rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
            :aria-label="t('admin.year.confirmLabel')"
          />
        </div>

        <div>
          <BaseButton :disabled="!canSubmit" :loading="running" @click="run">
            {{ t('admin.year.action') }}
          </BaseButton>
        </div>
      </BaseCard>
    </template>
  </div>
</template>
