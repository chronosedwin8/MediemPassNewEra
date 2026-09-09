<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { LANGUAGE, SUPPORTED_LANGUAGES, type Language } from '@medienpass/shared';
import { useAuthStore } from '@/stores/auth';
import { ApiError } from '@/services/http';
import { setLanguage } from '@/app/i18n';
import BaseButton from '@/design-system/BaseButton.vue';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

const identifier = ref('');
const password = ref('');
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

const languageNames: Record<Language, string> = {
  [LANGUAGE.ES]: 'Español',
  [LANGUAGE.DE]: 'Deutsch',
  [LANGUAGE.EN]: 'English',
};

async function submit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;

  try {
    await auth.login(identifier.value.trim(), password.value);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.push(redirect);
  } catch (error) {
    // El mensaje ya viene traducido desde el cliente HTTP, a partir del
    // código estable que emitió el servidor.
    errorMessage.value =
      error instanceof ApiError ? error.message : t('errors.generic');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
    <div class="w-full max-w-sm">
      <div class="mb-8 text-center">
        <div class="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-brand-600 text-ink-inverse">
          <span class="text-xl font-bold">M</span>
        </div>
        <h1 class="text-2xl font-semibold">{{ t('app.name') }}</h1>
        <p class="mt-1 text-sm text-ink-muted">{{ t('auth.signInSubtitle') }}</p>
      </div>

      <form class="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-card" @submit.prevent="submit">
        <!--
          Se anuncia como alerta para que un lector de pantalla lo lea sin que
          el usuario tenga que ir a buscarlo tras enviar el formulario.
        -->
        <p
          v-if="errorMessage"
          class="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ errorMessage }}
        </p>

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
            :aria-describedby="'identifier-hint'"
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
