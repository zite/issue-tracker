import { ArrowUpRight } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { saveProject } from 'zitejs/api';
import { RichEditor } from '../../editor/RichEditor';
import { GoalMark, HealthPill, Mark, PriorityGlyph } from '../../glyphs';
import { PRIORITY_LABEL } from '../../lib/constants';
import { errorMessage } from '../../lib/errors';
import { plural, shortDate, timeAgo } from '../../lib/format';
import { qk } from '../../lib/queries';
import type { ProjectDetail } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { DatePicker, PriorityPicker, TeamPicker } from '../../pickers/pickers';
import { Avatar, AvatarStack } from '../../ui/Avatar';
import { cn } from '../../ui/cn';
import { Card, FactRow, Skeleton } from '../../ui/Layout';
import { ProgressBar } from '../../ui/Progress';
import { Tooltip } from '../../ui/Tooltip';
import { GoalPicker, LeadPicker, ProjectStatusGlyph, ProjectStatusPicker, inlineValue } from './bits';
import { LatestCheckInCard } from './CheckIns';
import { Milestones } from './Milestones';
import { ProgressCard, useRollup } from './ProgressCard';
import { STATUS_LABEL, asStatus, isPastTarget } from './model';
import { useProjectActions } from './useProjectActions';

type Project = ProjectDetail['project'];

/** Autosaves after a pause in typing, on blur, and on leaving the page. */
function DescriptionCard({ project }: { project: Project }) {
  const qc = useQueryClient();
  const timer = useRef<number>();
  const pending = useRef<string | null>(null);
  const saved = useRef(project.description);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Adopt a newer server copy only when nothing local is waiting to be saved.
  useEffect(() => {
    if (pending.current === null) saved.current = project.description;
  }, [project.description]);

  const flush = async () => {
    window.clearTimeout(timer.current);
    const md = pending.current;
    if (md === null) return;
    pending.current = null;
    if (md.trim() === saved.current.trim()) return;
    setStatus('saving');
    try {
      await saveProject({ id: project.id, description: md });
      saved.current = md;
      qc.setQueryData<ProjectDetail>(qk.project(project.id), old => (old ? { ...old, project: { ...old.project, description: md } } : old));
      setStatus('saved');
      window.setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 1600);
    } catch (e) {
      setStatus('idle');
      toast.error(errorMessage(e, 'Couldn’t save the description'));
    }
  };

  // Leaving the page (or switching projects) saves what's pending.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(), [project.id]);

  return (
    <Card padded>
      <div className="mb-2 flex min-h-6 items-center gap-2">
        <h2 className="text-title font-semibold text-ink">Description</h2>
        <span aria-live="polite" className={cn('ml-auto text-meta text-ink-3 transition-opacity', status === 'idle' && 'opacity-0')}>
          {status === 'saving' ? 'Saving…' : 'Saved'}
        </span>
      </div>
      <RichEditor
        value={project.description}
        placeholder="Write the brief: the problem, what done looks like, what’s out of scope… Markdown shortcuts work."
        onChange={md => {
          pending.current = md;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(flush, 900);
        }}
        onBlur={() => flush()}
        minHeight={96}
      />
    </Card>
  );
}

