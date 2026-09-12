<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { http, ApiError } from '@/services/http';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import { useToast } from '@/composables/useToast';

/**
 * Añadir estudiantes al grupo, vengan del curso que vengan.
 *
 * Los grupos que llegan de Phidias son cursos completos, y eso cubre la mayor
 * parte del año. Pero una materia de electiva reúne a gente de varios cursos
 * —diez de décimo, ocho de undécimo— y para armarla hace falta buscar fuera
 * del alumnado propio.
 *
 * La búsqueda va atada a este grupo: el servidor abre el alcance solo porque
 * quien pregunta puede administrar sus miembros, y no para siempre ni para
 * todo. La alternativa era dejar la matrícula entera a la vista de cualquiera
 * con rol docente, lo cual es otra cosa.
 *
 * Se busca en lugar de listar. Con mil doscientos matriculados, una lista
 * completa es una pantalla por la que nadie encuentra a nadie.
 */

interface Candidato {
  id: string;
  firstName: string;
  lastName: string;
  code: string | null;
  gradeLevel?: { code: string } | null;
}

const props = defineProps<{ groupId: string; yaDentro: string[] }>();
const emit = defineEmits<{ added: [] }>();

const { t } = useI18n();
const toast = useToast();

const busqueda = ref('');
const buscando = ref(false);
const guardando = ref(false);
const resultados = ref<Candidato[]>([]);
const elegidos = ref<Set<string>>(new Set());
const buscado = ref(false);

const dentro = computed(() => new Set(props.yaDentro));

let temporizador: ReturnType<typeof setTimeout> | undefined;

watch(busqueda, (valor) => {
  clearTimeout(temporizador);
  if (valor.trim().length < 2) {
    resultados.value = [];
    buscado.value = false;
    return;
  }
  // Se espera a que deje de escribir: una consulta por tecla contra mil
  // doscientas matrículas no ayuda a nadie.
  temporizador = setTimeout(() => void buscar(), 350);
});

async function buscar(): Promise<void> {
  buscando.value = true;
  try {
    const resultado = await http.list<Candidato>('/students', {
      availableForGroupId: props.groupId,
      search: busqueda.value.trim(),
      pageSize: 40,
    });
    resultados.value = resultado.items;
    buscado.value = true;
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    buscando.value = false;
  }
}

function alternar(id: string): void {
  const copia = new Set(elegidos.value);
  if (copia.has(id)) copia.delete(id);
  else copia.add(id);
  elegidos.value = copia;
}

async function anadir(): Promise<void> {
  guardando.value = true;
  try {
    await http.post(`/groups/${props.groupId}/members`, {
      studentIds: [...elegidos.value],
    });
    toast.success(t('group.membersAdded', { count: elegidos.value.size }));
    elegidos.value = new Set();
    busqueda.value = '';
    resultados.value = [];
    buscado.value = false;
    emit('added');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-ink-muted">{{ t('group.pickerHint') }}</p>

    <label class="flex flex-col gap-1.5">
      <span class="sr-only">{{ t('group.searchStudents') }}</span>
      <input
        v-model="busqueda"
        type="search"
        :placeholder="t('group.searchStudents')"
        class="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
      />
    </label>

    <BaseSpinner v-if="buscando" size="sm" />

    <p v-else-if="buscado && resultados.length === 0" class="text-sm text-ink-subtle">
      {{ t('group.noCandidates') }}
    </p>

    <ul v-else-if="resultados.length > 0" class="flex max-h-72 flex-col gap-1 overflow-y-auto">
      <li v-for="c in resultados" :key="c.id">
        <!--
          Quien ya está en el grupo aparece, pero apagado y sin casilla: que no
          salga invita a buscarlo otra vez pensando que no existe.
        -->
        <label
          class="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
          :class="[
            dentro.has(c.id) ? 'opacity-50' : 'cursor-pointer',
            elegidos.has(c.id) ? 'border-brand-500 bg-brand-50' : '',
          ]"
        >
          <input
            type="checkbox"
            class="size-4 accent-brand-600"
            :checked="elegidos.has(c.id)"
            :disabled="dentro.has(c.id)"
            @change="alternar(c.id)"
          />
          <span class="flex-1">{{ c.lastName }}, {{ c.firstName }}</span>
          <span v-if="c.gradeLevel" class="font-mono text-xs text-ink-subtle">
            {{ c.gradeLevel.code }}
          </span>
          <span v-if="dentro.has(c.id)" class="text-xs text-ink-subtle">
            {{ t('group.alreadyIn') }}
          </span>
        </label>
      </li>
    </ul>

    <div v-if="elegidos.size > 0">
      <BaseButton :loading="guardando" @click="anadir">
        {{ t('group.addSelected', { count: elegidos.size }) }}
      </BaseButton>
    </div>
  </div>
</template>
