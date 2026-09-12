<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { DIFFICULTY, LANGUAGE, localize, type LocalizedText } from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseBadge from '@/design-system/BaseBadge.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import { useToast } from '@/composables/useToast';
import { LANGUAGE_OPTIONS } from '@/app/languages';

/**
 * Generación asistida de evaluaciones.
 *
 * Lo que sale de aquí es **siempre un borrador**. La pantalla lo dice antes de
 * generar y vuelve a decirlo después, porque es la diferencia entre una
 * herramienta que ayuda al docente y una que publica en su nombre cosas que no
 * ha leído.
 *
 * Los tipos de pregunta y los límites no están escritos en este archivo: se
 * piden a `/ai/capabilities`. Duplicarlos aquí garantizaría que algún día el
 * formulario ofrezca algo que el servidor rechaza.
 */

interface Capabilities {
  provider: string;
  configured: boolean;
  simulated: boolean;
  model: string;
  supportedQuestionTypes: string[];
  defaultQuestionTypes: string[];
  maxQuestions: number;
  dailyLimit: number;
}

interface Competency {
  id: string;
  code: string;
  name: LocalizedText;
  color: string;
}

interface Option {
  id: string;
  code: string;
  name: LocalizedText;
}

interface GenerationResult {
  requestId: string;
  assessmentId: string;
  versionId: string;
  questionsCreated: number;
}

const { t, locale } = useI18n();
const router = useRouter();
const toast = useToast();

const capabilities = ref<Capabilities | null>(null);
const competencies = ref<Competency[]>([]);
const subjects = ref<Option[]>([]);
const gradeLevels = ref<Option[]>([]);
const loading = ref(true);
const generating = ref(false);
const issues = ref<Array<{ questionIndex: number; rule: string; message: string }>>([]);

const form = reactive({
  topic: '',
  context: '',
  subjectId: '',
  gradeLevelId: '',
  difficulty: DIFFICULTY.INTERMEDIATE as string,
  language: LANGUAGE.ES as string,
  questionCount: 10,
  competencyIds: [] as string[],
  questionTypes: [] as string[],
});

const canSubmit = computed(
  () =>
    form.topic.trim().length >= 3 &&
    form.competencyIds.length > 0 &&
    form.questionTypes.length > 0 &&
    !generating.value,
);

onMounted(async () => {
  try {
    const [caps, kmk, subjectList, grades] = await Promise.all([
      http.get<Capabilities>('/ai/capabilities'),
      http.get<Competency[]>('/kmk/competencies'),
      http.list<Option>('/subjects', { pageSize: 100 }),
      http.get<Option[]>('/academic/grade-levels'),
    ]);
    capabilities.value = caps;
    competencies.value = kmk;
    subjects.value = subjectList.items;
    gradeLevels.value = grades;
    /*
     * Se ofrecen todos los tipos admitidos, pero vienen marcados solo los que
     * el servidor propone. Quién marca qué no es un detalle: pedir grabaciones
     * a un curso entero es una decisión del docente, no del formulario.
     */
    form.questionTypes = [...caps.defaultQuestionTypes];
    form.questionCount = Math.min(10, caps.maxQuestions);
  } finally {
    loading.value = false;
  }
});

function toggle(list: string[], value: string): void {
  const index = list.indexOf(value);
  if (index === -1) list.push(value);
  else list.splice(index, 1);
}

async function generate(): Promise<void> {
  generating.value = true;
  issues.value = [];

  try {
    const result = await http.post<GenerationResult>('/ai/generate', {
      topic: form.topic.trim(),
      context: form.context.trim() || null,
      subjectId: form.subjectId || null,
      gradeLevelId: form.gradeLevelId || null,
      difficulty: form.difficulty,
      language: form.language,
      questionCount: form.questionCount,
      competencyIds: form.competencyIds,
      questionTypes: form.questionTypes,
    });

    toast.success(t('ai.generated', { count: result.questionsCreated }));
    await router.push(`/assessments/${result.assessmentId}`);
  } catch (error) {
    /*
     * Un rechazo por validación no es un fallo del docente: es el sistema
     * negándose a guardar preguntas mal formadas. Se muestran los motivos
     * concretos en lugar de un «error al generar», que dejaría a cualquiera
     * pulsando el botón otra vez sin saber qué cambiar.
     */
    if (error instanceof ApiError && error.code === 'AI_RESPONSE_INVALID') {
      const details = error.details as
        { issues?: Array<{ questionIndex: number; rule: string; message: string }> } | undefined;
      issues.value = details?.issues ?? [];
    }
    toast.error(error instanceof Error ? error.message : t('errors.generic'));
  } finally {
    generating.value = false;
  }
}

