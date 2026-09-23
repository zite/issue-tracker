import { memo, type KeyboardEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { HealthPill, Mark } from '../../glyphs';
import { shortDate, timeAgo, todayString } from '../../lib/format';
import type { ProjectSummary } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Avatar } from '../../ui/Avatar';
import { cn } from '../../ui/cn';
import { ProgressBar } from '../../ui/Progress';
import { Tooltip } from '../../ui/Tooltip';
import { MilestoneNode } from './bits';
import { ProjectMenu } from './ProjectMenu';
import { isClosedStatus, isPastTarget, progressOf } from './model';

/** Open a project; ⌘/Ctrl-click opens it in a new tab. */
export function useOpenProject() {
  const navigate = useNavigate();
  return (id: string, e?: MouseEvent | KeyboardEvent) => {
    if (e && (e.metaKey || e.ctrlKey)) window.open(`#/project/${id}`, '_blank');
    else navigate(`/project/${id}`);
  };
}

/** Clicks on a card's own controls (menus, pickers) must not open the project. */
export const fromControl = (e: { target: EventTarget }) => Boolean((e.target as HTMLElement).closest('button, a, input, [role="menu"], [role="dialog"]'));

export function TeamKey({ teamId, className }: { teamId: string | null; className?: string }) {
  const ws = useWorkspace();
  const team = teamId ? ws.teamById.get(teamId) : undefined;
  if (!team) return null;
  return (
    <Tooltip content={team.name}>
      <span className={cn('inline-flex h-5 shrink-0 items-center rounded-xs bg-sunken px-1.5 font-mono text-[10.5px] font-medium text-ink-2 ring-1 ring-inset ring-line', className)}>{team.key}</span>
    </Tooltip>
  );
}

export function TargetDate({ project, className }: { project: Pick<ProjectSummary, 'targetDate' | 'status'>; className?: string }) {
  if (!project.targetDate) return null;
  const overdue = isPastTarget(project);
  return (
    <Tooltip content={overdue ? `Target was ${shortDate(project.targetDate)} — past due` : `Target ${shortDate(project.targetDate)}`}>
      <span className={cn('tabular inline-flex shrink-0 items-center whitespace-nowrap text-meta', overdue ? 'font-medium text-danger' : 'text-ink-2', className)}>
        {shortDate(project.targetDate)}
      </span>
    </Tooltip>
  );
}

export function ProjectHealth({ project, compact }: { project: Pick<ProjectSummary, 'health' | 'lastUpdateAt'>; compact?: boolean }) {
  return (
    <Tooltip content={project.lastUpdateAt ? `Last check-in ${timeAgo(project.lastUpdateAt)}` : 'Health is set by posting a check-in'}>
      <span className="inline-flex">
        <HealthPill health={project.health} compact={compact} className="text-meta" />
      </span>
    </Tooltip>
  );
}

function useNextMilestone(projectId: string) {
  const ws = useWorkspace();
  const today = todayString();
  return (ws.milestonesByProject.get(projectId) ?? []).find(m => m.targetDate && m.targetDate >= today);
}

