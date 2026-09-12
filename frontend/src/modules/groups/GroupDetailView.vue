<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ENROLLMENT_STATUS, localize, type LocalizedText } from '@medienpass/shared';
import { http } from '@/services/http';
import { useToast } from '@/composables/useToast';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';
import GroupPasswordsPanel from './GroupPasswordsPanel.vue';
import GroupTeachersPanel from './GroupTeachersPanel.vue';
import GroupMembersPicker from './GroupMembersPicker.vue';
import { useAuthStore } from '@/stores/auth';

/**
 * Los estudiantes de un grupo.
 *
 * El listado de grupos decía cuántos estudiantes hay pero no quiénes son, que
 * es justo lo que un docente necesita para saber a quién le está asignando una
 * evaluación y quién le falta por entregar.
 *
 * El alcance lo aplica el servidor: pedir un grupo ajeno devuelve 403 y aquí
 * se muestra como tal, sin listas a medias.
 */

interface Group {
  id: string;
  code: string;
  name: string;
  studentCount: number;
  gradeLevel: { code: string; name: LocalizedText };
  subject: { code: string } | null;
  homeroomTeacher: { firstName: string; lastName: string } | null;
  teachers?: Array<{
    teacher: { id: string; firstName: string; lastName: string };
    subject: { id: string; code: string } | null;
  }>;
  academicYear?: { code: string } | null;
}

interface Member {
  studentId: string;
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string | null;
  enrollmentStatus: string;
  joinedAt: string;
}

const route = useRoute();
const router = useRouter();
const { t, locale, d } = useI18n();
const toast = useToast();

const group = ref<Group | null>(null);
const auth = useAuthStore();

const members = ref<Member[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const search = ref('');

const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase();
  if (!needle) return members.value;
  return members.value.filter((member) =>
    `${member.firstName} ${member.lastName} ${member.email ?? ''}`.toLowerCase().includes(needle),
  );
});

/** Un curso de treinta no se lee igual que uno de tres: conviene el recuento. */
const withoutEmail = computed(() => members.value.filter((member) => !member.email).length);

const quitando = ref<string | null>(null);
const borrando = ref(false);
const confirmaBorrado = ref('');

/**
 * Da de baja el grupo.
 *
 * No borra estudiantes ni intentos: el grupo deja de existir y sus miembros
 * siguen matriculados en los suyos. Pide escribir el código porque, en una
 * lista de K10A, K10B y K10C, el grupo equivocado está a un renglón.
 */
async function borrar(): Promise<void> {
  borrando.value = true;
  try {
    await http.delete(`/groups/${route.params['id'] as string}`);
    toast.success(t('group.deleted', { code: group.value?.code ?? '' }));
    await router.push('/groups');
  } catch (caught) {
    toast.error(caught instanceof Error ? caught.message : t('errors.generic'));
  } finally {
    borrando.value = false;
  }
}

/**
 * Saca a alguien del grupo.
 *
 * No borra al estudiante ni sus intentos: deja de pertenecer, y eso basta
 * porque una electiva se arma a mano y a mano se corrige. Sin esto, meter a
 * quien no era obligaba a rehacer el grupo entero.
 */
async function quitar(member: Member): Promise<void> {
  quitando.value = member.studentId;
  try {
    await http.delete(`/groups/${route.params['id'] as string}/members/${member.studentId}`);
    toast.success(t('group.memberRemoved'));
    await load();
  } catch (caught) {
    toast.error(caught instanceof Error ? caught.message : t('errors.generic'));
  } finally {
    quitando.value = null;
  }
}

