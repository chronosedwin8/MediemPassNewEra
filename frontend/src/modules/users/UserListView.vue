<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ROLE, type Role } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';
import UserRolesDialog from './UserRolesDialog.vue';
import { useToast } from '@/composables/useToast';

/**
 * Personal y cuentas de la plataforma.
 *
 * Nace de una pregunta que no se podía responder: quién es docente y quién es
 * administrador. Los listados que había eran de estudiantes y de profesorado
 * por separado, y ninguno enseñaba los roles, de modo que la única forma de
 * saber si una cuenta podía tocarlo todo era mirarla en la base.
 *
 * Por eso lo primero que se ve son docentes y administración juntos, con sus
 * roles al lado: es la vista que contesta esa pregunta. El alumnado está a un
 * clic, pero no es lo que trae aquí a nadie.
 */

interface UserSummary {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  status: string;
  roles: Role[];
  lastLoginAt: string | null;
}

const { t, d } = useI18n();
const toast = useToast();

const users = ref<UserSummary[]>([]);
const total = ref(0);
const loading = ref(true);
const search = ref('');

/** Docentes y administración juntos: la pregunta que trae a esta pantalla. */
const STAFF = `${ROLE.ADMIN},${ROLE.TEACHER}`;

const scope = ref<string>(STAFF);

const SCOPES = [
  { value: STAFF, labelKey: 'users.scope.staff' },
  { value: ROLE.ADMIN, labelKey: 'users.scope.admin' },
  { value: ROLE.TEACHER, labelKey: 'users.scope.teacher' },
  { value: ROLE.STUDENT, labelKey: 'users.scope.student' },
];

const editing = ref<UserSummary | null>(null);
const resettingId = ref<string | null>(null);
/** Contraseña recién emitida. Se enseña una vez y no se vuelve a poder ver. */
const issued = ref<{ name: string; password: string } | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await http.list<UserSummary>('/users', {
      roles: scope.value,
      search: search.value || undefined,
      pageSize: 100,
      sort: 'lastName',
      order: 'asc',
    });
    users.value = result.items;
    total.value = result.meta.total;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch([scope, search], load);

const roleTone: Record<string, 'danger' | 'info' | 'neutral'> = {
  [ROLE.ADMIN]: 'danger',
  [ROLE.TEACHER]: 'info',
  [ROLE.STUDENT]: 'neutral',
};

const statusTone: Record<string, 'success' | 'warning' | 'neutral'> = {
  ACTIVE: 'success',
  PENDING_ACTIVATION: 'warning',
  SUSPENDED: 'neutral',
  INACTIVE: 'neutral',
};

const adminCount = computed(
  () => users.value.filter((user) => user.roles.includes(ROLE.ADMIN)).length,
);

/**
 * Restablece la contraseña de una persona y la enseña una sola vez.
 *
 * El servidor genera la temporal, obliga a cambiarla al entrar y cierra las
 * sesiones abiertas. Aquí solo se muestra: si se cierra el aviso sin copiarla,
 * hay que volver a lanzarlo.
 */
async function resetPassword(user: UserSummary): Promise<void> {
  resettingId.value = user.id;
  try {
    const result = await http.post<{ temporaryPassword: string }>(
      `/users/${user.id}/reset-password`,
      {},
    );
    issued.value = {
      name: `${user.lastName}, ${user.firstName}`,
      password: result.temporaryPassword,
    };
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    resettingId.value = null;
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="option in SCOPES"
          :key="option.value"
          type="button"
          :aria-pressed="scope === option.value"
          :class="[
            'rounded-md border px-3 py-1.5 text-sm transition-colors',
            scope === option.value
              ? 'border-brand-600 bg-brand-600 font-medium text-ink-inverse'
              : 'border-border-strong bg-surface text-ink-muted hover:bg-surface-muted',
          ]"
          @click="scope = option.value"
        >
          {{ t(option.labelKey) }}
        </button>
      </div>

      <label class="flex flex-col gap-1.5">
        <span class="sr-only">{{ t('common.search') }}</span>
        <input
          v-model="search"
          type="search"
          class="h-9 w-64 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
          :placeholder="t('users.searchPlaceholder')"
        />
      </label>
    </div>

    <!--
      Se dice cuántas cuentas pueden hacerlo todo. Es la cifra que alguien
      debería mirar de vez en cuando y que, sin esta pantalla, no existía.
    -->
    <p v-if="!loading" class="text-sm text-ink-muted">
      {{ t('users.summary', { total, admins: adminCount }) }}
    </p>

    <!-- La contraseña emitida, una sola vez. -->
    <div
      v-if="issued"
      class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning bg-warning-soft px-4 py-3"
      role="alert"
    >
      <div class="text-sm">
        <p class="font-medium">{{ t('users.temporaryFor', { name: issued.name }) }}</p>
        <p class="mt-1 font-mono text-base">{{ issued.password }}</p>
        <p class="mt-1 text-xs">{{ t('users.temporaryHint') }}</p>
      </div>
      <BaseButton variant="secondary" size="sm" @click="issued = null">
        {{ t('common.close') }}
      </BaseButton>
    </div>

    <BaseSpinner v-if="loading" size="lg" />

    <EmptyState
      v-else-if="users.length === 0"
      :title="t('users.empty')"
      :description="t('users.emptyHint')"
    />

    <BaseCard v-else>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[44rem] border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-border">
              <th scope="col" class="px-3 py-2 font-semibold">{{ t('users.name') }}</th>
              <th scope="col" class="px-3 py-2 font-semibold">{{ t('auth.identifier') }}</th>
              <th scope="col" class="px-3 py-2 font-semibold">{{ t('users.roles') }}</th>
              <th scope="col" class="px-3 py-2 font-semibold">{{ t('users.status') }}</th>
              <th scope="col" class="px-3 py-2 font-semibold">{{ t('users.lastLogin') }}</th>
              <th scope="col" class="px-3 py-2 font-semibold">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in users"
              :key="user.id"
              class="border-b border-border last:border-0 hover:bg-surface-muted"
            >
              <th scope="row" class="px-3 py-2 text-left font-medium">
                {{ user.lastName }}, {{ user.firstName }}
              </th>
              <td class="px-3 py-2 text-ink-muted">{{ user.username }}</td>
              <td class="px-3 py-2">
                <span class="flex flex-wrap gap-1">
                  <BaseBadge
                    v-for="role in user.roles"
                    :key="role"
                    :tone="roleTone[role] ?? 'neutral'"
                  >
                    {{ t(`roles.${role}`) }}
                  </BaseBadge>
                </span>
              </td>
              <td class="px-3 py-2">
                <BaseBadge :tone="statusTone[user.status] ?? 'neutral'">
                  {{ t(`users.statuses.${user.status}`) }}
                </BaseBadge>
              </td>
              <td class="px-3 py-2 text-xs text-ink-subtle">
                {{ user.lastLoginAt ? d(new Date(user.lastLoginAt), 'short') : t('users.never') }}
              </td>
              <td class="px-3 py-2">
                <span class="flex flex-wrap gap-2">
                  <BaseButton variant="secondary" size="sm" @click="editing = user">
                    {{ t('users.editRoles') }}
                  </BaseButton>
                  <BaseButton
                    variant="ghost"
                    size="sm"
                    :loading="resettingId === user.id"
                    @click="resetPassword(user)"
                  >
                    {{ t('users.resetPassword') }}
                  </BaseButton>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </BaseCard>

    <UserRolesDialog
      v-if="editing"
      :user="editing"
      @saved="
        editing = null;
        load();
      "
      @cancel="editing = null"
    />
  </div>
</template>
