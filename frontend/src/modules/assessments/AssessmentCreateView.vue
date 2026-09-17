<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  ASSESSMENT_AUDIENCE,
  ASSESSMENT_PURPOSE,
  localize,
  type LocalizedText,
} from '@medienpass/shared';
import { http, ApiError } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import { useToast } from '@/composables/useToast';

/** Alta de una evaluación. Crea también su primera versión en borrador. */

interface SubjectOption {
  id: string;
  code: string;
  name: LocalizedText;
}

interface GradeLevelOption {
  id: string;
  code: string;
  name: LocalizedText;
}

const router = useRouter();
const { t, locale } = useI18n();
const toast = useToast();

const title = ref('');
const description = ref('');
const instructions = ref('');
/*
 * La materia principal y el resto.
 *
 * Un trabajo sobre desinformación se evalúa en sociales y en informática a la
 * vez; con una sola materia había que elegir cuál de las dos mentía. La
 * principal sigue existiendo porque es la que ordena los informes.
 */
const subjectId = ref('');
const extraSubjectIds = ref<Set<string>>(new Set());
const gradeLevelId = ref('');
const academicPeriodId = ref('');
const timeLimitMinutes = ref<number | null>(null);

/*
 * Para quién es y para qué.
 *
 * El formulario no los enviaba, así que toda evaluación nacía «para
 * estudiantes / evaluación» y no había forma de crear una de capacitación
 * docente. La consecuencia se veía lejos del sitio donde estaba la causa:
 * ningún módulo formativo podía vincular su evaluación, y por tanto ningún
 * docente podía certificarse.
 */
const audience = ref<string>(ASSESSMENT_AUDIENCE.STUDENT);
const purpose = ref<string>(ASSESSMENT_PURPOSE.EVALUATION);

const subjects = ref<SubjectOption[]>([]);
const gradeLevels = ref<GradeLevelOption[]>([]);
const periods = ref<Array<{ id: string; name: string }>>([]);
const submitting = ref(false);
const fieldErrors = ref<Record<string, string>>({});

onMounted(async () => {
  const [subjectList, grades] = await Promise.all([
    http.list<SubjectOption>('/subjects', { pageSize: 100 }),
    http.get<GradeLevelOption[]>('/academic/grade-levels'),
  ]);
  subjects.value = subjectList.items;
  gradeLevels.value = grades;

  // Los periodos cuelgan del año vigente; si aún no hay, el campo no aparece.
  try {
    const year = await http.get<{ periods?: Array<{ id: string; name: string }> }>(
      '/academic/years/current',
    );
    periods.value = year.periods ?? [];
  } catch {
    periods.value = [];
  }
});

function alternarMateria(id: string): void {
  const copia = new Set(extraSubjectIds.value);
  if (copia.has(id)) copia.delete(id);
  else copia.add(id);
  extraSubjectIds.value = copia;
}

async function submit(): Promise<void> {
  submitting.value = true;
  fieldErrors.value = {};

  try {
    const created = await http.post<{ assessmentId: string; versionId: string }>('/assessments', {
      title: title.value.trim(),
      description: description.value.trim() || undefined,
      instructions: instructions.value.trim() || undefined,
      audience: audience.value,
      purpose: purpose.value,
      subjectId: subjectId.value || null,
      subjectIds: [...extraSubjectIds.value],
      academicPeriodId: academicPeriodId.value || null,
      gradeLevelId: gradeLevelId.value || null,
      timeLimitMinutes: timeLimitMinutes.value,
    });

    toast.success(t('common.saved'));
    await router.push(`/assessments/${created.assessmentId}`);
  } catch (error) {
    if (error instanceof ApiError) {
      toast.error(error.message);
      // Los errores por campo se pintan junto a su input, no solo en un aviso.
      for (const issue of error.issues ?? []) {
        fieldErrors.value[issue.path.replace('body.', '')] = issue.message;
      }
    }
  } finally {
    submitting.value = false;
  }
}

const label = (item: { name: LocalizedText; code: string }): string =>
  `${item.code} · ${localize(item.name, locale.value as never)}`;
</script>

