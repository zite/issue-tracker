import { ArrowElbowLeftUp, CalendarBlank, Diamond, Hash, Plus, Prohibit, Shapes, Tag, X } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Mark, PriorityGlyph, SprintGlyph, StatusGlyph, TypeGlyph } from '../glyphs';
import { IssuePropertyPicker, type PickerKind } from '../issues/PropertyPicker';
import { estimateLabel, isDoneType, PRIORITY_LABEL } from '../lib/constants';
import { dueLabel, shortDate } from '../lib/format';
import { useIssueActions } from '../lib/mutations';
import type { Issue } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import { IssueSearchPicker } from '../pickers/pickers';
import { Avatar, Unassigned } from '../ui/Avatar';
import { LabelChip } from '../ui/Chip';
import { cn } from '../ui/cn';
import { Tooltip } from '../ui/Tooltip';

const valueBtn =
  '-ml-1.5 flex min-h-7 w-[calc(100%+6px)] min-w-0 items-center gap-1.5 rounded-sm px-1.5 text-left text-ui text-ink transition-colors hover:bg-card hover:shadow-hairline hover:ring-1 hover:ring-line-strong data-[state=open]:bg-card data-[state=open]:ring-1 data-[state=open]:ring-line-strong';
const empty = 'text-ink-3';

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  // Top-aligned, so a value that wraps (many labels) keeps its label beside the first line.
  return (
    <div className={cn('grid min-h-9 grid-cols-[84px_minmax(0,1fr)] items-start gap-2', wide && 'sm:col-span-2')}>
      <span className="flex h-9 items-center truncate text-meta text-ink-3">{label}</span>
      <div className="flex min-h-9 min-w-0 items-center">{children}</div>
    </div>
  );
}

/**
 * The issue's facts, every one editable. In the sheet it is a two-column
 * "ticket stub" under the title; on the full page a single column in a card.
 * `openKind` lets keyboard shortcuts open the same pickers a click would.
 */
