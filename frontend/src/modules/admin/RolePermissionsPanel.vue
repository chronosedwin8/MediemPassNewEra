<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Permission } from '@medienpass/shared';
import { http } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import { useToast } from '@/composables/useToast';

/**
 * Qué puede hacer cada rol.
 *
 * Antes esto vivía solo en la semilla, así que quitarle a los docentes el uso
 * de la IA exigía tocar código y desplegar. Aquí se marca y se guarda.
 *
 * El rol de administrador aparece bloqueado a propósito: si se le pudieran
 * quitar permisos, bastaría un descuido para dejar la instalación sin nadie
 * capaz de devolvérselos, y la única salida sería entrar a la base de datos.
 */

interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  userCount: number;
  permissions: Permission[];
  editable: boolean;
}

interface CatalogEntry {
  resource: string;
  permissions: Permission[];
}

const { t } = useI18n();
const toast = useToast();

const roles = ref<Role[]>([]);
const catalog = ref<CatalogEntry[]>([]);
const selectedId = ref<string | null>(null);
const draft = ref<Set<Permission>>(new Set());
const loading = ref(true);
const saving = ref(false);

const selected = () => roles.value.find((role) => role.id === selectedId.value) ?? null;

function select(role: Role): void {
  selectedId.value = role.id;
  draft.value = new Set(role.permissions);
}

function toggle(permission: Permission): void {
  const next = new Set(draft.value);
  if (next.has(permission)) next.delete(permission);
  else next.add(permission);
  draft.value = next;
}

/** Marca o desmarca un bloque entero: revisar 80 casillas de una en una cansa. */
function toggleResource(entry: CatalogEntry, enable: boolean): void {
  const next = new Set(draft.value);
  for (const permission of entry.permissions) {
    if (enable) next.add(permission);
    else next.delete(permission);
  }
  draft.value = next;
}

function resourceState(entry: CatalogEntry): 'all' | 'some' | 'none' {
  const granted = entry.permissions.filter((permission) => draft.value.has(permission)).length;
  if (granted === 0) return 'none';
  return granted === entry.permissions.length ? 'all' : 'some';
}

async function load(): Promise<void> {
  const [roleData, catalogData] = await Promise.all([
    http.get<Role[]>('/roles'),
    http.get<CatalogEntry[]>('/roles/permissions'),
  ]);
  roles.value = roleData;
  catalog.value = catalogData;

  const current = roleData.find((role) => role.id === selectedId.value) ?? roleData[0];
  if (current) select(current);
}

onMounted(async () => {
  try {
    await load();
  } finally {
    loading.value = false;
  }
});

async function save(): Promise<void> {
  const role = selected();
  if (!role) return;

  saving.value = true;
  try {
    await http.put(`/roles/${role.id}/permissions`, { permissions: [...draft.value] });
    await load();
    toast.success(t('common.saved'));
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('errors.generic'));
  } finally {
    saving.value = false;
  }
}

async function reset(): Promise<void> {
  const role = selected();
  if (!role) return;

  saving.value = true;
  try {
    await http.post(`/roles/${role.id}/reset`);
    await load();
    toast.success(t('admin.roles.reset'));
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('errors.generic'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else class="grid gap-4 lg:grid-cols-[16rem_1fr]">
    <!-- Roles -->
    <nav class="flex flex-col gap-2" :aria-label="t('admin.tabs.roles')">
      <button
        v-for="role in roles"
        :key="role.id"
        type="button"
        class="rounded-lg border p-3 text-left"
        :class="
          selectedId === role.id
            ? 'border-brand-500 bg-brand-50'
            : 'border-border hover:bg-surface-muted'
        "
        @click="select(role)"
      >
        <span class="flex items-center justify-between gap-2">
          <span class="font-medium">{{ role.name }}</span>
          <BaseBadge v-if="!role.editable" tone="neutral">{{ t('admin.roles.locked') }}</BaseBadge>
        </span>
        <span class="mt-1 block text-xs text-ink-subtle">
          {{ t('admin.roles.userCount', { count: role.userCount }) }} ·
          {{ t('admin.roles.permissionCount', { count: role.permissions.length }) }}
        </span>
      </button>
    </nav>

    <!-- Permisos del rol elegido -->
    <BaseCard v-if="selected()" class="flex flex-col gap-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">{{ selected()!.name }}</h2>
          <p v-if="selected()!.description" class="mt-1 text-sm text-ink-muted">
            {{ selected()!.description }}
          </p>
        </div>
        <div class="flex gap-2">
          <BaseButton
            v-if="selected()!.editable"
            variant="secondary"
            size="sm"
            :loading="saving"
            @click="reset"
          >
            {{ t('admin.roles.resetAction') }}
          </BaseButton>
          <BaseButton v-if="selected()!.editable" size="sm" :loading="saving" @click="save">
            {{ t('common.save') }}
          </BaseButton>
        </div>
      </div>

      <p
        v-if="!selected()!.editable"
        class="rounded-md bg-surface-muted p-3 text-sm text-ink-muted"
      >
        {{ t('admin.roles.adminLocked') }}
      </p>

      <fieldset
        v-for="entry in catalog"
        :key="entry.resource"
        class="border-t border-border pt-3"
        :disabled="!selected()!.editable"
      >
        <legend class="flex items-center gap-2 text-sm font-medium">
          {{ t(`admin.resource.${entry.resource}`) }}
          <button
            type="button"
            class="text-xs font-normal text-brand-600 hover:underline"
            @click="toggleResource(entry, resourceState(entry) !== 'all')"
          >
            {{ resourceState(entry) === 'all' ? t('admin.roles.none') : t('admin.roles.all') }}
          </button>
        </legend>

        <div class="mt-2 flex flex-wrap gap-2">
          <label
            v-for="permission in entry.permissions"
            :key="permission"
            class="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1 text-xs"
            :class="draft.has(permission) ? 'border-brand-500 bg-brand-50' : ''"
          >
            <input
              type="checkbox"
              class="size-3.5 accent-brand-600"
              :checked="draft.has(permission)"
              @change="toggle(permission)"
            />
            {{ permission.split(':')[1] }}
          </label>
        </div>
      </fieldset>
    </BaseCard>
  </div>
</template>
