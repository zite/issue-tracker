import { CalendarBlank, CaretRight, Stack, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RichEditor } from '../../editor/RichEditor';
import { GoalMark, Mark } from '../../glyphs';
import { shortDate } from '../../lib/format';
import type { Goal } from '../../lib/types';
import { useWorkspace, type Workspace } from '../../lib/workspace';
import { OptionPicker } from '../../pickers/OptionPicker';
import { DatePicker } from '../../pickers/pickers';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter } from '../../ui/Dialog';
import { Kbd } from '../../ui/Kbd';
import { IconColorPicker } from './IconColorPicker';
import { OwnerPicker, ProjectsMultiPicker } from './pickers';
import { chip as propertyChip } from '../projects/bits';
import { GoalStatusGlyph, goalStatusOptions, toGoalStatus, type GoalStatus } from './status';
import { useGoalActions, type GoalPatch } from './useGoalActions';

type Form = {
  name: string;
  summary: string;
  description: string;
  icon: string;
  color: string;
  status: GoalStatus;
  ownerId: string | null;
  targetDate: string | null;
  projectIds: string[];
};

function formFor(goal: Goal | null | undefined, ws: Workspace): Form {
  if (!goal) {
    return { name: '', summary: '', description: '', icon: '🎯', color: '#3F76D0', status: 'Planned', ownerId: ws.me.id, targetDate: null, projectIds: [] };
  }
  return {
    name: goal.name,
    summary: goal.summary ?? '',
    description: goal.description ?? '',
    icon: goal.icon || '🎯',
    color: goal.color || '#3F76D0',
    status: toGoalStatus(goal.status),
    ownerId: goal.ownerId,
    targetDate: goal.targetDate,
    projectIds: ws.projects.filter(p => p.goalId === goal.id).map(p => p.id),
  };
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));

