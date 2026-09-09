<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  ASSESSMENT_VERSION_STATUS,
  type LocalizedText,
} from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import QuestionEditor from './editors/QuestionEditor.vue';
import DeleteAssessmentDialog from './DeleteAssessmentDialog.vue';
import VersionSettingsForm from './VersionSettingsForm.vue';
import AssignPanel from './AssignPanel.vue';
import QuestionList from './QuestionList.vue';
import type { Question } from './types';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
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
  instructions: string | null;
  questionCount: number;
  totalPoints: number;
  timeLimitMinutes: number | null;
}

interface Assessment {
  id: string;
  title: string;
  versions: Version[];
}

interface Competency {
  id: string;
  code: string;
  name: LocalizedText;
  subcompetencies: Array<{ id: string; code: string; name: LocalizedText }>;
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const toast = useToast();

const assessment = ref<Assessment | null>(null);
const questions = ref<Question[]>([]);
const competencies = ref<Competency[]>([]);

const loading = ref(true);
const savingQuestion = ref(false);
const publishing = ref(false);
const showEditor = ref(false);
const showAssignPanel = ref(false);

const showSettings = ref(false);

const editingQuestion = ref<Question | null>(null);

const showDeleteDialog = ref(false);

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

    competencies.value = await http.get<Competency[]>('/kmk/competencies');
  } finally {
    loading.value = false;
  }
}

onMounted(load);

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

/** Guarda una pregunta: nueva si no se está editando ninguna, o la editada. */
async function saveQuestion(payload: Record<string, unknown>): Promise<void> {
  if (!currentVersion.value) return;
  savingQuestion.value = true;

  try {
    if (editingQuestion.value) {
      await http.patch(`/assessments/questions/${editingQuestion.value.id}`, payload);
    } else {
      await http.post(`/assessments/versions/${currentVersion.value.id}/questions`, payload);
    }
    await loadQuestions();
    showEditor.value = false;
    editingQuestion.value = null;
    toast.success(t('common.saved'));
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : t('errors.generic'));
  } finally {
    savingQuestion.value = false;
  }
}

function editQuestion(question: Question): void {
  editingQuestion.value = question;
  showEditor.value = true;
}

function newQuestion(): void {
  editingQuestion.value = null;
  showEditor.value = true;
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
          <BaseButton v-if="isDraft" variant="secondary" @click="showSettings = !showSettings">
            {{ t('common.edit') }}
          </BaseButton>

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

          <BaseButton variant="danger" @click="showDeleteDialog = true">
            {{ t('common.delete') }}
          </BaseButton>
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

    <VersionSettingsForm
      v-if="showSettings && isDraft"
      :version-id="currentVersion.id"
      :name="currentVersion.name"
      :instructions="currentVersion.instructions"
      :time-limit-minutes="currentVersion.timeLimitMinutes"
      @saved="
        showSettings = false;
        load();
      "
      @cancel="showSettings = false"
    />

    <DeleteAssessmentDialog
      v-if="showDeleteDialog"
      :assessment-id="String(route.params.id)"
      @deleted="router.push('/assessments')"
      @cancel="showDeleteDialog = false"
    />

    <AssignPanel v-if="showAssignPanel" :version-id="currentVersion.id" />

    <!-- Preguntas -->
    <BaseCard :title="t('assessment.questions')">
      <template #actions>
        <BaseButton v-if="isDraft && !showEditor" size="sm" @click="newQuestion">
          {{ t('question.add') }}
        </BaseButton>
      </template>

      <QuestionList
        :questions="questions"
        :editable="isDraft"
        :showing-editor="showEditor"
        @edit="editQuestion"
        @remove="removeQuestion"
      />

      <div v-if="showEditor" class="mt-5 border-t border-border pt-5">
        <QuestionEditor
          :key="editingQuestion?.id ?? 'new'"
          :competencies="competencies"
          :question="editingQuestion"
          :saving="savingQuestion"
          @save="saveQuestion"
          @cancel="
            showEditor = false;
            editingQuestion = null;
          "
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
