import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Markdown } from 'tiptap-markdown';
import { cn } from '../ui/cn';

export type RichEditorHandle = { focus: () => void; clear: () => void; getMarkdown: () => string; setMarkdown: (md: string) => void };

type Props = {
  value: string;
  onChange?: (markdown: string) => void;
  onBlur?: (markdown: string) => void;
  onSubmit?: (markdown: string) => void;
  onEscape?: () => void;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
  className?: string;
  minHeight?: number;
};

const getMarkdown = (editor: Editor) => (editor.storage as any).markdown.getMarkdown() as string;

/**
 * Markdown in, Markdown out, no toolbar. Formatting comes from the shortcuts
 * people already type — `##`, `-`, `[ ]`, `**`, backticks — which is how the
 * editors people compare this to feel. Descriptions are stored as Markdown so
 * they stay readable in the database, exports and the AI prompts.
 */
export const RichEditor = forwardRef<RichEditorHandle, Props>(function RichEditor(
  { value, onChange, onBlur, onSubmit, onEscape, placeholder = 'Add description…', editable = true, autoFocus, className, minHeight = 80 },
  ref,
) {
  const last = useRef(value);
  const handlers = useRef({ onChange, onBlur, onSubmit, onEscape });
  handlers.current = { onChange, onBlur, onSubmit, onEscape };
  // The editor normalises content as it loads (a paragraph after a trailing list, re-serialised
  // Markdown) and reports that as an update. Only a person's input is a change — otherwise merely
  // opening an issue would autosave its description and log an edit nobody made.
  const touched = useRef(false);
  const touch = () => {
    touched.current = true;
    return false;
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // A plain click puts the caret in the link text to edit it; ⌘/Ctrl-click opens it (see handleClick).
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({ html: false, linkify: true, breaks: true, transformPastedText: true }),
    ],
    content: value,
    editable,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: { class: 'prose-issue-tracker focus:outline-none' },
      handleDOMEvents: { beforeinput: touch, keydown: touch, paste: touch, drop: touch, pointerdown: touch },
      handleClick: (view, _pos, event) => {
        const link = (event.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
        if (!link || !view.dom.contains(link)) return false;
        if (!view.editable || event.metaKey || event.ctrlKey) {
          window.open(link.href, '_blank', 'noopener,noreferrer');
          return true;
        }
        return false;
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && handlers.current.onSubmit) {
          event.preventDefault();
          handlers.current.onSubmit(last.current);
          return true;
        }
        if (event.key === 'Escape' && handlers.current.onEscape) {
          handlers.current.onEscape();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const md = getMarkdown(editor);
      last.current = md;
      if (touched.current) handlers.current.onChange?.(md);
    },
    onBlur: ({ editor }) => {
      if (touched.current) handlers.current.onBlur?.(getMarkdown(editor));
    },
  });

  // Adopt outside changes (another tab saved, the AI drafted) without clobbering typing.
  useEffect(() => {
    if (!editor || value === last.current || editor.isFocused) return;
    last.current = value;
    // New content (often a different issue in the same panel) starts untouched again.
    touched.current = false;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  useImperativeHandle(ref, () => ({
    focus: () => editor?.commands.focus('end'),
    clear: () => {
      last.current = '';
      editor?.commands.clearContent(false);
    },
    getMarkdown: () => (editor ? getMarkdown(editor) : last.current),
    setMarkdown: (md: string) => {
      last.current = md;
      editor?.commands.setContent(md, { emitUpdate: false });
    },
  }), [editor]);

  return (
    <div
      className={cn('issue-tracker-editor cursor-text', className)}
      style={{ minHeight }}
      // Only clicks on the empty area below the text focus the end; a click inside text places the caret itself.
      onClick={e => editable && e.target === e.currentTarget && editor?.commands.focus('end')}
    >
      <EditorContent editor={editor} />
    </div>
  );
});
