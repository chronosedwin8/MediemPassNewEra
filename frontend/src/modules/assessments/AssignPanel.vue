<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ASSIGNMENT_TARGET_TYPE } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import { useToast } from '@/composables/useToast';

/**
 * Asignación de una versión publicada a un grupo.
 *
 * Los grupos se piden aquí y no se reciben del padre: el servidor solo devuelve
 * los que el docente dirige, así que la lista ya viene acotada por el alcance y
 * no hace falta filtrar nada en el cliente.
 *
 * Si el desplegable sale vacío no es un fallo: significa que ese docente no
 * dirige ningún curso, y sin dirigirlo no puede asignarle nada.
 */

interface Group {
  id: string;
  code: string;
  studentCount: number;
}

const props = defineProps<{ versionId: string }>();

const { t } = useI18n();
const toast = useToast();

const groups = ref<Group[]>([]);
const groupId = ref('');
const attemptsAllowed = ref(1);
const assigning = ref(false);

onMounted(async () => {
  const result = await http.list<Group>('/groups', { pageSize: 100 });
  groups.value = result.items;
});

async function assign(): Promise<void> {
  if (!groupId.value) return;
  assigning.value = true;

  try {
    const result = await http.post<{ recipientCount: number }>('/assignments', {
      assessmentVersionId: props.versionId,
      targetType: ASSIGNMENT_TARGET_TYPE.GROUP,
      groupId: groupId.value,
      startAt: new Date().toISOString(),
      attemptsAllowed: attemptsAllowed.value,
    });
    toast.success(t('assignment.assigned', { count: result.recipientCount }));
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    assigning.value = false;
  }
}
</script>

<template>
  <BaseCard :title="t('assessment.assign')">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end">
      <div class="flex flex-1 flex-col gap-1.5">
        <label class="text-sm font-medium" for="assign-group">{{ t('assignment.group') }}</label>
        <select
          id="assign-group"
          v-model="groupId"
          class="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
        >
          <option value="">{{ t('common.none') }}</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">
            {{ group.code }} &#183; {{ t('group.studentCount', { count: group.studentCount }) }}
          </option>
        </select>
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium" for="assign-attempts">
          {{ t('assignment.attemptsAllowed') }}
        </label>
        <input
          id="assign-attempts"
          v-model.number="attemptsAllowed"
          type="number"
          min="1"
          max="20"
          class="h-10 w-24 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
        />
      </div>

      <BaseButton :disabled="!groupId" :loading="assigning" @click="assign">
        {{ t('assessment.assign') }}
      </BaseButton>
    </div>

    <p v-if="groups.length === 0" class="mt-3 text-sm text-ink-muted">
      {{ t('assignment.noGroups') }}
    </p>
  </BaseCard>
</template>