function FactsCard({ detail }: { detail: ProjectDetail }) {
  const ws = useWorkspace();
  const actions = useProjectActions();
  const p = detail.project;
  const rollup = useRollup(detail);
  const lead = p.leadId ? ws.memberById.get(p.leadId) : undefined;
  const team = p.teamId ? ws.teamById.get(p.teamId) : undefined;
  const goal = p.goalId ? ws.goalById.get(p.goalId) : undefined;
  const members = detail.contributors.map(c => ws.memberById.get(c.id)).filter((m): m is NonNullable<typeof m> => Boolean(m));
  const overdue = isPastTarget(p);
  const lastCheckIn = detail.updates[0];
  const status = asStatus(p.status);

  const setDates = (startDate: string | null, targetDate: string | null) => {
    if (startDate && targetDate && targetDate < startDate) {
      toast.error('The target date can’t be before the start date');
      return;
    }
    // Both are sent so the server validates the pair, not one side in isolation.
    actions.update(p.id, { startDate, targetDate });
  };

  const valueCls = cn(inlineValue, '-ml-1.5');

  return (
    <Card className="px-4 py-3">
      <h2 className="sr-only">Details</h2>
      <FactRow label="Status">
        <ProjectStatusPicker
          value={p.status}
          onChange={s => s !== p.status && actions.update(p.id, { status: asStatus(s) })}
          trigger={
            <button type="button" className={valueCls} aria-label={`Status: ${STATUS_LABEL[status]}`}>
              <ProjectStatusGlyph status={status} progress={rollup.progress} /> {STATUS_LABEL[status]}
            </button>
          }
        />
      </FactRow>
      <FactRow label="Health">
        <Tooltip content={lastCheckIn ? `Set by check-ins · last posted ${timeAgo(lastCheckIn.postedAt)}` : 'Health is set by posting a check-in'}>
          <span className="inline-flex h-7 cursor-default items-center">
            <HealthPill health={p.health} />
          </span>
        </Tooltip>
      </FactRow>
      <FactRow label="Priority">
        <PriorityPicker
          value={p.priority}
          onChange={v => v !== p.priority && actions.update(p.id, { priority: v })}
          trigger={
            <button type="button" className={cn(valueCls, !p.priority && 'text-ink-3')} aria-label="Priority">
              <PriorityGlyph priority={p.priority} /> {p.priority ? PRIORITY_LABEL[p.priority] : 'Set priority'}
            </button>
          }
        />
      </FactRow>
      <FactRow label="Lead">
        <LeadPicker
          teamId={p.teamId}
          value={p.leadId}
          onChange={v => v !== p.leadId && actions.update(p.id, { leadId: v })}
          trigger={
            <button type="button" className={cn(valueCls, !lead && 'text-ink-3')} aria-label="Lead">
              <Avatar person={lead} size={18} />
              <span className="truncate">{lead ? lead.name : 'Choose a lead'}</span>
            </button>
          }
        />
      </FactRow>
      <FactRow label="Members">
        <Tooltip content={members.length ? members.map(m => m.name).join(', ') : 'Members are the people assigned to its issues'}>
          <span className="inline-flex h-7 cursor-default items-center gap-2 text-ui text-ink-2">
            {members.length > 0 && <AvatarStack people={members} size={20} max={5} />}
            {members.length ? plural(members.length, 'person', 'people') : <span className="text-ink-3">Nobody assigned yet</span>}
          </span>
        </Tooltip>
      </FactRow>
      <FactRow label="Start">
        <DatePicker
          presets="target"
          label="Start date"
          value={p.startDate}
          onChange={v => setDates(v, p.targetDate)}
          trigger={
            <button type="button" className={cn(valueCls, 'tabular', !p.startDate && 'text-ink-3')} aria-label="Start date">
              {p.startDate ? shortDate(p.startDate) : 'Set start'}
            </button>
          }
        />
      </FactRow>
      <FactRow label="Target">
        <DatePicker
          presets="target"
          label="Target date"
          value={p.targetDate}
          onChange={v => setDates(p.startDate, v)}
          trigger={
            <button type="button" className={cn(valueCls, 'tabular', !p.targetDate && 'text-ink-3', overdue && 'font-medium text-danger')} aria-label="Target date">
              {p.targetDate ? shortDate(p.targetDate) : 'Set target'}
              {overdue && <span className="font-normal">· past due</span>}
            </button>
          }
        />
      </FactRow>
      <FactRow label="Team">
        <TeamPicker
          value={p.teamId ?? ''}
          onChange={v => v !== p.teamId && actions.update(p.id, { teamId: v })}
          trigger={
            <button type="button" className={cn(valueCls, !team && 'text-ink-3')} aria-label="Team">
              {team && <Mark icon={team.icon} color={team.color} name={team.name} size={18} />}
              <span className="truncate">{team?.name ?? 'Choose a team'}</span>
            </button>
          }
        />
      </FactRow>
      <FactRow label="Goal">
        <span className="group/goal flex min-w-0 flex-1 items-center gap-0.5">
          <GoalPicker
            value={p.goalId}
            onChange={v => v !== p.goalId && actions.update(p.id, { goalId: v })}
            trigger={
              <button type="button" className={cn(valueCls, 'min-w-0', !goal && 'text-ink-3')} aria-label="Goal">
                {goal && <GoalMark icon={goal.icon} color={goal.color} size={18} />}
                <span className="truncate">{goal?.name ?? 'Add to a goal'}</span>
              </button>
            }
          />
          {goal && (
            <Tooltip content="Open goal">
              <Link to={`/goal/${goal.id}`} aria-label={`Open ${goal.name}`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-ink-3 opacity-0 transition-opacity hover:bg-hover hover:text-ink focus-visible:opacity-100 group-hover/goal:opacity-100 [@media(hover:none)]:opacity-100">
                <ArrowUpRight size={13} />
              </Link>
            </Tooltip>
          )}
        </span>
      </FactRow>
    </Card>
  );
}

function ContributorsCard({ contributors }: { contributors: ProjectDetail['contributors'] }) {
  const ws = useWorkspace();
  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-center gap-2">
        <h2 className="text-title font-semibold text-ink">Contributors</h2>
        {contributors.length > 0 && <span className="tabular text-ui text-ink-3">{contributors.length}</span>}
      </div>
      {contributors.length === 0 ? (
        <p className="mt-1 text-ui text-ink-3">Nobody is assigned to this project’s issues yet.</p>
      ) : (
        <ul className="-mx-2 mt-2 flex flex-col">
          {contributors.map(c => {
            const m = ws.memberById.get(c.id);
            const total = c.open + c.completed;
            return (
              <li key={c.id}>
                <Link to={`/people/${c.id}`} className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 transition-colors hover:bg-hover">
                  <Avatar person={m} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-ui font-medium text-ink">{m?.name ?? 'Former member'}</div>
                    <div className="tabular text-meta text-ink-3">
                      {c.open} open · {c.completed} done
                    </div>
                  </div>
                  <Tooltip content={`${c.completed} of ${total} done`}>
                    <span className="flex w-14">
                      <ProgressBar height={4} value={c.completed} max={Math.max(1, total)} tone="success" />
                    </span>
                  </Tooltip>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Everything about a project on one page, in the order a stakeholder reads it. */
export function ProjectOverview({ detail }: { detail: ProjectDetail }) {
  return (
    <div className="grid max-w-[1600px] items-start gap-5 animate-rise-in lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <ProgressCard detail={detail} />
        <DescriptionCard key={detail.project.id} project={detail.project} />
        <Milestones detail={detail} />
      </div>
      <aside className="flex min-w-0 flex-col gap-5">
        <FactsCard detail={detail} />
        <LatestCheckInCard project={detail.project} checkIns={detail.updates} />
        <ContributorsCard contributors={detail.contributors} />
      </aside>
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div className="grid max-w-[1600px] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" aria-hidden>
      <div className="flex flex-col gap-5">
        <div className="rounded-lg border border-line bg-card p-5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-9 w-28" />
          <Skeleton className="mt-2 h-3.5 w-48" />
          <Skeleton className="mt-5 h-2.5 w-full rounded-full" />
          <Skeleton className="mt-6 h-[200px] w-full" />
        </div>
        <div className="rounded-lg border border-line bg-card p-5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-4 h-3.5 w-11/12" />
          <Skeleton className="mt-2 h-3.5 w-4/5" />
          <Skeleton className="mt-2 h-3.5 w-3/5" />
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-card p-4">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className={i % 2 ? 'h-3.5 w-24' : 'h-3.5 w-32'} />
            </div>
          ))}
        </div>
        <div className="h-40 rounded-lg border border-line bg-card" />
      </div>
    </div>
  );
}
