<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import { useToast } from '@/composables/useToast';

/**
 * Traer la matrícula desde Phidias.
 *
 * Es la pantalla que hacía falta para que una instalación nueva sirviera de
 * algo. Los estudiantes no se dan de alta a mano: vienen de Phidias, que es
 * donde el colegio los gestiona de verdad, y con ellos llegan los grupos y las
 * matrículas. Sin esto había una plataforma entera sin nadie a quien evaluar,
 * y la única vía era llamar a la API desde una terminal.
 *
 * **Siempre se previsualiza antes.** La vista previa ejecuta el proceso
 * completo sin escribir nada y devuelve exactamente lo que haría: cuántas
 * cuentas crearía, cuántas desactivaría y qué no supo resolver. Sincronizar a
 * ciegas contra la matrícula de un colegio es la clase de operación que se
 * lamenta una sola vez.
 */

interface Estado {
  mode: string;
  configured: boolean;
  baseUrl: string | null;
}

interface Problema {
  level?: string;
  code?: string;
  message?: string;
  detail?: string;
}

interface Resultado {
  status: string;
  academicYearExternalId: number;
  sectionsProcessed: number;
  studentsCreated: number;
  studentsUpdated: number;
  studentsDeactivated: number;
  groupsCreated: number;
  groupsMatched: number;
  membershipsAdded: number;
  skipped: number;
  issues: Problema[];
  durationMs: number;
}

const { t, n } = useI18n();
const toast = useToast();

const cargando = ref(true);
const trabajando = ref(false);
const estado = ref<Estado | null>(null);
const previa = ref<Resultado | null>(null);
const aplicado = ref<Resultado | null>(null);
const confirmacion = ref('');

const PALABRA = 'SINCRONIZAR';

const listo = computed(() => estado.value?.configured === true);
const puedeAplicar = computed(
  () =>
    previa.value !== null &&
    confirmacion.value.trim().toUpperCase() === PALABRA &&
    !trabajando.value,
);

/** Las cifras que importan, en el orden en que alguien las lee. */
const CIFRAS: Array<{ clave: keyof Resultado; etiqueta: string; alerta?: boolean }> = [
  { clave: 'sectionsProcessed', etiqueta: 'admin.phidias.sections' },
  { clave: 'groupsCreated', etiqueta: 'admin.phidias.groupsCreated' },
  { clave: 'groupsMatched', etiqueta: 'admin.phidias.groupsMatched' },
  { clave: 'studentsCreated', etiqueta: 'admin.phidias.studentsCreated' },
  { clave: 'studentsUpdated', etiqueta: 'admin.phidias.studentsUpdated' },
  { clave: 'studentsDeactivated', etiqueta: 'admin.phidias.studentsDeactivated', alerta: true },
  { clave: 'membershipsAdded', etiqueta: 'admin.phidias.memberships' },
  { clave: 'skipped', etiqueta: 'admin.phidias.skipped', alerta: true },
];

onMounted(async () => {
  try {
    estado.value = await http.get<Estado>('/integrations/phidias/status');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    cargando.value = false;
  }
});

async function previsualizar(): Promise<void> {
  trabajando.value = true;
  aplicado.value = null;
  try {
    previa.value = await http.get<Resultado>('/integrations/phidias/preview/students');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    trabajando.value = false;
  }
}

async function sincronizar(): Promise<void> {
  trabajando.value = true;
  try {
    aplicado.value = await http.post<Resultado>('/integrations/phidias/sync/students', {
      dryRun: false,
    });
    previa.value = null;
    confirmacion.value = '';
    toast.success(t('admin.phidias.done'));
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    trabajando.value = false;
  }
}

const mostrado = computed(() => aplicado.value ?? previa.value);
</script>

<template>
  <BaseSpinner v-if="cargando" size="lg" />

  <div v-else class="flex max-w-3xl flex-col gap-5">
    <BaseCard>
      <h2 class="text-lg font-semibold">{{ t('admin.phidias.title') }}</h2>
      <p class="mt-1 text-sm text-ink-muted">{{ t('admin.phidias.intro') }}</p>

      <div class="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <BaseBadge :tone="listo ? 'success' : 'warning'">
          {{ listo ? t('admin.phidias.ready') : t('admin.phidias.notConfigured') }}
        </BaseBadge>
        <span class="text-ink-muted">{{ t('admin.phidias.mode') }}: {{ estado?.mode }}</span>
      </div>

      <p v-if="estado?.mode === 'mock'" class="mt-3 text-sm text-warning">
        {{ t('admin.phidias.mockWarning') }}
      </p>
    </BaseCard>

    <BaseCard v-if="listo" class="flex flex-col gap-3">
      <div>
        <h3 class="font-medium">{{ t('admin.phidias.previewTitle') }}</h3>
        <p class="mt-1 text-sm text-ink-muted">{{ t('admin.phidias.previewHint') }}</p>
      </div>
      <div>
        <BaseButton variant="secondary" :loading="trabajando && !aplicado" @click="previsualizar">
          {{ t('admin.phidias.preview') }}
        </BaseButton>
      </div>
    </BaseCard>

    <BaseCard v-if="mostrado" class="flex flex-col gap-4">
      <h3 class="font-medium">
        {{ aplicado ? t('admin.phidias.appliedTitle') : t('admin.phidias.wouldDoTitle') }}
      </h3>

      <dl class="grid gap-3 sm:grid-cols-4">
        <div v-for="c in CIFRAS" :key="c.clave">
          <dt class="text-xs text-ink-subtle">{{ t(c.etiqueta) }}</dt>
          <dd
            class="text-xl font-semibold tabular-nums"
            :class="c.alerta && Number(mostrado[c.clave]) > 0 ? 'text-warning' : ''"
          >
            {{ n(Number(mostrado[c.clave])) }}
          </dd>
        </div>
      </dl>

      <!--
        Los problemas van enteros y no resumidos: «12 incidencias» no le dice a
        nadie si puede seguir. Un documento repetido y una sección sin grado no
        se parecen en nada, y solo quien administra sabe cuál de los dos es
        aceptable esta mañana.
      -->
      <div
        v-if="mostrado.issues.length > 0"
        class="rounded-md border border-warning/40 bg-warning/5 p-3"
      >
        <p class="text-sm font-medium">
          {{ t('admin.phidias.issues', { count: mostrado.issues.length }) }}
        </p>
        <ul class="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto text-sm text-ink-muted">
          <li v-for="(p, i) in mostrado.issues" :key="i">
            <span v-if="p.code" class="font-mono text-xs">{{ p.code }}</span>
            {{ p.message ?? p.detail }}
          </li>
        </ul>
      </div>

      <div v-if="previa && !aplicado" class="rounded-md border border-border bg-surface-muted p-3">
        <p class="text-sm">{{ t('admin.phidias.confirmHint', { word: PALABRA }) }}</p>
        <input
          v-model="confirmacion"
          type="text"
          autocomplete="off"
          class="mt-2 h-9 w-56 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
        />
        <div class="mt-3">
          <BaseButton :disabled="!puedeAplicar" :loading="trabajando" @click="sincronizar">
            {{ t('admin.phidias.apply') }}
          </BaseButton>
        </div>
      </div>
    </BaseCard>
  </div>
</template>
