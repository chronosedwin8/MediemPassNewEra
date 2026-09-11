<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { LANGUAGE, SUPPORTED_LANGUAGES, type Language } from '@medienpass/shared';
import { useAuthStore } from '@/stores/auth';
import { ApiError, http } from '@/services/http';
import { setLanguage, translateError } from '@/app/i18n';
import BaseButton from '@/design-system/BaseButton.vue';

/**
 * Pantalla de acceso.
 *
 * Ofrece los dos caminos que la institución necesita: la cuenta del colegio y
 * las credenciales propias. No son cuentas distintas, son dos formas de
 * demostrar la misma identidad, así que la pantalla no obliga a elegir un
 * "tipo de usuario" en ningún momento.
 */

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

const identifier = ref('');
const password = ref('');
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

const ssoEnabled = ref(false);

const languageNames: Record<Language, string> = {
  [LANGUAGE.ES]: 'Español',
  [LANGUAGE.DE]: 'Deutsch',
  [LANGUAGE.EN]: 'English',
};

onMounted(async () => {
  // El proveedor puede fallar al volver del flujo federado; ese fallo llega
  // como código en la URL y se traduce igual que cualquier otro error.
  const ssoError = route.query.ssoError;
  if (typeof ssoError === 'string') {
    errorMessage.value = translateError(ssoError);
    await router.replace({ query: {} });
  }

  try {
    const status = await http.get<{ enabled: boolean }>('/auth/sso/status');
    ssoEnabled.value = status.enabled;
  } catch {
    // Sin respuesta, simplemente no se ofrece el botón.
    ssoEnabled.value = false;
  }
});

function redirectTarget(): string {
  // Sin destino guardado se va al panel: la raíz es ahora la portada pública,
  // y devolver ahí a quien acaba de identificarse parecería que no ha entrado.
  return typeof route.query.redirect === 'string' ? route.query.redirect : '/panel';
}

/**
 * El flujo federado es una navegación completa, no una petición: el navegador
 * debe salir hacia el proveedor y volver.
 */
function signInWithSso(): void {
  const redirect = encodeURIComponent(redirectTarget());
  window.location.href = `/api/auth/sso/entra/start?redirect=${redirect}`;
}

async function submit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;

  try {
    const user = await auth.login(identifier.value.trim(), password.value);

    // Una contraseña emitida por administración se cambia antes de seguir.
    if (user.mustChangePassword) {
      await router.push({ name: 'change-password' });
      return;
    }

    await router.push(redirectTarget());
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
      <div class="mb-8 text-center">
        <div
          class="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-brand-600 text-ink-inverse"
        >
          <span class="text-xl font-bold">M</span>
        </div>
        <h1 class="text-2xl font-semibold">{{ t('app.name') }}</h1>
        <p class="mt-1 text-sm text-ink-muted">{{ t('auth.signInSubtitle') }}</p>
      </div>

      <div class="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-card">
        <p
          v-if="errorMessage"
          class="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ errorMessage }}
        </p>

        <!-- Cuenta del colegio, cuando el SSO está configurado. -->
        <template v-if="ssoEnabled">
          <BaseButton variant="secondary" block @click="signInWithSso">
            <svg class="size-4" viewBox="0 0 23 23" aria-hidden="true">
              <path fill="#f25022" d="M1 1h10v10H1z" />
              <path fill="#7fba00" d="M12 1h10v10H12z" />
              <path fill="#00a4ef" d="M1 12h10v10H1z" />
              <path fill="#ffb900" d="M12 12h10v10H12z" />
            </svg>
            {{ t('auth.ssoSignIn') }}
          </BaseButton>

          <div class="flex items-center gap-3">
            <span class="h-px flex-1 bg-border" aria-hidden="true" />
            <span class="text-xs text-ink-subtle">{{ t('auth.orUseCredentials') }}</span>
            <span class="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
        </template>

        <form class="flex flex-col gap-4" @submit.prevent="submit">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="identifier">{{ t('auth.identifier') }}</label>
            <input
              id="identifier"
              v-model="identifier"
              type="text"
              autocomplete="username"
              required
              autofocus
              class="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
              aria-describedby="identifier-hint"
            />
            <p id="identifier-hint" class="text-xs text-ink-subtle">
              {{ t('auth.identifierHint') }}
            </p>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="password">{{ t('auth.password') }}</label>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              required
              class="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
            />
          </div>

          <BaseButton type="submit" block :loading="submitting">
            {{ t('auth.signIn') }}
          </BaseButton>
        </form>
      </div>

      <div class="mt-6 flex justify-center">
        <label class="sr-only" for="login-language">{{ t('common.language') }}</label>
        <select
          id="login-language"
          class="h-9 rounded-md border border-border bg-surface px-2 text-sm text-ink-muted"
          :value="locale"
          @change="setLanguage(($event.target as HTMLSelectElement).value as Language)"
        >
          <option v-for="code in SUPPORTED_LANGUAGES" :key="code" :value="code">
            {{ languageNames[code] }}
          </option>
        </select>
      </div>
    </div>
  </div>
</template>
