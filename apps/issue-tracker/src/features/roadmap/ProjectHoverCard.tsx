import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HealthPill, Mark } from '../../glyphs';
import { plural, shortDate } from '../../lib/format';
import type { ProjectSummary } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Avatar } from '../../ui/Avatar';
import { cn } from '../../ui/cn';
import { floatingSurface } from '../../ui/Popover';
import { ProgressBar } from '../../ui/Progress';
import { statusLabel } from '../projects/model';
import { durationLabel, isOverdue, overdueDays, projectProgress } from './projectMath';
import { ProjectStatusGlyph } from '../../glyphs';

export type HoverAnchor = { x: number; top: number; bottom: number };

const WIDTH = 300;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="pt-px text-micro font-semibold uppercase text-ink-3">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 text-ui text-ink">{children}</dd>
    </>
  );
}

/**
 * The card that follows a hovered bar. Portalled and fixed so the timeline's
 * scroll container can't clip it; below the bar, or above when it would run
 * off the bottom of the window.
 */
export function ProjectHoverCard({ project, anchor }: { project: ProjectSummary; anchor: HoverAnchor }) {
  const ws = useWorkspace();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 200;
    const left = Math.max(8, Math.min(window.innerWidth - WIDTH - 8, anchor.x - WIDTH / 2));
    const below = anchor.bottom + 8;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, anchor.top - h - 8) : below;
    setPos({ left, top });
  }, [anchor.x, anchor.top, anchor.bottom]);

  const lead = project.leadId ? ws.memberById.get(project.leadId) : undefined;
  const team = project.teamId ? ws.teamById.get(project.teamId) : undefined;
  const progress = projectProgress(project);
  const overdue = isOverdue(project);
  const scope = project.total - project.canceled;

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className={cn('pointer-events-none fixed z-[80] p-3.5', floatingSurface, pos ? 'animate-fade-in' : 'invisible')}
      style={{ width: WIDTH, left: pos?.left ?? 0, top: pos?.top ?? 0 }}
    >
      <div className="flex items-start gap-2.5">
        <Mark icon={project.icon} color={project.color} name={project.name} size={24} className="mt-px" />
        <div className="min-w-0">
          <div className="truncate text-title font-semibold leading-5 text-ink">{project.name}</div>
          {project.summary && <p className="mt-0.5 line-clamp-2 text-meta text-ink-2">{project.summary}</p>}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[62px_minmax(0,1fr)] items-center gap-x-2 gap-y-2 border-t border-line pt-3">
        <Row label="Status">
          <ProjectStatusGlyph status={project.status} progress={progress} size={13} />
          <span className="truncate">{statusLabel(project.status)}</span>
          {team && (
            <span className="ml-auto flex shrink-0 items-center gap-1 text-meta text-ink-3">
              <Mark icon={team.icon} color={team.color} name={team.name} size={14} />
              {team.name}
            </span>
          )}
        </Row>
        <Row label="Health">
          <HealthPill health={project.health} className="text-ui" />
        </Row>
        <Row label="Dates">
          {project.startDate || project.targetDate ? (
            <span className="tabular truncate">
              {project.startDate ? shortDate(project.startDate) : <span className="text-ink-3">No start</span>}
              <span className="text-ink-3"> → </span>
              {project.targetDate ? shortDate(project.targetDate) : <span className="text-ink-3">No target</span>}
              {project.startDate && project.targetDate && project.targetDate >= project.startDate && (
                <span className="text-ink-3"> · {durationLabel(project.startDate, project.targetDate)}</span>
              )}
            </span>
          ) : (
            <span className="text-ink-3">Not scheduled</span>
          )}
        </Row>
        {overdue && (
          <Row label="">
            <span className="font-medium text-danger">Overdue by {plural(overdueDays(project.targetDate!), 'day')}</span>
          </Row>
        )}
        <Row label="Progress">
          <ProgressBar value={progress * 100} className="w-14 shrink-0" height={5} tone={progress >= 1 ? 'success' : 'ink'} />
          <span className="tabular font-medium">{Math.round(progress * 100)}%</span>
          <span className="truncate text-ink-3">· {scope > 0 ? `${project.completed} of ${plural(scope, 'issue')}` : 'no issues yet'}</span>
        </Row>
        <Row label="Lead">
          <Avatar person={lead} size={18} />
          <span className={cn('truncate', !lead && 'text-ink-3')}>{lead?.name ?? 'No lead'}</span>
        </Row>
      </dl>
    </div>,
    document.body,
  );
}
