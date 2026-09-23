import {
  Archive, ArrowSquareOut, ArrowUUpLeft, ArrowUpRight, ArrowsLeftRight, Bell, BellSlash, Copy, DotsThree, GitBranch, LinkSimple, PushPin, Trash, X,
} from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { updateIssue } from 'zitejs/api';
import { RichEditor } from '../editor/RichEditor';
import { HealthPill, Mark, SprintGlyph } from '../glyphs';
import type { PickerKind } from '../issues/PropertyPicker';
import { useAppActions } from '../lib/app-actions';
import { copyText } from '../lib/clipboard';
import { branchName, daysBetween, issueUrl, shortDate, timeAgo, todayString } from '../lib/format';
import { useHotkeys } from '../lib/hotkeys';
import { useIssueActions, usePinToggle } from '../lib/mutations';
import { errorMessage } from '../lib/errors';
import { qk } from '../lib/queries';
import { useScope } from '../lib/scope';
import type { IssueDetail as Detail } from '../lib/types';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useWorkspace } from '../lib/workspace';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Chip';
import { cn } from '../ui/cn';
import { Card } from '../ui/Layout';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from '../ui/Menu';
import { ProgressBar } from '../ui/Progress';
import { Tooltip } from '../ui/Tooltip';
import { Discussion, useFollow } from './Discussion';
import { IssueFacts } from './Facts';
import { patchDetail } from './cache';
import { useAutoHeight } from './useAutoHeight';
import { IssueExtras } from './Sections';

