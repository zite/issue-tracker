import { CaretDown } from '@phosphor-icons/react';
import { memo, useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { Mark, PriorityGlyph } from '../../glyphs';
import { PRIORITY_LABEL } from '../../lib/constants';
import { shortDate } from '../../lib/format';
import type { ProjectSummary } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { DatePicker, PriorityPicker } from '../../pickers/pickers';
import { Avatar, AvatarStack } from '../../ui/Avatar';
import { cn } from '../../ui/cn';
import { Skeleton } from '../../ui/Layout';
import { ProgressBar } from '../../ui/Progress';
import { Tooltip } from '../../ui/Tooltip';
import { LeadPicker, ProjectStatusGlyph, ProjectStatusPicker, inlineValue } from './bits';
import { ProjectHealth, TeamKey, fromControl, useOpenProject } from './ProjectCard';
import { SectionHeading, type ProjectSection } from './ProjectGallery';
import { ProjectMenu } from './ProjectMenu';
import { STATUS_LABEL, asStatus, isClosedStatus, isPastTarget, progressOf, useCollapsedSections, type ProjectStatus, type SortKey } from './model';
import { useProjectActions } from './useProjectActions';

/** Column widths shared by the header and every row, so the ledger lines up. */
const COL = {
  status: 'hidden w-[128px] md:flex',
  health: 'hidden w-[104px] lg:flex',
  priority: 'hidden w-[112px] xl:flex',
  lead: 'hidden w-12 sm:flex 2xl:w-[148px]',
  members: 'hidden w-[84px] 2xl:flex',
  target: 'hidden w-[92px] sm:flex',
  progress: 'flex w-[56px] sm:w-[124px]',
  team: 'hidden w-[60px] md:flex',
  menu: 'flex w-8 justify-end',
};

type Kind = 'status' | 'priority' | 'lead' | 'target';

/**
 * A plain button until clicked; only then a live picker. A page of rows each
 * mounting four popovers would re-render them all on every hover for nothing.
 */
function Slot({ kind, active, onActive, label, children, render, className }: {
  kind: Kind;
  active: Kind | null;
  onActive: (kind: Kind | null) => void;
  label: string;
  children: ReactElement | ReactElement[];
  render: (trigger: ReactElement, close: (open: boolean) => void) => ReactElement;
  className?: string;
}) {
  const trigger = (
    <button type="button" aria-label={label} onClick={() => onActive(kind)} className={cn(inlineValue, '-ml-1.5', className)}>
      {children}
    </button>
  );
  if (active !== kind) return trigger;
  return render(trigger, open => !open && onActive(null));
}

const ProjectRow = memo(function ProjectRow({ project, onEdit, showTeam }: { project: ProjectSummary; onEdit: (p: ProjectSummary) => void; showTeam: boolean }) {
  const ws = useWorkspace();
  const open = useOpenProject();
  const actions = useProjectActions();
  const [active, setActive] = useState<Kind | null>(null);
  const lead = project.leadId ? ws.memberById.get(project.leadId) : undefined;
  const members = project.memberIds.map(id => ws.memberById.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m));
  const progress = progressOf(project);
  const pct = Math.round(progress * 100);
  const overdue = isPastTarget(project);
  const closed = isClosedStatus(project.status);
  const status = asStatus(project.status);

  return (
    <div
      role="row"
      tabIndex={0}
      aria-label={project.name}
      data-project-id={project.id}
      onClick={e => !fromControl(e) && open(project.id, e)}
      onKeyDown={e => e.key === 'Enter' && e.target === e.currentTarget && open(project.id, e)}
      className="group/row flex min-h-11 cursor-pointer items-center gap-3 border-b border-line px-3 py-1.5 text-ui transition-colors duration-75 last:border-b-0 hover:bg-hover/60 focus-visible:bg-hover focus-visible:[border-radius:4px] focus-visible:[outline-offset:-2px] sm:gap-2 sm:px-4 sm:py-0"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Mark icon={project.icon} color={project.color} name={project.name} size={22} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span title={project.name} className={cn('min-w-0 shrink-0 truncate font-medium sm:max-w-[60%]', closed ? 'text-ink-2' : 'text-ink')}>{project.name}</span>
            {project.summary && <span className="hidden min-w-0 flex-1 truncate text-ink-3 lg:inline" title={project.summary}>{project.summary}</span>}
          </div>
          {/* On a phone the columns fold into one line under the name. */}
          <div className="mt-0.5 flex items-center gap-2 text-meta text-ink-2 md:hidden">
            <ProjectStatusGlyph status={status} progress={progress} size={12} />
            <span>{STATUS_LABEL[status]}</span>
            <ProjectHealth project={project} compact />
            {project.targetDate && <span className={cn('tabular', overdue && 'text-danger')}>{shortDate(project.targetDate)}</span>}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className={COL.status}>
          <Slot
            kind="status"
            active={active}
            onActive={setActive}
            label={`Status: ${STATUS_LABEL[status]}`}
            render={(trigger, close) => (
              <ProjectStatusPicker open onOpenChange={close} trigger={trigger} value={project.status} onChange={s => s !== project.status && actions.update(project.id, { status: asStatus(s) })} />
            )}
          >
            <ProjectStatusGlyph status={status} progress={progress} />
            <span className="truncate">{STATUS_LABEL[status]}</span>
          </Slot>
        </span>

        <span className={COL.health}>
          <ProjectHealth project={project} />
        </span>

        <span className={COL.priority}>
          <Slot
            kind="priority"
            active={active}
            onActive={setActive}
            label={`Priority: ${PRIORITY_LABEL[project.priority]}`}
            className={cn(!project.priority && 'text-ink-3')}
            render={(trigger, close) => (
              <PriorityPicker open onOpenChange={close} trigger={trigger} value={project.priority} onChange={v => v !== project.priority && actions.update(project.id, { priority: v })} />
            )}
          >
            <PriorityGlyph priority={project.priority} />
            <span className="truncate">{project.priority ? PRIORITY_LABEL[project.priority] : 'None'}</span>
          </Slot>
        </span>

        <span className={COL.lead}>
          <Slot
            kind="lead"
            active={active}
            onActive={setActive}
            label={lead ? `Lead: ${lead.name}` : 'Set lead'}
            className="min-w-0"
            render={(trigger, close) => (
              <LeadPicker open onOpenChange={close} trigger={trigger} teamId={project.teamId} value={project.leadId} onChange={v => v !== project.leadId && actions.update(project.id, { leadId: v })} />
            )}
          >
            <Avatar person={lead} size={20} />
            <span className={cn('hidden truncate 2xl:inline', !lead && 'text-ink-3')}>{lead ? lead.name : 'No lead'}</span>
          </Slot>
        </span>

        <span className={COL.members}>
          {members.length > 0 ? (
            <Tooltip content={members.map(m => m.name).join(', ')}>
              <span className="inline-flex">
                <AvatarStack people={members} size={20} max={3} />
              </span>
            </Tooltip>
          ) : (
            <span className="text-ink-3">—</span>
          )}
        </span>

        <span className={COL.target}>
          <Slot
            kind="target"
            active={active}
            onActive={setActive}
            label={project.targetDate ? `Target: ${shortDate(project.targetDate)}` : 'Set target date'}
            className={cn('tabular', overdue ? 'font-medium text-danger' : project.targetDate ? 'text-ink-2' : 'text-ink-3 opacity-0 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100')}
            render={(trigger, close) => (
              <DatePicker
                presets="target"
                open
                onOpenChange={close}
                trigger={trigger}
                label="Target date"
                value={project.targetDate}
                onChange={v => {
                  if (v && project.startDate && v < project.startDate) {
                    toast.error(`The target can’t be before the start date (${shortDate(project.startDate)})`);
                    return;
                  }
                  actions.update(project.id, { targetDate: v });
                }}
              />
            )}
          >
            <span>{project.targetDate ? shortDate(project.targetDate) : 'Set target'}</span>
          </Slot>
        </span>

        <span className={COL.progress}>
          {project.total - project.canceled > 0 ? (
            <Tooltip content={`${project.completed} of ${project.total - project.canceled} issues done`}>
              <span className="flex w-full items-center gap-2">
                <ProgressBar height={5} value={progress} max={1} tone={pct === 100 ? 'success' : 'ink'} className="hidden flex-1 sm:flex" />
                <span className="tabular w-full text-right text-meta font-medium text-ink-2 sm:w-9">{pct}%</span>
              </span>
            </Tooltip>
          ) : (
            <span className="w-full text-right text-meta text-ink-3 sm:text-left">No issues</span>
          )}
        </span>

        {showTeam && (
          <span className={COL.team}>
            <TeamKey teamId={project.teamId} />
          </span>
        )}

        <span className={cn(COL.menu, 'opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100 [&:has([data-state=open])]:opacity-100')}>
          <ProjectMenu project={project} onEdit={() => onEdit(project)} showOpen className="h-7 w-7" />
        </span>
      </div>
    </div>
  );
});

