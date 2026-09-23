import { PushPin } from '@phosphor-icons/react';
import { differenceInCalendarDays } from 'date-fns';
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoalMark, Mark } from '../../glyphs';
import { dueLabel, parseDay, plural, shortDate } from '../../lib/format';
import type { Goal, ProjectRef, ProjectSummary } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Avatar } from '../../ui/Avatar';
import { cn } from '../../ui/cn';
import { Card, Skeleton } from '../../ui/Layout';
import { ProgressBar } from '../../ui/Progress';
import { Tooltip } from '../../ui/Tooltip';
import { rollup } from '../roadmap/projectMath';
import { HealthBar, healthSentence } from './GoalHealth';
import { GoalMenu } from './GoalMenu';
import { GoalStatusBadge } from './status';

/** Overlapping project marks, like an avatar stack but square. */
export function ProjectMarks({ projects, max = 5, size = 20 }: { projects: Pick<ProjectRef, 'id' | 'name' | 'icon' | 'color'>[]; max?: number; size?: number }) {
  const shown = projects.slice(0, max);
  const rest = projects.length - shown.length;
  if (!projects.length) return null;
  return (
    <span className="inline-flex items-center">
      {shown.map((p, i) => (
        <Tooltip key={p.id} content={p.name}>
          <span className={cn('inline-flex rounded-[30%] bg-card ring-2 ring-card', i > 0 && '-ml-1')}>
            <Mark icon={p.icon} color={p.color} name={p.name} size={size} />
          </span>
        </Tooltip>
      ))}
      {rest > 0 && (
        <span style={{ height: size, minWidth: size }} className="-ml-1 inline-flex items-center justify-center rounded-[30%] bg-sunken px-1 text-micro font-semibold text-ink-2 ring-2 ring-card">
          +{rest}
        </span>
      )}
    </span>
  );
}

function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <div className="mb-1.5 text-micro font-semibold uppercase text-ink-3">{label}</div>
      {children}
    </div>
  );
}

export function targetHint(goal: Pick<Goal, 'targetDate' | 'status'>) {
  if (!goal.targetDate) return null;
  const days = differenceInCalendarDays(parseDay(goal.targetDate), new Date());
  if (goal.status === 'Completed') return 'Completed';
  if (days < 0) return `${plural(-days, 'day')} overdue`;
  if (days === 0) return 'Due today';
  if (days < 60) return `In ${plural(days, 'day')}`;
  return `In ${Math.round(days / 7)} weeks`;
}

/**
 * One goal on the Goals page: what it is on the left, how it's going on the
 * right — project health as a stacked bar, progress as a number, and when and
 * who.
 */
