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
 * Años lectivos y sus periodos.
 *
 * La única pantalla del calendario era el traspaso al curso siguiente, que
 * presupone que ya existe un año en marcha. En una instalación nueva eso no se
 * cumple: hay un año sembrado, sin periodos, y no había forma de corregir sus
 * fechas ni de añadir el segundo trimestre. Intentar crearlo desde el traspaso
 * devolvía «la operación entra en conflicto con el estado actual», que es
 * cierto —ese año ya existe— y no lo explica.
 *
 * Los periodos importan más de lo que parece: las estadísticas se filtran por
 * ellos, y sin ninguno no se puede separar un trimestre de otro.
 */

interface Periodo {
  id: string;
  name: string;
  position: number;
  startDate: string;
  endDate: string;
  weight: number;
}

interface Ano {
  id: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  periods?: Periodo[];
}

const { t, d } = useI18n();
const toast = useToast();

const cargando = ref(true);
const guardando = ref(false);
const anos = ref<Ano[]>([]);
const creandoAno = ref(false);
const anoParaPeriodo = ref<Ano | null>(null);

const formAno = reactive({ code: '', name: '', startDate: '', endDate: '', isCurrent: false });
const formPeriodo = reactive({ name: '', position: 0, startDate: '', endDate: '', weight: 0 });

const anoValido = computed(
  () =>
    formAno.code.trim().length >= 4 &&
    formAno.name.trim().length >= 1 &&
    formAno.startDate !== '' &&
    formAno.endDate !== '' &&
    formAno.endDate > formAno.startDate,
);

const periodoValido = computed(
  () =>
    formPeriodo.name.trim().length >= 1 &&
    formPeriodo.startDate !== '' &&
    formPeriodo.endDate !== '' &&
    formPeriodo.endDate > formPeriodo.startDate,
);

