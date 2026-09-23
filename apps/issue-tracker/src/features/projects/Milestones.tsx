import { DotsThree, ListBullets, PencilSimple, Plus, TextAlignLeft, Trash } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { saveMilestone } from 'zitejs/api';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { plural, shortDate, todayString } from '../../lib/format';
import { refreshSoon } from '../../lib/mutations';
import { qk } from '../../lib/queries';
import type { Bootstrap, ProjectDetail } from '../../lib/types';
import { DatePicker } from '../../pickers/pickers';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Card } from '../../ui/Layout';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui/Menu';
import { ProgressBar } from '../../ui/Progress';
import { Tooltip } from '../../ui/Tooltip';
import { MilestoneNode, inlineValue } from './bits';

type Milestone = ProjectDetail['milestones'][number];

const fieldCls =
  'h-8 min-w-0 rounded-md border border-control/60 bg-card px-2.5 text-ui text-ink shadow-hairline outline-none placeholder:text-ink-3 focus:border-ink/60 focus:ring-[3px] focus:ring-highlight/45 disabled:opacity-60';

function RenameInput({ initial, onCommit, onCancel, allowEmpty, label = 'Milestone name', placeholder, className }: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  /** A description may be cleared; a name may not. */
  allowEmpty?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  // Enter and the blur that follows unmounting must not both commit.
  const finish = (commit: boolean) => {
    if (settled.current) return;
    settled.current = true;
    if (commit && (value.trim() || allowEmpty)) onCommit(value.trim());
    else onCancel();
  };
  useEffect(() => {
    // Opened from a menu item: the closing menu still owns focus during this commit, so wait a tick.
    const t = window.setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, 30);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <input
      ref={ref}
      value={value}
      maxLength={allowEmpty ? 5000 : 200}
      aria-label={label}
      placeholder={placeholder}
      onChange={e => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (value.trim() || allowEmpty) finish(true);
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      }}
      className={cn(fieldCls, '-my-1 w-full', className)}
    />
  );
}

/**
 * Checkpoints on a track. Each node fills as its issues finish; its name opens
 * the project's issues filtered to it.
 */
