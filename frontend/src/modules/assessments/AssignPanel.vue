<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ASSESSMENT_AUDIENCE, ASSIGNMENT_TARGET_TYPE } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import { useToast } from '@/composables/useToast';

/**
 * Poner una evaluación a quien la tiene que hacer.
 *
 * Se elige más de un destino a la vez porque la misma evaluación se pone casi
 * siempre a los tres décimos, no a uno. Hacerlo tres veces seguidas producía
 * tres fechas distintas por descuido, y cada curso acababa con un plazo que
 * nadie había decidido.
 *
 * Cada grupo conserva su propia asignación: así se cierra la de un curso que
 * se fue de salida sin tocar la de los demás, y las notas no se mezclan.
 *
 * Los destinos se piden aquí y no se reciben del padre: el servidor devuelve
 * solo los grupos en los que da clase quien pregunta, así que la lista ya
 * viene acotada por el alcance. Si sale vacía no es un fallo, es que no
 * tiene ninguno.
 */

interface Group {
  id: string;
  code: string;
  studentCount: number;
}

interface Teacher {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
}

const props = defineProps<{ versionId: string; audience?: string }>();
const emit = defineEmits<{ assigned: [] }>();

const { t } = useI18n();
const toast = useToast();

/** Una evaluación docente se asigna a personas; una de estudiantes, a grupos. */
const aDocentes = computed(() => props.audience === ASSESSMENT_AUDIENCE.TEACHER);

const groups = ref<Group[]>([]);
const teachers = ref<Teacher[]>([]);
const elegidos = ref<Set<string>>(new Set());
const attemptsAllowed = ref(1);
const startAt = ref(paraCampo(new Date()));
const endAt = ref('');
const assigning = ref(false);
const cargando = ref(true);

/** `datetime-local` quiere la hora local sin zona ni segundos. */
function paraCampo(fecha: Date): string {
  const local = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const destinos = computed(() =>
  aDocentes.value
    ? teachers.value.map((docente) => ({
        id: docente.userId,
        label: `${docente.lastName}, ${docente.firstName}`,
        hint: '',
      }))
    : groups.value.map((grupo) => ({
        id: grupo.id,
        label: grupo.code,
        hint: t('group.studentCount', { count: grupo.studentCount }),
      })),
);

onMounted(async () => {
  try {
    if (aDocentes.value) {
      teachers.value = (await http.list<Teacher>('/teachers', { pageSize: 100 })).items;
    } else {
      groups.value = (await http.list<Group>('/groups', { pageSize: 100 })).items;
    }
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    cargando.value = false;
  }
});

function alternar(id: string): void {
  const copia = new Set(elegidos.value);
  if (copia.has(id)) copia.delete(id);
  else copia.add(id);
  elegidos.value = copia;
}

function todos(): void {
  elegidos.value = new Set(destinos.value.map((destino) => destino.id));
}

async function assign(): Promise<void> {
  if (elegidos.value.size === 0) return;
  assigning.value = true;

  try {
    const result = await http.post<{ recipientCount: number; assignments: unknown[] }>(
      '/assignments',
      {
        assessmentVersionId: props.versionId,
        targetType: aDocentes.value ? ASSIGNMENT_TARGET_TYPE.USER : ASSIGNMENT_TARGET_TYPE.GROUP,
        ...(aDocentes.value
          ? { userIds: [...elegidos.value] }
          : { groupIds: [...elegidos.value] }),
        startAt: new Date(startAt.value).toISOString(),
        ...(endAt.value ? { endAt: new Date(endAt.value).toISOString() } : {}),
        attemptsAllowed: attemptsAllowed.value,
      },
    );
    toast.success(
      t('assignment.assignedToTargets', {
        count: result.recipientCount,
        targets: result.assignments.length,
      }),
    );
    elegidos.value = new Set();
    emit('assigned');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    assigning.value = false;
  }
}

const campo =
  'h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <BaseCard :title="t('assessment.assign')">
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">
            {{ aDocentes ? t('assignment.teachers') : t('assignment.groups') }}
          </span>
          <BaseButton
            v-if="destinos.length > 1"
            variant="ghost"
            size="sm"
            @click="todos"
          >
            {{ t('assignment.selectAll', { count: destinos.length }) }}
          </BaseButton>
        </div>

        <!--
          Casillas y no un desplegable múltiple: en un desplegable, elegir el
          segundo curso sin dejar seleccionado el primero exige saber que hay
          que mantener pulsada una tecla, y quien no lo sabe asigna a uno solo
          creyendo que asignó a los dos.
        -->
        <ul class="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
          <li v-for="destino in destinos" :key="destino.id">
            <label
              class="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              :class="elegidos.has(destino.id) ? 'border-brand-500 bg-brand-50' : ''"
            >
              <input
                type="checkbox"
                class="size-4 accent-brand-600"
                :checked="elegidos.has(destino.id)"
                @change="alternar(destino.id)"
              />
              <span class="flex-1 font-medium">{{ destino.label }}</span>
              <span v-if="destino.hint" class="text-xs text-ink-subtle">{{ destino.hint }}</span>
            </label>
          </li>
        </ul>
      </div>

      <div class="flex flex-wrap items-end gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="assign-start">
            {{ t('assignment.opens') }}
          </label>
          <input id="assign-start" v-model="startAt" type="datetime-local" :class="campo" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="assign-end">{{ t('assignment.closes') }}</label>
          <input id="assign-end" v-model="endAt" type="datetime-local" :class="campo" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="assign-attempts">
            {{ t('assignment.attemptsAllowed') }}
          </label>
          <input
            id="assign-attempts"
            v-model.number="attemptsAllowed"
            type="number"
            min="1"
            max="20"
            :class="[campo, 'w-24']"
          />
        </div>

        <BaseButton :disabled="elegidos.size === 0" :loading="assigning" @click="assign">
          {{ t('assignment.assignTo', { count: elegidos.size }) }}
        </BaseButton>
      </div>
    </div>

    <p v-if="!cargando && destinos.length === 0" class="mt-3 text-sm text-ink-muted">
      {{ aDocentes ? t('assignment.noTeachers') : t('assignment.noGroups') }}
    </p>
  </BaseCard>
</template>
