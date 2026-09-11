<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { PERMISSION } from '@medienpass/shared';
import { useAuthStore } from '@/stores/auth';
import { http } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import StudentPanel from './StudentPanel.vue';
import TeacherPanel from './TeacherPanel.vue';
import StatTile from './StatTile.vue';

/**
 * Panel de inicio.
 *
 * Elige qué panel mostrar según lo que la cuenta puede hacer, no según el rol:
 * así, si mañana se crea un rol de coordinación con parte de los permisos de
 * docente, ve lo que le corresponde sin tocar este archivo.
 *
 * Ninguna cifra se calcula aquí. Antes se sumaban y promediaban en el
 * navegador a partir de la lista de asignaciones; eso podía dar un promedio
 * distinto del de la pantalla de estadísticas, y dos cifras distintas del
 * mismo dato hacen que nadie vuelva a fiarse de ninguna.
 */

interface Overview {
  attempts: number;
  pendingReview: number;
  averagePercentage: number;
  passRate: number;
  activeStudents: number;
  activeTeachers: number;
  publishedAssessments: number;
}

const auth = useAuthStore();
const { t, n } = useI18n();

const overview = ref<Overview | null>(null);
const loadingOverview = ref(false);

/** Quien responde evaluaciones y no las crea ve el panel de estudiante. */
const showsStudentPanel = computed(
  () => auth.can(PERMISSION.ATTEMPT_TAKE) && !auth.can(PERMISSION.ASSESSMENT_CREATE),
);
const showsTeacherPanel = computed(() => auth.can(PERMISSION.ASSESSMENT_CREATE));
const showsSchoolOverview = computed(() => auth.can(PERMISSION.STATS_READ_GLOBAL));

onMounted(async () => {
  if (!showsSchoolOverview.value) return;

  loadingOverview.value = true;
  try {
    overview.value = await http.get<Overview>('/statistics/overview');
  } finally {
    loadingOverview.value = false;
  }
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h2 class="text-xl font-semibold">
        {{ t('auth.welcomeBack', { name: auth.user?.firstName }) }}
      </h2>
      <p class="mt-1 text-sm text-ink-muted">
        {{ auth.user?.roles.map((role) => t(`roles.${role}`)).join(' · ') }}
      </p>
    </div>

    <!--
      El resumen del colegio va primero en la administración: quien lo ve viene
      a mirar el conjunto, y su propio panel docente es lo secundario.
    -->
    <BaseCard v-if="showsSchoolOverview" :title="t('dashboard.admin.title')">
      <BaseSpinner v-if="loadingOverview" />
      <div v-else-if="overview" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile :label="t('dashboard.admin.activeStudents')" :value="overview.activeStudents" />
        <StatTile :label="t('dashboard.admin.activeTeachers')" :value="overview.activeTeachers" />
        <StatTile
          :label="t('dashboard.admin.assessmentsTaken')"
          :value="overview.attempts"
          :hint="`${overview.publishedAssessments} ${t('assessment.published').toLowerCase()}`"
        />
        <StatTile
          :label="t('dashboard.teacher.passRate')"
          :value="n(overview.passRate / 100, 'percent')"
        />
      </div>
    </BaseCard>

    <StudentPanel v-if="showsStudentPanel" />
    <TeacherPanel v-if="showsTeacherPanel" />
  </div>
</template>
