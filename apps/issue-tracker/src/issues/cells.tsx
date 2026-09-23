import { ChatCircle, Diamond, Paperclip, Prohibit } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Mark, PriorityGlyph, SprintGlyph, StatusGlyph, TypeGlyph } from '../glyphs';
import { estimateLabel, isDoneType, PRIORITY_LABEL, type Grouping } from '../lib/constants';
import { dueLabel } from '../lib/format';
import type { Issue } from '../lib/types';
import type { IssueGroup } from '../lib/view';
import { useWorkspace } from '../lib/workspace';
import { Avatar, Unassigned } from '../ui/Avatar';
import { LabelChip, Swatch } from '../ui/Chip';
import { cn } from '../ui/cn';
import { ProgressRing } from '../ui/Progress';
import { Tooltip } from '../ui/Tooltip';

/** An empty ledger field: a quiet dash that keeps the column's rhythm. */
export const Blank = () => <span className="text-line-strong">–</span>;

export function DueText({ day, done, className }: { day: string | null; done?: boolean; className?: string }) {
  const due = dueLabel(day);
  if (!due) return <Blank />;
  return <span className={cn('tabular truncate', !done && due.tone === 'overdue' && 'font-medium text-danger', !done && due.tone === 'soon' && 'text-warning', done && 'text-ink-3', className)}>{due.label}</span>;
}

export function SubIssueProgress({ done, total }: { done: number; total: number }) {
  if (!total) return null;
  return (
    <Tooltip content={`${done} of ${total} sub-issues done`}>
      <span className="tabular inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-sunken px-1.5 text-micro font-semibold text-ink-2">
        <ProgressRing value={done / total} size={11} stroke={2} barClassName="text-success" />
        {done}/{total}
      </span>
    </Tooltip>
  );
}

export function BlockedBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <Tooltip content={`Blocked by ${count} open issue${count === 1 ? '' : 's'}`}>
      <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-danger/10 px-1.5 text-micro font-semibold uppercase tracking-wide text-danger">
        <Prohibit size={10} weight="bold" /> Blocked
      </span>
    </Tooltip>
  );
}

export function CommentCount({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="tabular inline-flex shrink-0 items-center gap-1 text-meta text-ink-3">
      <ChatCircle size={13} /> {count}
    </span>
  );
}

/** The glyph for a group band or board lane, by grouping. */
export function GroupGlyph({ group, grouping }: { group: IssueGroup; grouping: Grouping }) {
  const ws = useWorkspace();
  switch (grouping) {
    case 'status':
      return <StatusGlyph status={group.status} siblings={group.status?.teamId ? ws.statusesByTeam.get(group.status.teamId) : undefined} />;
    case 'assignee': {
      const m = group.memberId ? ws.memberById.get(group.memberId) : undefined;
      return m ? <Avatar person={m} size={18} /> : <Unassigned size={18} />;
    }
    case 'priority':
      return <PriorityGlyph priority={group.priority ?? 0} />;
    case 'project': {
      const p = group.projectId ? ws.projectById.get(group.projectId) : undefined;
      return p ? <Mark icon={p.icon} color={p.color} name={p.name} size={18} /> : <Prohibit size={14} className="text-ink-3" />;
    }
    case 'sprint': {
      const s = group.sprintId ? ws.sprintById.get(group.sprintId) : undefined;
      return s ? <SprintGlyph status={s.status} progress={0.5} /> : <Prohibit size={14} className="text-ink-3" />;
    }
    case 'label': {
      const l = group.labelId ? ws.labelById.get(group.labelId) : undefined;
      return l ? <Swatch color={l.color} size={11} /> : <Prohibit size={14} className="text-ink-3" />;
    }
    case 'team': {
      const t = group.teamId ? ws.teamById.get(group.teamId) : undefined;
      return t ? <Mark icon={t.icon} color={t.color} name={t.name} size={18} /> : null;
    }
    case 'type':
      return <TypeGlyph type={group.issueType} />;
    default:
      return null;
  }
}

