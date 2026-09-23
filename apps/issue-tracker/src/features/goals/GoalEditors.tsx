import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { RichEditor } from '../../editor/RichEditor';
import type { Goal } from '../../lib/types';
import { cn } from '../../ui/cn';
import { useGoalActions } from './useGoalActions';

/** A textarea as tall as its text — re-measured when the text changes and when its width does (a rotated phone, a resized window). */
function useAutoHeight(ref: RefObject<HTMLTextAreaElement>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = '0px';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, value]);
}

/** Editable text in a header: no box, a stone rule on hover and a highlighter rule while you type. */
const inPlace =
  'bg-transparent outline-none transition-shadow duration-150 [@media(hover:hover)]:hover:shadow-[inset_0_-1px_0_rgb(var(--line-strong))] focus:shadow-[inset_0_-2px_0_rgb(var(--highlight))] placeholder:text-ink-3';

export function GoalTitleEditor({ goal }: { goal: Goal }) {
  const actions = useGoalActions();
  const [value, setValue] = useState(goal.name);
  const ref = useRef<HTMLTextAreaElement>(null);
  const skipBlur = useRef(false);
  useEffect(() => setValue(goal.name), [goal.name]);
  useAutoHeight(ref, value);

  const commit = async () => {
    if (skipBlur.current) {
      skipBlur.current = false;
      return;
    }
    const name = value.trim();
    if (!name) return setValue(goal.name);
    if (name !== goal.name && !(await actions.update(goal, { name }))) setValue(goal.name);
  };

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      maxLength={200}
      aria-label="Goal name"
      spellCheck={false}
      onChange={e => setValue(e.target.value.replace(/\n/g, ' '))}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setValue(goal.name);
          skipBlur.current = true;
          e.currentTarget.blur();
        }
      }}
      className={cn('block w-full resize-none overflow-hidden whitespace-pre-wrap', inPlace)}
    />
  );
}

export function GoalSummaryEditor({ goal }: { goal: Goal }) {
  const actions = useGoalActions();
  const [value, setValue] = useState(goal.summary ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  const skipBlur = useRef(false);
  useEffect(() => setValue(goal.summary ?? ''), [goal.summary]);
  useAutoHeight(ref, value);
  const commit = async () => {
    if (skipBlur.current) {
      skipBlur.current = false;
      return;
    }
    const summary = value.trim();
    if (summary === (goal.summary ?? '')) return;
    if (!(await actions.update(goal, { summary: summary || null }))) setValue(goal.summary ?? '');
  };
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      maxLength={500}
      aria-label="Summary"
      placeholder="Add a one-line summary…"
      onChange={e => setValue(e.target.value.replace(/\n/g, ' '))}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setValue(goal.summary ?? '');
          skipBlur.current = true;
          e.currentTarget.blur();
        }
      }}
      className={cn('block w-full resize-none overflow-hidden py-0.5 text-body text-ink-2', inPlace)}
    />
  );
}

export type SaveState = 'idle' | 'saving' | 'saved';

/** Autosaves after a pause in typing, on blur, and when you leave the page — the rhythm of an issue description. */
export function GoalDescriptionEditor({ goal, onStateChange }: { goal: Goal; onStateChange?: (s: SaveState) => void }) {
  const actions = useGoalActions();
  const known = goal.description ?? '';
  const saved = useRef(known);
  const pending = useRef<string | null>(null);
  const timer = useRef<number>();
  const goalRef = useRef(goal);
  goalRef.current = goal;
  const report = useRef(onStateChange);
  report.current = onStateChange;

  useEffect(() => {
    if (pending.current === null) saved.current = known;
  }, [known]);

  const flush = async () => {
    window.clearTimeout(timer.current);
    const md = pending.current;
    if (md === null) return;
    pending.current = null;
    if (md.trim() === saved.current.trim()) return;
    report.current?.('saving');
    const ok = await actions.update(goalRef.current, { description: md.trim() ? md : null }, { quiet: true });
    if (ok) {
      saved.current = md;
      report.current?.('saved');
      window.setTimeout(() => report.current?.('idle'), 1600);
    } else {
      report.current?.('idle');
      toast.error('Couldn’t save the description');
    }
  };

  // Leaving the page saves whatever was typed.
  useEffect(() => () => void flush(), [goal.id]);

  return (
    <RichEditor
      value={known}
      placeholder="Why this goal matters, what’s in and out of scope, and how you’ll know it’s done…"
      onChange={md => {
        pending.current = md;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, 900);
      }}
      onBlur={() => void flush()}
      minHeight={72}
    />
  );
}
