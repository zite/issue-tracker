import { ArrowUp, CircleNotch } from '@phosphor-icons/react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { cn } from '../ui/cn';
import { MOD } from '../lib/hotkeys';
import { useWorkspace } from '../lib/workspace';
import { Avatar } from '../ui/Avatar';

export type ComposerHandle = { focus: () => void; insert: (text: string) => void };

type Props = {
  placeholder?: string;
  onSubmit: (body: string) => Promise<unknown> | void;
  initialValue?: string;
  submitLabel?: string;
  onCancel?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
  className?: string;
};

/**
 * The comment box. Markdown, @mentions with a keyboard picker, and ⌘↵ to send —
 * the mention picker is what makes the server-side mention notifications
 * reachable at all.
 */
export const MentionComposer = forwardRef<ComposerHandle, Props>(function MentionComposer(
  { placeholder = 'Leave a comment…', onSubmit, initialValue = '', submitLabel = 'Comment', onCancel, autoFocus, compact, className },
  ref,
) {
  const ws = useWorkspace();
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => area.current?.focus(),
    insert: (text: string) => {
      setValue(v => (v ? `${v}\n${text}` : text));
      window.setTimeout(() => area.current?.focus(), 0);
    },
  }));

  // Editing starts with the caret after the existing text, not before it.
  useEffect(() => {
    if (!autoFocus || !area.current) return;
    const end = area.current.value.length;
    area.current.focus();
    area.current.setSelectionRange(end, end);
  }, []);

  // Grow with the text, up to a point.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(320, Math.max(compact ? 36 : 56, el.scrollHeight))}px`;
  }, [value, compact]);

  const matches = useMemo(() => {
    if (!mention) return [];
    // "tomas" finds Tomás: compare without accents.
    const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = fold(mention.query);
    return ws.activeMembers
      .filter(m => fold(m.name).split(/\s+/).some(part => part.startsWith(q)) || fold(m.name).startsWith(q) || (m.email ?? '').toLowerCase().startsWith(q))
      .slice(0, 6);
  }, [mention, ws.activeMembers]);

  const detect = (text: string, caret: number) => {
    const upto = text.slice(0, caret);
    const m = /(^|\s)@([\w.'-]*(?: [\w.'-]*)?)$/.exec(upto);
    if (m && m[2].length <= 24) {
      setMention({ start: caret - m[2].length - 1, query: m[2] });
      setActive(0);
    } else setMention(null);
  };

  const choose = (name: string) => {
    if (!mention || !area.current) return;
    const caret = area.current.selectionStart;
    const next = `${value.slice(0, mention.start)}@${name} ${value.slice(caret)}`;
    setValue(next);
    setMention(null);
    const pos = mention.start + name.length + 2;
    window.setTimeout(() => {
      area.current?.focus();
      area.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const submit = async () => {
    const body = value.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await onSubmit(body);
      setValue('');
    } catch {
      // The caller has already said what went wrong; keep the text so nothing is lost.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('relative rounded-lg border border-line-strong bg-card shadow-hairline transition-[border-color,box-shadow] focus-within:border-ink/50 focus-within:ring-[3px] focus-within:ring-highlight/40', className)}>
      <textarea
        ref={area}
        value={value}
        aria-label={placeholder}
        placeholder={placeholder}
        rows={1}
        onChange={e => {
          setValue(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={e => {
          if (mention && matches.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % matches.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + matches.length) % matches.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(matches[active].name); return; }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMention(null); return; }
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape' && onCancel) {
            e.stopPropagation();
            onCancel();
          }
        }}
        onBlur={() => setTimeout(() => setMention(null), 150)}
        className="block w-full resize-none bg-transparent px-3 pt-2.5 text-body leading-relaxed text-ink outline-none placeholder:text-ink-3"
      />
      <div className="flex items-center justify-end gap-2 px-2 pb-2">
        <span className="mr-auto pl-1 text-meta text-ink-3">{value ? `${MOD}↵ to send · Markdown supported` : ''}</span>
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-7 rounded-sm px-2.5 text-meta font-medium text-ink-2 hover:bg-hover hover:text-ink">
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || busy}
          aria-label={submitLabel}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-meta font-medium transition-colors',
            value.trim() ? 'bg-primary text-on-primary hover:bg-primary/90' : 'bg-sunken text-ink-3',
          )}
        >
          {busy ? <CircleNotch size={14} className="animate-spin" /> : compact ? <ArrowUp size={14} weight="bold" /> : null}
          {!compact && submitLabel}
        </button>
      </div>
      {mention && matches.length > 0 && (
        <div className="absolute bottom-full left-2 z-50 mb-1 w-80 max-w-[calc(100%-1rem)] overflow-hidden rounded-lg border border-line bg-card p-1 shadow-pop animate-pop-in" role="listbox">
          {matches.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={e => {
                e.preventDefault();
                choose(m.name);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-ui', i === active && 'bg-sunken')}
            >
              <Avatar person={m} size={18} />
              <span className="shrink-0">{m.name}</span>
              <span className="ml-auto min-w-0 truncate pl-2 text-meta text-ink-3">{m.jobTitle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