/** Con nombre para poder releer tras cambiar el claustro. */
async function load(): Promise<void> {
  const id = route.params['id'] as string;
  try {
    const [groupData, memberData] = await Promise.all([
      http.get<Group>(`/groups/${id}`),
      http.get<Member[]>(`/groups/${id}/members`),
    ]);
    group.value = groupData;
    members.value = memberData;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : t('errors.generic');
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/**
 * Color de la insignia según la matrícula.
 *
 * Solo `ACTIVE` y `ENROLLED` cuentan como matrícula evaluable; el resto se
 * marca para que se vea de un vistazo por qué alguien no aparece en una
 * asignación. El color acompaña al texto, nunca lo sustituye.
 */
function statusTone(status: string): 'success' | 'warning' | 'neutral' {
  if (status === ENROLLMENT_STATUS.ACTIVE || status === ENROLLMENT_STATUS.ENROLLED) {
    return 'success';
  }
  if (status === ENROLLMENT_STATUS.WITHDRAWN || status === ENROLLMENT_STATUS.UNKNOWN) {
    return 'neutral';
  }
  return 'warning';
}
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <EmptyState v-else-if="error" :title="error" />

  <div v-else-if="group" class="flex flex-col gap-5">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <RouterLink to="/groups" class="text-sm text-ink-muted hover:underline">
          ← {{ t('nav.groups') }}
        </RouterLink>
        <h1 class="mt-1 text-2xl font-semibold">{{ group.code }}</h1>
        <p class="mt-1 text-sm text-ink-muted">
          {{ localize(group.gradeLevel.name, locale as never) }}
          <span v-if="group.subject"> · {{ group.subject.code }}</span>
          <span v-if="group.academicYear"> · {{ group.academicYear.code }}</span>
        </p>
        <p v-if="group.homeroomTeacher" class="mt-1 text-xs text-ink-subtle">
          {{ t('group.homeroomTeacher') }}: {{ group.homeroomTeacher.firstName }}
          {{ group.homeroomTeacher.lastName }}
        </p>
      </div>

      <div class="text-right">
        <p class="text-3xl font-semibold tabular-nums">{{ members.length }}</p>
        <p class="text-xs text-ink-subtle">{{ t('group.students') }}</p>
      </div>
    </header>

    <!--
      El aviso solo aparece si hay a quién avisar. Un contador en cero ocupando
      espacio permanente enseña a ignorar el sitio donde luego saldrá algo real.
    -->
    <BaseCard v-if="withoutEmail > 0" class="border-warning/40 bg-warning/5">
      <p class="text-sm">{{ t('group.withoutEmail', { count: withoutEmail }) }}</p>
    </BaseCard>

    <!--
      Quién da clase aquí.
      
      Es lo que decide qué grupos ve cada docente, así que vive en la ficha del
      grupo y no escondido en administración: lo sabe quien lleva el curso.
    -->
    <BaseCard v-if="group && auth.can('group:update')" class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">{{ t('group.teachers') }}</h2>
      <GroupTeachersPanel
        :key="group.teachers?.length ?? 0"
        :group-id="group.id"
        :iniciales="group.teachers ?? []"
        @saved="load()"
      />
    </BaseCard>

    <!--
      Dar de baja el grupo. Al final y en su propia tarjeta: es lo último que
      alguien quiere encontrarse por accidente mientras administra miembros.
    -->
    <BaseCard v-if="group && auth.can('group:delete')" class="border-danger/40">
      <h2 class="text-base font-semibold">{{ t('group.delete') }}</h2>
      <p class="mt-1 text-sm text-ink-muted">
        {{ t('group.deleteConfirm', { code: group.code }) }}
      </p>
      <div class="mt-3 flex flex-wrap items-end gap-2">
        <input
          v-model="confirmaBorrado"
          type="text"
          autocomplete="off"
          :placeholder="group.code"
          class="h-9 w-40 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
        />
        <BaseButton
          variant="danger"
          :disabled="confirmaBorrado.trim() !== group.code || borrando"
          :loading="borrando"
          @click="borrar"
        >
          {{ t('group.delete') }}
        </BaseButton>
      </div>
    </BaseCard>

    <!--
      Añadir estudiantes sueltos.
      
      Los cursos completos llegan de Phidias; esto es para lo que Phidias no
      sabe: una electiva que junta gente de varios cursos.
    -->
    <BaseCard v-if="group && auth.can('group:manage_members')" class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">{{ t('group.addStudents') }}</h2>
      <GroupMembersPicker
        :group-id="group.id"
        :ya-dentro="members.map((m) => m.studentId)"
        @added="load()"
      />
    </BaseCard>

    <!--
      Solo para administración: restablecer las contraseñas de un curso entero
      es la operación más ancha de la plataforma y no corresponde a quien da
      clase, aunque dirija el grupo.
    -->
    <GroupPasswordsPanel
      v-if="group && auth.can('user:reset_password') && members.length > 0"
      :group-id="group.id"
      :group-code="group.code"
      :student-count="members.length"
    />

    <EmptyState v-if="members.length === 0" :title="t('group.noStudents')" />

    <template v-else>
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t('common.search') }}</span>
        <input
          v-model="search"
          type="search"
          class="h-9 max-w-sm rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
        />
      </label>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[36rem] text-sm">
          <caption class="sr-only">
            {{
              t('group.students')
            }}
          </caption>
          <thead>
            <tr
              class="border-b border-border text-left text-xs uppercase tracking-wide text-ink-subtle"
            >
              <th class="pb-2 pr-4 font-medium">{{ t('student.name') }}</th>
              <th class="pb-2 pr-4 font-medium">{{ t('student.email') }}</th>
              <th class="pb-2 pr-4 font-medium">{{ t('student.status') }}</th>
              <th class="pb-2 font-medium">{{ t('group.joinedAt') }}</th>
              <th v-if="auth.can('group:manage_members')" class="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="member in filtered"
              :key="member.studentId"
              class="border-b border-border/50"
            >
              <td class="py-2 pr-4 font-medium">{{ member.lastName }}, {{ member.firstName }}</td>
              <td class="py-2 pr-4 text-ink-muted">
                <span v-if="member.email">{{ member.email }}</span>
                <span v-else class="text-ink-subtle">{{ t('student.noEmail') }}</span>
              </td>
              <td class="py-2 pr-4">
                <BaseBadge :tone="statusTone(member.enrollmentStatus)">
                  {{ t(`enrollment.${member.enrollmentStatus}`) }}
                </BaseBadge>
              </td>
              <td class="py-2 text-ink-muted tabular-nums">
                {{ d(new Date(member.joinedAt), 'short') }}
              </td>
              <td v-if="auth.can('group:manage_members')" class="py-2 text-right">
                <BaseButton
                  variant="ghost"
                  size="sm"
                  class="text-danger hover:text-danger"
                  :loading="quitando === member.studentId"
                  @click="quitar(member)"
                >
                  {{ t('common.remove') }}
                </BaseButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="filtered.length === 0" class="text-sm text-ink-subtle">
        {{ t('common.noResults') }}
      </p>
    </template>
  </div>
</template>