export function GoalCard({ goal, projects, loading, onEdit }: { goal: Goal; projects: ProjectSummary[]; loading: boolean; onEdit: () => void }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const owner = goal.ownerId ? ws.memberById.get(goal.ownerId) : undefined;
  const refs = useMemo(() => ws.projects.filter(p => p.goalId === goal.id), [ws.projects, goal.id]);
  const r = useMemo(() => rollup(projects), [projects]);
  const pinned = ws.isPinned('Goal', goal.id);
  const late = dueLabel(goal.targetDate)?.tone === 'overdue' && goal.status !== 'Completed';
  const pct = Math.round(r.progress * 100);
  const progressLabel = r.scope ? `${r.completed} of ${plural(r.scope, 'issue')} done` : refs.length ? 'No issues in these projects yet' : 'No projects yet';
  const href = `/goal/${goal.id}`;

  return (
    <div
      onClick={e => {
        // Text selection and clicks on inner controls shouldn't navigate.
        if (window.getSelection()?.toString() || (e.target as HTMLElement).closest('button, a, [role="menuitem"]')) return;
        navigate(href);
      }}
      className="group cursor-pointer animate-rise-in"
    >
      <Card className="p-4 transition-shadow duration-150 group-hover:shadow-raised sm:p-5">
        <div className="flex items-start gap-3.5 sm:gap-4">
          <GoalMark icon={goal.icon} color={goal.color} size={40} className="mt-0.5" />

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              <Link to={href} className="min-w-0 truncate font-display text-[22px] leading-7 text-ink decoration-line-strong underline-offset-4 hover:underline">
                {goal.name}
              </Link>
              <GoalStatusBadge status={goal.status} />
              {pinned && (
                <Tooltip content="Pinned">
                  <span className="flex text-ink-3" aria-label="Pinned">
                    <PushPin size={13} weight="fill" />
                  </span>
                </Tooltip>
              )}
            </div>
            <p className={cn('mt-1 line-clamp-2 text-body', goal.summary ? 'text-ink-2' : 'text-ink-3')}>{goal.summary || 'No summary yet'}</p>
            <div className="mt-3 flex min-h-6 flex-wrap items-center gap-x-2.5 gap-y-2">
              <ProjectMarks projects={refs} />
              <span className="text-meta text-ink-3">{refs.length ? plural(refs.length, 'project') : 'No projects yet'}</span>

              {/* Narrow screens fold the facts into one line. */}
              <span className="flex w-full items-center gap-3 text-meta text-ink-2 lg:hidden">
                {loading ? (
                  <Skeleton className="h-3 w-40" />
                ) : (
                  <>
                    {refs.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        <ProgressBar value={pct} height={4} className="w-12" tone={pct >= 100 ? 'success' : 'ink'} />
                        <span className="tabular font-medium text-ink">{pct}%</span>
                      </span>
                    )}
                    {r.active > 0 && <span className="truncate">{healthSentence(r)}</span>}
                    {goal.targetDate && <span className={cn('tabular shrink-0', late && 'font-medium text-danger')}>{shortDate(goal.targetDate)}</span>}
                    <span className="ml-auto flex shrink-0">
                      <Avatar person={owner} size={20} />
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="hidden shrink-0 items-stretch self-center lg:flex">
            <Fact label="Health" className="w-[168px] pr-5">
              {loading ? (
                <>
                  <Skeleton className="h-1.5 w-[120px] rounded-full" />
                  <Skeleton className="mt-2 h-3 w-24" />
                </>
              ) : (
                <>
                  <HealthBar rollup={r} className="w-[120px]" />
                  <div className="mt-1.5 truncate text-meta text-ink-2">{healthSentence(r)}</div>
                </>
              )}
            </Fact>
            <Fact label="Progress" className="w-[132px] border-l border-line px-5">
              {loading ? (
                <>
                  <Skeleton className="h-6 w-12" />
                  <Skeleton className="mt-2 h-1 w-full rounded-full" />
                </>
              ) : (
                <Tooltip content={progressLabel}>
                  <div>
                    <div className="tabular font-display text-[28px] leading-none text-ink">
                      {pct}
                      <span className="text-[18px] text-ink-3">%</span>
                    </div>
                    <ProgressBar value={pct} height={4} className="mt-2" tone={pct >= 100 ? 'success' : 'ink'} />
                  </div>
                </Tooltip>
              )}
            </Fact>
            <Fact label="Target" className="w-[150px] border-l border-line pl-5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className={cn('tabular truncate text-ui font-medium', late ? 'text-danger' : goal.targetDate ? 'text-ink' : 'text-ink-3')}>
                    {goal.targetDate ? shortDate(goal.targetDate) : 'No target'}
                  </div>
                  <div className={cn('mt-0.5 truncate text-meta', late ? 'text-danger' : 'text-ink-3')}>{targetHint(goal) ?? 'Set one on the goal'}</div>
                </div>
                <Tooltip content={owner ? `Owner: ${owner.name}` : 'No owner'}>
                  <span className="flex shrink-0">
                    <Avatar person={owner} size={26} />
                  </span>
                </Tooltip>
              </div>
            </Fact>
          </div>

          <GoalMenu goal={goal} onEdit={onEdit} className="-mr-2 -mt-1 shrink-0 text-ink-3 sm:-mr-2.5" />
        </div>
      </Card>
    </div>
  );
}

export function GoalCardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <Skeleton className="h-10 w-10 rounded-[12px]" />
        <div className="flex-1">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="mt-2 h-3.5 w-80 max-w-full" />
          <Skeleton className="mt-4 h-5 w-32" />
        </div>
      </div>
    </Card>
  );
}
