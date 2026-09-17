<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { TRAINING_AUDIENCE_MODE } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import { useToast } from '@/composables/useToast';

/**
 * A qué docentes se les aplica esta capacitación.
 *
 * Antes toda formación era para todo el claustro, y eso hacía inservible el
 * porcentaje de cumplimiento: una capacitación del área de ciencias aparecía
 * pendiente en la cuenta de los cuarenta y tantos docentes del colegio, así
 * que «la ha hecho el 18%» no decía nada sobre si la formación funcionaba.
 *
 * La fecha límite ordena lo pendiente y permite ver quién va tarde, pero no
 * cierra el acceso: cerrar una formación por vencida deja sin hacerla justo a
 * quien le hacía falta.
 */

interface Docente {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
}

const props = defineProps<{
  moduleId: string;
  mode: string;
  selected: Array<{ userId: string; dueDate: string | null }>;
}>();

const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const toast = useToast();

const docentes = ref<Docente[]>([]);
const cargando = ref(true);
const guardando = ref(false);
const busqueda = ref('');
const modo = ref(props.mode);
const elegidos = ref<Set<string>>(new Set(props.selected.map((fila) => fila.userId)));
const dueDate = ref(props.selected[0]?.dueDate?.slice(0, 10) ?? '');

const dirigido = computed(() => modo.value === TRAINING_AUDIENCE_MODE.SELECTED);

const visibles = computed(() => {
  const texto = busqueda.value.trim().toLowerCase();
  if (!texto) return docentes.value;
  return docentes.value.filter((docente) =>
    `${docente.firstName} ${docente.lastName}`.toLowerCase().includes(texto),
  );
});

onMounted(async () => {
  try {
    docentes.value = (await http.list<Docente>('/teachers', { pageSize: 100 })).items;
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    cargando.value = false;
  }
});

function alternar(userId: string): void {
  const copia = new Set(elegidos.value);
  if (copia.has(userId)) copia.delete(userId);
  else copia.add(userId);
  elegidos.value = copia;
}

function todos(): void {
  elegidos.value = new Set(visibles.value.map((docente) => docente.userId));
}

async function guardar(): Promise<void> {
  guardando.value = true;
  try {
    await http.put(`/training/admin/modules/${props.moduleId}/audience`, {
      mode: modo.value,
      userIds: dirigido.value ? [...elegidos.value] : [],
      dueDate: dirigido.value && dueDate.value ? dueDate.value : null,
    });
    toast.success(t('common.saved'));
    emit('changed');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    guardando.value = false;
  }
}

const campo =
  'h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap gap-4">
      <label class="flex items-center gap-2 text-sm">
        <input
          v-model="modo"
          type="radio"
          class="size-4 accent-brand-600"
          :value="TRAINING_AUDIENCE_MODE.ALL"
        />
        {{ t('training.admin.audienceAll') }}
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input
          v-model="modo"
          type="radio"
          class="size-4 accent-brand-600"
          :value="TRAINING_AUDIENCE_MODE.SELECTED"
        />
        {{ t('training.admin.audienceSelected') }}
      </label>
    </div>

    <template v-if="dirigido">
      <div class="flex flex-wrap items-end gap-3">
        <label class="flex min-w-48 flex-1 flex-col gap-1.5">
          <span class="sr-only">{{ t('common.search') }}</span>
          <input
            v-model="busqueda"
            type="search"
            :placeholder="t('training.admin.searchTeacher')"
            :class="campo"
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('training.admin.dueDate') }}</span>
          <input v-model="dueDate" type="date" :class="campo" />
        </label>
        <BaseButton variant="ghost" size="sm" @click="todos">
          {{ t('training.admin.selectAllTeachers', { count: visibles.length }) }}
        </BaseButton>
      </div>

      <BaseSpinner v-if="cargando" size="sm" />

      <ul v-else class="grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
        <li v-for="docente in visibles" :key="docente.userId">
          <label
            class="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
            :class="elegidos.has(docente.userId) ? 'border-brand-500 bg-brand-50' : ''"
          >
            <input
              type="checkbox"
              class="size-4 accent-brand-600"
              :checked="elegidos.has(docente.userId)"
              @change="alternar(docente.userId)"
            />
            <span class="truncate">{{ docente.lastName }}, {{ docente.firstName }}</span>
          </label>
        </li>
      </ul>

      <p class="text-sm text-ink-muted">
        {{ t('training.admin.audienceCount', { count: elegidos.size }) }}
      </p>
    </template>

    <p v-else class="text-sm text-ink-muted">{{ t('training.admin.audienceAllHint') }}</p>

    <div>
      <BaseButton :loading="guardando" @click="guardar">{{ t('common.save') }}</BaseButton>
    </div>
  </div>
</template>
