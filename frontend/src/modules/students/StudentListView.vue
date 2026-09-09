<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { PERMISSION } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';
import { useToast } from '@/composables/useToast';

/**
 * Estudiantes y sus credenciales.
 *
 * Lo importante de esta pantalla es la emisión de credenciales: después de
 * sincronizar con Phidias llegan cientos de cuentas sin contraseña, y hasta
 * que alguien se las emite solo pueden entrar por SSO. Aquí se resuelve en un
 * paso, para todo un grupo o solo para quienes aún no pueden entrar.
 */

interface Student {
  id: string;
  userId: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  status: string;
  enrollmentStatus: string;
  groups: Array<{ id: string; code: string }>;
}

interface Group {
  id: string;
  code: string;
  studentCount: number;
}

interface IssuedCredential {
  studentId: string;
  username: string;
  email: string | null;
  fullName: string;
  password: string;
}

const auth = useAuthStore();
const { t } = useI18n();
const toast = useToast();

const students = ref<Student[]>([]);
const groups = ref<Group[]>([]);
const loading = ref(true);
const issuing = ref(false);

const showPanel = ref(false);
const targetGroupId = ref('');
const onlyWithoutCredentials = ref(true);
const sharedPassword = ref('');
const forceChange = ref(true);

const issued = ref<IssuedCredential[]>([]);

const canIssue = computed(() => auth.can(PERMISSION.USER_RESET_PASSWORD));

const pendingCount = computed(
  () => students.value.filter((student) => student.status === 'PENDING_ACTIVATION').length,
);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [studentList, groupList] = await Promise.all([
      http.list<Student>('/students', { pageSize: 100 }),
      http.list<Group>('/groups', { pageSize: 100 }),
    ]);
    students.value = studentList.items;
    groups.value = groupList.items;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function issue(): Promise<void> {
  issuing.value = true;
  issued.value = [];

  try {
    const result = await http.post<{ issued: IssuedCredential[] }>('/students/credentials', {
      groupId: targetGroupId.value || undefined,
      onlyWithoutCredentials: onlyWithoutCredentials.value,
      password: sharedPassword.value.trim() || undefined,
      mustChangePassword: forceChange.value,
    });

    issued.value = result.issued;
    showPanel.value = false;
    toast.success(t('student.issuedCount', { count: result.issued.length }));
    await load();
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    issuing.value = false;
  }
}

/** El listado se copia en texto tabulado, listo para pegar en una hoja. */
async function copyIssued(): Promise<void> {
  const header = ['Nombre', t('student.loginIdentifier'), t('auth.password')].join('\t');
  const rows = issued.value.map((entry) =>
    [entry.fullName, entry.email ?? entry.username, entry.password].join('\t'),
  );

  try {
    await navigator.clipboard.writeText([header, ...rows].join('\n'));
    toast.success(t('student.copied'));
  } catch {
    toast.error(t('errors.generic'));
  }
}
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else class="flex flex-col gap-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-ink-muted">
        {{ t('group.studentCount', { count: students.length }) }}
        <span v-if="pendingCount > 0" class="text-warning">
          · {{ pendingCount }} {{ t('student.noCredentials').toLowerCase() }}
        </span>
      </p>

      <BaseButton v-if="canIssue" @click="showPanel = !showPanel">
        {{ t('student.issueCredentials') }}
      </BaseButton>
    </div>

    <!-- Emisión de credenciales -->
    <BaseCard v-if="showPanel" :title="t('student.issueCredentials')">
      <div class="flex flex-col gap-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="target-group">{{
              t('student.issueForGroup')
            }}</label>
            <select
              id="target-group"
              v-model="targetGroupId"
              class="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
            >
              <option value="">{{ t('common.none') }}</option>
              <option v-for="group in groups" :key="group.id" :value="group.id">
                {{ group.code }} · {{ t('group.studentCount', { count: group.studentCount }) }}
              </option>
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="shared-password">
              {{ t('student.sharedPassword') }}
              <span class="font-normal text-ink-subtle">({{ t('common.optional') }})</span>
            </label>
            <input
              id="shared-password"
              v-model="sharedPassword"
              type="text"
              autocomplete="off"
              class="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
              aria-describedby="shared-hint"
            />
            <p id="shared-hint" class="text-xs text-ink-subtle">
              {{ t('student.sharedPasswordHint') }}
            </p>
          </div>
        </div>

        <label class="flex items-center gap-2 text-sm">
          <input v-model="onlyWithoutCredentials" type="checkbox" class="size-4 accent-brand-600" />
          {{ t('student.issueForPending') }}
        </label>

        <label class="flex items-center gap-2 text-sm">
          <input v-model="forceChange" type="checkbox" class="size-4 accent-brand-600" />
          {{ t('student.forceChange') }}
        </label>

        <div class="flex justify-end gap-2">
          <BaseButton variant="secondary" @click="showPanel = false">
            {{ t('common.cancel') }}
          </BaseButton>
          <BaseButton :loading="issuing" @click="issue">
            {{ t('student.issueCredentials') }}
          </BaseButton>
        </div>
      </div>
    </BaseCard>

    <!--
      Credenciales recién emitidas. Se muestran una sola vez: no se guardan en
      claro, así que si se pierden hay que volver a emitirlas.
    -->
    <BaseCard v-if="issued.length > 0" :title="t('student.issuedTitle')">
      <template #actions>
        <BaseButton size="sm" variant="secondary" @click="copyIssued">
          {{ t('student.copyAll') }}
        </BaseButton>
      </template>

      <p
        class="mb-4 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning"
      >
        {{ t('student.issuedWarning') }}
      </p>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr
              class="border-b border-border text-left text-xs uppercase tracking-wide text-ink-subtle"
            >
              <th class="pb-2 pr-4 font-medium">{{ t('student.title') }}</th>
              <th class="pb-2 pr-4 font-medium">{{ t('student.loginIdentifier') }}</th>
              <th class="pb-2 font-medium">{{ t('auth.password') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in issued" :key="entry.studentId" class="border-b border-border/50">
              <td class="py-2 pr-4">{{ entry.fullName }}</td>
              <td class="py-2 pr-4 font-mono text-xs">{{ entry.email ?? entry.username }}</td>
              <td class="py-2 font-mono">{{ entry.password }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </BaseCard>

    <!-- Listado -->
    <EmptyState v-if="students.length === 0" :title="t('common.noResults')" />

    <BaseCard v-else :padded="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr
              class="border-b border-border text-left text-xs uppercase tracking-wide text-ink-subtle"
            >
              <th class="p-4 font-medium">{{ t('student.title') }}</th>
              <th class="p-4 font-medium">{{ t('student.loginIdentifier') }}</th>
              <th class="p-4 font-medium">{{ t('nav.groups') }}</th>
              <th class="p-4 font-medium">{{ t('student.credentials') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="student in students" :key="student.id" class="border-b border-border/50">
              <td class="p-4">{{ student.firstName }} {{ student.lastName }}</td>
              <td class="p-4 font-mono text-xs text-ink-muted">
                {{ student.email ?? student.username }}
              </td>
              <td class="p-4 text-ink-muted">
                {{ student.groups.map((group) => group.code).join(', ') || '—' }}
              </td>
              <td class="p-4">
                <!-- El color nunca es la única señal: siempre va con texto. -->
                <BaseBadge :tone="student.status === 'ACTIVE' ? 'success' : 'warning'">
                  {{
                    student.status === 'ACTIVE'
                      ? t('student.canSignIn')
                      : t('student.pendingActivation')
                  }}
                </BaseBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </BaseCard>
  </div>
</template>
