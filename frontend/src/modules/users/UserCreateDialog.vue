<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { LANGUAGE, ROLE, type Role } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseButton from '@/design-system/BaseButton.vue';
import { useToast } from '@/composables/useToast';
import { LANGUAGE_OPTIONS } from '@/app/languages';

/**
 * Crear una cuenta.
 *
 * Faltaba por completo: la API sabía hacerlo desde el principio y la pantalla
 * de cuentas no ofrecía ninguna forma de llegar, así que la única manera de
 * dar de alta a alguien era escribir en la base de datos.
 *
 * Las dos formas de entrar se eligen aquí, y la diferencia importa más de lo
 * que parece:
 *
 *  - **Con la cuenta del colegio.** No se guarda contraseña. La cuenta nace
 *    pendiente y se activa la primera vez que esa persona entra con Microsoft.
 *    Es el camino sano: una credencial menos que custodiar, que caduca y se
 *    revoca donde ya se gestionan todas las demás del centro.
 *  - **Con contraseña temporal.** Para quien no tiene cuenta institucional.
 *    Se muestra una sola vez y hay que cambiarla al entrar.
 */

const emit = defineEmits<{ created: []; cancel: [] }>();

const { t } = useI18n();
const toast = useToast();

const enviando = ref(false);
/** La contraseña recién emitida. Se enseña una vez y no se recupera. */
const emitida = ref<{ nombre: string; password: string } | null>(null);

const form = reactive({
  firstName: '',
  lastName: '',
  username: '',
  email: '',
  roles: [ROLE.TEACHER] as Role[],
  preferredLanguage: LANGUAGE.ES as string,
  conPassword: false,
  password: '',
});

const ROLES: Role[] = [ROLE.ADMIN, ROLE.TEACHER, ROLE.STUDENT];

const passwordValida = computed(
  () =>
    !form.conPassword ||
    (form.password.length >= 10 &&
      /[a-z]/.test(form.password) &&
      /[A-Z]/.test(form.password) &&
      /\d/.test(form.password)),
);

const puedeGuardar = computed(
  () =>
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    form.username.trim().length >= 3 &&
    form.roles.length > 0 &&
    passwordValida.value &&
    !enviando.value,
);

function alternarRol(rol: Role): void {
  const indice = form.roles.indexOf(rol);
  if (indice === -1) form.roles.push(rol);
  else form.roles.splice(indice, 1);
}

async function guardar(): Promise<void> {
  enviando.value = true;
  try {
    await http.post('/users', {
      username: form.username.trim().toLowerCase(),
      email: form.email.trim() || null,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      preferredLanguage: form.preferredLanguage,
      roles: form.roles,
      ...(form.conPassword ? { password: form.password } : {}),
    });

    if (form.conPassword) {
      emitida.value = {
        nombre: `${form.lastName.trim()}, ${form.firstName.trim()}`,
        password: form.password,
      };
    } else {
      toast.success(t('users.created', { name: form.username.trim() }));
      emit('created');
    }
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
    :aria-label="t('users.createTitle')"
  >
    <!-- La contraseña emitida sustituye al formulario: no hay nada más que
         hacer aquí, y dejarla junto a los campos invita a cerrar sin copiarla. -->
    <div
      v-if="emitida"
      class="flex w-full max-w-lg flex-col gap-4 rounded-lg bg-surface p-6 shadow-xl"
    >
      <h2 class="text-lg font-semibold">{{ t('users.createdTitle') }}</h2>
      <p class="text-sm text-ink-muted">{{ t('users.createdOnce', { name: emitida.nombre }) }}</p>
      <p class="rounded-md border border-border bg-surface-muted p-3 font-mono text-lg">
        {{ emitida.password }}
      </p>
      <footer class="flex justify-end">
        <BaseButton @click="emit('created')">{{ t('common.close') }}</BaseButton>
      </footer>
    </div>

    <form
      v-else
      class="flex w-full max-w-lg flex-col gap-4 rounded-lg bg-surface p-6 shadow-xl"
      @submit.prevent="guardar"
    >
      <header>
        <h2 class="text-lg font-semibold">{{ t('users.createTitle') }}</h2>
        <p class="mt-1 text-sm text-ink-muted">{{ t('users.createSubtitle') }}</p>
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
          <span class="text-sm font-medium">{{ t('auth.identifier') }}</span>
          <input v-model="form.username" type="text" required autocomplete="off" :class="campo" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('users.email') }}</span>
          <input v-model="form.email" type="email" autocomplete="off" :class="campo" />
        </label>
      </div>

      <fieldset class="flex flex-col gap-2">
        <legend class="text-sm font-medium">{{ t('users.roles') }}</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="rol in ROLES"
            :key="rol"
            class="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
            :class="form.roles.includes(rol) ? 'border-brand-500 bg-brand-50' : ''"
          >
            <input
              type="checkbox"
              class="size-4 accent-brand-600"
              :checked="form.roles.includes(rol)"
              @change="alternarRol(rol)"
            />
            {{ t(`roles.${rol}`) }}
          </label>
        </div>
      </fieldset>

      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t('users.language') }}</span>
        <select v-model="form.preferredLanguage" :class="campo">
          <option v-for="o in LANGUAGE_OPTIONS" :key="o.code" :value="o.code">{{ o.label }}</option>
        </select>
      </label>

      <fieldset class="flex flex-col gap-2 rounded-md border border-border p-3">
        <legend class="px-1 text-sm font-medium">{{ t('users.howTheySignIn') }}</legend>

        <label class="flex cursor-pointer items-start gap-2 text-sm">
          <input v-model="form.conPassword" type="radio" :value="false" class="mt-1" />
          <span>
            {{ t('users.signInWithSso') }}
            <span class="block text-xs text-ink-subtle">{{ t('users.signInWithSsoHint') }}</span>
          </span>
        </label>

        <label class="flex cursor-pointer items-start gap-2 text-sm">
          <input v-model="form.conPassword" type="radio" :value="true" class="mt-1" />
          <span>
            {{ t('users.signInWithPassword') }}
            <span class="block text-xs text-ink-subtle">{{
              t('users.signInWithPasswordHint')
            }}</span>
          </span>
        </label>

        <label v-if="form.conPassword" class="mt-1 flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('auth.newPassword') }}</span>
          <input v-model="form.password" type="text" autocomplete="off" :class="campo" />
          <span class="text-xs" :class="passwordValida ? 'text-ink-subtle' : 'text-danger'">
            {{ t('auth.passwordRule') }}
          </span>
        </label>
      </fieldset>

      <footer class="flex justify-end gap-2">
        <BaseButton variant="ghost" type="button" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </BaseButton>
        <BaseButton type="submit" :disabled="!puedeGuardar" :loading="enviando">
          {{ t('users.create') }}
        </BaseButton>
      </footer>
    </form>
  </div>
</template>
