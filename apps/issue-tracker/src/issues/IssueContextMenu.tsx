import {
  Archive, ArrowSquareOut, ArrowUUpLeft, CalendarBlank, Copy, GitBranch, Hash, LinkSimple, PushPin, Shapes, SidebarSimple, Tag, Trash, User,
} from '@phosphor-icons/react';
import { addDays, endOfWeek, nextMonday } from 'date-fns';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mark, PriorityGlyph, SprintGlyph, StatusGlyph } from '../glyphs';
import { useAppActions } from '../lib/app-actions';
import { copyText } from '../lib/clipboard';
import { ESTIMATE_SCALES, PRIORITIES } from '../lib/constants';
import { branchName, issueUrl, toDayString } from '../lib/format';
import { useIssueActions, usePinToggle } from '../lib/mutations';
import type { Issue } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import { Avatar, Unassigned } from '../ui/Avatar';
import { Swatch } from '../ui/Chip';
import {
  ContextMenu, ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuSub,
  ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger,
} from '../ui/Menu';

/**
 * Right-click on any issue. When the row is part of a selection, every action
 * applies to the whole selection. The body is only built while open, so a list
 * of hundreds of rows doesn't construct hundreds of menus.
 */
export function IssueContextMenu({ getIssues, children, disabled }: { getIssues: () => Issue[]; children: ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  if (disabled) return <>{children}</>;
  return (
    <ContextMenu onOpenChange={setOpen}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">{open && <MenuBody issues={getIssues()} />}</ContextMenuContent>
    </ContextMenu>
  );
}

function MenuBody({ issues }: { issues: Issue[] }) {
  const ws = useWorkspace();
  const actions = useIssueActions();
  const app = useAppActions();
  const navigate = useNavigate();
  const togglePin = usePinToggle();
  if (issues.length === 0) return null;

  const single = issues.length === 1 ? issues[0] : null;
  const teamIds = [...new Set(issues.map(i => i.teamId))];
  const teamId = teamIds.length === 1 ? teamIds[0] : null;
  const statuses = teamId ? ws.statusesByTeam.get(teamId) ?? [] : [];
  const scale = (teamId && ws.teamById.get(teamId)?.estimateScale) || 'fibonacci';
  const apply = (patch: Parameters<typeof actions.update>[1]) =>
    single ? actions.update(single, patch).catch(() => undefined) : actions.bulkUpdate(issues, patch, { toastMessage: `Updated ${issues.length} issues` });
  const all = (pred: (i: Issue) => boolean) => issues.every(pred);
  const sprints = teamId ? (ws.sprintsByTeam.get(teamId) ?? []).filter(c => c.status !== 'completed') : [];
  const projects = ws.projects.filter(p => !['Completed', 'Canceled'].includes(p.status));
  const members = ws.membersFor(teamId);
  const today = new Date();

  return (
    <>
      {issues.length > 1 && <ContextMenuLabel>{issues.length} issues selected</ContextMenuLabel>}

      {statuses.length > 0 && (
        <ContextMenuSub>
          <ContextMenuSubTrigger icon={<StatusGlyph status={single ? ws.statusOf(single) : statuses[0]} siblings={statuses} />}>Status</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {statuses.map((s, i) => (
              <ContextMenuItem key={s.id} icon={<StatusGlyph status={s} siblings={statuses} />} shortcut={String(i + 1)} onSelect={() => apply({ statusId: s.id })}>
                {s.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      <ContextMenuSub>
        <ContextMenuSubTrigger icon={<PriorityGlyph priority={single?.priority ?? 2} />}>Priority</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {PRIORITIES.map(p => (
            <ContextMenuItem key={p.value} icon={<PriorityGlyph priority={p.value} />} shortcut={p.shortcut} onSelect={() => apply({ priority: p.value })}>
              {p.label}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger icon={<User size={15} />}>Assignee</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem icon={<Avatar person={ws.memberById.get(ws.me.id)} size={16} />} shortcut="I" onSelect={() => apply({ assigneeId: ws.me.id })}>
            Assign to me
          </ContextMenuItem>
          <ContextMenuItem icon={<Unassigned size={16} />} onSelect={() => apply({ assigneeId: null })}>
            Unassign
          </ContextMenuItem>
          <ContextMenuSeparator />
          {members.filter(m => m.id !== ws.me.id).map(m => (
            <ContextMenuItem key={m.id} icon={<Avatar person={m} size={16} />} onSelect={() => apply({ assigneeId: m.id })}>
              {m.name}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger icon={<Tag size={15} />}>Labels</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {ws.labelsFor(teamId).map(l => {
            const on = all(i => i.labelIds.includes(l.id));
            return (
              <ContextMenuCheckboxItem
                key={l.id}
                checked={on}
                icon={<Swatch color={l.color} />}
                onCheckedChange={() => {
                  if (single) actions.setLabels(single, on ? single.labelIds.filter(x => x !== l.id) : [...single.labelIds, l.id]);
                  else actions.bulkUpdate(issues, (on ? { removeLabelIds: [l.id] } : { addLabelIds: [l.id] }) as never);
                }}
              >
                {l.name}
              </ContextMenuCheckboxItem>
            );
          })}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger icon={<Shapes size={15} />}>Project</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem onSelect={() => apply({ projectId: null })}>No project</ContextMenuItem>
          <ContextMenuSeparator />
          {projects.map(p => (
            <ContextMenuItem key={p.id} icon={<Mark icon={p.icon} color={p.color} name={p.name} size={16} />} onSelect={() => apply({ projectId: p.id })}>
              {p.name}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

      {sprints.length > 0 && (
        <ContextMenuSub>
          <ContextMenuSubTrigger icon={<SprintGlyph status="active" progress={0.5} />}>Sprint</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onSelect={() => apply({ sprintId: null })}>No sprint</ContextMenuItem>
            <ContextMenuSeparator />
            {sprints.map(c => (
              <ContextMenuItem key={c.id} icon={<SprintGlyph status={c.status} progress={0.5} />} hint={c.status === 'active' ? 'Current' : undefined} onSelect={() => apply({ sprintId: c.id })}>
                {c.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      {scale !== 'none' && (
        <ContextMenuSub>
          <ContextMenuSubTrigger icon={<Hash size={15} />}>Estimate</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onSelect={() => apply({ estimate: null })}>No estimate</ContextMenuItem>
            {(ESTIMATE_SCALES[scale] ?? []).map(e => (
              <ContextMenuItem key={e.value} onSelect={() => apply({ estimate: e.value })}>
                {e.label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      <ContextMenuSub>
        <ContextMenuSubTrigger icon={<CalendarBlank size={15} />}>Due date</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {([
            ['Today', today],
            ['Tomorrow', addDays(today, 1)],
            ['End of week', endOfWeek(today, { weekStartsOn: 1 })],
            ['Next Monday', nextMonday(today)],
            ['In two weeks', addDays(today, 14)],
          ] as Array<[string, Date]>).map(([label, d]) => (
            <ContextMenuItem key={label} onSelect={() => apply({ dueDate: toDayString(d) })}>
              {label}
            </ContextMenuItem>
          ))}
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => apply({ dueDate: null })}>Clear due date</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />

      {single && (
        <>
          <ContextMenuItem icon={<SidebarSimple size={15} className="-scale-x-100" />} shortcut="space" onSelect={() => app.openPeek(single.identifier)}>
            Open in sheet
          </ContextMenuItem>
          <ContextMenuItem icon={<ArrowSquareOut size={15} />} shortcut="mod+enter" onSelect={() => navigate(`/issue/${single.identifier}`)}>
            Open full page
          </ContextMenuItem>
          <ContextMenuItem icon={<Copy size={15} />} shortcut="mod+." onSelect={() => copyText(single.identifier, `Copied ${single.identifier}`)}>
            Copy ID
          </ContextMenuItem>
          <ContextMenuItem icon={<LinkSimple size={15} />} onSelect={() => copyText(issueUrl(single.identifier), 'Copied link')}>
            Copy link
          </ContextMenuItem>
          <ContextMenuItem icon={<GitBranch size={15} />} onSelect={() => copyText(branchName(single.identifier, single.title, ws.memberById.get(single.assigneeId ?? '')?.name), 'Copied branch name')}>
            Copy branch name
          </ContextMenuItem>
          <ContextMenuItem icon={<PushPin size={15} weight={ws.isPinned('Issue', single.id) ? 'fill' : 'regular'} />} onSelect={() => togglePin('Issue', single.id, !ws.isPinned('Issue', single.id))}>
            {ws.isPinned('Issue', single.id) ? 'Unpin' : 'Pin'}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      {issues.length > 1 && (
        <>
          <ContextMenuItem icon={<Copy size={15} />} onSelect={() => copyText(issues.map(i => i.identifier).join(', '), `Copied ${issues.length} IDs`)}>
            Copy IDs
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}

      {all(i => i.archived) ? (
        <ContextMenuItem icon={<ArrowUUpLeft size={15} />} onSelect={() => actions.archive(issues, false)}>
          Restore
        </ContextMenuItem>
      ) : (
        <ContextMenuItem icon={<Archive size={15} />} shortcut="mod+backspace" onSelect={() => actions.archive(issues)}>
          Archive
        </ContextMenuItem>
      )}
      <ContextMenuItem
        icon={<Trash size={15} />}
        destructive
        onSelect={async () => {
          const ok = await app.confirm({
            title: issues.length === 1 ? `Delete ${issues[0].identifier}?` : `Delete ${issues.length} issues?`,
            description: 'This permanently removes them with their comments, history and links. Sub-issues are kept and lose their parent. Archive instead if you might want them back.',
            confirmLabel: 'Delete permanently',
            destructive: true,
          });
          if (ok) actions.remove(issues);
        }}
      >
        Delete…
      </ContextMenuItem>
    </>
  );
}
