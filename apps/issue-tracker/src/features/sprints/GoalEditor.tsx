import { PencilSimple } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { saveSprint } from 'zitejs/api';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import type { SprintDetail } from '../../lib/types';
import { Button } from '../../ui/Button';
import { Textarea } from '../../ui/Form';
import { Kbd } from '../../ui/Kbd';
import { Tooltip } from '../../ui/Tooltip';
import { useSprintActions } from './useSprintActions';

/** The sprint goal as a pull quote you can click to rewrite. Saves optimistically. */
export function GoalEditor({ sprint }: { sprint: SprintDetail['sprint'] }) {
  const qc = useQueryClient();
  const { refresh } = useSprintActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const start = () => {
    setDraft(sprint.goal ?? '');
    setEditing(true);
  };

  const save = async () => {
    if (!sprint.teamId) return;
    const goal = draft.trim() || null;
    if (goal === (sprint.goal ?? null)) return setEditing(false);
    const key = qk.sprint(sprint.id);
    const previous = qc.getQueryData<SprintDetail>(key);
    qc.setQueryData<SprintDetail>(key, old => (old ? { ...old, sprint: { ...old.sprint, goal } } : old));
    setEditing(false);
    try {
      await saveSprint({ id: sprint.id, teamId: sprint.teamId, goal });
      refresh([sprint.id]);
    } catch (e) {
      qc.setQueryData(key, previous);
      setDraft(goal ?? '');
      setEditing(true);
      toast.error(errorMessage(e, 'Couldn’t save the goal'));
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2 border-l-2 border-highlight pl-4 animate-rise-in">
        <Textarea
          autoFocus
          bare
          aria-label="Sprint goal"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onFocus={e => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setEditing(false);
            }
          }}
          minRows={2}
          maxLength={5000}
          placeholder="What does this sprint need to deliver?"
          className="font-display text-[20px] italic leading-7 text-ink"
        />
        <div className="flex items-center gap-1.5">
          <span className="mr-auto hidden items-center gap-1 text-meta text-ink-3 sm:inline-flex">
            <Kbd keys="mod+enter" /> save · <Kbd keys="esc" /> cancel
          </span>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save}>
            Save goal
          </Button>
        </div>
      </div>
    );
  }

  if (!sprint.goal) {
    return (
      <button
        type="button"
        onClick={start}
        className="w-full rounded-sm border-l-2 border-line-strong py-1 pl-4 text-left font-display text-[20px] italic leading-7 text-ink-3 transition-colors hover:border-highlight hover:text-ink-2"
      >
        Add a goal for this sprint…
      </button>
    );
  }

  return (
    <div className="group relative">
      <blockquote
        onClick={start}
        className="cursor-text whitespace-pre-wrap border-l-2 border-highlight pl-4 pr-8 font-display text-[20px] italic leading-7 text-ink-2 text-pretty"
      >
        {sprint.goal}
      </blockquote>
      <Tooltip content="Edit goal">
        <Button variant="ghost" size="xs" icon aria-label="Edit goal" onClick={start} className="absolute right-0 top-0 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100">
          <PencilSimple size={14} />
        </Button>
      </Tooltip>
    </div>
  );
}
