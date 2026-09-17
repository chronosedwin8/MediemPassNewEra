<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Editor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import { EMBED_PLATFORMS, RICH_TEXT_MAX_LENGTH, resolveEmbed } from '@medienpass/shared';
import { AudioNode, EmbedNode, VideoNode } from './editor-media';
import { formatActions } from './editor-toolbar';

/**
 * Editor de contenido.
 *
 * Se escribe y se inserta en el mismo sitio: texto con formato, imágenes,
 * vídeo, audio y lo que vive en otras plataformas —un Genially, una
 * presentación— van dentro del documento, no en fichas aparte. Es lo que
 * distingue escribir una lección de rellenar un formulario.
 *
 * La barra ofrece **exactamente** lo que el servidor admite al guardar.
 * Ofrecer de más y que el saneado lo tire es la peor combinación posible: el
 * trabajo desaparece sin explicación. Por eso los medios comprueban su
 * dirección al insertarse y lo que no se puede incrustar se dice en el
 * momento, no al publicar.
 *
 * Los archivos no los sube este componente: recibe `uploadFile` del padre, que
 * es quien sabe a qué evaluación o a qué bloque pertenece lo que se sube.
 */

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    /** Sin barra de herramientas, para respuestas breves. */
    minimal?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
    /** Sube un archivo y devuelve su dirección estable. */
    uploadFile?: (file: File) => Promise<string>;
  }>(),
  {
    placeholder: '',
    minimal: false,
    disabled: false,
    ariaLabel: undefined,
    uploadFile: undefined,
  },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const { t } = useI18n();

const fileInput = ref<HTMLInputElement | null>(null);
const subiendo = ref(false);
/** Qué se está subiendo: decide el filtro del diálogo y el nodo que se crea. */
const tipoSubida = ref<'image' | 'video' | 'audio'>('image');

const editor = new Editor({
  content: props.modelValue,
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({
      // Sin `h1` ni `h2`: el documento vive dentro de una página que ya tiene
      // su jerarquía, y un `h1` en mitad de una lección rompe el recorrido de
      // quien navega por encabezados con lector de pantalla.
      heading: { levels: [3, 4] },
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      protocols: ['http', 'https', 'mailto'],
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    }),
    Image.configure({ inline: false, allowBase64: false }),
    VideoNode,
    AudioNode,
    EmbedNode,
  ],
  editorProps: {
    attributes: {
      class: 'rich-editor__content',
      ...(props.ariaLabel ? { 'aria-label': props.ariaLabel } : {}),
    },
  },
  onUpdate: ({ editor: instance }) => {
    emit('update:modelValue', instance.isEmpty ? '' : instance.getHTML());
  },
});

// El padre puede cambiar el valor (cargar otra pregunta, limpiar el formulario)
// sin que eso deba reescribir lo que se está tecleando.
watch(
  () => props.modelValue,
  (value) => {
    if (value !== editor.getHTML()) editor.commands.setContent(value || '', false);
  },
);

watch(
  () => props.disabled,
  (value) => editor.setEditable(!value),
);

onBeforeUnmount(() => editor.destroy());

const remaining = computed(() => RICH_TEXT_MAX_LENGTH - editor.getHTML().length);

const FORMAT_ACTIONS = formatActions(editor);

/** Las plataformas admitidas, para decirlo antes de que alguien pruebe. */
const plataformas = EMBED_PLATFORMS.map((plataforma) => plataforma.label).join(', ');

function setLink(): void {
  const previous = editor.getAttributes('link')['href'] as string | undefined;
  const url = window.prompt(t('editor.linkPrompt'), previous ?? 'https://');

  if (url === null) return;
  if (url === '') {
    editor.chain().focus().unsetLink().run();
    return;
  }
  editor.chain().focus().setLink({ href: url }).run();
}

/**
 * Inserta lo que haya en esa dirección, sea lo que sea.
 *
 * Un enlace de YouTube se convierte en su reproductor, uno de Genially en su
 * marco, y un archivo `.mp3` en un reproductor de audio. Quien escribe pega la
 * dirección que copió del navegador y no tiene que saber cuál de las tres
 * cosas es.
 */
function insertFromUrl(): void {
  const raw = window.prompt(t('editor.mediaPrompt', { platforms: plataformas }), 'https://');
  if (!raw) return;

  const recurso = resolveEmbed(raw.trim(), window.location.origin);

  if (recurso.kind === 'link') {
    window.alert(t('editor.mediaNotSupported', { platforms: plataformas }));
    return;
  }

  insertResource(recurso.kind, recurso.src);
}

function insertResource(kind: 'iframe' | 'video' | 'audio' | 'image', src: string): void {
  const nombre = { iframe: 'embed', video: 'video', audio: 'audio', image: 'image' }[kind];
  editor.chain().focus().insertContent({ type: nombre, attrs: { src } }).run();
}

/** Abre el diálogo de archivos pidiendo el tipo que se va a insertar. */
function pickFile(tipo: 'image' | 'video' | 'audio'): void {
  tipoSubida.value = tipo;
  fileInput.value?.click();
}

async function onFileChosen(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file || !props.uploadFile) return;

  subiendo.value = true;
  try {
    const url = await props.uploadFile(file);
    insertResource(tipoSubida.value, url);
  } catch {
    window.alert(t('editor.uploadFailed'));
  } finally {
    subiendo.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}

const accept = computed(() =>
  ({ image: 'image/*', video: 'video/mp4,video/webm', audio: 'audio/*' })[tipoSubida.value],
);

/** Compatibilidad: el padre puede seguir insertando una imagen ya subida. */
function insertImage(url: string, alt: string): void {
  editor.chain().focus().setImage({ src: url, alt }).run();
}