function TitleEditor({ detail, size }: { detail: Detail; size: 'sheet' | 'page' }) {
  const actions = useIssueActions();
  const [value, setValue] = useState(detail.issue.title);
  // Esc reverts: the blur that follows must not commit what was just thrown away.
  const reverting = useRef(false);
  useEffect(() => setValue(detail.issue.title), [detail.issue.title]);
  const autoHeight = useAutoHeight(value);
  const commit = () => {
    const t = value.trim();
    if (!t) return setValue(detail.issue.title);
    if (t !== detail.issue.title) actions.update(detail.issue, { title: t }).catch(() => setValue(detail.issue.title));
  };
  return (
    <textarea
      ref={autoHeight}
      value={value}
      rows={1}
      aria-label="Issue title"
      onChange={e => setValue(e.target.value.replace(/\n/g, ' '))}
      onBlur={() => {
        if (reverting.current) {
          reverting.current = false;
          return;
        }
        commit();
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          reverting.current = true;
          setValue(detail.issue.title);
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      className={cn(
        'w-full resize-none overflow-hidden bg-transparent font-display text-ink outline-none placeholder:text-ink-3',
        size === 'page' ? 'text-[36px] leading-[42px] tracking-[-0.01em]' : 'text-[30px] leading-[36px] tracking-[-0.005em]',
      )}
    />
  );
}

function DescriptionEditor({ detail }: { detail: Detail }) {
  const actions = useIssueActions();
  const qc = useQueryClient();
  const timer = useRef<number>();
  const pending = useRef<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const flush = async () => {
    window.clearTimeout(timer.current);
    const md = pending.current;
    if (md === null) return;
    pending.current = null;
    if (md.trim() === detail.description.trim()) return;
    setStatus('saving');
    try {
      await actions.update(detail.issue, { description: md }, { quiet: true });
      patchDetail(qc, detail.issue.id, old => ({ ...old, description: md }));
      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 1500);
    } catch (e) {
      setStatus('idle');
      // Keep what they wrote queued, so the next pause or blur tries again.
      pending.current = pending.current ?? md;
      toast.error(errorMessage(e, 'Couldn’t save the description — your text is still here'));
    }
  };

  // Save after a pause in typing, and always on leaving.
  useEffect(() => () => void flush(), [detail.issue.id]);

  return (
    <div className="relative mt-5">
      <RichEditor
        value={detail.description}
        placeholder="Describe it — what’s happening, why it matters, what done looks like. Markdown works."
        onChange={md => {
          pending.current = md;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(flush, 900);
        }}
        onBlur={() => flush()}
        // Esc leaves the description (saving it), so the next Esc can close the sheet.
        onEscape={() => (document.activeElement as HTMLElement | null)?.blur()}
        minHeight={64}
      />
      <span className={cn('pointer-events-none absolute -top-5 right-0 text-meta text-ink-3 transition-opacity', status === 'idle' && 'opacity-0')}>
        {status === 'saving' ? 'Saving…' : 'Saved'}
      </span>
    </div>
  );
}

/** Where the issue sits: its project and sprint, as small live cards (full page only). */
function ContextCards({ detail }: { detail: Detail }) {
  const ws = useWorkspace();
  const { issue } = detail;
  const project = issue.projectId ? ws.projectById.get(issue.projectId) : undefined;
  const sprint = issue.sprintId ? ws.sprintById.get(issue.sprintId) : undefined;
  const creator = issue.creatorId ? ws.memberById.get(issue.creatorId) : undefined;
  const sprintTotal = sprint?.startDate && sprint.endDate ? Math.max(1, daysBetween(sprint.startDate, sprint.endDate)) : 1;
  const sprintElapsed = sprint?.startDate ? Math.max(0, Math.min(sprintTotal, daysBetween(sprint.startDate, todayString()))) : 0;
  return (
    <>
      {project && (
        <Link to={`/project/${project.id}`} className="group block rounded-lg border border-line bg-card p-3.5 shadow-hairline transition-[box-shadow,border-color] hover:border-line-strong hover:shadow-raised">
          <div className="text-micro font-semibold uppercase text-ink-3">Project</div>
          <div className="mt-2 flex items-center gap-2">
            <Mark icon={project.icon} color={project.color} name={project.name} size={22} />
            <span className="min-w-0 flex-1 truncate text-ui font-semibold">{project.name}</span>
            <ArrowUpRight size={13} className="text-ink-3 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
          </div>
          <div className="mt-2 flex items-center gap-2 text-meta text-ink-2">
            <span>{project.status}</span>
            <span className="text-line-strong">·</span>
            <HealthPill health={project.health} className="text-meta" />
          </div>
          {project.targetDate && <div className="mt-1 text-meta text-ink-3">Target {shortDate(project.targetDate)}</div>}
        </Link>
      )}
      {sprint && (
        <Link to={`/sprint/${sprint.id}`} className="group block rounded-lg border border-line bg-card p-3.5 shadow-hairline transition-[box-shadow,border-color] hover:border-line-strong hover:shadow-raised">
          <div className="text-micro font-semibold uppercase text-ink-3">Sprint</div>
          <div className="mt-2 flex items-center gap-2">
            <SprintGlyph status={sprint.status} progress={sprintElapsed / sprintTotal} size={18} />
            <span className="min-w-0 flex-1 truncate text-ui font-semibold">{sprint.name}</span>
            {sprint.status === 'active' && <Badge tone="highlight">Current</Badge>}
          </div>
          <div className="mt-1.5 text-meta text-ink-2">
            {shortDate(sprint.startDate)} → {shortDate(sprint.endDate)}
          </div>
          {sprint.status === 'active' && <ProgressBar value={sprintElapsed} max={sprintTotal} tone="highlight" height={4} className="mt-2" />}
        </Link>
      )}
      <div className="rounded-lg border border-line bg-card p-3.5 text-meta text-ink-2 shadow-hairline">
        <div className="text-micro font-semibold uppercase text-ink-3">Record</div>
        <div className="mt-2 flex items-center gap-2">
          <Avatar person={creator} size={18} />
          <span>
            Opened by <span className="font-medium text-ink">{creator?.name ?? 'someone'}</span> · {timeAgo(issue.openedAt)}
          </span>
        </div>
        {issue.startedAt && <div className="mt-1.5">Started {shortDate(issue.startedAt)}</div>}
        {issue.completedAt && <div className="mt-1">Done {shortDate(issue.completedAt)}</div>}
        {issue.updatedAt && <div className="mt-1 text-ink-3">Last touched {timeAgo(issue.updatedAt)}</div>}
      </div>
    </>
  );
}

/**
 * One issue. `mode="sheet"` is the side sheet over lists, Inbox and Intake;
 * `mode="page"` is the full page with facts and context in a right column.
 * Every property also has a shortcut: S P A L ⇧P ⇧S ⇧D ⇧E, I to take it.
 */
export function IssueDetailView({ detail, mode = 'page', onClose, onDeleted, hideHeader }: {
  detail: Detail;
  mode?: 'page' | 'sheet';
  onClose?: () => void;
  /** After a confirmed delete. Defaults to closing the sheet, or leaving the full page. */
  onDeleted?: () => void;
  hideHeader?: boolean;
}) {
  const ws = useWorkspace();
  const app = useAppActions();
  const actions = useIssueActions();
  const navigate = useNavigate();
  const scope = useScope();
  const togglePin = usePinToggle();
  const qc = useQueryClient();
  const [openKind, setOpenKind] = useState<PickerKind | null>(null);
  const follow = useFollow(detail);
  const { issue } = detail;
  const team = issue.teamId ? ws.teamById.get(issue.teamId) : undefined;
  const pinned = ws.isPinned('Issue', issue.id);
  const sheet = mode === 'sheet';
  // On the full page the facts live in the right column when wide, under the title when not.
  const wide = useMediaQuery('(min-width: 1024px)');

  useHotkeys(
    {
      s: () => setOpenKind('status'),
      p: () => setOpenKind('priority'),
      a: () => setOpenKind('assignee'),
      l: () => setOpenKind('labels'),
      'shift+p': () => setOpenKind('project'),
      'shift+s': () => setOpenKind('sprint'),
      'shift+d': () => setOpenKind('due'),
      'shift+e': () => setOpenKind('estimate'),
      'shift+t': () => setOpenKind('type'),
      i: () => actions.update(issue, { assigneeId: ws.me.id }).catch(() => undefined),
      'mod+.': () => copyText(issue.identifier, `Copied ${issue.identifier}`),
      'mod+shift+.': () => copyText(branchName(issue.identifier, issue.title, ws.memberById.get(issue.assigneeId ?? '')?.name), 'Copied branch name'),
      'mod+shift+,': () => copyText(issueUrl(issue.identifier), 'Copied link'),
      'mod+backspace': () => actions.archive([issue]),
      ...(sheet ? { 'mod+enter': () => navigate(`/issue/${issue.identifier}`) } : {}),
    },
    { allowInOverlay: sheet },
  );

  const otherTeams = ws.teams.filter(t => t.id !== issue.teamId);

  const moveToTeam = async (teamId: string) => {
    const to = ws.teamById.get(teamId);
    if (!to) return;
    const dropsLabels = issue.labelIds.some(id => {
      const l = ws.labelById.get(id);
      return l?.teamId && l.teamId !== teamId;
    });
    const ok = await app.confirm({
      title: `Move ${issue.identifier} to ${to.name}?`,
      description: [
        `It gets the next ${to.key} number, and links to ${issue.identifier} stop working. `,
        `Its status moves to the matching step in ${to.name}’s workflow`,
        issue.sprintId ? `, it leaves ${ws.sprintById.get(issue.sprintId)?.name ?? 'its sprint'}` : '',
        dropsLabels ? `, and ${team?.name ?? 'team'}-only labels come off` : '',
        '.',
      ].join(''),
      confirmLabel: `Move to ${to.name}`,
    });
    if (!ok) return;
    try {
      const res = await updateIssue({ id: issue.id, teamId });
      const next = res.issue.identifier;
      qc.removeQueries({ queryKey: qk.issueRoot, predicate: q => (q.state.data as Detail | undefined)?.issue?.id === issue.id });
      qc.invalidateQueries({ queryKey: qk.issuesRoot });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: qk.bootstrap });
      toast.success(`${issue.identifier} is now ${next}`, { description: `Moved to ${to.name}` });
      if (!sheet) navigate(`/issue/${next}`, { replace: true });
      else if (onClose) app.openPeek(next);
    } catch (e) {
      toast.error(errorMessage(e, `Couldn’t move ${issue.identifier}`));
    }
  };

  const menu = (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="sm" icon aria-label="Issue actions">
          <DotsThree size={16} weight="bold" />
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="w-60">
        <MenuItem icon={<Copy size={15} />} shortcut="mod+." onSelect={() => copyText(issue.identifier, `Copied ${issue.identifier}`)}>Copy ID</MenuItem>
        <MenuItem icon={<LinkSimple size={15} />} shortcut="mod+shift+," onSelect={() => copyText(issueUrl(issue.identifier), 'Copied link')}>Copy link</MenuItem>
        <MenuItem icon={<GitBranch size={15} />} shortcut="mod+shift+." onSelect={() => copyText(branchName(issue.identifier, issue.title, ws.memberById.get(issue.assigneeId ?? '')?.name), 'Copied branch name')}>Copy branch name</MenuItem>
        <MenuSeparator />
        <MenuItem icon={follow.following ? <BellSlash size={15} /> : <Bell size={15} />} onSelect={follow.toggle}>
          {follow.following ? 'Unfollow' : 'Follow'}
        </MenuItem>
        <MenuItem icon={<PushPin size={15} weight={pinned ? 'fill' : 'regular'} />} onSelect={() => togglePin('Issue', issue.id, !pinned)}>
          {pinned ? 'Unpin' : 'Pin'}
        </MenuItem>
        {otherTeams.length > 0 && (
          <MenuSub>
            <MenuSubTrigger icon={<ArrowsLeftRight size={15} />}>Move to team</MenuSubTrigger>
            <MenuSubContent className="w-56">
              {otherTeams.map(t => (
                <MenuItem key={t.id} icon={<Mark icon={t.icon} color={t.color} name={t.name} size={16} />} hint={t.key} onSelect={() => moveToTeam(t.id)}>
                  {t.name}
                </MenuItem>
              ))}
            </MenuSubContent>
          </MenuSub>
        )}
        <MenuSeparator />
        {issue.archived ? (
          <MenuItem icon={<ArrowUUpLeft size={15} />} onSelect={() => actions.archive([issue], false)}>Restore</MenuItem>
        ) : (
          <MenuItem icon={<Archive size={15} />} shortcut="mod+backspace" onSelect={() => actions.archive([issue])}>Archive</MenuItem>
        )}
        <MenuItem
          icon={<Trash size={15} />}
          destructive
          onSelect={async () => {
            const ok = await app.confirm({
              title: `Delete ${issue.identifier}?`,
              description: 'This permanently removes the issue with its comments, history and links. Archive it instead if you might want it back.',
              confirmLabel: 'Delete permanently',
              destructive: true,
            });
            if (ok && (await actions.remove([issue]))) {
              if (onDeleted) onDeleted();
              else if (sheet) onClose?.();
              else navigate(scope.to('issues'));
              // Drop the cached copies once nothing is showing them, so no surface can open a deleted issue.
              window.setTimeout(() => qc.removeQueries({ queryKey: qk.issueRoot, predicate: q => (q.state.data as Detail | undefined)?.issue?.id === issue.id }), 0);
            }
          }}
        >
          Delete…
        </MenuItem>
      </MenuContent>
    </Menu>
  );

  const header = (
    <div className={cn('flex h-12 shrink-0 items-center gap-1.5 border-b border-line px-3 sm:px-4', sheet ? 'bg-card' : 'bg-paper')}>
      {team && (
        <Link to={`/${team.key.toLowerCase()}/issues`} className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-ui text-ink-2 hover:bg-hover hover:text-ink">
          <Mark icon={team.icon} color={team.color} name={team.name} size={18} />
          <span className="hidden sm:inline">{team.name}</span>
        </Link>
      )}
      <span className="text-line-strong">/</span>
      {issue.parentIdentifier && (
        <>
          <Tooltip content={issue.parentTitle}>
            <button type="button" onClick={() => app.openPeek(issue.parentIdentifier!)} className="rounded-sm px-1 py-0.5 font-mono text-[12px] text-ink-2 hover:bg-hover hover:text-ink">
              {issue.parentIdentifier}
            </button>
          </Tooltip>
          <span className="text-line-strong">/</span>
        </>
      )}
      <Tooltip content="Copy ID" shortcut="mod+.">
        <button type="button" onClick={() => copyText(issue.identifier, `Copied ${issue.identifier}`)} className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono text-[12px] font-medium text-ink ring-1 ring-inset ring-line hover:bg-hover">
          {issue.identifier}
        </button>
      </Tooltip>
      {issue.archived && <Badge className="ml-1">Archived</Badge>}
      <div className="ml-auto flex items-center gap-0.5">
        <Tooltip content={pinned ? 'Unpin' : 'Pin'}>
          <Button variant="ghost" size="sm" icon onClick={() => togglePin('Issue', issue.id, !pinned)} aria-label={pinned ? 'Unpin' : 'Pin'}>
            <PushPin size={15} weight={pinned ? 'fill' : 'regular'} className={cn(pinned && 'text-ink')} />
          </Button>
        </Tooltip>
        <Tooltip content="Copy link" shortcut="mod+shift+,">
          <Button variant="ghost" size="sm" icon onClick={() => copyText(issueUrl(issue.identifier), 'Copied link')} aria-label="Copy link">
            <LinkSimple size={15} />
          </Button>
        </Tooltip>
        {menu}
        {sheet && (
          <>
            <span className="mx-1 h-5 w-px bg-line" />
            <Tooltip content="Open full page" shortcut="mod+enter">
              <Button variant="ghost" size="sm" icon onClick={() => navigate(`/issue/${issue.identifier}`)} aria-label="Open full page">
                <ArrowSquareOut size={15} />
              </Button>
            </Tooltip>
            {onClose && (
              <Tooltip content="Close" shortcut="esc">
                <Button variant="ghost" size="sm" icon onClick={onClose} aria-label="Close">
                  <X size={16} />
                </Button>
              </Tooltip>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (sheet) {
    return (
      <div className="flex h-full flex-col">
        {!hideHeader && header}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-5 pb-12 pt-5 sm:px-8">
            <TitleEditor detail={detail} size="sheet" />
            <div className="mt-4 rounded-lg bg-sunken/70 px-3 py-1.5 ring-1 ring-inset ring-line">
              <IssueFacts issue={issue} openKind={openKind} onOpenKind={setOpenKind} />
            </div>
            <DescriptionEditor detail={detail} />
            <IssueExtras detail={detail} />
            <Discussion detail={detail} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      {header}
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-4 pb-24 pt-8 sm:px-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {/* The visible title is an editable field; give the page a real heading for assistive tech. */}
          <h1 className="sr-only">{issue.identifier} {issue.title}</h1>
          <TitleEditor detail={detail} size="page" />
          {!wide && (
            <div className="mt-4 rounded-lg bg-sunken/70 px-3 py-1.5 ring-1 ring-inset ring-line">
              <IssueFacts issue={issue} openKind={openKind} onOpenKind={setOpenKind} />
            </div>
          )}
          <DescriptionEditor detail={detail} />
          <IssueExtras detail={detail} />
          <Discussion detail={detail} />
        </div>
        {wide && (
          <aside className="flex flex-col gap-3">
            <Card className="p-3">
              <div className="px-1.5 pb-1 pt-0.5 text-micro font-semibold uppercase text-ink-3">Facts</div>
              <IssueFacts issue={issue} openKind={openKind} onOpenKind={setOpenKind} columns={1} />
            </Card>
            <ContextCards detail={detail} />
          </aside>
        )}
      </div>
    </div>
  );
}
