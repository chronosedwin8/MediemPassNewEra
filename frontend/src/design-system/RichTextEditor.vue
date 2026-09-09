<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Editor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import { RICH_TEXT_MAX_LENGTH } from '@medienpass/shared';

/**
 * Editor de texto con formato.
 *
 * El conjunto de extensiones está recortado a propósito para que coincida con
 * lo que el servidor admite. Ofrecer tablas o colores en la barra y que el
 * saneado los tire al guardar sería la peor combinación posible: el docente ve
 * su trabajo desaparecer sin explicación.
 *
 * Las imágenes se insertan por URL, y quien la proporciona es el componente
 * padre después de subir el archivo: este editor no sabe nada de S3.
 */

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    /** Sin barra de herramientas, para respuestas breves. */
    minimal?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
  }>(),
  { placeholder: '', minimal: false, disabled: false, ariaLabel: undefined },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const { t } = useI18n();

const editor = new Editor({
  content: props.modelValue,
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({
      // Sin encabezados grandes: el enunciado ya vive dentro de una jerarquía
      // de la página, y un `h1` dentro de una pregunta rompe el orden para
      // quien navega por encabezados con lector de pantalla.
      heading: { levels: [3, 4] },
      horizontalRule: false,
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      protocols: ['http', 'https', 'mailto'],
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    }),
    Image.configure({ inline: false, allowBase64: false }),
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

interface ToolbarAction {
  key: string;
  labelKey: string;
  isActive: () => boolean;
  run: () => void;
}

const ACTIONS: ToolbarAction[] = [
  {
    key: 'bold',
    labelKey: 'editor.bold',
    isActive: () => editor.isActive('bold'),
    run: () => editor.chain().focus().toggleBold().run(),
  },
  {
    key: 'italic',
    labelKey: 'editor.italic',
    isActive: () => editor.isActive('italic'),
    run: () => editor.chain().focus().toggleItalic().run(),
  },
  {
    key: 'underline',
    labelKey: 'editor.underline',
    isActive: () => editor.isActive('underline'),
    run: () => editor.chain().focus().toggleUnderline().run(),
  },
  {
    key: 'bulletList',
    labelKey: 'editor.bulletList',
    isActive: () => editor.isActive('bulletList'),
    run: () => editor.chain().focus().toggleBulletList().run(),
  },
  {
    key: 'orderedList',
    labelKey: 'editor.orderedList',
    isActive: () => editor.isActive('orderedList'),
    run: () => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    key: 'blockquote',
    labelKey: 'editor.quote',
    isActive: () => editor.isActive('blockquote'),
    run: () => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    key: 'code',
    labelKey: 'editor.code',
    isActive: () => editor.isActive('code'),
    run: () => editor.chain().focus().toggleCode().run(),
  },
];

const ICONS: Record<string, string> = {
  bold: 'B',
  italic: 'I',
  underline: 'U',
  bulletList: '•',
  orderedList: '1.',
  blockquote: '“',
  code: '</>',
};

/** Inserta una imagen ya subida. Lo llama el padre con la URL definitiva. */
function insertImage(url: string, alt: string): void {
  editor.chain().focus().setImage({ src: url, alt }).run();
}

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

defineExpose({ insertImage, focus: () => editor.commands.focus() });
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
        v-for="action in ACTIONS"
        :key="action.key"
        type="button"
        class="size-8 rounded text-sm hover:bg-surface-muted"
        :class="action.isActive() ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink-muted'"
        :aria-pressed="action.isActive()"
        :title="t(action.labelKey)"
        :aria-label="t(action.labelKey)"
        :disabled="disabled"
        @click="action.run"
      >
        <span aria-hidden="true">{{ ICONS[action.key] }}</span>
      </button>

      <button
        type="button"
        class="size-8 rounded text-sm text-ink-muted hover:bg-surface-muted"
        :class="editor.isActive('link') ? 'bg-brand-50 font-semibold text-brand-700' : ''"
        :title="t('editor.link')"
        :aria-label="t('editor.link')"
        :disabled="disabled"
        @click="setLink"
      >
        <span aria-hidden="true">&#128279;</span>
      </button>

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

/* El marcador de párrafo vacío, para que no parezca que el editor no responde. */
:deep(.rich-editor__content p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  color: var(--color-ink-subtle, #94a3b8);
  pointer-events: none;
}
</style>