<template>
  <form class="mx-auto flex max-w-2xl flex-col gap-5" @submit.prevent="submit">
    <BaseCard :title="t('assessment.createTitle')">
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="title">{{ t('assessment.titleField') }}</label>
          <input
            id="title"
            v-model="title"
            type="text"
            required
            minlength="3"
            class="h-10 rounded-md border bg-surface px-3 text-sm outline-none focus:border-brand-500"
            :class="fieldErrors.title ? 'border-danger' : 'border-border'"
            :aria-invalid="Boolean(fieldErrors.title)"
            :aria-describedby="fieldErrors.title ? 'title-error' : undefined"
          />
          <p v-if="fieldErrors.title" id="title-error" class="text-xs text-danger">
            {{ fieldErrors.title }}
          </p>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="description">
            {{ t('assessment.description') }}
            <span class="font-normal text-ink-subtle">({{ t('common.optional') }})</span>
          </label>
          <textarea
            id="description"
            v-model="description"
            rows="2"
            class="resize-y rounded-md border border-border bg-surface p-3 text-sm outline-none focus:border-brand-500"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="instructions">
            {{ t('assessment.instructions') }}
            <span class="font-normal text-ink-subtle">({{ t('common.optional') }})</span>
          </label>
          <textarea
            id="instructions"
            v-model="instructions"
            rows="3"
            class="resize-y rounded-md border border-border bg-surface p-3 text-sm outline-none focus:border-brand-500"
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="audience">
              {{ t('assessment.audience') }}
            </label>
            <select
              id="audience"
              v-model="audience"
              class="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
            >
              <option :value="ASSESSMENT_AUDIENCE.STUDENT">
                {{ t('assessment.audienceStudent') }}
              </option>
              <option :value="ASSESSMENT_AUDIENCE.TEACHER">
                {{ t('assessment.audienceTeacher') }}
              </option>
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="purpose">{{ t('assessment.purpose') }}</label>
            <select
              id="purpose"
              v-model="purpose"
              class="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
            >
              <option :value="ASSESSMENT_PURPOSE.EVALUATION">
                {{ t('assessment.purposeEvaluation') }}
              </option>
              <option :value="ASSESSMENT_PURPOSE.DIAGNOSTIC">
                {{ t('assessment.purposeDiagnostic') }}
              </option>
              <option :value="ASSESSMENT_PURPOSE.TRAINING">
                {{ t('assessment.purposeTraining') }}
              </option>
            </select>
            <!--
              La combinación que hace falta para certificar un módulo se dice
              aquí, y no se descubre después con un desplegable vacío.
            -->
            <span
              v-if="
                audience === ASSESSMENT_AUDIENCE.TEACHER && purpose === ASSESSMENT_PURPOSE.TRAINING
              "
              class="text-xs text-brand-600"
            >
              {{ t('assessment.trainingHint') }}
            </span>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="subject">{{ t('assessment.subject') }}</label>
            <select
              id="subject"
              v-model="subjectId"
              class="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
            >
              <option value="">{{ t('common.none') }}</option>
              <option v-for="subject in subjects" :key="subject.id" :value="subject.id">
                {{ label(subject) }}
              </option>
            </select>

            <!--
              Las demás materias, si la evaluación mide en más de una. Van
              detrás de un desplegable porque es lo excepcional: el formulario
              no debe pedir trece decisiones para el caso de siempre.
            -->
            <details v-if="subjects.length > 0" class="mt-2">
              <summary class="cursor-pointer text-xs text-ink-muted">
                {{ t('assessment.moreSubjects', { count: extraSubjectIds.size }) }}
              </summary>
              <ul class="mt-2 grid max-h-40 gap-1 overflow-y-auto">
                <li v-for="subject in subjects" :key="subject.id">
                  <label class="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      class="size-4 accent-brand-600"
                      :checked="extraSubjectIds.has(subject.id)"
                      @change="alternarMateria(subject.id)"
                    />
                    {{ label(subject) }}
                  </label>
                </li>
              </ul>
            </details>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="grade">{{ t('assessment.gradeLevel') }}</label>
            <select
              id="grade"
              v-model="gradeLevelId"
              class="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
            >
              <option value="">{{ t('common.none') }}</option>
              <option v-for="grade in gradeLevels" :key="grade.id" :value="grade.id">
                {{ label(grade) }}
              </option>
            </select>

            <!--
              El periodo, porque las evaluaciones se discriminan por periodo:
              sin él no hay forma de responder qué se evaluó en el segundo
              trimestre sin mirar fechas una por una.
            -->
            <template v-if="periods.length > 0">
              <label class="mt-4 text-sm font-medium" for="period">
                {{ t('statistics.period') }}
              </label>
              <select
                id="period"
                v-model="academicPeriodId"
                class="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
              >
                <option value="">{{ t('common.none') }}</option>
                <option v-for="period in periods" :key="period.id" :value="period.id">
                  {{ period.name }}
                </option>
              </select>
            </template>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium" for="time-limit">
            {{ t('assessment.timeLimit') }}
            <span class="font-normal text-ink-subtle">({{ t('common.optional') }})</span>
          </label>
          <input
            id="time-limit"
            v-model.number="timeLimitMinutes"
            type="number"
            min="0"
            max="600"
            class="h-10 w-32 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500"
          />
        </div>
      </div>
    </BaseCard>

    <div class="flex justify-end gap-2">
      <BaseButton variant="secondary" type="button" @click="router.back()">
        {{ t('common.cancel') }}
      </BaseButton>
      <BaseButton type="submit" :loading="submitting">{{ t('common.create') }}</BaseButton>
    </div>
  </form>
</template>
