<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { PaginationMeta } from '@medienpass/shared';
import { http } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';

interface AssessmentSummary {
  id: string;
  title: string;
  audience: string;
  createdBy: { firstName: string; lastName: string };
  subject: { code: string } | null;
  latestVersion: {
    id: string;
    versionNumber: number;
    status: string;
    questionCount: number;
    totalPoints: number;
  } | null;
}

const auth = useAuthStore();
const { t } = useI18n();

const assessments = ref<AssessmentSummary[]>([]);
const meta = ref<PaginationMeta | null>(null);
const loading = ref(true);
const page = ref(1);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await http.list<AssessmentSummary>('/assessments', {
      page: page.value,
      pageSize: 20,
    });
    assessments.value = result.items;
    meta.value = result.meta;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const statusTone = (status: string): 'success' | 'warning' | 'neutral' =>
  status === 'PUBLISHED' ? 'success' : status === 'DRAFT' ? 'warning' : 'neutral';

const statusLabel = (status: string): string =>
  status === 'PUBLISHED'
    ? t('assessment.published')
    : status === 'DRAFT'
      ? t('assessment.draft')
      : t('assessment.archived');
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center justify-between gap-4">
      <p class="text-sm text-ink-muted">
        <span v-if="meta">{{ meta.total }} {{ t('nav.assessments').toLowerCase() }}</span>
      </p>
      <RouterLink v-if="auth.can('assessment:create')" to="/assessments/new">
        <BaseButton>{{ t('nav.createAssessment') }}</BaseButton>
      </RouterLink>
    </div>

    <BaseSpinner v-if="loading" size="lg" />

    <EmptyState
      v-else-if="assessments.length === 0"
      :title="t('assessment.empty')"
      :description="t('assessment.emptyHint')"
    >
      <template #action>
        <RouterLink v-if="auth.can('assessment:create')" to="/assessments/new">
          <BaseButton>{{ t('nav.createAssessment') }}</BaseButton>
        </RouterLink>
      </template>
    </EmptyState>

    <div v-else class="flex flex-col gap-3">
      <RouterLink
        v-for="assessment in assessments"
        :key="assessment.id"
        :to="`/assessments/${assessment.id}`"
        class="block rounded-lg transition-shadow hover:shadow-raised"
      >
        <BaseCard>
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <h3 class="truncate font-medium">{{ assessment.title }}</h3>
              <p class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-subtle">
                <span v-if="assessment.subject">{{ assessment.subject.code }}</span>
                <span v-if="assessment.latestVersion">
                  {{ t('assessment.version', { number: assessment.latestVersion.versionNumber }) }}
                </span>
                <span v-if="assessment.latestVersion">
                  {{
                    t('assessment.questionCount', { count: assessment.latestVersion.questionCount })
                  }}
                </span>
                <span v-if="assessment.latestVersion">
                  {{
                    t('assessment.totalPoints', { points: assessment.latestVersion.totalPoints })
                  }}
                </span>
              </p>
            </div>

            <BaseBadge
              v-if="assessment.latestVersion"
              class="shrink-0"
              :tone="statusTone(assessment.latestVersion.status)"
            >
              {{ statusLabel(assessment.latestVersion.status) }}
            </BaseBadge>
          </div>
        </BaseCard>
      </RouterLink>
    </div>

    <div v-if="meta && meta.totalPages > 1" class="flex items-center justify-center gap-3">
      <BaseButton
        variant="secondary"
        size="sm"
        :disabled="page === 1"
        @click="((page -= 1), load())"
      >
        {{ t('common.previous') }}
      </BaseButton>
      <p class="text-sm text-ink-muted">
        {{ t('common.showingPage', { page: meta.page, total: meta.totalPages }) }}
      </p>
      <BaseButton
        variant="secondary"
        size="sm"
        :disabled="page >= meta.totalPages"
        @click="((page += 1), load())"
      >
        {{ t('common.next') }}
      </BaseButton>
    </div>
  </div>
</template>
