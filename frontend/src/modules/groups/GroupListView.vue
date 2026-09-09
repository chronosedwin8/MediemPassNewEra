<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { localize, type LocalizedText } from '@medienpass/shared';
import { http } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';

/** Grupos a cargo del usuario. El alcance lo aplica el servidor. */

interface Group {
  id: string;
  code: string;
  studentCount: number;
  gradeLevel: { code: string; name: LocalizedText };
  subject: { code: string } | null;
  homeroomTeacher: { firstName: string; lastName: string } | null;
}

const { t, locale } = useI18n();
const groups = ref<Group[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const result = await http.list<Group>('/groups', { pageSize: 100 });
    groups.value = result.items;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <EmptyState v-else-if="groups.length === 0" :title="t('group.empty')" />

  <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <BaseCard v-for="group in groups" :key="group.id">
      <h3 class="text-lg font-semibold">{{ group.code }}</h3>
      <p class="mt-1 text-sm text-ink-muted">
        {{ localize(group.gradeLevel.name, locale as never) }}
        <span v-if="group.subject"> · {{ group.subject.code }}</span>
      </p>
      <p class="mt-3 text-sm tabular-nums">
        {{ t('group.studentCount', { count: group.studentCount }) }}
      </p>
      <p v-if="group.homeroomTeacher" class="mt-1 text-xs text-ink-subtle">
        {{ t('group.homeroomTeacher') }}: {{ group.homeroomTeacher.firstName }}
        {{ group.homeroomTeacher.lastName }}
      </p>
    </BaseCard>
  </div>
</template>
