import { ArrowRight, CalendarBlank, CaretDown, CaretRight, FlagCheckered, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { RichEditor, type RichEditorHandle } from '../../editor/RichEditor';
import { GoalMark, Mark, PriorityGlyph } from '../../glyphs';
import { useAppActions } from '../../lib/app-actions';
import { PRIORITY_LABEL, PROJECT_ICONS, SWATCHES } from '../../lib/constants';
import { errorMessage } from '../../lib/errors';
import { shortDate } from '../../lib/format';
import { useProject } from '../../lib/queries';
import { useWorkspace } from '../../lib/workspace';
import { DatePicker, PriorityPicker, TeamPicker } from '../../pickers/pickers';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Dialog, DialogClose, DialogContent } from '../../ui/Dialog';
import { Kbd } from '../../ui/Kbd';
import { Skeleton } from '../../ui/Layout';
import { GoalPicker, LeadPicker, ProjectIconPicker, ProjectStatusGlyph, ProjectStatusPicker, chip } from './bits';
import { STATUS_LABEL, asStatus, type ProjectLike, type ProjectStatus } from './model';
import { useProjectActions } from './useProjectActions';

type Form = {
  name: string;
  summary: string;
  icon: string;
  color: string;
  status: ProjectStatus;
  priority: number;
  leadId: string | null;
  teamId: string | null;
  goalId: string | null;
  startDate: string | null;
  targetDate: string | null;
};

export type ProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  project?: ProjectLike | null;
  defaultTeamId?: string | null;
  defaultStatus?: ProjectStatus;
};