/** The gallery card: what it is, how far along, and whether it needs a look. */
export const ProjectCard = memo(function ProjectCard({ project, onEdit, showTeam }: { project: ProjectSummary; onEdit: (p: ProjectSummary) => void; showTeam: boolean }) {
  const ws = useWorkspace();
  const open = useOpenProject();
  const lead = project.leadId ? ws.memberById.get(project.leadId) : undefined;
  const progress = progressOf(project);
  const pct = Math.round(progress * 100);
  const scope = project.total - project.canceled;
  const next = useNextMilestone(project.id);
  const closed = isClosedStatus(project.status);

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={project.name}
      data-project-id={project.id}
      onClick={e => !fromControl(e) && open(project.id, e)}
      onKeyDown={e => e.key === 'Enter' && e.target === e.currentTarget && open(project.id, e)}
      className="group/card flex cursor-pointer flex-col rounded-lg border border-line bg-card p-4 shadow-hairline transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-raised focus-visible:shadow-raised focus-visible:[border-radius:12px]"
    >
      <div className="flex items-center gap-3">
        <Mark icon={project.icon} color={project.color} name={project.name} size={32} />
        <h3 title={project.name} className={cn('min-w-0 flex-1 truncate text-title font-semibold', closed ? 'text-ink-2' : 'text-ink')}>{project.name}</h3>
        <ProjectMenu
          project={project}
          onEdit={() => onEdit(project)}
          showOpen
          className="-mr-1.5 opacity-0 focus-visible:opacity-100 group-hover/card:opacity-100 group-focus-visible/card:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
        />
      </div>

      <p className={cn('mt-2.5 line-clamp-2 min-h-[36px] text-ui', project.summary ? 'text-ink-2' : 'text-ink-3')}>{project.summary || 'No summary yet.'}</p>

      <div className="mt-auto pt-4">
        {scope > 0 ? (
          <Tooltip content={`${project.completed} of ${scope} issues done · ${project.started} in flight`}>
            <div className="flex items-center gap-2.5">
              <ProgressBar
                height={6}
                max={scope}
                segments={[
                  { value: project.completed, className: pct === 100 ? 'bg-success' : 'bg-ink' },
                  { value: project.started, className: 'bg-warning/35' },
                ]}
                className="flex-1"
              />
              <span className="tabular w-9 shrink-0 text-right text-ui font-semibold text-ink">{pct}%</span>
              <span className="tabular shrink-0 text-meta text-ink-3">
                {project.completed}/{scope} issues
              </span>
            </div>
          </Tooltip>
        ) : (
          <div className="flex h-[18px] items-center text-meta text-ink-3">No issues yet</div>
        )}

        <div className="mt-2 flex h-4 min-w-0 items-center gap-1.5 text-meta text-ink-3">
          {next ? (
            <>
              <MilestoneNode done={0} total={0} size={11} />
              <span className="shrink-0">Next:</span>
              <span className="min-w-0 truncate text-ink-2">{next.name}</span>
              <span aria-hidden>·</span>
              <span className="tabular shrink-0">{shortDate(next.targetDate)}</span>
            </>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-2.5 border-t border-line pt-3">
          <ProjectHealth project={project} />
          <TargetDate project={project} />
          <span className="ml-auto flex items-center gap-2">
            {showTeam && <TeamKey teamId={project.teamId} />}
            <Tooltip content={lead ? `Lead: ${lead.name}` : 'No lead'}>
              <span className="inline-flex">
                <Avatar person={lead} size={22} />
              </span>
            </Tooltip>
          </span>
        </div>
      </div>
    </article>
  );
});

/** The board's compact card. Presentational, so the drag overlay can render a copy. */
export const BoardCardBody = memo(function BoardCardBody({ project, overlay, onEdit, showTeam }: { project: ProjectSummary; overlay?: boolean; onEdit?: (p: ProjectSummary) => void; showTeam: boolean }) {
  const ws = useWorkspace();
  const lead = project.leadId ? ws.memberById.get(project.leadId) : undefined;
  const progress = progressOf(project);
  const pct = Math.round(progress * 100);
  return (
    <div
      className={cn(
        'group/card rounded-md border border-line bg-card p-3 shadow-hairline transition-[border-color,box-shadow] duration-100 hover:border-line-strong hover:shadow-raised',
        overlay && 'rotate-[1.2deg] cursor-grabbing border-line-strong shadow-pop',
      )}
    >
      <div className="flex items-start gap-2.5">
        <Mark icon={project.icon} color={project.color} name={project.name} size={22} className="mt-px" />
        <p className={cn('line-clamp-2 min-w-0 flex-1 text-ui font-semibold leading-[1.35]', isClosedStatus(project.status) ? 'text-ink-2' : 'text-ink')}>{project.name}</p>
        {onEdit && !overlay && (
          <ProjectMenu
            project={project}
            onEdit={() => onEdit(project)}
            showOpen
            className="-mr-1.5 -mt-1 h-6 w-6 opacity-0 focus-visible:opacity-100 group-hover/card:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
          />
        )}
      </div>
      {project.summary && <p className="mt-1.5 line-clamp-2 pl-[32px] text-meta text-ink-2">{project.summary}</p>}
      <div className="mt-3 flex items-center gap-2">
        <ProgressBar height={4} value={progress} max={1} tone={pct === 100 ? 'success' : 'ink'} className="flex-1" />
        <span className="tabular w-8 shrink-0 text-right text-meta font-medium text-ink-2">{pct}%</span>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <ProjectHealth project={project} />
        <TargetDate project={project} />
        <span className="ml-auto flex items-center gap-1.5">
          {showTeam && <TeamKey teamId={project.teamId} />}
          <Avatar person={lead} size={20} />
        </span>
      </div>
    </div>
  );
});
