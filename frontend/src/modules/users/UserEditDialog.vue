<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { USER_STATUS } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseButton from '@/design-system/BaseButton.vue';
import { useToast } from '@/composables/useToast';
import { LANGUAGE_OPTIONS } from '@/app/languages';

/**
 * Corregir los datos de una cuenta.
 *
 * Un apellido mal escrito, un correo que cambió, alguien que se va de baja
 * medio año. Sin esta pantalla la única salida era dar de baja la cuenta y
 * crear otra, lo cual rompe el historial: las evaluaciones que esa persona
 * corrigió quedan colgando de una cuenta muerta.
 *
 * El estado también se toca aquí. Suspender no es lo mismo que dar de baja:
 * la cuenta sigue existiendo con todo lo suyo y deja de poder entrar, que es
 * lo que hace falta durante una licencia.
 */

interface Cuenta {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  status: string;
}

const props = defineProps<{ user: Cuenta }>();
const emit = defineEmits<{ saved: []; cancel: [] }>();

const { t } = useI18n();
const toast = useToast();

const enviando = ref(false);

const form = reactive({
  firstName: props.user.firstName,
  lastName: props.user.lastName,
  email: props.user.email ?? '',
  status: props.user.status,
  preferredLanguage: 'es',
});

/** Los estados que una persona puede poner a mano. */
const ESTADOS = [
  USER_STATUS.ACTIVE,
  USER_STATUS.SUSPENDED,
  USER_STATUS.PENDING_ACTIVATION,
  USER_STATUS.INACTIVE,
];

const puedeGuardar = computed(
  () => form.firstName.trim().length > 0 && form.lastName.trim().length > 0 && !enviando.value,
);

async function guardar(): Promise<void> {
  enviando.value = true;
  try {
    await http.patch(`/users/${props.user.id}`, {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim() || null,
      status: form.status,
      preferredLanguage: form.preferredLanguage,
    });
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
    :aria-label="t('users.edit')"
  >
    <form
      class="flex w-full max-w-lg flex-col gap-4 rounded-lg bg-surface p-6 shadow-xl"
      @submit.prevent="guardar"
    >
      <header>
        <h2 class="text-lg font-semibold">{{ t('users.edit') }}</h2>
        <!-- El nombre de usuario no se toca: es con lo que esa persona entra. -->
        <p class="mt-1 font-mono text-sm text-ink-muted">{{ user.username }}</p>
      </header>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('users.firstName') }}</span>
          <input v-model="form.firstName" type="text" required :class="campo" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('users.lastName') }}</span>
          <input v-model="form.lastName" type="text" required :class="campo" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('users.email') }}</span>
          <input v-model="form.email" type="email" :class="campo" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('users.language') }}</span>
          <select v-model="form.preferredLanguage" :class="campo">
            <option v-for="o in LANGUAGE_OPTIONS" :key="o.code" :value="o.code">
              {{ o.label }}
            </option>
          </select>
        </label>
      </div>

      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t('users.status') }}</span>
        <select v-model="form.status" :class="campo">
          <option v-for="e in ESTADOS" :key="e" :value="e">{{ t(`users.statuses.${e}`) }}</option>
        </select>
        <span class="text-xs text-ink-subtle">{{ t('users.statusHint') }}</span>
      </label>

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