/** Create and edit share one form. The content only mounts while open, so every opening starts clean. */
export function ProjectDialog(props: ProjectDialogProps) {
  const { open, onOpenChange, project } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" label={project ? `Edit ${project.name}` : 'New project'} onOpenAutoFocus={e => e.preventDefault()}>
        <ProjectForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function pick<T>(list: readonly T[]) {
  return list[Math.floor(Math.random() * list.length)];
}

function ProjectForm({ onOpenChange, project, defaultTeamId, defaultStatus }: ProjectDialogProps) {
  const ws = useWorkspace();
  const app = useAppActions();
  const navigate = useNavigate();
  const actions = useProjectActions();
  const editing = Boolean(project?.id);
  const nameRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLInputElement>(null);
  const editor = useRef<RichEditorHandle>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // A list row has no description; fetch the project so editing never blanks it.
  const needsDetail = editing && project?.description === undefined;
  const detail = useProject(needsDetail ? project!.id : undefined);
  const originalDescription = project?.description ?? detail.data?.project.description;
  const descriptionReady = !editing || originalDescription !== undefined;
  const [descTouched, setDescTouched] = useState(false);

  const [form, setForm] = useState<Form>(() =>
    project
      ? {
          name: project.name,
          summary: project.summary ?? '',
          icon: project.icon ?? pick(PROJECT_ICONS),
          color: project.color ?? SWATCHES[9],
          status: asStatus(project.status),
          priority: project.priority,
          leadId: project.leadId,
          teamId: project.teamId,
          goalId: project.goalId,
          startDate: project.startDate,
          targetDate: project.targetDate,
        }
      : {
          name: '',
          summary: '',
          // A fresh mark each time — easy to change, and new projects don't all look alike.
          icon: pick(PROJECT_ICONS),
          color: pick(SWATCHES.slice(2)),
          status: defaultStatus ?? 'Planned',
          priority: 0,
          leadId: ws.me.id,
          teamId: defaultTeamId ?? app.contextTeamId ?? ws.myTeams[0]?.id ?? null,
          goalId: null,
          startDate: null,
          targetDate: null,
        },
  );
  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }));

  useEffect(() => {
    const t = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  const team = form.teamId ? ws.teamById.get(form.teamId) : undefined;
  const lead = form.leadId ? ws.memberById.get(form.leadId) : undefined;
  const goal = form.goalId ? ws.goalById.get(form.goalId) : undefined;
  const nameError = !form.name.trim() ? 'Give the project a name' : null;
  const dateError = form.startDate && form.targetDate && form.targetDate < form.startDate ? 'The target date can’t be before the start date' : null;
  const error = dateError ?? (showErrors ? nameError : null);

  const submit = async () => {
    if (busyRef.current) return;
    if (nameError || dateError) {
      setShowErrors(true);
      if (nameError) nameRef.current?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const description = editor.current?.getMarkdown() ?? '';
    const fields = {
      name: form.name.trim(),
      summary: form.summary.trim() || null,
      status: form.status,
      priority: form.priority,
      leadId: form.leadId,
      teamId: form.teamId,
      goalId: form.goalId,
      icon: form.icon,
      color: form.color,
      startDate: form.startDate,
      targetDate: form.targetDate,
    };
    try {
      if (editing && project) {
        const descChanged = descriptionReady && descTouched && description.trim() !== (originalDescription ?? '').trim();
        await actions.save({ id: project.id, ...fields, ...(descChanged ? { description } : {}) });
        toast.success('Project saved');
        onOpenChange(false);
      } else {
        const id = await actions.save({ ...fields, description: description.trim() ? description : null });
        toast.success(`Created ${fields.name}`, fields.summary ? { description: fields.summary } : undefined);
        onOpenChange(false);
        if (id) navigate(`/project/${id}`);
      }
    } catch (e) {
      toast.error(errorMessage(e, editing ? 'Couldn’t save the project' : 'Couldn’t create the project'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.defaultPrevented) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="flex items-center gap-2 px-5 pb-1 pt-4">
        <TeamPicker
          value={form.teamId ?? ''}
          onChange={teamId => set({ teamId })}
          trigger={
            <button type="button" className={cn(chip, 'h-6 gap-1 rounded-full pl-1 pr-2 text-meta', !team && 'text-ink-3')} aria-label="Team">
              {team ? <Mark icon={team.icon} color={team.color} name={team.name} size={16} className="rounded-full" /> : null}
              <span className="font-medium">{team?.name ?? 'Choose team'}</span>
              <CaretDown size={10} className="text-ink-3" />
            </button>
          }
        />
        <CaretRight size={10} weight="bold" className="text-ink-3" aria-hidden />
        <span className="truncate text-meta font-medium text-ink-2">{editing ? 'Edit project' : 'New project'}</span>
        <DialogClose asChild>
          <Button variant="ghost" size="sm" icon aria-label="Close" className="-mr-2 ml-auto">
            <X size={16} />
          </Button>
        </DialogClose>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 pt-3">
        <div className="flex items-start gap-3.5">
          <ProjectIconPicker icon={form.icon} color={form.color} name={form.name || 'Project'} size={44} className="mt-0.5" onChange={p => set(p)} />
          <div className="min-w-0 flex-1">
            <input
              ref={nameRef}
              value={form.name}
              maxLength={200}
              onChange={e => set({ name: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  summaryRef.current?.focus();
                }
              }}
              placeholder="Project name"
              aria-label="Project name"
              aria-invalid={Boolean(showErrors && nameError)}
              className="block w-full bg-transparent font-display text-display-sm text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
            />
            <input
              ref={summaryRef}
              value={form.summary}
              maxLength={500}
              onChange={e => set({ summary: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  editor.current?.focus();
                }
              }}
              placeholder="One line on the outcome it delivers"
              aria-label="Summary"
              className="mt-0.5 block w-full bg-transparent text-body text-ink-2 outline-none placeholder:text-ink-3 focus-visible:outline-none"
            />
          </div>
        </div>

        <div
          className="mt-4 rounded-md bg-sunken/70 px-3.5 py-3"
          onKeyDownCapture={() => setDescTouched(true)}
          onPasteCapture={() => setDescTouched(true)}
          onDropCapture={() => setDescTouched(true)}
        >
          {descriptionReady ? (
            <RichEditor
              ref={editor}
              value={originalDescription ?? ''}
              onSubmit={() => submit()}
              placeholder="Write the brief: the problem, what done looks like, what’s out of scope…"
              minHeight={132}
            />
          ) : (
            <div className="flex min-h-[132px] flex-col gap-2 py-1" aria-label="Loading description">
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          )}
        </div>
      </div>

      {/* Properties stay in view however long the brief grows. */}
      <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3 pt-3">
        <ProjectStatusPicker
          value={form.status}
          onChange={v => set({ status: asStatus(v) })}
          trigger={
            <button type="button" className={chip} aria-label={`Status: ${STATUS_LABEL[form.status]}`}>
              <ProjectStatusGlyph status={form.status} /> {STATUS_LABEL[form.status]}
            </button>
          }
        />
        <PriorityPicker
          value={form.priority}
          onChange={v => set({ priority: v })}
          trigger={
            <button type="button" className={cn(chip, !form.priority && 'text-ink-3')} aria-label="Priority">
              <PriorityGlyph priority={form.priority} />
              {form.priority ? PRIORITY_LABEL[form.priority] : 'Priority'}
            </button>
          }
        />
        <LeadPicker
          teamId={form.teamId}
          value={form.leadId}
          onChange={v => set({ leadId: v })}
          trigger={
            <button type="button" className={cn(chip, 'max-w-[200px]', !lead && 'text-ink-3')} aria-label="Lead">
              <Avatar person={lead} size={16} />
              <span className="truncate">{lead ? lead.name : 'Lead'}</span>
            </button>
          }
        />
        <span className="inline-flex items-center gap-1">
          <DatePicker
            label="Start date" presets="target"
            value={form.startDate}
            onChange={v => set({ startDate: v })}
            trigger={
              <button type="button" className={cn(chip, !form.startDate && 'text-ink-3')} aria-label="Start date">
                <CalendarBlank size={14} /> {form.startDate ? shortDate(form.startDate) : 'Start'}
              </button>
            }
          />
          <ArrowRight size={12} className="text-ink-3" aria-hidden />
          <DatePicker
            label="Target date" presets="target"
            value={form.targetDate}
            onChange={v => set({ targetDate: v })}
            trigger={
              <button type="button" className={cn(chip, !form.targetDate && 'text-ink-3', dateError && 'border-danger/50 text-danger')} aria-label="Target date">
                <FlagCheckered size={14} /> {form.targetDate ? shortDate(form.targetDate) : 'Target'}
              </button>
            }
          />
        </span>
        {ws.goals.length > 0 && (
          <GoalPicker
            value={form.goalId}
            onChange={v => set({ goalId: v })}
            trigger={
              <button type="button" className={cn(chip, 'max-w-[240px]', !goal && 'text-ink-3')} aria-label="Goal">
                {goal ? <GoalMark icon={goal.icon} color={goal.color} size={16} /> : <GoalMark size={16} />}
                <span className="truncate">{goal?.name ?? 'Goal'}</span>
              </button>
            }
          />
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-line bg-paper/60 px-5 py-3">
        <p className={cn('min-w-0 flex-1 truncate text-meta', error ? 'text-danger' : 'text-ink-3 max-sm:invisible')} role={error ? 'alert' : undefined}>
          {error ?? (editing ? '' : 'Milestones and check-ins come once it exists.')}
        </p>
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button variant="primary" onClick={submit} loading={busy} disabled={Boolean(dateError)}>
          {editing ? 'Save changes' : 'Create project'}
          <Kbd keys="mod+enter" tone="inverse" className="ml-0.5 hidden sm:inline-flex" />
        </Button>
      </div>
    </div>
  );
}
