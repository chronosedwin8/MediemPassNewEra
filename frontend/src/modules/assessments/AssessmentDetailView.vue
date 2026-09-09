<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  ASSESSMENT_VERSION_STATUS,
  ASSIGNMENT_TARGET_TYPE,
  type LocalizedText,
  type QuestionType,
} from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import QuestionEditor from './editors/QuestionEditor.vue';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';
import { useToast } from '@/composables/useToast';

/**
 * Detalle de una evaluación: preguntas, publicación y asignación.
 *
 * La interfaz refleja la regla del dominio sin necesidad de explicarla: si la
 * versión está publicada, no hay formulario de edición, hay un botón para
 * crear la versión siguiente.
 */

interface Version {
  id: string;
  versionNumber: number;
  status: string;
  name: string;
  questionCount: number;
  totalPoints: number;
  timeLimitMinutes: number | null;
}

interface Assessment {
  id: string;
  title: string;
  versions: Version[];
}

interface Question {
  id: string;
  type: QuestionType;
  statement: string;
  points: number;
  position: number;
  kmkCompetency: { code: string; name: LocalizedText; color: string };
}

interface Competency {
  id: string;
  code: string;
  name: LocalizedText;
  subcompetencies: Array<{ id: string; code: string; name: LocalizedText }>;
}

interface Group {
  id: string;
  code: string;
  studentCount: number;
}

const route = useRoute();
const { t } = useI18n();
const toast = useToast();

const assessment = ref<Assessment | null>(null);
const questions = ref<Question[]>([]);
const competencies = ref<Competency[]>([]);
const groups = ref<Group[]>([]);

const loading = ref(true);
const savingQuestion = ref(false);
const publishing = ref(false);
const assigning = ref(false);
const showEditor = ref(false);
const showAssignPanel = ref(false);

const assignGroupId = ref('');
const assignAttempts = ref(1);

const currentVersion = computed<Version | null>(() => assessment.value?.versions[0] ?? null);
const isDraft = computed(() => currentVersion.value?.status === ASSESSMENT_VERSION_STATUS.DRAFT);
const isPublished = computed(
  () => currentVersion.value?.status === ASSESSMENT_VERSION_STATUS.PUBLISHED,
);

