<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { localize, type LocalizedText } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseButton from '@/design-system/BaseButton.vue';
import { useToast } from '@/composables/useToast';

/**
 * Quién da clase a este grupo.
 *
 * Es lo que decide qué grupos ve cada docente, y por eso importa más de lo que
 * parece: antes el único vínculo era ser director de curso, y solo cabe uno.
 * Quien daba una materia en cinco cursos sin ser director de ninguno no veía
 * ni un grupo y no podía asignar nada. Con las secciones que llegan de
 * Phidias, que vienen sin director, eso dejaba la plataforma en manos de
 * administración.
 *
 * La materia es opcional a propósito: en primaria el director de curso da casi
 * todo, y obligar a desglosarlo sería papeleo sin dueño.
 */

/**
 * Ojo con el identificador.
 *
 * `/teachers` devuelve dos: `id` es el de la ficha docente y `userId` el de la
 * persona. El grupo apunta a la persona, así que lo que viaja es `userId`.
 * Confundirlos no da un error claro —son dos UUID igual de válidos—, sino una
 * fila que apunta a nadie.
 */
interface Docente {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
}

/**
 * Lo que ya consta en el grupo. Aquí `id` ya es el de la persona: la relación
 * del grupo apunta a `users`, no a la ficha docente.
 */
interface DocenteDelGrupo {
  id: string;
  firstName: string;
  lastName: string;
}

interface Materia {
  id: string;
  code: string;
  name: LocalizedText;
}

interface Fila {
  teacherId: string;
  subjectId: string;
}

const props = defineProps<{
  groupId: string;
  iniciales: Array<{ teacher: DocenteDelGrupo; subject: { id: string } | null }>;
}>();

const emit = defineEmits<{ saved: [] }>();

const { t, locale } = useI18n();
const toast = useToast();

const cargando = ref(true);
const guardando = ref(false);
const docentes = ref<Docente[]>([]);
const materias = ref<Materia[]>([]);
const filas = ref<Fila[]>(
  props.iniciales.map((e) => ({ teacherId: e.teacher.id, subjectId: e.subject?.id ?? '' })),
);

/** Nadie puede figurar dos veces: el servidor lo rechaza y aquí se evita. */
const disponibles = computed(() => (indice: number) => {
  const tomados = new Set(filas.value.filter((_, i) => i !== indice).map((f) => f.teacherId));
  return docentes.value.filter((d) => !tomados.has(d.userId));
});

const puedeGuardar = computed(
  () => !guardando.value && filas.value.every((f) => f.teacherId !== ''),
);

onMounted(async () => {
  try {
    const [lista, materiaLista] = await Promise.all([
      http.list<Docente>('/teachers', { pageSize: 100 }),
      http.list<Materia>('/subjects', { pageSize: 100 }),
    ]);
    docentes.value = lista.items;
    materias.value = materiaLista.items;
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    cargando.value = false;
  }
});

function anadir(): void {
  filas.value.push({ teacherId: '', subjectId: '' });
}

function quitar(indice: number): void {
  filas.value.splice(indice, 1);
}

async function guardar(): Promise<void> {
  guardando.value = true;
  try {
    await http.put(`/groups/${props.groupId}/teachers`, {
      teachers: filas.value.map((f) => ({
        teacherId: f.teacherId,
        subjectId: f.subjectId || null,
      })),
    });
    toast.success(t('common.saved'));
    emit('saved');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    guardando.value = false;
  }
}

const campo =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-ink-muted">{{ t('group.teachersHint') }}</p>

    <p v-if="filas.length === 0" class="text-sm text-ink-subtle">{{ t('group.noTeachers') }}</p>

    <ul v-else class="flex flex-col gap-2">
      <li v-for="(fila, indice) in filas" :key="indice" class="flex flex-wrap items-end gap-2">
        <label class="flex min-w-52 flex-1 flex-col gap-1">
          <span class="text-xs text-ink-subtle">{{ t('group.teacher') }}</span>
          <select v-model="fila.teacherId" :class="campo" :disabled="cargando">
            <option value="" disabled>{{ t('common.choose') }}</option>
            <option v-for="d in disponibles(indice)" :key="d.userId" :value="d.userId">
              {{ d.lastName }}, {{ d.firstName }}
            </option>
          </select>
        </label>

        <label class="flex min-w-44 flex-1 flex-col gap-1">
          <span class="text-xs text-ink-subtle">{{ t('assessment.subject') }}</span>
          <select v-model="fila.subjectId" :class="campo" :disabled="cargando">
            <option value="">{{ t('common.none') }}</option>
            <option v-for="m in materias" :key="m.id" :value="m.id">
              {{ localize(m.name, locale as never) }}
            </option>
          </select>
        </label>

        <BaseButton variant="ghost" size="sm" @click="quitar(indice)">
          {{ t('common.remove') }}
        </BaseButton>
      </li>
    </ul>

    <div class="flex flex-wrap gap-2">
      <BaseButton variant="secondary" size="sm" :disabled="cargando" @click="anadir">
        {{ t('group.addTeacher') }}
      </BaseButton>
      <BaseButton size="sm" :disabled="!puedeGuardar" :loading="guardando" @click="guardar">
        {{ t('common.save') }}
      </BaseButton>
    </div>
  </div>
</template>
