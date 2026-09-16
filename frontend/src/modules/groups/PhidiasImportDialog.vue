<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { http, ApiError } from '@/services/http';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import { useToast } from '@/composables/useToast';

/**
 * Traer cursos de Phidias como grupos.
 *
 * Es la puerta del docente a la matrícula real, sin depender de que
 * administración haya sincronizado el colegio entero. Elige sus cursos, y cada
 * uno llega como grupo con sus estudiantes y con él como docente.
 *
 * Un curso que ya existe no se duplica: se actualiza y, si quien importa no
 * daba clase en él, pasa a darla. Por eso la lista dice qué cursos ya están y
 * en cuáles ya figura, que es lo que decide si hace falta volver a traerlo.
 *
 * Se busca y se filtra por grado porque la matrícula tiene sesenta y tantos
 * cursos, y bajar por una lista así para encontrar 10B es perder el tiempo.
 */

interface Curso {
  externalId: number;
  code: string;
  courseName: string;
  levelName: string;
  studentCount: number;
  group: { id: string; code: string; teaching: boolean } | null;
}

interface Resultado {
  groups: Array<{ id: string; code: string; students: number }>;
  studentsCreated: number;
  studentsUpdated: number;
  membershipsAdded: number;
  issues: Array<{ reason: string; detail: string }>;
}

const emit = defineEmits<{ imported: []; cancel: [] }>();

const { t } = useI18n();
const toast = useToast();

const cargando = ref(true);
const importando = ref(false);
const cursos = ref<Curso[]>([]);
const busqueda = ref('');
const grado = ref('');
const elegidos = ref<Set<number>>(new Set());
const resultado = ref<Resultado | null>(null);

/** Los grados que aparecen de verdad en la matrícula, no una lista fija. */
const grados = computed(() => [...new Set(cursos.value.map((c) => c.courseName))].sort());

const visibles = computed(() => {
  const texto = busqueda.value.trim().toLowerCase();
  return cursos.value.filter(
    (c) =>
      (!grado.value || c.courseName === grado.value) &&
      (!texto ||
        c.code.toLowerCase().includes(texto) ||
        c.courseName.toLowerCase().includes(texto)),
  );
});

const estudiantesElegidos = computed(() =>
  cursos.value
    .filter((c) => elegidos.value.has(c.externalId))
    .reduce((suma, c) => suma + c.studentCount, 0),
);

onMounted(async () => {
  try {
    cursos.value = await http.get<Curso[]>('/integrations/phidias/sections');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    cargando.value = false;
  }
});

function alternar(id: number): void {
  const copia = new Set(elegidos.value);
  if (copia.has(id)) copia.delete(id);
  else copia.add(id);
  elegidos.value = copia;
}

async function importar(): Promise<void> {
  importando.value = true;
  try {
    resultado.value = await http.post<Resultado>('/integrations/phidias/sections/import', {
      sectionExternalIds: [...elegidos.value],
      joinAsTeacher: true,
    });
    toast.success(t('phidiasImport.done', { count: resultado.value.groups.length }));
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    importando.value = false;
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
    :aria-label="t('phidiasImport.title')"
  >
    <div
      class="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 rounded-lg bg-surface p-6 shadow-xl"
    >
      <header>
        <h2 class="text-lg font-semibold">{{ t('phidiasImport.title') }}</h2>
        <p class="mt-1 text-sm text-ink-muted">{{ t('phidiasImport.intro') }}</p>
      </header>

      <!-- Hecho: lo que llegó, y sin más botones que cerrar. -->
      <template v-if="resultado">
        <ul class="flex flex-col gap-1 text-sm">
          <li v-for="g in resultado.groups" :key="g.id" class="flex items-center gap-2">
            <BaseBadge tone="success">{{ g.code }}</BaseBadge>
            {{ t('phidiasImport.groupStudents', { count: g.students }) }}
          </li>
        </ul>
        <p class="text-sm text-ink-muted">
          {{
            t('phidiasImport.summary', {
              created: resultado.studentsCreated,
              updated: resultado.studentsUpdated,
            })
          }}
        </p>
        <div
          v-if="resultado.issues.length > 0"
          class="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm"
        >
          <p class="font-medium">
            {{ t('phidiasImport.issues', { count: resultado.issues.length }) }}
          </p>
          <ul class="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto text-ink-muted">
            <li v-for="(i, n) in resultado.issues" :key="n">{{ i.detail }}</li>
          </ul>
        </div>
        <footer class="flex justify-end">
          <BaseButton @click="emit('imported')">{{ t('common.close') }}</BaseButton>
        </footer>
      </template>

      <template v-else>
        <div class="flex flex-wrap gap-2">
          <label class="flex min-w-48 flex-1 flex-col gap-1">
            <span class="sr-only">{{ t('phidiasImport.search') }}</span>
            <input
              v-model="busqueda"
              type="search"
              :placeholder="t('phidiasImport.search')"
              :class="campo"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="sr-only">{{ t('group.gradeLevel') }}</span>
            <select v-model="grado" :class="campo">
              <option value="">{{ t('phidiasImport.allGrades') }}</option>
              <option v-for="g in grados" :key="g" :value="g">{{ g }}</option>
            </select>
          </label>
        </div>

        <BaseSpinner v-if="cargando" size="lg" />

        <ul v-else class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          <li v-for="c in visibles" :key="c.externalId">
            <label
              class="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
              :class="elegidos.has(c.externalId) ? 'border-brand-500 bg-brand-50' : ''"
            >
              <input
                type="checkbox"
                class="size-4 accent-brand-600"
                :checked="elegidos.has(c.externalId)"
                @change="alternar(c.externalId)"
              />
              <span class="w-16 font-mono font-medium">{{ c.code }}</span>
              <span class="flex-1 text-ink-muted">{{ c.courseName }}</span>
              <span class="tabular-nums text-ink-subtle">
                {{ t('phidiasImport.students', { count: c.studentCount }) }}
              </span>
              <!--
                Si ya da clase ahí, no hace falta traerlo; si el grupo existe
                pero no es suyo, traerlo lo apunta como docente.
              -->
              <BaseBadge v-if="c.group?.teaching" tone="success">
                {{ t('phidiasImport.yours') }}
              </BaseBadge>
              <BaseBadge v-else-if="c.group" tone="info">
                {{ t('phidiasImport.exists') }}
              </BaseBadge>
            </label>
          </li>
        </ul>

        <footer class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-sm text-ink-muted">
            {{
              t('phidiasImport.selection', {
                courses: elegidos.size,
                students: estudiantesElegidos,
              })
            }}
          </span>
          <span class="flex gap-2">
            <BaseButton variant="ghost" @click="emit('cancel')">{{
              t('common.cancel')
            }}</BaseButton>
            <BaseButton
              :disabled="elegidos.size === 0 || elegidos.size > 20"
              :loading="importando"
              @click="importar"
            >
              {{ t('phidiasImport.import') }}
            </BaseButton>
          </span>
        </footer>
      </template>
    </div>
  </div>
</template>
