<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
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
/** Curso de origen: electivas se arman trayendo gente curso a curso. */
const cursoOrigen = ref('');
const cursos = ref<Array<{ id: string; code: string; studentCount: number }>>([]);
const buscando = ref(false);
const guardando = ref(false);
const resultados = ref<Candidato[]>([]);
const elegidos = ref<Set<string>>(new Set());
const buscado = ref(false);

const dentro = computed(() => new Set(props.yaDentro));

let temporizador: ReturnType<typeof setTimeout> | undefined;

onMounted(async () => {
  try {
    // Todos los cursos del año, sin datos personales: solo para filtrar.
    const catalogo =
      await http.get<Array<{ id: string; code: string; studentCount: number }>>('/groups/catalog');
    cursos.value = catalogo.filter((c) => c.id !== props.groupId);
  } catch {
    cursos.value = [];
  }
});

watch(cursoOrigen, () => {
  // Con un curso elegido se lista entero, sin esperar a que se escriba nada.
  if (cursoOrigen.value) void buscar();
  else if (busqueda.value.trim().length < 2) {
    resultados.value = [];
    buscado.value = false;
  }
});

watch(busqueda, (valor) => {
  clearTimeout(temporizador);
  if (valor.trim().length < 2 && !cursoOrigen.value) {
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
      ...(busqueda.value.trim().length >= 2 ? { search: busqueda.value.trim() } : {}),
      ...(cursoOrigen.value ? { groupId: cursoOrigen.value } : {}),
      pageSize: 100,
    });
    resultados.value = resultado.items;
    buscado.value = true;
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    buscando.value = false;
  }
}

/** Marca a todos los que aparecen y no están ya: un curso entero de un toque. */
function elegirTodos(): void {
  elegidos.value = new Set(
    resultados.value.filter((c) => !dentro.value.has(c.id)).map((c) => c.id),
  );
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

    <div class="flex flex-wrap gap-2">
      <label class="flex min-w-48 flex-1 flex-col gap-1.5">
        <span class="sr-only">{{ t('group.searchStudents') }}</span>
        <input
          v-model="busqueda"
          type="search"
          :placeholder="t('group.searchStudents')"
          class="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
        />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="sr-only">{{ t('group.fromCourse') }}</span>
        <select
          v-model="cursoOrigen"
          class="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
        >
          <option value="">{{ t('group.anyCourse') }}</option>
          <option v-for="c in cursos" :key="c.id" :value="c.id">
            {{ c.code }} · {{ c.studentCount }}
          </option>
        </select>
      </label>
    </div>

    <div v-if="resultados.length > 0" class="flex justify-end">
      <BaseButton variant="ghost" size="sm" @click="elegirTodos">
        {{ t('group.selectAll', { count: resultados.filter((c) => !dentro.has(c.id)).length }) }}
      </BaseButton>
    </div>

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
