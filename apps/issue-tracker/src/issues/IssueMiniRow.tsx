import { memo, type ReactNode } from 'react';
import { PriorityGlyph, StatusGlyph } from '../glyphs';
import { useAppActions } from '../lib/app-actions';
import { isDoneType } from '../lib/constants';
import type { Issue } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import { Avatar } from '../ui/Avatar';
import { cn } from '../ui/cn';
import { BlockedBadge, DueText, SubIssueProgress } from './cells';
import { IssueContextMenu } from './IssueContextMenu';

/**
 * A compact issue line for summaries (Home, a person, a goal): status, key,
 * title and the one or two facts that matter. Clicking opens the sheet.
 */
export const IssueMiniRow = memo(function IssueMiniRow({ issue, showAssignee, trailing, className }: { issue: Issue; showAssignee?: boolean; trailing?: ReactNode; className?: string }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const status = ws.statusOf(issue);
  const done = isDoneType(status?.type);
  const assignee = issue.assigneeId ? ws.memberById.get(issue.assigneeId) : undefined;
  const open = app.peekId === issue.identifier;
  return (
    <IssueContextMenu getIssues={() => [issue]}>
      <button
        type="button"
        onClick={() => app.openPeek(issue.identifier)}
        className={cn(
          // Phones get two lines — the title, then its facts — instead of a title truncated to three words.
          'group flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5 text-left last:border-b-0 transition-colors sm:flex-nowrap sm:py-2',
          open ? 'bg-highlight/35 dark:bg-highlight/[0.12]' : 'hover:bg-paper/80 dark:hover:bg-hover/50',
          className,
        )}
      >
        <StatusGlyph status={status} siblings={issue.teamId ? ws.statusesByTeam.get(issue.teamId) : undefined} />
        <span className="hidden w-[62px] shrink-0 font-mono text-[11px] text-ink-3 sm:inline">{issue.identifier}</span>
        <span className={cn('min-w-0 flex-1 text-ui font-medium line-clamp-2 sm:truncate', done ? 'text-ink-3' : 'text-ink')}>{issue.title}</span>
        <span className="flex shrink-0 basis-full items-center gap-2.5 pl-[26px] text-meta empty:hidden sm:basis-auto sm:pl-0">
          {!done && <BlockedBadge count={issue.blockedBy} />}
          <SubIssueProgress done={issue.subIssueDone} total={issue.subIssueTotal} />
          {issue.dueDate && <DueText day={issue.dueDate} done={done} />}
          {issue.priority > 0 && <PriorityGlyph priority={issue.priority} size={13} />}
          {showAssignee && assignee && <Avatar person={assignee} size={20} />}
          {trailing}
        </span>
      </button>
    </IssueContextMenu>
  );
});