const inputClass =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <BaseSpinner v-if="loading" size="lg" />

  <div v-else class="flex max-w-3xl flex-col gap-5">
    <header>
      <h1 class="text-2xl font-semibold">{{ t('ai.title') }}</h1>
      <p class="mt-1 text-sm text-ink-muted">{{ t('ai.draftNotice') }}</p>
    </header>

    <!--
      Dos avisos distintos, y la diferencia importa.

      «No configurado» significa que enviar el formulario fallará. «Simulado»
      significa que funcionará y devolverá preguntas de relleno con la forma
      correcta pero sin relación con el tema. Sin este segundo aviso, quien
      pide una evaluación sobre el ciclo del agua y recibe «Opción correcta /
      Opción incorrecta» concluye que la IA no entendió el tema.
    -->
    <BaseCard
      v-if="capabilities && !capabilities.configured"
      class="border-warning/40 bg-warning/5"
    >
      <p class="text-sm">{{ t('ai.notConfigured') }}</p>
    </BaseCard>

    <BaseCard v-else-if="capabilities?.simulated" class="border-warning/40 bg-warning/5">
      <p class="text-sm font-medium">{{ t('ai.simulatedTitle') }}</p>
      <p class="mt-1 text-sm">{{ t('ai.simulatedHint') }}</p>
    </BaseCard>

    <BaseCard v-if="capabilities" class="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
      <BaseBadge tone="info">{{ capabilities.provider }}</BaseBadge>
      <span>{{ capabilities.model }}</span>
      <span>{{ t('ai.maxQuestions', { count: capabilities.maxQuestions }) }}</span>
      <span>{{ t('ai.dailyLimit', { count: capabilities.dailyLimit }) }}</span>
    </BaseCard>

    <form class="flex flex-col gap-5" @submit.prevent="generate">
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t('ai.topic') }}</span>
        <input v-model="form.topic" type="text" required :class="inputClass" />
      </label>

      <!--
        El campo que convierte una evaluación genérica en una que encaja con la
        clase. Es texto libre a propósito: acotarlo con casillas obligaría a
        anticipar qué querrá decir cada docente, y siempre faltaría la casilla
        que hace falta.
      -->
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t('ai.context') }}</span>
        <span class="text-xs text-ink-subtle">{{ t('ai.contextHint') }}</span>
        <textarea
          v-model="form.context"
          rows="5"
          maxlength="2000"
          :placeholder="t('ai.contextPlaceholder')"
          class="resize-y rounded-md border border-border bg-surface p-3 text-sm leading-relaxed outline-none focus:border-brand-500"
        />
        <span class="text-right text-xs tabular-nums text-ink-subtle">
          {{ form.context.length }} / 2000
        </span>
      </label>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('assessment.subject') }}</span>
          <select v-model="form.subjectId" :class="inputClass">
            <option value="">{{ t('common.none') }}</option>
            <option v-for="subject in subjects" :key="subject.id" :value="subject.id">
              {{ localize(subject.name, locale as never) }}
            </option>
          </select>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('assessment.gradeLevel') }}</span>
          <select v-model="form.gradeLevelId" :class="inputClass">
            <option value="">{{ t('common.none') }}</option>
            <option v-for="grade in gradeLevels" :key="grade.id" :value="grade.id">
              {{ localize(grade.name, locale as never) }}
            </option>
          </select>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('assessment.difficulty') }}</span>
          <select v-model="form.difficulty" :class="inputClass">
            <option value="BASIC">{{ t('difficulty.BASIC') }}</option>
            <option value="INTERMEDIATE">{{ t('difficulty.INTERMEDIATE') }}</option>
            <option value="ADVANCED">{{ t('difficulty.ADVANCED') }}</option>
          </select>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('assessment.language') }}</span>
          <select v-model="form.language" :class="inputClass">
            <option v-for="option in LANGUAGE_OPTIONS" :key="option.code" :value="option.code">
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t('ai.questionCount') }}</span>
          <input
            v-model.number="form.questionCount"
            type="number"
            min="1"
            :max="capabilities?.maxQuestions ?? 30"
            :class="inputClass"
          />
        </label>
      </div>

      <fieldset class="flex flex-col gap-2">
        <legend class="text-sm font-medium">{{ t('ai.competencies') }}</legend>
        <p class="text-xs text-ink-subtle">{{ t('ai.competenciesHint') }}</p>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="competency in competencies"
            :key="competency.id"
            class="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
            :class="
              form.competencyIds.includes(competency.id) ? 'border-brand-500 bg-brand-50' : ''
            "
          >
            <input
              type="checkbox"
              class="size-4 accent-brand-600"
              :checked="form.competencyIds.includes(competency.id)"
              @change="toggle(form.competencyIds, competency.id)"
            />
            <span
              class="size-2.5 rounded-full"
              :style="{ backgroundColor: competency.color }"
              aria-hidden="true"
            />
            KMK {{ competency.code }}
          </label>
        </div>
      </fieldset>

      <fieldset class="flex flex-col gap-2">
        <legend class="text-sm font-medium">{{ t('ai.questionTypes') }}</legend>
        <p class="text-xs text-ink-subtle">{{ t('ai.questionTypesHint') }}</p>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="type in capabilities?.supportedQuestionTypes ?? []"
            :key="type"
            class="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
            :class="form.questionTypes.includes(type) ? 'border-brand-500 bg-brand-50' : ''"
          >
            <input
              type="checkbox"
              class="size-4 accent-brand-600"
              :checked="form.questionTypes.includes(type)"
              @change="toggle(form.questionTypes, type)"
            />
            {{ t(`question.types.${type}`) }}
          </label>
        </div>
      </fieldset>

      <!-- Motivos concretos del rechazo, pregunta por pregunta. -->
      <BaseCard v-if="issues.length > 0" class="border-danger/40 bg-danger/5">
        <h2 class="text-sm font-semibold">{{ t('ai.rejected') }}</h2>
        <ul class="mt-2 flex flex-col gap-1 text-sm">
          <li v-for="(issue, index) in issues" :key="index">
            <span v-if="issue.questionIndex >= 0" class="font-medium">
              {{ t('ai.questionNumber', { number: issue.questionIndex + 1 }) }}:
            </span>
            {{ issue.message }}
          </li>
        </ul>
      </BaseCard>

      <div class="flex items-center gap-3">
        <BaseButton type="submit" :disabled="!canSubmit" :loading="generating">
          {{ t('ai.generate') }}
        </BaseButton>
        <p v-if="generating" class="text-sm text-ink-muted">{{ t('ai.generatingHint') }}</p>
      </div>
    </form>
  </div>
</template>