function HeaderCell({ className, label, sortKey, sort, onSort }: { className: string; label: string; sortKey?: SortKey; sort: SortKey; onSort: (s: SortKey) => void }) {
  if (!sortKey) return <span className={cn(className, 'items-center')}>{label}</span>;
  const on = sort === sortKey;
  return (
    <span className={cn(className, 'items-center')}>
      <button
        type="button"
        onClick={() => onSort(on ? 'manual' : sortKey)}
        aria-label={on ? `Sorted by ${label.toLowerCase()} — clear` : `Sort by ${label.toLowerCase()}`}
        className={cn('-ml-1 inline-flex h-6 items-center gap-1 rounded-xs px-1 uppercase transition-colors hover:bg-hover hover:text-ink', on && 'text-ink')}
      >
        {label}
        {on && <CaretDown size={9} weight="bold" />}
      </button>
    </span>
  );
}

/** The ledger: sections by status, every property editable in place, sortable by its headers. */
export function ProjectTable({ sections, onEdit, onCreate, showTeam, sort, onSort }: {
  sections: ProjectSection[];
  onEdit: (p: ProjectSummary) => void;
  onCreate: (status: ProjectStatus) => void;
  showTeam: boolean;
  sort: SortKey;
  onSort: (s: SortKey) => void;
}) {
  const [collapsed, toggle] = useCollapsedSections('issue-tracker:projects:collapsed');
  const h = { sort, onSort };
  return (
    <div className="mb-16 rounded-lg border border-line bg-card shadow-hairline" role="table" aria-label="Projects">
      <div role="row" className="sticky top-0 z-[5] flex h-9 items-center gap-2 rounded-t-lg border-b border-line bg-sunken px-3 text-micro font-semibold uppercase text-ink-3 sm:px-4">
        <span className="flex min-w-0 flex-1 items-center pl-[32px]">
          <HeaderCell className="flex" label="Project" sortKey="name" {...h} />
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <HeaderCell className={COL.status} label="Status" {...h} />
          <HeaderCell className={COL.health} label="Health" sortKey="health" {...h} />
          <HeaderCell className={COL.priority} label="Priority" sortKey="priority" {...h} />
          <HeaderCell className={COL.lead} label="Lead" {...h} />
          <HeaderCell className={COL.members} label="Members" {...h} />
          <HeaderCell className={COL.target} label="Target" sortKey="target" {...h} />
          <HeaderCell className={cn(COL.progress, 'justify-end sm:justify-start')} label="Progress" sortKey="progress" {...h} />
          {showTeam && <HeaderCell className={COL.team} label="Team" {...h} />}
          <span className={COL.menu} />
        </span>
      </div>
      {sections.map((section, i) => {
        const isCollapsed = collapsed.has(section.status);
        return (
          <div key={section.status} role="rowgroup" aria-label={STATUS_LABEL[section.status]}>
            <SectionHeading
              section={section}
              collapsed={isCollapsed}
              onToggle={() => toggle(section.status)}
              onCreate={onCreate}
              className={cn('sticky top-9 z-[4] h-10 border-b border-line bg-paper px-3 sm:px-4', isCollapsed && i === sections.length - 1 && 'rounded-b-lg border-b-0')}
            >
              <span className="flex-1" />
            </SectionHeading>
            {!isCollapsed && section.projects.map(p => <ProjectRow key={p.id} project={p} onEdit={onEdit} showTeam={showTeam} />)}
          </div>
        );
      })}
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="rounded-lg border border-line bg-card" aria-hidden>
      <div className="h-9 rounded-t-lg border-b border-line bg-sunken" />
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex h-11 items-center gap-3 border-b border-line px-4 last:border-b-0">
          <Skeleton className="h-5 w-5 rounded-[30%]" />
          <Skeleton className={i % 3 === 0 ? 'h-3 w-56' : i % 3 === 1 ? 'h-3 w-40' : 'h-3 w-48'} />
          <Skeleton className="ml-auto hidden h-3 w-20 md:block" />
          <Skeleton className="hidden h-3 w-16 lg:block" />
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-1.5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