async function loadQuestions(): Promise<void> {
  if (!currentVersion.value) return;
  questions.value = await http.get<Question[]>(
    `/assessments/versions/${currentVersion.value.id}/questions`,
  );
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    assessment.value = await http.get<Assessment>(`/assessments/${route.params.id}`);
    await loadQuestions();

    const [competencyTree, groupList] = await Promise.all([
      http.get<Competency[]>('/kmk/competencies'),
      http.list<Group>('/groups', { pageSize: 100 }),
    ]);
    competencies.value = competencyTree;
    groups.value = groupList.items;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function addQuestion(payload: Record<string, unknown>): Promise<void> {
  if (!currentVersion.value) return;
  savingQuestion.value = true;

  try {
    await http.post(`/assessments/versions/${currentVersion.value.id}/questions`, payload);
    await loadQuestions();
    showEditor.value = false;
    toast.success(t('common.saved'));
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    savingQuestion.value = false;
  }
}

async function removeQuestion(questionId: string): Promise<void> {
  try {
    await http.delete(`/assessments/questions/${questionId}`);
    await loadQuestions();
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  }
}

async function publish(): Promise<void> {
  if (!currentVersion.value) return;
  publishing.value = true;

  try {
    await http.post(`/assessments/versions/${currentVersion.value.id}/publish`);
    await load();
    toast.success(t('assessment.published'));
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    publishing.value = false;
  }
}

/** Crea la versión siguiente copiando las preguntas de la publicada. */
async function createNewVersion(): Promise<void> {
  try {
    await http.post(`/assessments/${route.params.id}/versions`);
    await load();
    toast.success(t('assessment.newVersion'));
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  }
}

async function assign(): Promise<void> {
  if (!currentVersion.value || !assignGroupId.value) return;
  assigning.value = true;

  try {
    const result = await http.post<{ recipientCount: number }>('/assignments', {
      assessmentVersionId: currentVersion.value.id,
      targetType: ASSIGNMENT_TARGET_TYPE.GROUP,
      groupId: assignGroupId.value,
      startAt: new Date().toISOString(),
      attemptsAllowed: assignAttempts.value,
    });

    showAssignPanel.value = false;
    toast.success(`${t('assessment.assign')}: ${result.recipientCount}`);
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    assigning.value = false;
  }
}

const statusTone = (status: string): 'success' | 'warning' | 'neutral' =>
  status === 'PUBLISHED' ? 'success' : status === 'DRAFT' ? 'warning' : 'neutral';
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else-if="assessment && currentVersion" class="flex flex-col gap-5">
    <!-- Cabecera de la versión vigente -->
    <BaseCard>
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-xl font-semibold">{{ assessment.title }}</h2>
            <BaseBadge :tone="statusTone(currentVersion.status)">
              {{
                currentVersion.status === 'PUBLISHED'
                  ? t('assessment.published')
                  : currentVersion.status === 'DRAFT'
                    ? t('assessment.draft')
                    : t('assessment.archived')
              }}
            </BaseBadge>
            <BaseBadge tone="neutral">
              {{ t('assessment.version', { number: currentVersion.versionNumber }) }}
            </BaseBadge>
          </div>

          <p class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span>{{ t('assessment.questionCount', { count: questions.length }) }}</span>
            <span>
              {{
                t('assessment.totalPoints', {
                  points: questions.reduce((sum, question) => sum + question.points, 0),
                })
              }}
            </span>
            <span>
              {{
                currentVersion.timeLimitMinutes
                  ? t('assessment.timeLimitMinutes', { minutes: currentVersion.timeLimitMinutes })
                  : t('assessment.noTimeLimit')
              }}
            </span>
          </p>
        </div>

        <div class="flex shrink-0 flex-wrap gap-2">
          <BaseButton
            v-if="isDraft"
            :disabled="questions.length === 0"
            :loading="publishing"
            @click="publish"
          >
            {{ t('assessment.publish') }}
          </BaseButton>

          <template v-if="isPublished">
            <BaseButton @click="showAssignPanel = !showAssignPanel">
              {{ t('assessment.assign') }}
            </BaseButton>
            <BaseButton variant="secondary" @click="createNewVersion">
              {{ t('assessment.newVersion') }}
            </BaseButton>
          </template>
        </div>
      </div>

      <p
        v-if="isDraft"
        class="mt-4 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning"
      >
        {{ t('assessment.publishWarning') }}
      </p>
      <p
        v-else-if="isPublished"
        class="mt-4 rounded-md border border-info/30 bg-info-soft px-3 py-2 text-sm text-info"
      >
        {{ t('assessment.versionImmutableHint') }}
      </p>
    </BaseCard>

    <!-- Asignación a un grupo -->
    <BaseCard v-if="showAssignPanel" :title="t('assessment.assign')">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div class="flex flex-1 flex-col gap-1.5">
          <label class="text-sm font-medium" for="assign-group">{{ t('assignment.group') }}</label>
          <select
            id="assign-group"
            v-model="assignGroupId"
            class="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
          >
            <option value="">{{ t('common.none') }}</option>
            <option v-for="group in groups" :key="group.id" :value="group.id">
              {{ group.code }} · {{ t('group.studentCount', { count: group.studentCount }) }}
            </option>
          </select>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="assign-attempts">
            {{ t('assignment.attemptsAllowed') }}
          </label>
          <input
            id="assign-attempts"
            v-model.number="assignAttempts"
            type="number"
            min="1"
            max="20"
            class="h-10 w-24 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
          />
        </div>

        <BaseButton :disabled="!assignGroupId" :loading="assigning" @click="assign">
          {{ t('assessment.assign') }}
        </BaseButton>
      </div>
    </BaseCard>

    <!-- Preguntas -->
    <BaseCard :title="t('assessment.questions')">
      <template #actions>
        <BaseButton v-if="isDraft && !showEditor" size="sm" @click="showEditor = true">
          {{ t('question.add') }}
        </BaseButton>
      </template>

      <EmptyState v-if="questions.length === 0 && !showEditor" :title="t('question.empty')" />

      <ol v-else class="flex flex-col gap-3">
        <li
          v-for="(question, index) in questions"
          :key="question.id"
          class="flex items-start gap-3 rounded-md border border-border p-3"
        >
          <span class="mt-0.5 w-6 shrink-0 text-center text-xs tabular-nums text-ink-subtle">
            {{ index + 1 }}
          </span>

          <div class="min-w-0 flex-1">
            <p class="text-sm">{{ question.statement }}</p>
            <p class="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span
                class="rounded-full px-2 py-0.5 font-medium"
                :style="{
                  backgroundColor: `${question.kmkCompetency.color}1a`,
                  color: question.kmkCompetency.color,
                }"
              >
                KMK {{ question.kmkCompetency.code }}
              </span>
              <span class="text-ink-subtle">{{ t(`question.types.${question.type}`) }}</span>
              <span class="text-ink-subtle">
                {{ t('assessment.totalPoints', { points: question.points }) }}
              </span>
            </p>
          </div>

          <button
            v-if="isDraft"
            type="button"
            class="shrink-0 rounded-md p-2 text-ink-subtle hover:bg-surface-muted hover:text-danger"
            :aria-label="`${t('common.delete')}: ${question.statement}`"
            @click="removeQuestion(question.id)"
          >
            <svg
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </li>
      </ol>

      <div v-if="showEditor" class="mt-5 border-t border-border pt-5">
        <QuestionEditor
          :competencies="competencies"
          :saving="savingQuestion"
          @save="addQuestion"
          @cancel="showEditor = false"
        />
      </div>
    </BaseCard>

    <!-- Historial de versiones -->
    <BaseCard v-if="assessment.versions.length > 1" :title="t('assessment.versions')">
      <ul class="flex flex-col gap-2">
        <li
          v-for="version in assessment.versions"
          :key="version.id"
          class="flex items-center justify-between gap-4 text-sm"
        >
          <span>{{ t('assessment.version', { number: version.versionNumber }) }}</span>
          <span class="text-ink-subtle">
            {{ t('assessment.questionCount', { count: version.questionCount }) }}
          </span>
          <BaseBadge :tone="statusTone(version.status)">{{ version.status }}</BaseBadge>
        </li>
      </ul>
    </BaseCard>
  </div>
</template>
