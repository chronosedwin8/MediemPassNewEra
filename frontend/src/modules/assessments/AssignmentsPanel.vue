<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { http, ApiError } from '@/services/http';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import { useToast } from '@/composables/useToast';

/**
 * Lo que ya está asignado, y cómo deshacerlo.
 *
 * Faltaba el camino de vuelta. Se podía asignar y no se podía ver qué había
 * asignado uno, ni cancelar una asignación al grupo equivocado —el error más
 * común que existe— ni recoger a quien entró al grupo después.
 *
 * Cancelar pide confirmación escrita cuando ya hay intentos: cancelar una
 * asignación con trabajo hecho encima no es lo mismo que cancelar una recién
 * creada, y la diferencia no se ve en el botón.
 */

interface Asignacion {
  id: string;
  status: string;
  group: { id: string; code: string } | null;
  assessment: { versionNumber: number };
  /** Repartidos por estado: es lo que dice si cancelar tiene consecuencias. */
  recipients: { total: number; completed: number; inProgress: number; pending: number };
  endAt: string | null;
  createdAt: string;
}

const props = defineProps<{ assessmentId: string }>();

const { t, d } = useI18n();
const toast = useToast();

const cargando = ref(true);
const trabajando = ref<string | null>(null);
const asignaciones = ref<Asignacion[]>([]);
const cancelando = ref<Asignacion | null>(null);
const confirmacion = ref('');

const puedeCancelar = computed(
  () => cancelando.value !== null && confirmacion.value.trim() === cancelando.value.group?.code,
);

async function cargar(): Promise<void> {
  cargando.value = true;
  try {
    const resultado = await http.list<Asignacion>('/assignments', {
      assessmentId: props.assessmentId,
      pageSize: 100,
    });
    asignaciones.value = resultado.items;
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

/** Recoge a quien entró al grupo después de asignar. */
async function resincronizar(asignacion: Asignacion): Promise<void> {
  trabajando.value = asignacion.id;
  try {
    const resultado = await http.post<{ added: number }>(
      `/assignments/${asignacion.id}/sync-recipients`,
      {},
    );
    toast.success(t('assignment.resynced', { count: resultado.added ?? 0 }));
    await cargar();
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    trabajando.value = null;
  }
}

async function cancelar(): Promise<void> {
  if (!cancelando.value) return;
  trabajando.value = cancelando.value.id;
  try {
    await http.delete(`/assignments/${cancelando.value.id}`);
    toast.success(t('assignment.cancelled'));
    cancelando.value = null;
    confirmacion.value = '';
    await cargar();
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    trabajando.value = null;
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <BaseSpinner v-if="cargando" size="sm" />

    <p v-else-if="asignaciones.length === 0" class="text-sm text-ink-subtle">
      {{ t('assignment.none') }}
    </p>

    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="a in asignaciones"
        :key="a.id"
        class="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm"
      >
        <span class="font-medium">{{ a.group?.code ?? '—' }}</span>
        <BaseBadge tone="neutral">v{{ a.assessment.versionNumber }}</BaseBadge>
        <span class="text-ink-muted">
          {{ t('assignment.recipients', { count: a.recipients.total }) }}
        </span>
        <!--
          Lo empezado se dice aquí y no en el diálogo: quien mira la lista
          decide antes de pulsar si esa asignación se puede tocar.
        -->
        <span
          v-if="a.recipients.inProgress + a.recipients.completed > 0"
          class="text-xs text-warning"
        >
          {{
            t('assignment.withWork', {
              count: a.recipients.inProgress + a.recipients.completed,
            })
          }}
        </span>
        <span v-if="a.endAt" class="text-xs text-ink-subtle">
          {{ t('assignment.dueAt') }}: {{ d(new Date(a.endAt), 'short') }}
        </span>

        <span class="ml-auto flex gap-2">
          <BaseButton
            variant="secondary"
            size="sm"
            :loading="trabajando === a.id"
            @click="resincronizar(a)"
          >
            {{ t('assignment.resync') }}
          </BaseButton>
          <BaseButton
            variant="ghost"
            size="sm"
            class="text-danger hover:text-danger"
            @click="
              cancelando = a;
              confirmacion = '';
            "
          >
            {{ t('assignment.cancel') }}
          </BaseButton>
        </span>
      </li>
    </ul>

    <p class="text-xs text-ink-subtle">{{ t('assignment.resyncHint') }}</p>

    <!-- Confirmación escrita: se cancela para un curso entero. -->
    <div
      v-if="cancelando"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="t('assignment.cancelTitle')"
    >
      <div class="flex w-full max-w-md flex-col gap-4 rounded-lg bg-surface p-6 shadow-xl">
        <header>
          <h2 class="text-lg font-semibold">{{ t('assignment.cancelTitle') }}</h2>
          <p class="mt-1 text-sm text-ink-muted">
            {{ t('assignment.cancelBody', { code: cancelando.group?.code ?? '' }) }}
          </p>
        </header>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">
            {{ t('assignment.cancelConfirm', { code: cancelando.group?.code ?? '' }) }}
          </span>
          <input
            v-model="confirmacion"
            type="text"
            autocomplete="off"
            class="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
          />
        </label>

        <footer class="flex justify-end gap-2">
          <BaseButton variant="ghost" @click="cancelando = null">
            {{ t('common.cancel') }}
          </BaseButton>
          <BaseButton
            variant="danger"
            :disabled="!puedeCancelar"
            :loading="trabajando !== null"
            @click="cancelar"
          >
            {{ t('assignment.cancel') }}
          </BaseButton>
        </footer>
      </div>
    </div>
  </div>
</template>
