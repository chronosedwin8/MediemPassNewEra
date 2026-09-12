<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MEDIA_MAX_SECONDS, QUESTION_TYPE, type QuestionType } from '@medienpass/shared';

/**
 * Ajustes de una pregunta que se responde grabando.
 *
 * Hay poco que configurar, y es a propósito: el enunciado es la consigna y lo
 * único que cambia es cuánto puede durar la grabación. El máximo del tipo no
 * se puede subir desde aquí —es un límite de almacenamiento y de la atención
 * de quien corrige, no una preferencia—, así que el campo solo permite pedir
 * menos.
 */

const props = defineProps<{ type: QuestionType; payload: Record<string, unknown> }>();

const emit = defineEmits<{ 'update:payload': [Record<string, unknown>] }>();

const { t } = useI18n();

const isSelfie = computed(() => props.type === QUESTION_TYPE.SELFIE);
const ceiling = computed(() => MEDIA_MAX_SECONDS[props.type] ?? 0);

const maxSeconds = computed({
  get: () =>
    typeof props.payload['maxSeconds'] === 'number' ? props.payload['maxSeconds'] : ceiling.value,
  set: (value: number) =>
    emit('update:payload', {
      ...props.payload,
      maxSeconds: Math.min(Math.max(10, Math.round(value)), ceiling.value),
    }),
});

const guidance = computed({
  get: () => (typeof props.payload['guidance'] === 'string' ? props.payload['guidance'] : ''),
  set: (value: string) => emit('update:payload', { ...props.payload, guidance: value }),
});

const inputClass =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <div class="flex flex-col gap-4">
    <label v-if="!isSelfie" class="flex max-w-xs flex-col gap-1.5">
      <span class="text-sm font-medium">{{ t('question.media.maxSeconds') }}</span>
      <input
        v-model.number="maxSeconds"
        type="number"
        min="10"
        :max="ceiling"
        step="10"
        :class="inputClass"
      />
      <span class="text-xs text-ink-subtle">
        {{ t('question.media.maxSecondsHint', { seconds: ceiling }) }}
      </span>
    </label>

    <label class="flex flex-col gap-1.5">
      <span class="text-sm font-medium">{{ t('question.media.guidance') }}</span>
      <textarea
        v-model="guidance"
        rows="2"
        maxlength="500"
        class="resize-y rounded-md border border-border bg-surface p-3 text-sm outline-none focus:border-brand-500"
      />
      <span class="text-xs text-ink-subtle">
        {{ isSelfie ? t('question.media.guidanceSelfieHint') : t('question.media.guidanceHint') }}
      </span>
    </label>

    <!--
      Se dice aquí y no solo en la guía: quien escribe la pregunta es quien
      tiene que saber que la cámara exige HTTPS, porque es quien va a recibir
      el aviso de que «no funciona» el día del examen.
    -->
    <p class="rounded-md border border-info/30 bg-info-soft px-3 py-2 text-xs">
      {{ t('question.media.secureContextNote') }}
    </p>
  </div>
</template>
