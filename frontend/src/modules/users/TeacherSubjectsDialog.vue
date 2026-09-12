<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { localize, type LocalizedText } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import { useToast } from '@/composables/useToast';

/**
 * Qué enseña un docente.
 *
 * Varias materias y varias áreas, porque así es un claustro real: quien da
 * matemáticas suele dar también geometría y física. El modelo lo admitía desde
 * el principio —son relaciones de muchos a muchos— y no había forma de
 * tocarlas sin entrar en la base de datos.
 *
 * Las áreas y las materias se guardan por separado, con dos llamadas, porque
 * así las expone el servidor. Si la segunda falla, la primera ya se guardó y
 * se dice: es preferible a fingir que no pasó nada y dejar al docente con la
 * mitad puesta sin saberlo.
 */

interface Opcion {
  id: string;
  code: string;
  name: LocalizedText;
}

interface Ficha {
  id: string;
  firstName: string;
  lastName: string;
  areas: Array<{ id: string }>;
  subjects: Array<{ id: string }>;
}

const props = defineProps<{ teacherId: string; nombre: string }>();
const emit = defineEmits<{ saved: []; cancel: [] }>();

const { t, locale } = useI18n();
const toast = useToast();

const cargando = ref(true);
const guardando = ref(false);
const areas = ref<Opcion[]>([]);
const materias = ref<Opcion[]>([]);
const areasElegidas = ref<Set<string>>(new Set());
const materiasElegidas = ref<Set<string>>(new Set());

const resumen = computed(() => `${areasElegidas.value.size} · ${materiasElegidas.value.size}`);

onMounted(async () => {
  try {
    const [ficha, listaAreas, listaMaterias] = await Promise.all([
      http.get<Ficha>(`/teachers/${props.teacherId}`),
      http.list<Opcion>('/areas', { pageSize: 100 }),
      http.list<Opcion>('/subjects', { pageSize: 100 }),
    ]);
    areas.value = listaAreas.items;
    materias.value = listaMaterias.items;
    areasElegidas.value = new Set(ficha.areas.map((a) => a.id));
    materiasElegidas.value = new Set(ficha.subjects.map((m) => m.id));
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    cargando.value = false;
  }
});

/**
 * Alterna una casilla.
 *
 * Se reemplaza el conjunto en vez de mutarlo: Vue no observa los cambios
 * dentro de un Set, así que añadir un elemento al que ya está no repintaría
 * nada. Recibe cuál de los dos conjuntos toca por su nombre, y no la
 * referencia, porque pasar el ref a la plantilla lo desenvuelve y llega el
 * valor desnudo.
 */
function alternar(cual: 'areas' | 'materias', id: string): void {
  const actual = cual === 'areas' ? areasElegidas : materiasElegidas;
  const copia = new Set(actual.value);
  if (copia.has(id)) copia.delete(id);
  else copia.add(id);
  actual.value = copia;
}

async function guardar(): Promise<void> {
  guardando.value = true;
  try {
    await http.put(`/teachers/${props.teacherId}/areas`, {
      areaIds: [...areasElegidas.value],
    });
    await http.put(`/teachers/${props.teacherId}/subjects`, {
      subjectIds: [...materiasElegidas.value],
    });
    toast.success(t('common.saved'));
    emit('saved');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/40 p-4"
    role="dialog"
    aria-modal="true"
    :aria-label="t('users.teaches')"
  >
    <div class="flex w-full max-w-2xl flex-col gap-4 rounded-lg bg-surface p-6 shadow-xl">
      <header>
        <h2 class="text-lg font-semibold">{{ t('users.teaches') }}</h2>
        <p class="mt-1 text-sm text-ink-muted">{{ nombre }} — {{ t('users.teachesHint') }}</p>
      </header>

      <BaseSpinner v-if="cargando" size="lg" />

      <template v-else>
        <fieldset class="flex flex-col gap-2">
          <legend class="text-sm font-medium">{{ t('users.subjects') }}</legend>
          <div class="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
            <label
              v-for="m in materias"
              :key="m.id"
              class="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
              :class="materiasElegidas.has(m.id) ? 'border-brand-500 bg-brand-50' : ''"
            >
              <input
                type="checkbox"
                class="size-4 accent-brand-600"
                :checked="materiasElegidas.has(m.id)"
                @change="alternar('materias', m.id)"
              />
              {{ localize(m.name, locale as never) }}
            </label>
          </div>
        </fieldset>

        <fieldset class="flex flex-col gap-2">
          <legend class="text-sm font-medium">{{ t('users.areas') }}</legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="a in areas"
              :key="a.id"
              class="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
              :class="areasElegidas.has(a.id) ? 'border-brand-500 bg-brand-50' : ''"
            >
              <input
                type="checkbox"
                class="size-4 accent-brand-600"
                :checked="areasElegidas.has(a.id)"
                @change="alternar('areas', a.id)"
              />
              {{ localize(a.name, locale as never) }}
            </label>
          </div>
        </fieldset>

        <footer class="flex items-center justify-between gap-2">
          <span class="font-mono text-xs text-ink-subtle">{{ resumen }}</span>
          <span class="flex gap-2">
            <BaseButton variant="ghost" @click="emit('cancel')">{{
              t('common.cancel')
            }}</BaseButton>
            <BaseButton :loading="guardando" @click="guardar">{{ t('common.save') }}</BaseButton>
          </span>
        </footer>
      </template>
    </div>
  </div>
</template>
