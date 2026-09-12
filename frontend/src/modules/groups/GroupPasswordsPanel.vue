<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import { useToast } from '@/composables/useToast';

/**
 * Restablecer la contraseña de todo un grupo.
 *
 * Existe porque el curso empieza con treinta cuentas sin estrenar y hacerlo de
 * una en una es media mañana. Es la operación más ancha de la plataforma, así
 * que la pantalla está construida para que cueste hacerla sin querer: pide
 * escribir el código del grupo, avisa de lo que implica cada modo y enseña las
 * credenciales una sola vez.
 *
 * De los dos modos, el individual es el predeterminado. Una contraseña
 * compartida es cómoda de dictar, pero hasta que cada uno la cambie cualquiera
 * del grupo puede entrar como cualquier otro, y eso significa ver las notas y
 * los trabajos de un compañero.
 */

const props = defineProps<{ groupId: string; groupCode: string; studentCount: number }>();

const { t } = useI18n();
const toast = useToast();

interface IssuedCredential {
  userId: string;
  username: string;
  fullName: string;
  code: string | null;
  password: string;
}

const open = ref(false);
const mode = ref<'individual' | 'shared'>('individual');
const sharedPassword = ref('');
const confirmation = ref('');
const running = ref(false);
const issued = ref<IssuedCredential[] | null>(null);

const confirmed = computed(
  () => confirmation.value.trim().toUpperCase() === props.groupCode.toUpperCase(),
);

const sharedValid = computed(() => mode.value !== 'shared' || sharedPassword.value.length >= 10);

const canRun = computed(() => confirmed.value && sharedValid.value && props.studentCount > 0);

async function run(): Promise<void> {
  running.value = true;
  try {
    const result = await http.post<{ issued: IssuedCredential[] }>(
      `/groups/${props.groupId}/reset-student-passwords`,
      {
        mode: mode.value,
        ...(mode.value === 'shared' ? { password: sharedPassword.value } : {}),
      },
    );
    issued.value = result.issued;
    confirmation.value = '';
    sharedPassword.value = '';
    toast.success(t('groupPasswords.done', { count: result.issued.length }));
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    running.value = false;
  }
}

/**
 * Descarga el listado como CSV.
 *
 * Se arma en el navegador a partir de lo que ya está en pantalla y no se pide
 * al servidor: las contraseñas viajaron una vez y no existen en ningún sitio
 * del que se puedan volver a pedir. Es también el aviso implícito de que este
 * archivo es sensible y de que su sitio no es la carpeta de descargas.
 */
function downloadCsv(): void {
  if (!issued.value) return;

  const header = ['codigo', 'usuario', 'nombre', 'contrasena'];
  const rows = issued.value.map((entry) => [
    entry.code ?? '',
    entry.username,
    entry.fullName,
    entry.password,
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');

  /*
   * La marca de orden de bytes va delante: sin ella, Excel abre el CSV en la
   * codificación del sistema y los apellidos con tilde salen rotos, que es
   * medio listado de un colegio alemán en Colombia.
   *
   * Se compone con `fromCharCode` y no con el escape literal porque el
   * formateador convierte el escape en el carácter invisible, y entonces el
   * linter lo marca como espacio irregular con razón: nadie que lea el archivo
   * puede ver que está ahí.
   */
  const bom = String.fromCharCode(0xfeff);
  const url = URL.createObjectURL(new Blob([bom + csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `contrasenas-${props.groupCode}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const inputClass =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <BaseCard :title="t('groupPasswords.title')">
    <p class="text-sm text-ink-muted">{{ t('groupPasswords.intro') }}</p>

    <BaseButton v-if="!open && !issued" class="mt-4" variant="secondary" @click="open = true">
      {{ t('groupPasswords.start') }}
    </BaseButton>

    <div v-else-if="!issued" class="mt-4 flex flex-col gap-4">
      <fieldset class="flex flex-col gap-3">
        <legend class="text-sm font-medium">{{ t('groupPasswords.mode') }}</legend>

        <label class="flex items-start gap-3">
          <input v-model="mode" type="radio" value="individual" class="mt-1" />
          <span class="flex flex-col gap-0.5">
            <span class="text-sm font-medium">{{ t('groupPasswords.individual') }}</span>
            <span class="text-xs text-ink-subtle">{{ t('groupPasswords.individualHint') }}</span>
          </span>
        </label>

        <label class="flex items-start gap-3">
          <input v-model="mode" type="radio" value="shared" class="mt-1" />
          <span class="flex flex-col gap-0.5">
            <span class="text-sm font-medium">{{ t('groupPasswords.shared') }}</span>
            <span class="text-xs text-ink-subtle">{{ t('groupPasswords.sharedHint') }}</span>
          </span>
        </label>
      </fieldset>

      <!--
        El aviso del modo compartido no es una formalidad: hasta que cada uno
        la cambie, cualquiera del grupo puede entrar como cualquier otro y ver
        sus notas. Quien lo elija tiene que haberlo leído.
      -->
      <p
        v-if="mode === 'shared'"
        class="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm"
        role="alert"
      >
        {{ t('groupPasswords.sharedWarning') }}
      </p>

      <label v-if="mode === 'shared'" class="flex max-w-sm flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t('groupPasswords.sharedPassword') }}</span>
        <input v-model="sharedPassword" type="text" minlength="10" :class="inputClass" />
        <span class="text-xs text-ink-subtle">{{ t('groupPasswords.sharedPasswordHint') }}</span>
      </label>

      <label class="flex max-w-sm flex-col gap-1.5">
        <span class="text-sm font-medium">
          {{ t('groupPasswords.confirm', { code: groupCode }) }}
        </span>
        <input v-model="confirmation" type="text" :class="inputClass" />
        <span class="text-xs text-ink-subtle">
          {{ t('groupPasswords.confirmHint', { count: studentCount }) }}
        </span>
      </label>

      <div class="flex gap-2">
        <BaseButton variant="danger" :loading="running" :disabled="!canRun" @click="run">
          {{ t('groupPasswords.run', { count: studentCount }) }}
        </BaseButton>
        <BaseButton variant="ghost" @click="open = false">{{ t('common.cancel') }}</BaseButton>
      </div>
    </div>

    <!-- El resultado. Se enseña una vez y no se puede volver a consultar. -->
    <div v-else class="mt-4 flex flex-col gap-3">
      <p class="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm" role="alert">
        {{ t('groupPasswords.onceOnly') }}
      </p>

      <div class="flex flex-wrap gap-2">
        <BaseButton size="sm" @click="downloadCsv">{{ t('groupPasswords.download') }}</BaseButton>
        <BaseButton
          size="sm"
          variant="secondary"
          @click="
            issued = null;
            open = false;
          "
        >
          {{ t('groupPasswords.finish') }}
        </BaseButton>
      </div>

      <div class="overflow-x-auto rounded-lg border border-border">
        <table class="w-full min-w-[32rem] border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-border bg-surface-muted">
              <th scope="col" class="px-3 py-2 font-semibold">{{ t('users.name') }}</th>
              <th scope="col" class="px-3 py-2 font-semibold">{{ t('auth.identifier') }}</th>
              <th scope="col" class="px-3 py-2 font-semibold">{{ t('auth.password') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in issued"
              :key="entry.userId"
              class="border-b border-border last:border-0"
            >
              <th scope="row" class="px-3 py-2 text-left font-normal">{{ entry.fullName }}</th>
              <td class="px-3 py-2 text-ink-muted">{{ entry.username }}</td>
              <td class="px-3 py-2 font-mono">{{ entry.password }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </BaseCard>
</template>