/** Create a goal, or edit one. Creating opens the new goal. */
export function GoalDialog({ open, onOpenChange, goal }: { open: boolean; onOpenChange: (open: boolean) => void; goal?: Goal | null }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const actions = useGoalActions();
  const nameRef = useRef<HTMLInputElement>(null);
  const initial = useRef<Form>(formFor(goal, ws));
  const [form, setForm] = useState<Form>(initial.current);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [session, setSession] = useState(0);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }));

  // Each opening starts from the goal as it is now; the editor remounts to pick up its content.
  useEffect(() => {
    if (!open) return;
    const next = formFor(goal, ws);
    initial.current = next;
    setForm(next);
    setDescriptionTouched(false);
    setSession(s => s + 1);
    // Seed once per open — a background refetch mustn't wipe what's being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal?.id]);

  const owner = form.ownerId ? ws.memberById.get(form.ownerId) : undefined;
  const selectedProjects = form.projectIds.map(id => ws.projectById.get(id)).filter(Boolean);

  const submit = async () => {
    const name = form.name.trim();
    if (!name || busy) {
      if (!name) nameRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      if (!goal) {
        const id = await actions.create({
          name,
          summary: form.summary.trim() || null,
          description: form.description.trim() ? form.description : null,
          icon: form.icon,
          color: form.color,
          status: form.status,
          ownerId: form.ownerId,
          targetDate: form.targetDate,
          projectIds: form.projectIds,
        });
        if (id) {
          onOpenChange(false);
          navigate(`/goal/${id}`);
        }
        return;
      }

      // Send only what changed — above all the description, which is never overwritten unless it was edited here.
      const was = initial.current;
      const patch: GoalPatch = {};
      if (name !== was.name) patch.name = name;
      if (form.summary.trim() !== was.summary.trim()) patch.summary = form.summary.trim() || null;
      if (descriptionTouched && form.description !== was.description) patch.description = form.description.trim() ? form.description : null;
      if (form.icon !== was.icon) patch.icon = form.icon;
      if (form.color !== was.color) patch.color = form.color;
      if (form.status !== was.status) patch.status = form.status;
      if (form.ownerId !== was.ownerId) patch.ownerId = form.ownerId;
      if (form.targetDate !== was.targetDate) patch.targetDate = form.targetDate;
      if (!sameSet(form.projectIds, was.projectIds)) patch.projectIds = form.projectIds;
      if (Object.keys(patch).length === 0) {
        onOpenChange(false);
        return;
      }
      if (await actions.update(goal, patch, { success: `Saved ${name}` })) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        label={goal ? `Edit ${goal.name}` : 'New goal'}
        onOpenAutoFocus={e => {
          e.preventDefault();
          nameRef.current?.focus();
        }}
      >
        <div
          className="flex min-h-0 flex-col"
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
        >
          <div className="flex items-center gap-1.5 px-5 pt-3.5 text-meta text-ink-3">
            <span>Goals</span>
            <CaretRight size={10} weight="bold" />
            <span className="truncate font-medium text-ink-2">{goal ? goal.name : 'New goal'}</span>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" icon aria-label="Close" className="-mr-2 ml-auto">
                <X size={16} />
              </Button>
            </DialogClose>
          </div>

          <DialogBody className="pb-4 pt-2">
            <div className="flex items-start gap-3.5">
              <IconColorPicker icon={form.icon} color={form.color} onChange={p => set(p)}>
                <button type="button" aria-label="Choose icon and colour" className="mt-0.5 shrink-0 rounded-[14px] transition-transform hover:scale-[1.04]">
                  <GoalMark icon={form.icon} color={form.color} size={44} />
                </button>
              </IconColorPicker>
              <div className="min-w-0 flex-1">
                <input
                  ref={nameRef}
                  value={form.name}
                  onChange={e => set({ name: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                  placeholder="Name the goal"
                  aria-label="Goal name"
                  maxLength={200}
                  className="block h-9 w-full bg-transparent font-display text-display-sm text-ink outline-none placeholder:text-ink-3"
                />
                <input
                  value={form.summary}
                  onChange={e => set({ summary: e.target.value })}
                  placeholder="Add a one-line summary…"
                  aria-label="Summary"
                  maxLength={500}
                  className="block h-7 w-full bg-transparent text-body text-ink-2 outline-none placeholder:text-ink-3"
                />
              </div>
            </div>

            <div className="mt-4 max-h-[34vh] overflow-y-auto rounded-md bg-sunken/70 px-3.5 py-3">
              <RichEditor
                key={session}
                value={form.description}
                onChange={md => {
                  setDescriptionTouched(true);
                  set({ description: md });
                }}
                onSubmit={() => void submit()}
                placeholder="Why this matters, and how you’ll know it’s done…"
                minHeight={96}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <OptionPicker
                value={form.status}
                onChange={v => set({ status: v })}
                options={goalStatusOptions}
                placeholder="Set status…"
                width={210}
                trigger={
                  <button type="button" className={propertyChip} aria-label={`Status: ${form.status}`}>
                    <GoalStatusGlyph status={form.status} />
                    {form.status}
                  </button>
                }
              />
              <OwnerPicker
                value={form.ownerId}
                onChange={v => set({ ownerId: v })}
                trigger={
                  <button type="button" className={cn(propertyChip, !owner && 'text-ink-3')} aria-label="Owner">
                    <Avatar person={owner} size={16} />
                    <span className="truncate">{owner?.name ?? 'Owner'}</span>
                  </button>
                }
              />
              <DatePicker
                label="Target date" presets="target"
                value={form.targetDate}
                onChange={v => set({ targetDate: v })}
                trigger={
                  <button type="button" className={cn(propertyChip, !form.targetDate && 'text-ink-3')} aria-label="Target date">
                    <CalendarBlank size={14} className="text-ink-3" />
                    {form.targetDate ? `Target ${shortDate(form.targetDate)}` : 'Target date'}
                  </button>
                }
              />
              <ProjectsMultiPicker
                goalId={goal?.id ?? null}
                value={form.projectIds}
                onChange={ids => set({ projectIds: ids })}
                trigger={
                  <button type="button" className={cn(propertyChip, 'max-w-[260px] whitespace-nowrap', !selectedProjects.length && 'text-ink-3')} aria-label="Projects">
                    {selectedProjects.length ? (
                      <span className="flex">
                        {selectedProjects.slice(0, 3).map((p, i) => (
                          <Mark key={p!.id} icon={p!.icon} color={p!.color} name={p!.name} size={16} className={cn('ring-2 ring-card', i > 0 && '-ml-1')} />
                        ))}
                      </span>
                    ) : (
                      <Stack size={14} className="text-ink-3" />
                    )}
                    <span className="truncate">
                      {selectedProjects.length === 0 ? 'Projects' : selectedProjects.length === 1 ? selectedProjects[0]!.name : `${selectedProjects.length} projects`}
                    </span>
                  </button>
                }
              />
            </div>
          </DialogBody>

          <DialogFooter start={<span className="hidden text-meta text-ink-3 sm:inline">A project belongs to one goal at a time.</span>}>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={!form.name.trim()} loading={busy}>
              {goal ? 'Save changes' : 'Create goal'}
              <Kbd keys="mod+enter" tone="inverse" className="hidden sm:inline-flex" />
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