/** Readable content for a property cell (the button around it is the caller's). */
export function PropertyValue({ issue, kind }: { issue: Issue; kind: string }): ReactNode {
  const ws = useWorkspace();
  switch (kind) {
    case 'status': {
      const s = ws.statusOf(issue);
      return (
        <>
          <StatusGlyph status={s} siblings={issue.teamId ? ws.statusesByTeam.get(issue.teamId) : undefined} />
          <span className="truncate">{s?.name ?? 'No status'}</span>
        </>
      );
    }
    case 'priority':
      return issue.priority ? (
        <>
          <PriorityGlyph priority={issue.priority} />
          <span className="truncate">{PRIORITY_LABEL[issue.priority]}</span>
        </>
      ) : (
        <>
          <PriorityGlyph priority={0} />
          <Blank />
        </>
      );
    case 'assignee': {
      const m = issue.assigneeId ? ws.memberById.get(issue.assigneeId) : undefined;
      return m ? (
        <>
          <Avatar person={m} size={20} />
          <span className="truncate">{m.id === ws.me.id ? 'You' : m.name.split(' ')[0]}</span>
        </>
      ) : (
        <>
          <Unassigned size={20} />
          <Blank />
        </>
      );
    }
    case 'labels': {
      const labels = issue.labelIds.map(id => ws.labelById.get(id)).filter(Boolean);
      if (!labels.length) return <Blank />;
      return (
        <span className="flex min-w-0 items-center gap-1 overflow-hidden" title={labels.map(l => l!.name).join(', ')}>
          {labels.slice(0, 2).map(l => (
            <LabelChip key={l!.id} name={l!.name} color={l!.color} className="min-w-0 max-w-[92px] shrink" />
          ))}
          {labels.length > 2 && <span className="shrink-0 text-meta text-ink-3">+{labels.length - 2}</span>}
        </span>
      );
    }
    case 'project': {
      const p = issue.projectId ? ws.projectById.get(issue.projectId) : undefined;
      return p ? (
        <>
          <Mark icon={p.icon} color={p.color} name={p.name} size={16} />
          <span className="truncate">{p.name}</span>
        </>
      ) : (
        <Blank />
      );
    }
    case 'milestone': {
      const m = issue.milestoneId ? ws.milestoneById.get(issue.milestoneId) : undefined;
      return m ? (
        <>
          <Diamond size={13} className="shrink-0 text-ink-3" />
          <span className="truncate">{m.name}</span>
        </>
      ) : (
        <Blank />
      );
    }
    case 'sprint': {
      const s = issue.sprintId ? ws.sprintById.get(issue.sprintId) : undefined;
      if (!s) return <Blank />;
      return (
        <>
          <SprintGlyph status={s.status} progress={0.5} />
          <span className={cn('truncate', s.status === 'active' && 'rounded-xs bg-highlight/45 px-1 font-medium text-highlight-ink dark:bg-highlight/20 dark:text-ink')}>{s.name.replace(/^Sprint /, 'S')}</span>
        </>
      );
    }
    case 'type':
      return (
        <>
          <TypeGlyph type={issue.issueType} />
          <span className="truncate">{issue.issueType ?? 'Task'}</span>
        </>
      );
    case 'estimate': {
      const team = issue.teamId ? ws.teamById.get(issue.teamId) : undefined;
      const label = estimateLabel(issue.estimate, team?.estimateScale, true);
      return label ? <span className="tabular font-medium">{label}</span> : <Blank />;
    }
    case 'dueDate':
      return <DueText day={issue.dueDate} done={isDoneType(ws.statusOf(issue)?.type)} />;
    case 'links':
      return issue.attachmentCount ? (
        <span className="tabular inline-flex items-center gap-1 text-ink-2">
          <Paperclip size={13} /> {issue.attachmentCount}
        </span>
      ) : (
        <Blank />
      );
    default:
      return null;
  }
}
