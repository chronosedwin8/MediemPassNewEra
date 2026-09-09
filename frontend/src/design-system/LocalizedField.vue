<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { SUPPORTED_LANGUAGES, type Language, type LocalizedText } from '@medienpass/shared';
import { LANGUAGE_NAMES } from '@/app/languages';
import RichTextEditor from './RichTextEditor.vue';

/**
 * Un texto que existe en tres idiomas.
 *
 * La plataforma es trilingüe, pero pedirle a quien redacta que escriba todo
 * tres veces antes de poder guardar sería garantizar que nadie escriba nada.
 * Así que se empieza por el idioma de la interfaz y los demás quedan como
 * pestañas opcionales, marcadas para que se vea de un vistazo cuáles faltan.
 *
 * Los idiomas vacíos **no se guardan** como cadena vacía: se omiten, y así
 * `localize` recurre al que sí tenga contenido. Guardarlos vacíos haría que un
 * docente en alemán viera un hueco en lugar del texto en español.
 */

const props = withDefaults(
  defineProps<{
    modelValue: Partial<LocalizedText>;
    label: string;
    hint?: string;
    /** Con formato o texto plano. Un título no necesita negritas. */
    rich?: boolean;
    /**
     * Sube una imagen y devuelve su URL.
     *
     * Se recibe como función en lugar de resolverlo aquí porque cada sitio
     * sube a un destino distinto —el enunciado de una pregunta, el material de
     * un módulo— y este componente no tiene por qué conocerlos.
     */
    uploadImage?: (file: File) => Promise<string>;
  }>(),
  { hint: undefined, rich: false, uploadImage: undefined },
);

const emit = defineEmits<{ 'update:modelValue': [value: Partial<LocalizedText>] }>();

const { t, locale } = useI18n();

const active = ref<Language>(locale.value as Language);
const editorRef = ref<InstanceType<typeof RichTextEditor> | null>(null);
const imageInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);

async function onPickImage(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file || !props.uploadImage) return;

  uploading.value = true;
  try {
    editorRef.value?.insertImage(await props.uploadImage(file), file.name);
  } finally {
    uploading.value = false;
    if (imageInput.value) imageInput.value.value = '';
  }
}

function valueFor(language: Language): string {
  return props.modelValue[language] ?? '';
}

function update(language: Language, value: string): void {
  const next = { ...props.modelValue };
  if (value.trim()) next[language] = value;
  else delete next[language];
  emit('update:modelValue', next);
}

const filled = computed(
  () => new Set(SUPPORTED_LANGUAGES.filter((code) => (props.modelValue[code] ?? '').trim())),
);

const inputClass =
  'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-brand-500';
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-sm font-medium">{{ label }}</span>

      <!--
        Las pestañas dicen dónde hay contenido y dónde no. Sin la marca, quien
        redacta descubre que faltaba el alemán cuando un docente se queja.
      -->
      <div class="flex gap-1" role="tablist" :aria-label="label">
        <button
          v-for="code in SUPPORTED_LANGUAGES"
          :key="code"
          type="button"
          role="tab"
          :aria-selected="active === code"
          class="rounded px-2 py-1 text-xs font-medium"
          :class="
            active === code
              ? 'bg-brand-50 text-brand-700'
              : filled.has(code)
                ? 'text-ink-muted hover:bg-surface-muted'
                : 'text-ink-subtle hover:bg-surface-muted'
          "
          @click="active = code"
        >
          {{ LANGUAGE_NAMES[code] }}
          <span v-if="!filled.has(code)" aria-hidden="true">·</span>
        </button>
      </div>
    </div>

    <span v-if="hint" class="text-xs text-ink-subtle">{{ hint }}</span>

    <RichTextEditor
      v-if="rich"
      :key="`rich-${active}`"
      ref="editorRef"
      :model-value="valueFor(active)"
      :aria-label="`${label} — ${LANGUAGE_NAMES[active]}`"
      @update:model-value="update(active, $event)"
    >
      <template v-if="uploadImage" #toolbar-extra>
        <span class="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <input
          ref="imageInput"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          class="sr-only"
          @change="onPickImage"
        />
        <button
          type="button"
          class="h-8 rounded px-2 text-xs text-ink-muted hover:bg-surface-muted"
          :disabled="uploading"
          :title="t('editor.insertImage')"
          @click="imageInput?.click()"
        >
          {{ uploading ? t('common.saving') : t('editor.insertImage') }}
        </button>
      </template>
    </RichTextEditor>

    <input
      v-else
      :key="`plain-${active}`"
      type="text"
      :value="valueFor(active)"
      :class="inputClass"
      :aria-label="`${label} — ${LANGUAGE_NAMES[active]}`"
      @input="update(active, ($event.target as HTMLInputElement).value)"
    />

    <p v-if="filled.size === 0" class="text-xs text-warning">
      {{ t('training.admin.needsOneLanguage') }}
    </p>
  </div>
</template>
