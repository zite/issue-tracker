import { Plus, Stack, X } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HealthPill, Mark } from '../../glyphs';
import { plural, shortDate } from '../../lib/format';
import type { Goal, ProjectSummary } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Card, EmptyState, Skeleton } from '../../ui/Layout';
import { CardHeader } from './CardHeader';
import { ProgressBar } from '../../ui/Progress';
import { Tooltip } from '../../ui/Tooltip';
import { isOverdue, projectProgress } from '../roadmap/projectMath';
import { statusLabel } from '../projects/model';
import { ProjectStatusGlyph } from '../../glyphs';
import { ProjectsMultiPicker } from './pickers';
import { useGoalActions } from './useGoalActions';

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));

/** Picks collect while the picker is open and save once when it closes: one write and one Undo, not one per tick. */
function AddProjects({ goal, memberIds, variant = 'ghost' }: { goal: Goal; memberIds: string[]; variant?: 'ghost' | 'primary' }) {
  const actions = useGoalActions();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(memberIds);

  const onOpenChange = (next: boolean) => {
    if (next) setDraft(memberIds);
    else if (!sameSet(draft, memberIds)) {
      const added = draft.filter(id => !memberIds.includes(id)).length;
      const removed = memberIds.filter(id => !draft.includes(id)).length;
      const message =
        added && removed ? `Updated projects in ${goal.name}`
          : added ? `Added ${plural(added, 'project')} to ${goal.name}`
            : `Removed ${plural(removed, 'project')} from ${goal.name}`;
      void actions.setProjects(goal, draft, { success: message, undoTo: memberIds });
    }
    setOpen(next);
  };

  return (
    <ProjectsMultiPicker
      goalId={goal.id}
      value={open ? draft : memberIds}
      onChange={setDraft}
      open={open}
      onOpenChange={onOpenChange}
      align="end"
      trigger={
        <Button variant={variant} size={variant === 'primary' ? 'md' : 'sm'} leading={<Plus size={14} weight="bold" />} className="data-[state=open]:bg-hover">
          Add projects
        </Button>
      }
    />
  );
}

const GRID = 'xl:grid xl:grid-cols-[minmax(0,1fr)_128px_108px_36px_84px_132px_28px] xl:items-center xl:gap-4';

export function GoalProjects({ goal, projects, memberIds, loading }: { goal: Goal; projects: ProjectSummary[]; memberIds: string[]; loading: boolean }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const actions = useGoalActions();
  const sorted = useMemo(
    () => [...projects].sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999') || a.name.localeCompare(b.name)),
    [projects],
  );

  const removeProject = (p: ProjectSummary) =>
    void actions.setProjects(goal, memberIds.filter(id => id !== p.id), { success: `Removed ${p.name} from ${goal.name}`, undoTo: memberIds });

  return (
    <Card as="section" className="overflow-hidden">
      <CardHeader title="Projects" count={memberIds.length || undefined} action={memberIds.length > 0 ? <AddProjects goal={goal} memberIds={memberIds} /> : undefined} />
      {loading ? (
          <div className="divide-y divide-line">
            {Array.from({ length: Math.min(5, Math.max(2, memberIds.length)) }, (_, i) => (
              <div key={i} className="flex h-11 items-center gap-3 px-4">
                <Skeleton className="h-[18px] w-[18px] rounded-[5px]" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="ml-auto h-1.5 w-24 rounded-full" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState icon={<Stack size={22} weight="duotone" />} title="No projects yet" compact actions={<AddProjects goal={goal} memberIds={memberIds} variant="primary" />}>
            Add the projects that move this goal forward to follow their progress and health here.
          </EmptyState>
        ) : (
          <div role="table" aria-label={`Projects in ${goal.name}`}>
            <div role="row" className={cn('hidden h-9 border-b border-line bg-sunken px-4 text-micro font-semibold uppercase text-ink-3', GRID)}>
              <span role="columnheader">Name</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Health</span>
              <span role="columnheader">
                <span className="sr-only">Lead</span>
              </span>
              <span role="columnheader">Target</span>
              <span role="columnheader">Progress</span>
              <span role="columnheader">
                <span className="sr-only">Remove</span>
              </span>
            </div>
            {sorted.map((p, i) => {
              const progress = projectProgress(p);
              const pct = Math.round(progress * 100);
              const lead = p.leadId ? ws.memberById.get(p.leadId) : undefined;
              const overdue = isOverdue(p);
              const scope = p.total - p.canceled;
              return (
                <div
                  key={p.id}
                  role="row"
                  onClick={e => {
                    if ((e.target as HTMLElement).closest('button, a')) return;
                    navigate(`/project/${p.id}`);
                  }}
                  className={cn('group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-hover/60 xl:h-11 xl:py-0', i > 0 && 'border-t border-line', GRID)}
                >
                  <div role="cell" className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Mark icon={p.icon} color={p.color} name={p.name} size={20} />
                    <div className="min-w-0">
                      <Link to={`/project/${p.id}`} title={p.name} className="block truncate text-ui font-medium text-ink decoration-line-strong underline-offset-[3px] hover:underline">
                        {p.name}
                      </Link>
                      {/* Stacked facts on narrow screens. */}
                      <div className="mt-0.5 flex items-center gap-2 text-meta text-ink-2 xl:hidden">
                        <span className="flex items-center gap-1">
                          <ProjectStatusGlyph status={p.status} progress={progress} size={12} />
                          {statusLabel(p.status)}
                        </span>
                        <HealthPill health={p.health} compact />
                        {p.targetDate && <span className={cn('tabular', overdue && 'text-danger')}>{shortDate(p.targetDate)}</span>}
                      </div>
                    </div>
                  </div>
                  <div role="cell" className="hidden min-w-0 items-center gap-1.5 text-ui text-ink xl:flex">
                    <ProjectStatusGlyph status={p.status} progress={progress} />
                    <span className="truncate">{statusLabel(p.status)}</span>
                  </div>
                  <div role="cell" className="hidden min-w-0 xl:flex">
                    <HealthPill health={p.health} className="truncate" />
                  </div>
                  <div role="cell" className="hidden xl:flex">
                    <Tooltip content={lead ? `Lead: ${lead.name}` : 'No lead'}>
                      <span className="flex">
                        <Avatar person={lead} size={22} />
                      </span>
                    </Tooltip>
                  </div>
                  <div role="cell" className={cn('tabular hidden text-ui xl:block', overdue ? 'font-medium text-danger' : p.targetDate ? 'text-ink' : 'text-ink-3')}>
                    {p.targetDate ? shortDate(p.targetDate) : '—'}
                  </div>
                  <Tooltip content={scope > 0 ? `${p.completed} of ${plural(scope, 'issue')} done` : 'No issues yet'}>
                    <div role="cell" className="flex w-[88px] shrink-0 items-center gap-2 xl:w-auto">
                      <ProgressBar value={pct} height={5} tone={pct >= 100 ? 'success' : 'ink'} />
                      <span className="tabular w-8 shrink-0 text-right text-meta text-ink-2">{pct}%</span>
                    </div>
                  </Tooltip>
                  <div role="cell" className="flex shrink-0 justify-end">
                    <Tooltip content="Remove from goal">
                      <Button
                        variant="ghost"
                        size="xs"
                        icon
                        aria-label={`Remove ${p.name} from ${goal.name}`}
                        className="text-ink-3 xl:opacity-0 xl:focus-visible:opacity-100 xl:group-hover:opacity-100"
                        onClick={() => removeProject(p)}
                      >
                        <X size={13} weight="bold" />
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </Card>
  );
}
