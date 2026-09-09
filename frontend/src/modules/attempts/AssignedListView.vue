<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';
import { useToast } from '@/composables/useToast';

/** Evaluaciones asignadas al usuario actual, con su estado y sus intentos. */

interface AssignedAssessment {
  assignmentId: string;
  recipientId: string;
  assessmentId: string;
  title: string;
  description: string | null;
  questionCount: number;
  totalPoints: number;
  timeLimitMinutes: number | null;
  startAt: string;
  endAt: string | null;
  attemptsAllowed: number;
  attemptsUsed: number;
  status: string;
  resumableAttemptId: string | null;
  bestPercentage: number | null;
}

const router = useRouter();
const { t, d, n } = useI18n();
const toast = useToast();

const items = ref<AssignedAssessment[]>([]);
const loading = ref(true);
const startingId = ref<string | null>(null);

onMounted(async () => {
  try {
    items.value = await http.get<AssignedAssessment[]>('/attempts/assigned');
  } finally {
    loading.value = false;
  }
});

const pending = computed(() => items.value.filter((item) => item.status !== 'COMPLETED'));
const completed = computed(() => items.value.filter((item) => item.status === 'COMPLETED'));

function statusTone(status: string): 'success' | 'warning' | 'info' | 'neutral' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'OPEN') return 'info';
  if (status === 'SCHEDULED') return 'warning';
  return 'neutral';
}

const canStart = (item: AssignedAssessment): boolean =>
  item.status === 'OPEN' &&
  (item.resumableAttemptId !== null || item.attemptsUsed < item.attemptsAllowed);

async function start(item: AssignedAssessment): Promise<void> {
  startingId.value = item.recipientId;
  try {
    // Si hay un intento sin terminar, el servidor lo devuelve en lugar de
    // crear otro: retomar no consume un intento nuevo.
    const attempt = await http.post<{ id: string }>('/attempts', { recipientId: item.recipientId });
    await router.push({ name: 'attempt-runner', params: { attemptId: attempt.id } });
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    startingId.value = null;
  }
}
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else class="flex flex-col gap-6">
    <section class="flex flex-col gap-3">
      <h2 class="text-sm font-medium uppercase tracking-wide text-ink-subtle">
        {{ t('dashboard.student.pending') }}
      </h2>

      <EmptyState
        v-if="pending.length === 0"
        :title="t('dashboard.student.noPending')"
        :description="t('dashboard.student.noPendingHint')"
      />

      <BaseCard v-for="item in pending" :key="item.recipientId">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-col gap-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-medium">{{ item.title }}</h3>
              <BaseBadge :tone="statusTone(item.status)">
                {{ t(`assignment.status.${item.status}`) }}
              </BaseBadge>
            </div>

            <p v-if="item.description" class="text-sm text-ink-muted">{{ item.description }}</p>

            <p class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-subtle">
              <span>{{ t('assessment.questionCount', { count: item.questionCount }) }}</span>
              <span>{{ t('assessment.totalPoints', { points: item.totalPoints }) }}</span>
              <span>
                {{
                  item.timeLimitMinutes
                    ? t('assessment.timeLimitMinutes', { minutes: item.timeLimitMinutes })
                    : t('assessment.noTimeLimit')
                }}
              </span>
              <span v-if="item.status === 'SCHEDULED'">
                {{ t('assignment.notOpenYet', { date: d(new Date(item.startAt), 'long') }) }}
              </span>
              <span v-else-if="item.endAt">
                {{ t('assignment.closed', { date: d(new Date(item.endAt), 'long') }) }}
              </span>
              <span>
                {{
                  item.attemptsUsed < item.attemptsAllowed
                    ? t('assignment.attemptsLeft', item.attemptsAllowed - item.attemptsUsed)
                    : t('assignment.noAttemptsLeft')
                }}
              </span>
            </p>
          </div>

          <BaseButton
            class="shrink-0"
            :disabled="!canStart(item)"
            :loading="startingId === item.recipientId"
            @click="start(item)"
          >
            {{ item.resumableAttemptId ? t('assessment.resume') : t('assessment.start') }}
          </BaseButton>
        </div>
      </BaseCard>
    </section>

    <section v-if="completed.length > 0" class="flex flex-col gap-3">
      <h2 class="text-sm font-medium uppercase tracking-wide text-ink-subtle">
        {{ t('dashboard.student.completed') }}
      </h2>

      <BaseCard v-for="item in completed" :key="item.recipientId">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <h3 class="truncate font-medium">{{ item.title }}</h3>
            <p v-if="item.bestPercentage !== null" class="text-sm text-ink-muted tabular-nums">
              {{ n(item.bestPercentage / 100, 'percent') }}
            </p>
          </div>
          <BaseBadge tone="success">{{ t('assignment.status.COMPLETED') }}</BaseBadge>
        </div>
      </BaseCard>
    </section>
  </div>
</template>
