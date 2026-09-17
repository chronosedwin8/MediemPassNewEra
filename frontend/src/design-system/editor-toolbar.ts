import type { Editor } from '@tiptap/vue-3';

/**
 * Los botones de formato, en el orden en que aparecen.
 *
 * Están fuera del componente para que la barra se lea de un vistazo —diez
 * entradas iguales, no doscientas líneas entre la lógica del editor— y porque
 * el orden es una decisión de diseño que conviene poder revisar sola.
 *
 * La lista ofrece exactamente lo que el servidor admite al guardar. Ofrecer de
 * más y que el saneado lo descarte es la peor combinación posible: el trabajo
 * desaparece sin que nadie explique por qué.
 */

export interface ToolbarAction {
  key: string;
  labelKey: string;
  icon: string;
  isActive: () => boolean;
  run: () => void;
}

export function formatActions(editor: Editor): ToolbarAction[] {
  return [
    {
      key: 'heading3',
      labelKey: 'editor.heading',
      icon: 'H1',
      isActive: () => editor.isActive('heading', { level: 3 }),
      run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      key: 'heading4',
      labelKey: 'editor.subheading',
      icon: 'H2',
      isActive: () => editor.isActive('heading', { level: 4 }),
      run: () => editor.chain().focus().toggleHeading({ level: 4 }).run(),
    },
    {
      key: 'bold',
      labelKey: 'editor.bold',
      icon: 'B',
      isActive: () => editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      key: 'italic',
      labelKey: 'editor.italic',
      icon: 'I',
      isActive: () => editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      key: 'underline',
      labelKey: 'editor.underline',
      icon: 'U',
      isActive: () => editor.isActive('underline'),
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      key: 'bulletList',
      labelKey: 'editor.bulletList',
      icon: '•',
      isActive: () => editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      key: 'orderedList',
      labelKey: 'editor.orderedList',
      icon: '1.',
      isActive: () => editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      key: 'blockquote',
      labelKey: 'editor.quote',
      icon: '“',
      isActive: () => editor.isActive('blockquote'),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      key: 'code',
      labelKey: 'editor.code',
      icon: '</>',
      isActive: () => editor.isActive('code'),
      run: () => editor.chain().focus().toggleCode().run(),
    },
    {
      key: 'horizontalRule',
      labelKey: 'editor.divider',
      icon: '—',
      isActive: () => false,
      run: () => editor.chain().focus().setHorizontalRule().run(),
    },
  ];
}
