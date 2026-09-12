<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { localize, type LocalizedText } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseButton from '@/design-system/BaseButton.vue';
import { useToast } from '@/composables/useToast';

/**
 * Crear o editar un grupo.
 *
 * Faltaba entera. La API sabía crear grupos desde el principio y la pantalla
 * solo los listaba, así que en una instalación nueva —donde no hay ninguno—
 * no había forma de empezar: sin grupos no hay a quién asignar una
 * evaluación, y el colegio se quedaba mirando una lista vacía.
 *
 * El director de curso se pide aquí y no después por un motivo práctico: sin
 * él, nadie puede asignar evaluaciones a ese grupo, y un grupo al que no se
 * le puede asignar nada es un grupo que no sirve. Se admite vacío porque a
 * veces todavía no está decidido, pero la interfaz lo dice.
 */

interface Opcion {
  id: string;
  code: string;
  name: LocalizedText;
}

interface Docente {
  id: string;
  firstName: string;
  lastName: string;
}

const props = defineProps<{
  grupo?: {
    id: string;
    code: string;
    name: LocalizedText | null;
    gradeLevel: { id: string };
    subject: { id: string } | null;
    homeroomTeacher: { id: string } | null;
  } | null;
}>();

const emit = defineEmits<{ saved: []; cancel: [] }>();

const { t, locale } = useI18n();
const toast = useToast();

const cargando = ref(true);
const enviando = ref(false);
const grados = ref<Opcion[]>([]);
const materias = ref<Opcion[]>([]);
const docentes = ref<Docente[]>([]);
const anoId = ref('');

const editando = computed(() => Boolean(props.grupo));

const form = reactive({
  code: props.grupo?.code ?? '',
  nombre: '',
  gradeLevelId: props.grupo?.gradeLevel.id ?? '',
  subjectId: props.grupo?.subject?.id ?? '',
  homeroomTeacherId: props.grupo?.homeroomTeacher?.id ?? '',
});

/** Mayúsculas y números: es lo que valida el servidor, así que se fuerza aquí. */
const codigoValido = computed(() => /^[A-Z0-9]{2,20}$/.test(form.code));

const puedeGuardar = computed(
  () => codigoValido.value && form.gradeLevelId !== '' && !enviando.value,
);

onMounted(async () => {
  try {
    const [gradeLevels, subjectList, teacherList, ano] = await Promise.all([
      http.get<Opcion[]>('/academic/grade-levels'),
      // 100 es el tope que acepta el servidor; pedir más da un 422 que en la
      // pantalla se lee como «hay datos incorrectos en el formulario», sin que
      // haya ningún dato escrito todavía.
      http.list<Opcion>('/subjects', { pageSize: 100 }),
      http.list<Docente>('/teachers', { pageSize: 100 }),
      http.get<{ id: string }>('/academic/years/current'),
    ]);
    grados.value = gradeLevels;
    materias.value = subjectList.items;
    docentes.value = teacherList.items;
    anoId.value = ano.id;
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    cargando.value = false;
  }
});

async function guardar(): Promise<void> {
  enviando.value = true;
  try {
    const cuerpo = {
      code: form.code.trim().toUpperCase(),
      ...(form.nombre.trim() ? { name: form.nombre.trim() } : {}),
      gradeLevelId: form.gradeLevelId,
      subjectId: form.subjectId || null,
      homeroomTeacherId: form.homeroomTeacherId || null,
    };

    if (editando.value && props.grupo) {
      await http.patch(`/groups/${props.grupo.id}`, cuerpo);
    } else {
      await http.post('/groups', { ...cuerpo, academicYearId: anoId.value });
    }

    toast.success(t('common.saved'));
    emit('saved');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    enviando.value = false;
  }
}

const campo =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/40 p-4"
    role="dialog"
    aria-modal="true"
    :aria-label="editando ? t('group.edit') : t('group.create')"
  >
    <form
      class="flex w-full max-w-lg flex-col gap-4 rounded-lg bg-surface p-6 shadow-xl"
      @submit.prevent="guardar"
    >
      <header>
        <h2 class="text-lg font-semibold">{{ editando ? t('group.edit') : t('group.create') }}</h2>
        <p class="mt-1 text-sm text-ink-muted">{{ t('group.formHint') }}</p>
      </header>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('group.code') }}</span>
          <input
            v-model="form.code"
            type="text"
            required
            autocomplete="off"
            :class="campo"
            @input="form.code = form.code.toUpperCase()"
          />
          <span
            class="text-xs"
            :class="codigoValido || !form.code ? 'text-ink-subtle' : 'text-danger'"
          >
            {{ t('group.codeRule') }}
          </span>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('group.gradeLevel') }}</span>
          <select v-model="form.gradeLevelId" required :class="campo" :disabled="cargando">
            <option value="" disabled>{{ t('common.choose') }}</option>
            <option v-for="g in grados" :key="g.id" :value="g.id">
              {{ localize(g.name, locale as never) }}
            </option>
          </select>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('assessment.subject') }}</span>
          <select v-model="form.subjectId" :class="campo" :disabled="cargando">
            <option value="">{{ t('common.none') }}</option>
            <option v-for="m in materias" :key="m.id" :value="m.id">
              {{ localize(m.name, locale as never) }}
            </option>
          </select>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('group.homeroomTeacher') }}</span>
          <select v-model="form.homeroomTeacherId" :class="campo" :disabled="cargando">
            <option value="">{{ t('common.none') }}</option>
            <option v-for="d in docentes" :key="d.id" :value="d.id">
              {{ d.lastName }}, {{ d.firstName }}
            </option>
          </select>
          <span class="text-xs text-ink-subtle">{{ t('group.homeroomHint') }}</span>
        </label>
      </div>

      <footer class="flex justify-end gap-2">
        <BaseButton variant="ghost" type="button" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </BaseButton>
        <BaseButton type="submit" :disabled="!puedeGuardar" :loading="enviando">
          {{ t('common.save') }}
        </BaseButton>
      </footer>
    </form>
  </div>
</template>
