<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { http } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';

/**
 * Panel de inicio.
 *
 * Presenta lo que cada rol necesita ver primero: al estudiante, lo que tiene
 * pendiente; al docente, el estado de lo que ha asignado. Las cifras salen de
 * los mismos endpoints que las listas, para que nunca discrepen.
 */

const auth = useAuthStore();
const { t, n } = useI18n();

interface AssignedItem {
  status: string;
  bestPercentage: number | null;
}

const assigned = ref<AssignedItem[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    if (auth.can('attempt:take')) {
      assigned.value = await http.get<AssignedItem[]>('/attempts/assigned');
    }
  } finally {
    loading.value = false;
  }
});

const pendingCount = computed(
  () => assigned.value.filter((item) => item.status !== 'COMPLETED').length,
);
const completedCount = computed(
  () => assigned.value.filter((item) => item.status === 'COMPLETED').length,
);

const average = computed(() => {
  const scored = assigned.value.filter((item) => item.bestPercentage !== null);
  if (scored.length === 0) return null;
  const sum = scored.reduce((total, item) => total + (item.bestPercentage ?? 0), 0);
  return sum / scored.length;
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h2 class="text-xl font-semibold">{{ t('auth.welcomeBack', { name: auth.user?.firstName }) }}</h2>
      <p class="mt-1 text-sm text-ink-muted">
        {{ auth.user?.roles.map((role) => t(`roles.${role}`)).join(' · ') }}
      </p>
    </div>

    <BaseSpinner v-if="loading" />

    <template v-else>
      <!-- Cifras del estudiante -->
      <div v-if="auth.isStudent" class="grid gap-4 sm:grid-cols-3">
        <BaseCard>
          <p class="text-sm text-ink-muted">{{ t('dashboard.student.pending') }}</p>
          <p class="mt-1 text-3xl font-semibold tabular-nums">{{ pendingCount }}</p>
        </BaseCard>
        <BaseCard>
          <p class="text-sm text-ink-muted">{{ t('dashboard.student.completed') }}</p>
          <p class="mt-1 text-3xl font-semibold tabular-nums">{{ completedCount }}</p>
        </BaseCard>
        <BaseCard>
          <p class="text-sm text-ink-muted">{{ t('dashboard.student.average') }}</p>
          <p class="mt-1 text-3xl font-semibold tabular-nums">
            {{ average !== null ? n(average / 100, 'percent') : '—' }}
          </p>
        </BaseCard>
      </div>

      <BaseCard v-if="auth.isStudent && pendingCount > 0">
        <div class="flex items-center justify-between gap-4">
          <p class="text-sm">{{ t('dashboard.student.pending') }}: {{ pendingCount }}</p>
          <RouterLink to="/my-assessments">
            <BaseButton size="sm">{{ t('nav.myAssessments') }}</BaseButton>
          </RouterLink>
        </div>
      </BaseCard>

      <!-- Accesos del docente -->
      <div v-if="auth.can('assessment:create')" class="grid gap-4 sm:grid-cols-2">
        <BaseCard :title="t('nav.assessments')" :subtitle="t('assessment.emptyHint')">
          <RouterLink to="/assessments/new">
            <BaseButton>{{ t('nav.createAssessment') }}</BaseButton>
          </RouterLink>
        </BaseCard>

        <BaseCard :title="t('nav.groups')">
          <RouterLink to="/groups">
            <BaseButton variant="secondary">{{ t('nav.groups') }}</BaseButton>
          </RouterLink>
        </BaseCard>
      </div>
    </template>
  </div>
</template>