defineExpose({ insertImage, focus: () => editor.commands.focus() });

const botonClase = 'h-8 min-w-8 rounded px-1.5 text-sm hover:bg-surface-muted';
</script>

<template>
  <div
    class="flex flex-col rounded-md border border-border bg-surface focus-within:border-brand-500"
  >
    <div
      v-if="!minimal"
      class="flex flex-wrap items-center gap-1 border-b border-border p-1.5"
      role="toolbar"
      :aria-label="t('editor.toolbar')"
    >
      <button
        v-for="action in FORMAT_ACTIONS"
        :key="action.key"
        type="button"
        :class="[
          botonClase,
          action.isActive() ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink-muted',
        ]"
        :aria-pressed="action.isActive()"
        :title="t(action.labelKey)"
        :aria-label="t(action.labelKey)"
        :disabled="disabled"
        @click="action.run"
      >
        <span aria-hidden="true">{{ action.icon }}</span>
      </button>

      <button
        type="button"
        :class="[botonClase, editor.isActive('link') ? 'bg-brand-50 text-brand-700' : 'text-ink-muted']"
        :title="t('editor.link')"
        :aria-label="t('editor.link')"
        :disabled="disabled"
        @click="setLink"
      >
        <span aria-hidden="true">&#128279;</span>
      </button>

      <span class="mx-1 h-5 w-px bg-border" aria-hidden="true" />

      <!--
        Insertar. Subir un archivo y pegar una dirección son dos gestos
        distintos para lo mismo, y hacen falta los dos: el vídeo de la clase
        está en el ordenador, y el Genially está en Genially.
      -->
      <template v-if="uploadFile">
        <button
          type="button"
          :class="[botonClase, 'text-ink-muted']"
          :title="t('editor.insertImage')"
          :aria-label="t('editor.insertImage')"
          :disabled="disabled || subiendo"
          @click="pickFile('image')"
        >
          <span aria-hidden="true">&#128247;</span>
        </button>
        <button
          type="button"
          :class="[botonClase, 'text-ink-muted']"
          :title="t('editor.insertVideo')"
          :aria-label="t('editor.insertVideo')"
          :disabled="disabled || subiendo"
          @click="pickFile('video')"
        >
          <span aria-hidden="true">&#127916;</span>
        </button>
        <button
          type="button"
          :class="[botonClase, 'text-ink-muted']"
          :title="t('editor.insertAudio')"
          :aria-label="t('editor.insertAudio')"
          :disabled="disabled || subiendo"
          @click="pickFile('audio')"
        >
          <span aria-hidden="true">&#127911;</span>
        </button>
      </template>

      <button
        type="button"
        :class="[botonClase, 'text-ink-muted']"
        :title="t('editor.insertEmbed', { platforms: plataformas })"
        :aria-label="t('editor.insertEmbed', { platforms: plataformas })"
        :disabled="disabled"
        @click="insertFromUrl"
      >
        <span aria-hidden="true">&#129513;</span>
      </button>

      <span v-if="subiendo" class="px-1 text-xs text-ink-subtle">{{ t('editor.uploading') }}</span>

      <input ref="fileInput" type="file" class="sr-only" :accept="accept" @change="onFileChosen" />

      <slot name="toolbar-extra" />
    </div>

    <EditorContent :editor="editor" class="min-h-24 px-3 py-2 text-sm" />

    <p
      v-if="remaining < 2000"
      class="px-3 pb-1.5 text-right text-xs tabular-nums"
      :class="remaining < 0 ? 'text-danger' : 'text-ink-subtle'"
    >
      {{ t('editor.remaining', { count: remaining }) }}
    </p>
  </div>
</template>

<style scoped>
.rich-editor__content:focus {
  outline: none;
}

:deep(.rich-editor__content p) {
  margin: 0 0 0.6em;
}

:deep(.rich-editor__content p:last-child) {
  margin-bottom: 0;
}

:deep(.rich-editor__content h3) {
  margin: 0.8em 0 0.4em;
  font-size: 1.05rem;
  font-weight: 600;
}

:deep(.rich-editor__content h4) {
  margin: 0.8em 0 0.4em;
  font-weight: 600;
}

:deep(.rich-editor__content ul) {
  list-style: disc;
  padding-left: 1.4em;
}

:deep(.rich-editor__content ol) {
  list-style: decimal;
  padding-left: 1.4em;
}

:deep(.rich-editor__content blockquote) {
  padding-left: 0.9em;
  border-left: 3px solid var(--color-border-strong, #cbd5e1);
}

:deep(.rich-editor__content img) {
  max-width: 100%;
  height: auto;
  border-radius: 0.5rem;
}

/*
 * Los medios se ven dentro del editor tal como se verán publicados, con un
 * borde de selección: un bloque que en el editor es una caja gris y al
 * publicar es un vídeo obliga a previsualizar para cada cambio.
 */
:deep(.rich-editor__content video),
:deep(.rich-editor__content iframe) {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  margin: 0.5em 0;
  border: 0;
  border-radius: 0.5rem;
  background: #000;
}

:deep(.rich-editor__content audio) {
  display: block;
  width: 100%;
  margin: 0.5em 0;
}

:deep(.rich-editor__content hr) {
  margin: 0.8em 0;
  border: 0;
  border-top: 1px solid var(--color-border, #e2e8f0);
}

:deep(.rich-editor__content .ProseMirror-selectednode) {
  outline: 2px solid var(--color-brand-500, #3b82f6);
  outline-offset: 2px;
}

/* El marcador de párrafo vacío, para que no parezca que el editor no responde. */
:deep(.rich-editor__content p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  color: var(--color-ink-subtle, #94a3b8);
  pointer-events: none;
}
</style>
