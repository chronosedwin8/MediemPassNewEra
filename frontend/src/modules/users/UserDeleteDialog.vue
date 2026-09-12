<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { http, ApiError } from '@/services/http';
import BaseButton from '@/design-system/BaseButton.vue';
import { useToast } from '@/composables/useToast';

/**
 * Dar de baja una cuenta.
 *
 * Pide escribir el nombre de usuario antes de confirmar. No es ceremonia: en
 * una tabla de cuentas con nombres parecidos, el botón correcto y el de la
 * fila de al lado están a ocho píxeles, y aquí no hay deshacer en la interfaz.
 * Escribir el nombre obliga a mirar a quién se está dando de baja.
 *
 * Lo que ocurre por debajo no es un borrado: la fila se conserva para no
 * romper el historial académico —las evaluaciones que esa persona corrigió
 * siguen teniendo autor— y se liberan el usuario y el correo, que pueden
 * necesitar reasignarse. El diálogo lo dice, porque «eliminar» sugiere otra
 * cosa y quien lo pulse merece saber qué va a pasar.
 */

const props = defineProps<{
  user: { id: string; username: string; firstName: string; lastName: string };
}>();

const emit = defineEmits<{ deleted: []; cancel: [] }>();

const { t } = useI18n();
const toast = useToast();

const confirmacion = ref('');
const enviando = ref(false);

const nombre = computed(() => `${props.user.lastName}, ${props.user.firstName}`);
const puedeConfirmar = computed(
  () => confirmacion.value.trim() === props.user.username && !enviando.value,
);

async function eliminar(): Promise<void> {
  enviando.value = true;
  try {
    await http.delete(`/users/${props.user.id}`);
    toast.success(t('users.deleted', { name: nombre.value }));
    emit('deleted');
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
    role="dialog"
    aria-modal="true"
    :aria-label="t('users.deleteTitle')"
  >
    <div class="flex w-full max-w-lg flex-col gap-4 rounded-lg bg-surface p-6 shadow-xl">
      <header>
        <h2 class="text-lg font-semibold">{{ t('users.deleteTitle') }}</h2>
        <p class="mt-1 text-sm text-ink-muted">{{ t('users.deleteSubtitle', { name: nombre }) }}</p>
      </header>

      <div class="rounded-md border border-border bg-surface-muted p-3 text-sm text-ink-muted">
        <p>{{ t('users.deleteKeeps') }}</p>
        <p class="mt-2">{{ t('users.deleteFrees') }}</p>
      </div>

      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">
          {{ t('users.deleteConfirmLabel', { username: user.username }) }}
        </span>
        <input
          v-model="confirmacion"
          type="text"
          autocomplete="off"
          spellcheck="false"
          class="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
        />
      </label>

      <footer class="flex justify-end gap-2">
        <BaseButton variant="ghost" @click="emit('cancel')">{{ t('common.cancel') }}</BaseButton>
        <BaseButton
          variant="danger"
          :disabled="!puedeConfirmar"
          :loading="enviando"
          @click="eliminar"
        >
          {{ t('users.deleteConfirm') }}
        </BaseButton>
      </footer>
    </div>
  </div>
</template>
