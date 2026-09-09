<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { ApiError, http } from '@/services/http';
import BaseButton from '@/design-system/BaseButton.vue';
import { useToast } from '@/composables/useToast';

/**
 * Cambio de contraseña.
 *
 * Es obligatorio la primera vez que se entra con una contraseña emitida por
 * administración: esa contraseña ha pasado por manos ajenas —se dicta en
 * clase, se imprime en un listado— y no debe seguir siendo la definitiva.
 *
 * Cambiarla revoca todas las sesiones, así que después hay que volver a
 * entrar. Es intencionado: si el motivo del cambio fuera una sospecha, dejar
 * sesiones vivas lo haría inútil.
 */

const auth = useAuthStore();
const router = useRouter();
const { t } = useI18n();
const toast = useToast();

const currentPassword = ref('');
const newPassword = ref('');
const confirmation = ref('');
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

/** Misma política que aplica el servidor, comprobada aquí para avisar antes. */
const policyIssues = computed<string[]>(() => {
  const value = newPassword.value;
  if (value.length === 0) return [];

  const issues: string[] = [];
  if (value.length < 10) issues.push(t('validation.minLength', { min: 10 }));
  if (!/[a-z]/.test(value)) issues.push(t('auth.passwordPolicy'));
  else if (!/[A-Z]/.test(value)) issues.push(t('auth.passwordPolicy'));
  else if (!/[0-9]/.test(value)) issues.push(t('auth.passwordPolicy'));
  return [...new Set(issues)];
});

const mismatch = computed(
  () => confirmation.value.length > 0 && confirmation.value !== newPassword.value,
);

const canSubmit = computed(
  () =>
    currentPassword.value.length > 0 &&
    newPassword.value.length > 0 &&
    policyIssues.value.length === 0 &&
    !mismatch.value,
);

async function submit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;

  try {
    await http.post('/auth/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    });

    // El servidor revocó todas las sesiones: la local ya no vale.
    auth.clear();
    toast.success(t('auth.passwordChanged'));
    await router.push({ name: 'login' });
  } catch (error) {
    errorMessage.value = error instanceof ApiError ? error.message : t('errors.generic');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
    <div class="w-full max-w-sm">
      <h1 class="mb-1 text-xl font-semibold">{{ t('auth.changePassword') }}</h1>
      <p class="mb-6 text-sm text-ink-muted">{{ t('auth.mustChangePassword') }}</p>

      <form
        class="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-card"
        @submit.prevent="submit"
      >
        <p
          v-if="errorMessage"
          class="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ errorMessage }}
        </p>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="current">{{ t('auth.currentPassword') }}</label>
          <input
            id="current"
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            required
            autofocus
            class="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="new">{{ t('auth.newPassword') }}</label>
          <input
            id="new"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            required
            class="h-10 rounded-md border bg-surface px-3 text-sm outline-none focus:border-brand-500"
            :class="policyIssues.length > 0 ? 'border-danger' : 'border-border'"
            :aria-invalid="policyIssues.length > 0"
            aria-describedby="policy-hint"
          />
          <p id="policy-hint" class="text-xs" :class="policyIssues.length > 0 ? 'text-danger' : 'text-ink-subtle'">
            {{ policyIssues[0] ?? t('auth.passwordPolicy') }}
          </p>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="confirm">{{ t('auth.newPassword') }}</label>
          <input
            id="confirm"
            v-model="confirmation"
            type="password"
            autocomplete="new-password"
            required
            class="h-10 rounded-md border bg-surface px-3 text-sm outline-none focus:border-brand-500"
            :class="mismatch ? 'border-danger' : 'border-border'"
            :aria-invalid="mismatch"
          />
          <p v-if="mismatch" class="text-xs text-danger" role="alert">
            {{ t('auth.passwordsDoNotMatch') }}
          </p>
        </div>

        <BaseButton type="submit" block :disabled="!canSubmit" :loading="submitting">
          {{ t('common.save') }}
        </BaseButton>
      </form>
    </div>
  </div>
</template>