async function cargar(): Promise<void> {
  cargando.value = true;
  try {
    anos.value = await http.get<Ano[]>('/academic/years');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

async function crearAno(): Promise<void> {
  guardando.value = true;
  try {
    await http.post('/academic/years', {
      code: formAno.code.trim(),
      name: formAno.name.trim(),
      startDate: formAno.startDate,
      endDate: formAno.endDate,
      isCurrent: formAno.isCurrent,
    });
    toast.success(t('common.saved'));
    creandoAno.value = false;
    await cargar();
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    guardando.value = false;
  }
}

async function crearPeriodo(): Promise<void> {
  if (!anoParaPeriodo.value) return;
  guardando.value = true;
  try {
    await http.post('/academic/periods', {
      academicYearId: anoParaPeriodo.value.id,
      name: formPeriodo.name.trim(),
      position: formPeriodo.position,
      startDate: formPeriodo.startDate,
      endDate: formPeriodo.endDate,
      weight: formPeriodo.weight,
    });
    toast.success(t('common.saved'));
    anoParaPeriodo.value = null;
    await cargar();
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    guardando.value = false;
  }
}

function abrirPeriodo(ano: Ano): void {
  anoParaPeriodo.value = ano;
  // La posición siguiente, ya propuesta: es lo que se va a escribir casi
  // siempre y equivocarla desordena las estadísticas.
  formPeriodo.position = (ano.periods?.length ?? 0) + 1;
  formPeriodo.name = '';
  formPeriodo.startDate = '';
  formPeriodo.endDate = '';
  formPeriodo.weight = 0;
}

const campo =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <BaseSpinner v-if="cargando" size="lg" />

  <div v-else class="flex max-w-3xl flex-col gap-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">{{ t('admin.calendar.title') }}</h2>
        <p class="mt-1 text-sm text-ink-muted">{{ t('admin.calendar.intro') }}</p>
      </div>
      <BaseButton @click="creandoAno = true">{{ t('admin.calendar.newYear') }}</BaseButton>
    </header>

    <BaseCard v-for="ano in anos" :key="ano.id" class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-base font-semibold">{{ ano.code }}</span>
        <BaseBadge v-if="ano.isCurrent" tone="success">{{ t('admin.calendar.current') }}</BaseBadge>
        <span class="text-sm text-ink-muted">
          {{ d(new Date(ano.startDate), 'short') }} — {{ d(new Date(ano.endDate), 'short') }}
        </span>
        <BaseButton variant="secondary" size="sm" class="ml-auto" @click="abrirPeriodo(ano)">
          {{ t('admin.calendar.addPeriod') }}
        </BaseButton>
      </div>

      <!--
        Sin periodos no se puede filtrar un trimestre en las estadísticas, así
        que el vacío lo dice en lugar de quedarse callado.
      -->
      <p v-if="!ano.periods || ano.periods.length === 0" class="text-sm text-warning">
        {{ t('admin.calendar.noPeriods') }}
      </p>

      <ul v-else class="flex flex-col gap-1 text-sm">
        <li
          v-for="p in ano.periods"
          :key="p.id"
          class="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2"
        >
          <span class="font-mono text-xs text-ink-subtle">{{ p.position }}</span>
          <span class="font-medium">{{ p.name }}</span>
          <span class="text-ink-muted">
            {{ d(new Date(p.startDate), 'short') }} — {{ d(new Date(p.endDate), 'short') }}
          </span>
          <span v-if="p.weight > 0" class="ml-auto text-xs text-ink-subtle">{{ p.weight }} %</span>
        </li>
      </ul>
    </BaseCard>

    <!-- Año nuevo -->
    <div
      v-if="creandoAno"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="t('admin.calendar.newYear')"
    >
      <form
        class="flex w-full max-w-lg flex-col gap-4 rounded-lg bg-surface p-6 shadow-xl"
        @submit.prevent="crearAno"
      >
        <h2 class="text-lg font-semibold">{{ t('admin.calendar.newYear') }}</h2>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ t('admin.year.code') }}</span>
            <input v-model="formAno.code" type="text" required :class="campo" />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ t('admin.year.name') }}</span>
            <input v-model="formAno.name" type="text" required :class="campo" />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ t('admin.year.start') }}</span>
            <input v-model="formAno.startDate" type="date" required :class="campo" />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ t('admin.year.end') }}</span>
            <input v-model="formAno.endDate" type="date" required :class="campo" />
          </label>
        </div>

        <label class="flex items-start gap-2 text-sm">
          <input v-model="formAno.isCurrent" type="checkbox" class="mt-1 size-4 accent-brand-600" />
          <span>
            {{ t('admin.calendar.markCurrent') }}
            <span class="block text-xs text-ink-subtle">{{ t('admin.calendar.currentHint') }}</span>
          </span>
        </label>

        <footer class="flex justify-end gap-2">
          <BaseButton variant="ghost" type="button" @click="creandoAno = false">
            {{ t('common.cancel') }}
          </BaseButton>
          <BaseButton type="submit" :disabled="!anoValido || guardando" :loading="guardando">
            {{ t('common.save') }}
          </BaseButton>
        </footer>
      </form>
    </div>

    <!-- Periodo nuevo -->
    <div
      v-if="anoParaPeriodo"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="t('admin.calendar.addPeriod')"
    >
      <form
        class="flex w-full max-w-lg flex-col gap-4 rounded-lg bg-surface p-6 shadow-xl"
        @submit.prevent="crearPeriodo"
      >
        <header>
          <h2 class="text-lg font-semibold">{{ t('admin.calendar.addPeriod') }}</h2>
          <p class="mt-1 text-sm text-ink-muted">{{ anoParaPeriodo.code }}</p>
        </header>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ t('admin.year.name') }}</span>
            <input v-model="formPeriodo.name" type="text" required :class="campo" />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ t('admin.calendar.position') }}</span>
            <input v-model.number="formPeriodo.position" type="number" min="0" :class="campo" />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ t('admin.year.start') }}</span>
            <input v-model="formPeriodo.startDate" type="date" required :class="campo" />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ t('admin.year.end') }}</span>
            <input v-model="formPeriodo.endDate" type="date" required :class="campo" />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ t('admin.calendar.weight') }}</span>
            <input
              v-model.number="formPeriodo.weight"
              type="number"
              min="0"
              max="100"
              :class="campo"
            />
            <span class="text-xs text-ink-subtle">{{ t('admin.calendar.weightHint') }}</span>
          </label>
        </div>

        <footer class="flex justify-end gap-2">
          <BaseButton variant="ghost" type="button" @click="anoParaPeriodo = null">
            {{ t('common.cancel') }}
          </BaseButton>
          <BaseButton type="submit" :disabled="!periodoValido || guardando" :loading="guardando">
            {{ t('common.save') }}
          </BaseButton>
        </footer>
      </form>
    </div>
  </div>
</template>