export function IssueFacts({ issue, openKind, onOpenKind, columns = 2 }: { issue: Issue; openKind: PickerKind | null; onOpenKind: (k: PickerKind | null) => void; columns?: 1 | 2 }) {
  const ws = useWorkspace();
  const actions = useIssueActions();
  const [parentOpen, setParentOpen] = useState(false);
  const status = ws.statusOf(issue);
  const team = issue.teamId ? ws.teamById.get(issue.teamId) : undefined;
  const assignee = issue.assigneeId ? ws.memberById.get(issue.assigneeId) : undefined;
  const project = issue.projectId ? ws.projectById.get(issue.projectId) : undefined;
  const milestone = issue.milestoneId ? ws.milestoneById.get(issue.milestoneId) : undefined;
  const sprint = issue.sprintId ? ws.sprintById.get(issue.sprintId) : undefined;
  const labels = issue.labelIds.map(id => ws.labelById.get(id)).filter(Boolean);
  const due = dueLabel(issue.dueDate);
  const done = isDoneType(status?.type);

  const pick = (kind: PickerKind, content: ReactNode, className?: string) => (
    <IssuePropertyPicker
      issues={[issue]}
      kind={kind}
      open={openKind === kind}
      onOpenChange={o => onOpenKind(o ? kind : null)}
      trigger={
        <button type="button" className={cn(valueBtn, className)}>
          {content}
        </button>
      }
    />
  );

  return (
    <div className={cn('grid gap-x-6', columns === 2 ? 'sm:grid-cols-2' : 'grid-cols-1')}>
      <Fact label="Status">
        {pick('status', <><StatusGlyph status={status} siblings={team ? ws.statusesByTeam.get(team.id) : undefined} /><span className="truncate font-medium">{status?.name ?? 'No status'}</span></>)}
      </Fact>
      <Fact label="Assignee">
        {pick('assignee', assignee ? <><Avatar person={assignee} size={20} /><span className="truncate">{assignee.name}</span></> : <><Unassigned size={20} /><span className={empty}>Unassigned</span></>)}
      </Fact>
      <Fact label="Priority">
        {pick('priority', <><PriorityGlyph priority={issue.priority} /><span className={cn('truncate', !issue.priority && empty)}>{PRIORITY_LABEL[issue.priority]}</span></>)}
      </Fact>
      <Fact label="Due">
        {pick('due', <><CalendarBlank size={15} className={cn('shrink-0', !done && due?.tone === 'overdue' ? 'text-danger' : 'text-ink-3')} /><span className={cn('truncate', !due && empty, !done && due?.tone === 'overdue' && 'font-medium text-danger', !done && due?.tone === 'soon' && 'text-warning')}>{due ? (due.days < 0 ? `${due.label} · overdue` : due.label) : 'Set due date'}</span></>)}
      </Fact>
      <Fact label="Labels" wide={columns === 2}>
        {pick(
          'labels',
          labels.length ? (
            <span className="flex flex-wrap items-center gap-1 py-1">
              {labels.map(l => <LabelChip key={l!.id} name={l!.name} color={l!.color} />)}
              <Plus size={12} className="text-ink-3" />
            </span>
          ) : (
            <><Tag size={15} className="text-ink-3" /><span className={empty}>Add labels</span></>
          ),
          'h-auto',
        )}
      </Fact>
      <Fact label="Project">
        {pick('project', project ? <><Mark icon={project.icon} color={project.color} name={project.name} size={18} /><span className="truncate">{project.name}</span></> : <><Shapes size={15} className="text-ink-3" /><span className={empty}>No project</span></>)}
      </Fact>
      {project ? (
        <Fact label="Milestone">
          {pick('milestone', <><Diamond size={14} className="text-ink-3" /><span className={cn('truncate', !milestone && empty)}>{milestone?.name ?? 'No milestone'}</span>{milestone?.targetDate && <span className="shrink-0 text-meta text-ink-3">{shortDate(milestone.targetDate)}</span>}</>)}
        </Fact>
      ) : (
        columns === 2 && <span className="hidden sm:block" />
      )}
      {team?.sprintsEnabled && (
        <Fact label="Sprint">
          {pick('sprint', sprint ? <><SprintGlyph status={sprint.status} progress={0.5} /><span className="truncate">{sprint.name}</span>{sprint.status === 'active' && <span className="hl shrink-0 text-meta font-medium">current</span>}</> : <><Prohibit size={14} className="text-ink-3" /><span className={empty}>No sprint</span></>)}
        </Fact>
      )}
      {team?.estimateScale !== 'none' && (
        <Fact label="Estimate">
          {pick('estimate', <><Hash size={14} className="text-ink-3" /><span className={cn('truncate', issue.estimate == null && empty)}>{estimateLabel(issue.estimate, team?.estimateScale) ?? 'Not estimated'}</span></>)}
        </Fact>
      )}
      <Fact label="Type">{pick('type', <><TypeGlyph type={issue.issueType} /><span className="truncate">{issue.issueType ?? 'Task'}</span></>)}</Fact>
      <Fact label="Parent">
        {issue.parentId ? (
          <div className="group/parent flex min-w-0 items-center gap-1">
            <Link to={`/issue/${issue.parentIdentifier}`} className={cn(valueBtn, 'w-auto')}>
              <ArrowElbowLeftUp size={14} className="text-ink-3" />
              <span className="shrink-0 whitespace-nowrap font-mono text-[11.5px] text-ink-3">{issue.parentIdentifier}</span>
              <span className="truncate">{issue.parentTitle}</span>
            </Link>
            <Tooltip content="Remove parent">
              <button type="button" onClick={() => actions.update(issue, { parentId: null }).catch(() => undefined)} aria-label="Remove parent" className="rounded-xs p-1 text-ink-3 hover:bg-hover hover:text-ink focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/parent:opacity-100">
                <X size={12} />
              </button>
            </Tooltip>
          </div>
        ) : (
          <IssueSearchPicker
            open={parentOpen}
            onOpenChange={setParentOpen}
            excludeIds={[issue.id]}
            placeholder="Make this a sub-issue of…"
            onSelect={p => actions.update(issue, { parentId: p.id }).catch(() => undefined)}
            trigger={
              <button type="button" className={valueBtn}>
                <ArrowElbowLeftUp size={14} className="text-ink-3" />
                <span className={empty}>Set parent</span>
              </button>
            }
          />
        )}
      </Fact>
    </div>
  );
}
