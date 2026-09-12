<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ROLE, type Role } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseButton from '@/design-system/BaseButton.vue';
import { useToast } from '@/composables/useToast';

/**
 * Cambiar los roles de una cuenta.
 *
 * El rol es lo que decide qué puede hacer alguien, así que esta ventana es la
 * más peligrosa de la administración y se comporta como tal: dice en una
 * frase qué concede cada rol, avisa al conceder administración y no deja
 * guardar una cuenta sin ningún rol, que quedaría dentro de la plataforma sin
 * poder hacer nada y sin que nadie entendiera por qué.
 */

const props = defineProps<{
  user: { id: string; firstName: string; lastName: string; roles: Role[] };
}>();

const emit = defineEmits<{ saved: []; cancel: [] }>();

const { t } = useI18n();
const toast = useToast();

const selected = ref<Role[]>([...props.user.roles]);
const saving = ref(false);
const dialogRef = ref<HTMLElement | null>(null);

onMounted(() => dialogRef.value?.focus());

const ALL_ROLES: Role[] = [ROLE.ADMIN, ROLE.TEACHER, ROLE.STUDENT];

function toggle(role: Role): void {
  selected.value = selected.value.includes(role)
    ? selected.value.filter((entry) => entry !== role)
    : [...selected.value, role];
}

const grantsAdmin = computed(
  () => selected.value.includes(ROLE.ADMIN) && !props.user.roles.includes(ROLE.ADMIN),
);

const canSave = computed(() => selected.value.length > 0);

async function save(): Promise<void> {
  saving.value = true;
  try {
    await http.put(`/users/${props.user.id}/roles`, { roles: selected.value });
    toast.success(t('common.saved'));
    emit('saved');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
    @click.self="emit('cancel')"
  >
    <div
      ref="dialogRef"
      tabindex="-1"
      class="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="roles-title"
      @keydown.esc="emit('cancel')"
    >
      <h2 id="roles-title" class="text-lg font-semibold">
        {{ t('users.rolesFor', { name: `${user.lastName}, ${user.firstName}` }) }}
      </h2>

      <ul class="mt-4 flex list-none flex-col gap-3 p-0">
        <li v-for="role in ALL_ROLES" :key="role">
          <label class="flex items-start gap-3">
            <input
              type="checkbox"
              class="mt-0.5 size-4 rounded border-border-strong"
              :checked="selected.includes(role)"
              @change="toggle(role)"
            />
            <span class="flex flex-col gap-0.5">
              <span class="text-sm font-medium">{{ t(`roles.${role}`) }}</span>
              <span class="text-xs text-ink-subtle">{{ t(`users.roleMeaning.${role}`) }}</span>
            </span>
          </label>
        </li>
      </ul>

      <!--
        El aviso solo aparece al **conceder** administración, no cada vez que
        se abre la ventana de alguien que ya la tiene: un aviso que sale
        siempre deja de leerse.
      -->
      <p
        v-if="grantsAdmin"
        class="mt-4 rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm"
        role="alert"
      >
        {{ t('users.grantAdminWarning') }}
      </p>

      <p v-if="!canSave" class="mt-4 text-sm text-danger">{{ t('users.needsRole') }}</p>

      <div class="mt-6 flex justify-end gap-2">
        <BaseButton variant="secondary" @click="emit('cancel')">{{
          t('common.cancel')
        }}</BaseButton>
        <BaseButton :loading="saving" :disabled="!canSave" @click="save">
          {{ t('common.save') }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