export function Milestones({ detail }: { detail: ProjectDetail }) {
  const qc = useQueryClient();
  const app = useAppActions();
  const navigate = useNavigate();
  const { project, milestones } = detail;
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [describing, setDescribing] = useState<string | null>(null);
  const today = todayString();
  const reached = milestones.filter(m => m.total > 0 && m.done === m.total).length;

  const patchLocal = (fn: (list: Milestone[]) => Milestone[]) =>
    qc.setQueryData<ProjectDetail>(qk.project(project.id), old => (old ? { ...old, milestones: fn(old.milestones) } : old));
  const patchBootstrap = (fn: (list: Bootstrap['milestones']) => Bootstrap['milestones']) =>
    qc.setQueryData<Bootstrap>(qk.bootstrap, old => (old ? { ...old, milestones: fn(old.milestones) } : old));

  // Rename and re-date are optimistic; the bootstrap copy feeds every milestone picker and card hint.
  const edit = async (m: Milestone, patch: { name?: string; description?: string | null; targetDate?: string | null }) => {
    const before = { detail: qc.getQueryData(qk.project(project.id)), bootstrap: qc.getQueryData(qk.bootstrap) };
    patchLocal(list => list.map(x => (x.id === m.id ? { ...x, ...patch } : x)));
    patchBootstrap(list => list.map(x => (x.id === m.id ? { ...x, ...patch } : x)));
    try {
      await saveMilestone({ id: m.id, projectId: project.id, ...patch });
      refreshSoon(qc, [qk.project(project.id), qk.bootstrap], 700);
    } catch (e) {
      if (before.detail) qc.setQueryData(qk.project(project.id), before.detail);
      if (before.bootstrap) qc.setQueryData(qk.bootstrap, before.bootstrap);
      toast.error(errorMessage(e, 'Couldn’t update the milestone'));
    }
  };

  const remove = async (m: Milestone) => {
    const ok = await app.confirm({
      title: `Delete “${m.name}”?`,
      description: m.total ? `Its ${plural(m.total, 'issue')} stay in the project, without a milestone.` : 'No issues are in this milestone.',
      confirmLabel: 'Delete milestone',
      destructive: true,
    });
    if (!ok) return;
    const before = { detail: qc.getQueryData(qk.project(project.id)), bootstrap: qc.getQueryData(qk.bootstrap) };
    patchLocal(list => list.filter(x => x.id !== m.id));
    patchBootstrap(list => list.filter(x => x.id !== m.id));
    try {
      await saveMilestone({ id: m.id, projectId: project.id, remove: true });
      toast.success(`Deleted milestone “${m.name}”`);
      qc.invalidateQueries({ queryKey: qk.project(project.id) });
      qc.invalidateQueries({ queryKey: qk.bootstrap });
      qc.invalidateQueries({ queryKey: qk.issuesRoot });
    } catch (e) {
      if (before.detail) qc.setQueryData(qk.project(project.id), before.detail);
      if (before.bootstrap) qc.setQueryData(qk.bootstrap, before.bootstrap);
      toast.error(errorMessage(e, 'Couldn’t delete the milestone'));
    }
  };

  return (
    <Card padded>
      <div className="flex min-h-7 items-center gap-2">
        <h2 className="text-title font-semibold text-ink">Milestones</h2>
        {milestones.length > 0 && (
          <span className="tabular text-ui text-ink-3">
            {reached} of {milestones.length} reached
          </span>
        )}
        {!adding && milestones.length > 0 && (
          <Button variant="ghost" size="sm" leading={<Plus size={13} weight="bold" />} onClick={() => setAdding(true)} className="ml-auto">
            Add
          </Button>
        )}
      </div>

      {milestones.length === 0 && !adding && (
        <p className="mt-1 max-w-xl text-ui text-ink-2">Break the project into checkpoints — a beta, a launch — and watch each one fill in as its issues finish.</p>
      )}

      <ol className="relative mt-3" aria-label="Milestones">
        {(milestones.length > 0 || adding) && <span aria-hidden className="absolute bottom-5 left-[7.5px] top-5 w-px bg-line-strong" />}
        {milestones.map(m => {
          const complete = m.total > 0 && m.done === m.total;
          const overdue = Boolean(m.targetDate && m.targetDate < today && !complete);
          return (
            <li key={m.id} className="group/ms relative flex gap-3 py-2.5">
              <span className="relative mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center bg-card">
                <MilestoneNode done={m.done} total={m.total} />
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-4 gap-y-1.5">
                <div className="min-w-[180px] flex-1">
                  {renaming === m.id ? (
                    <RenameInput
                      initial={m.name}
                      onCancel={() => setRenaming(null)}
                      onCommit={name => {
                        setRenaming(null);
                        if (name !== m.name) edit(m, { name });
                      }}
                    />
                  ) : (
                    <Link
                      to={`/project/${project.id}/issues?milestone=${m.id}`}
                      className={cn('text-ui font-semibold underline-offset-[3px] hover:underline', complete ? 'text-ink-2' : 'text-ink')}
                      title={`View the issues in ${m.name}`}
                    >
                      {m.name}
                    </Link>
                  )}
                  {describing === m.id ? (
                    <RenameInput
                      initial={m.description ?? ''}
                      allowEmpty
                      label="Milestone description"
                      placeholder="What reaching it means, in a line"
                      className="mt-2 h-7 text-meta"
                      onCancel={() => setDescribing(null)}
                      onCommit={description => {
                        setDescribing(null);
                        if (description !== (m.description ?? '')) edit(m, { description: description || null });
                      }}
                    />
                  ) : (
                    m.description && renaming !== m.id && <p className="mt-0.5 line-clamp-2 text-meta text-ink-3" title={m.description}>{m.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {m.total ? (
                    <Tooltip content={`${m.done} of ${plural(m.total, 'issue')} done`}>
                      <span className="flex w-[108px] items-center gap-2">
                        <ProgressBar height={4} value={m.done} max={m.total} tone={complete ? 'success' : 'ink'} className="flex-1" />
                        <span className="tabular w-9 text-right text-meta text-ink-3">
                          {m.done}/{m.total}
                        </span>
                      </span>
                    </Tooltip>
                  ) : (
                    <Tooltip content="Set the milestone from an issue’s properties">
                      <span className="w-[108px] cursor-default text-right text-meta text-ink-3">No issues yet</span>
                    </Tooltip>
                  )}
                  <DatePicker
                    label="Milestone target" presets="target"
                    align="end"
                    value={m.targetDate}
                    onChange={v => v !== m.targetDate && edit(m, { targetDate: v })}
                    trigger={
                      <button
                        type="button"
                        className={cn(inlineValue, 'tabular -my-1 w-[78px] justify-end text-meta', overdue ? 'font-medium text-danger' : m.targetDate ? 'text-ink-2' : 'text-ink-3')}
                        aria-label={m.targetDate ? `Target ${shortDate(m.targetDate)}` : 'Set target date'}
                      >
                        {m.targetDate ? shortDate(m.targetDate) : 'Set date'}
                      </button>
                    }
                  />
                  <Menu>
                    <MenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="xs"
                        icon
                        aria-label={`${m.name} actions`}
                        className="-my-1 opacity-0 focus-visible:opacity-100 group-hover/ms:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <DotsThree size={15} weight="bold" />
                      </Button>
                    </MenuTrigger>
                    {/* Keep focus where the rename input puts it, not back on the trigger. */}
                    <MenuContent align="end" className="w-44" onCloseAutoFocus={e => e.preventDefault()}>
                      <MenuItem icon={<PencilSimple size={15} />} onSelect={() => setRenaming(m.id)}>
                        Rename
                      </MenuItem>
                      <MenuItem icon={<TextAlignLeft size={15} />} onSelect={() => setDescribing(m.id)}>
                        {m.description ? 'Edit description' : 'Add description'}
                      </MenuItem>
                      <MenuItem icon={<ListBullets size={15} />} onSelect={() => navigate(`/project/${project.id}/issues?milestone=${m.id}`)}>
                        View issues
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem destructive icon={<Trash size={15} />} onSelect={() => remove(m)}>
                        Delete…
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
              </div>
            </li>
          );
        })}

        {adding ? (
          <AddMilestone projectId={project.id} onDone={() => setAdding(false)} />
        ) : (
          <li className="relative flex">
            <button type="button" onClick={() => setAdding(true)} className="group/add -ml-1 flex h-9 items-center gap-3 rounded-sm pl-1 pr-2 text-ui text-ink-3 transition-colors hover:text-ink">
              <span className="flex h-4 w-4 items-center justify-center bg-card">
                <MilestoneNode done={0} total={0} dashed className="group-hover/add:text-ink" />
              </span>
              <span className="flex items-center gap-1">
                <Plus size={12} weight="bold" /> Add milestone
              </span>
            </button>
          </li>
        )}
      </ol>
    </Card>
  );
}

function AddMilestone({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => ref.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  const submit = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      await saveMilestone({ projectId, name: n, targetDate: date });
      await Promise.all([qc.invalidateQueries({ queryKey: qk.project(projectId) }), qc.invalidateQueries({ queryKey: qk.bootstrap })]);
      // Stay open for the next one, like a checklist.
      setName('');
      setDate(null);
      window.setTimeout(() => ref.current?.focus(), 0);
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t add the milestone'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="relative flex gap-3 py-2 animate-rise-in">
      <span className="relative mt-2 flex h-4 w-4 shrink-0 items-center justify-center bg-card">
        <MilestoneNode done={0} total={0} dashed />
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-md bg-sunken p-2">
        <input
          ref={ref}
          value={name}
          maxLength={200}
          disabled={busy}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onDone();
            }
          }}
          placeholder="Milestone name, e.g. Private beta"
          aria-label="Milestone name"
          className={cn(fieldCls, 'min-w-[160px] flex-1')}
        />
        <DatePicker
          label="Milestone target" presets="target"
          align="end"
          value={date}
          onChange={setDate}
          trigger={
            <Button variant="secondary" size="md" className={cn('tabular', !date && 'text-ink-3')}>
              {date ? shortDate(date) : 'Target date'}
            </Button>
          }
        />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" onClick={onDone}>
            Done
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()} loading={busy}>
            Add
          </Button>
        </div>
      </div>
    </li>
  );
}
