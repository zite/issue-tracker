import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowsLeftRight, Bug, CaretDown, CircleNotch, DotsSixVertical, FigmaLogo, FileText, GithubLogo, LinkSimple, Plus, Sparkle, Trash, TreeStructure, VideoCamera, X,
} from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { aiBreakdownIssue, moveIssue, saveAttachment, setIssueRelation, type AiBreakdownIssueOutputType } from 'zitejs/api';
import { PriorityGlyph, StatusGlyph } from '../glyphs';
import { IssueContextMenu } from '../issues/IssueContextMenu';
import { IssuePropertyPicker } from '../issues/PropertyPicker';
import { useAppActions } from '../lib/app-actions';
import { isDoneType, PRIORITY_LABEL } from '../lib/constants';
import { errorMessage } from '../lib/errors';
import { timeAgo } from '../lib/format';
import { useIssueActions } from '../lib/mutations';
import { qk } from '../lib/queries';
import type { Issue, IssueDetail } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import { IssueSearchPicker } from '../pickers/pickers';
import { Avatar, Unassigned } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { Checkbox } from '../ui/Form';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '../ui/Menu';
import { ProgressBar } from '../ui/Progress';
import { Tooltip } from '../ui/Tooltip';
import { patchDetail, refreshDetail, snapshotDetail } from './cache';

/** Row actions that appear on hover — but only where hovering exists; on touch they are simply there. */
const reveal = (group: 'sub' | 'rel' | 'link') =>
  cn(
    'focus-visible:opacity-100 [@media(hover:hover)]:opacity-0',
    group === 'sub' && '[@media(hover:hover)]:group-hover/sub:opacity-100',
    group === 'rel' && '[@media(hover:hover)]:group-hover/rel:opacity-100',
    group === 'link' && '[@media(hover:hover)]:group-hover/link:opacity-100',
  );

export function DetailSection({ title, count, children, actions, collapsible = true }: { title: string; count?: ReactNode; children: ReactNode; actions?: ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="mt-8">
      <div className="mb-2 flex h-7 items-center gap-2">
        <button
          type="button"
          disabled={!collapsible}
          aria-expanded={collapsible ? open : undefined}
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 rounded-sm text-title font-semibold text-ink enabled:hover:text-ink-2"
        >
          {title}
          {count != null && <span className="tabular text-ui font-normal text-ink-3">{count}</span>}
          {collapsible && <CaretDown size={11} className={cn('text-ink-3 transition-transform', !open && '-rotate-90')} />}
        </button>
        <div className="ml-auto flex items-center gap-0.5">{actions}</div>
      </div>
      {open && children}
    </section>
  );
}

// ---- Breakdown (sub-issues) -------------------------------------------------

function SubIssueRow({ issue, sortable }: { issue: Issue; sortable: boolean }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const [kind, setKind] = useState<'status' | 'assignee' | 'priority' | null>(null);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id, disabled: !sortable });
  const status = ws.statusOf(issue);
  const assignee = issue.assigneeId ? ws.memberById.get(issue.assigneeId) : undefined;
  const done = isDoneType(status?.type);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <IssueContextMenu getIssues={() => [issue]}>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        onClick={() => app.openPeek(issue.identifier)}
        className={cn(
          'group/sub relative flex h-10 cursor-default items-center gap-2.5 border-b border-line bg-card pl-6 pr-3 last:border-b-0 hover:bg-paper/70 dark:hover:bg-hover/40',
          isDragging && 'z-10 bg-card shadow-raised ring-1 ring-line-strong',
        )}
      >
        {sortable && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            onClick={stop}
            aria-label={`Reorder ${issue.identifier}`}
            className={cn('absolute left-1 top-1/2 flex h-6 w-4 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-xs text-ink-3 hover:bg-hover hover:text-ink active:cursor-grabbing', reveal('sub'), isDragging && 'opacity-100')}
          >
            <DotsSixVertical size={13} weight="bold" />
          </button>
        )}
        <IssuePropertyPicker issues={[issue]} kind="status" open={kind === 'status'} onOpenChange={o => setKind(o ? 'status' : null)} trigger={<button type="button" onClick={stop} aria-label={`Status: ${status?.name ?? 'none'}`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs hover:bg-hover"><StatusGlyph status={status} siblings={ws.statusesByTeam.get(issue.teamId ?? '')} /></button>} />
        <span className="w-[58px] shrink-0 truncate font-mono text-[11px] text-ink-3">{issue.identifier}</span>
        <span title={issue.title} className={cn('min-w-0 flex-1 truncate text-ui', done ? 'text-ink-3 line-through decoration-line-strong' : 'text-ink')}>{issue.title}</span>
        <IssuePropertyPicker issues={[issue]} kind="priority" align="end" open={kind === 'priority'} onOpenChange={o => setKind(o ? 'priority' : null)} trigger={<button type="button" onClick={stop} aria-label={`Priority: ${PRIORITY_LABEL[issue.priority]}`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs hover:bg-hover"><PriorityGlyph priority={issue.priority} /></button>} />
        <IssuePropertyPicker issues={[issue]} kind="assignee" align="end" open={kind === 'assignee'} onOpenChange={o => setKind(o ? 'assignee' : null)} trigger={<button type="button" onClick={stop} aria-label={assignee ? `Assignee: ${assignee.name}` : 'Assign'} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-hover">{assignee ? <Avatar person={assignee} size={20} /> : <Unassigned size={20} />}</button>} />
      </div>
    </IssueContextMenu>
  );
}

function useBreakdown(detail: IssueDetail) {
  const actions = useIssueActions();
  const qc = useQueryClient();
  const ws = useWorkspace();
  const { issue, subIssues } = detail;
  const [suggestions, setSuggestions] = useState<AiBreakdownIssueOutputType['suggestions'] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [thinking, setThinking] = useState(false);

  // Open work in the order people put it; finished work sinks to the bottom.
  const ordered = useMemo(() => {
    const done = (i: Issue) => isDoneType(ws.statusOf(i)?.type);
    const open = subIssues.filter(i => !done(i)).sort((a, b) => a.position - b.position || a.number - b.number);
    return { open, closed: subIssues.filter(done) };
  }, [subIssues, ws]);

  /** New sub-issues join the end of the list, so a breakdown typed in order stays in order. */
  const create = async (t: string, extra: { description?: string; estimate?: number | null } = {}, after?: Issue | null) => {
    const created = await actions.create({
      teamId: issue.teamId!, title: t, parentId: issue.id, projectId: issue.projectId, sprintId: issue.sprintId,
      milestoneId: issue.milestoneId, priority: issue.priority, description: extra.description ?? null, estimate: extra.estimate ?? null,
    });
    const last = after === undefined ? ordered.open[ordered.open.length - 1] : after;
    if (last) await moveIssue({ id: created.id, prevId: last.id, nextId: null }).catch(() => undefined);
    await refreshDetail(qc, issue.id);
    return created;
  };

  const suggest = async () => {
    setThinking(true);
    try {
      const res = await aiBreakdownIssue({ issueId: issue.id });
      if (!res.available) toast.info('AI isn’t connected, so there’s no breakdown to suggest. Add sub-issues by hand.');
      else if (!res.suggestions.length) toast.info('Nothing to break down here — it reads like one piece of work');
      setSuggestions(res.suggestions.length ? res.suggestions : null);
      setPicked(new Set(res.suggestions.map((_, i) => i)));
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t suggest a breakdown'));
    } finally {
      setThinking(false);
    }
  };

  return { ordered, create, suggest, thinking, suggestions, setSuggestions, picked, setPicked };
}

export function BreakdownSection({ detail, adding, onAdding, breakdown }: { detail: IssueDetail; adding: boolean; onAdding: (on: boolean) => void; breakdown: ReturnType<typeof useBreakdown> }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const { subIssues, issue } = detail;
  const { ordered, create, suggest, thinking, suggestions, setSuggestions, picked, setPicked } = breakdown;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (subIssues.length === 0 && !adding && !suggestions) return null;
  const done = ordered.closed.length;

  const submit = async () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await create(t);
      setTitle('');
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t add the sub-issue'));
    } finally {
      setBusy(false);
    }
  };

  const createPicked = async () => {
    if (!suggestions) return;
    setBusy(true);
    try {
      let after: Issue | null = ordered.open[ordered.open.length - 1] ?? null;
      for (const [i, s] of suggestions.entries()) {
        if (!picked.has(i)) continue;
        after = await create(s.title, { description: s.description, estimate: s.estimate }, after);
      }
      toast.success(`Added ${picked.size} sub-issue${picked.size === 1 ? '' : 's'}`);
      setSuggestions(null);
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t add those sub-issues'));
    } finally {
      setBusy(false);
    }
  };

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = ordered.open.map(i => i.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = [...ordered.open];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const prev = next[to - 1] ?? null;
    const after = next[to + 1] ?? null;
    const guess = prev && after ? (prev.position + after.position) / 2 : prev ? prev.position + 1024 : after ? after.position - 1024 : moved.position;
    const rollback = snapshotDetail(qc, issue.id);
    patchDetail(qc, issue.id, d => ({ ...d, subIssues: d.subIssues.map(s => (s.id === moved.id ? { ...s, position: guess } : s)) }));
    try {
      await moveIssue({ id: moved.id, prevId: prev?.id ?? null, nextId: after?.id ?? null, columnIds: next.map(i => i.id) });
    } catch (e) {
      rollback();
      toast.error(errorMessage(e, `Couldn’t move ${moved.identifier}`));
    } finally {
      refreshDetail(qc, issue.id);
      qc.invalidateQueries({ queryKey: qk.issuesRoot });
    }
  };

  return (
    <DetailSection
      title="Breakdown"
      count={subIssues.length ? `${done} of ${subIssues.length} done` : undefined}
      actions={
        <>
          {ws.aiAvailable && subIssues.length > 0 && (
            <Tooltip content="Suggest more sub-issues">
              <Button variant="ghost" size="sm" onClick={suggest} disabled={thinking} leading={thinking ? <CircleNotch size={14} className="animate-spin" /> : <Sparkle size={14} weight="fill" className="text-violet" />}>
                Suggest
              </Button>
            </Tooltip>
          )}
          <Tooltip content="Add sub-issue">
            <Button variant="ghost" size="sm" icon onClick={() => onAdding(true)} aria-label="Add sub-issue">
              <Plus size={15} />
            </Button>
          </Tooltip>
        </>
      }
    >
      {subIssues.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line bg-card">
          <div className="px-3 pb-2 pt-2.5">
            <ProgressBar value={done} max={subIssues.length} tone="success" height={4} />
          </div>
          <div className="border-t border-line">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={ordered.open.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {ordered.open.map(s => <SubIssueRow key={s.id} issue={s} sortable={ordered.open.length > 1} />)}
              </SortableContext>
            </DndContext>
            {ordered.closed.map(s => <SubIssueRow key={s.id} issue={s} sortable={false} />)}
          </div>
        </div>
      )}
      {suggestions && suggestions.length > 0 && (
        <div className="mt-2 rounded-lg border border-violet/25 bg-violet/[0.05] p-2 animate-rise-in">
          <div className="mb-1 flex items-center gap-1.5 px-1.5 pt-0.5 text-micro font-semibold uppercase text-violet">
            <Sparkle size={12} weight="fill" /> Suggested breakdown
          </div>
          {suggestions.map((s, i) => (
            <label key={i} className="flex cursor-pointer items-start gap-2.5 rounded-sm px-1.5 py-2 hover:bg-card/70">
              <Checkbox checked={picked.has(i)} onChange={() => setPicked(p => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; })} className="mt-0.5" label={s.title} />
              <span className="min-w-0 flex-1">
                <span className="block text-ui font-medium">{s.title}</span>
                <span className="block text-meta text-ink-2">{s.description}</span>
              </span>
              {s.estimate != null && <span className="tabular shrink-0 rounded-full bg-card px-1.5 text-micro font-semibold text-ink-2 ring-1 ring-line">{s.estimate} pts</span>}
            </label>
          ))}
          <div className="mt-1 flex justify-end gap-2 px-1 pb-0.5">
            <Button size="sm" variant="ghost" onClick={() => setSuggestions(null)}>Dismiss</Button>
            <Button size="sm" variant="primary" disabled={!picked.size} loading={busy} onClick={createPicked}>Add {picked.size}</Button>
          </div>
        </div>
      )}
      {adding && (
        <div className="mt-2 flex h-10 items-center gap-2 rounded-lg bg-card px-3 shadow-hairline ring-1 ring-line-strong animate-pop-in focus-within:ring-ink/50">
          {busy ? <CircleNotch size={14} className="shrink-0 animate-spin text-ink-3" /> : <Plus size={14} className="shrink-0 text-ink-3" />}
          <input
            autoFocus
            value={title}
            aria-label="New sub-issue title"
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onAdding(false);
                setTitle('');
              }
            }}
            onBlur={() => {
              if (!title.trim()) onAdding(false);
            }}
            placeholder="Sub-issue title"
            className="min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-ink-3"
          />
          <span className="hidden shrink-0 text-meta text-ink-3 sm:inline">↵ add · esc done</span>
        </div>
      )}
    </DetailSection>
  );
}

// ---- Relations ----------------------------------------------------------------

export type RelationType = 'blocks' | 'blocked_by' | 'relates' | 'duplicate_of';

const RELATION_LABEL: Record<string, string> = {
  blocks: 'Blocking', blocked_by: 'Blocked by', relates: 'Related', duplicate_of: 'Duplicate of', duplicated_by: 'Duplicated by',
};
const RELATION_PHRASE: Record<string, string> = {
  blocks: 'blocks', blocked_by: 'is blocked by', relates: 'relates to', duplicate_of: 'duplicates', duplicated_by: 'is duplicated by',
};
const RELATION_CHOICES: Array<[RelationType, string]> = [
  ['blocks', 'Blocks…'],
  ['blocked_by', 'Is blocked by…'],
  ['relates', 'Relates to…'],
  ['duplicate_of', 'Duplicates…'],
];

function RelationMenu({ trigger, onPick, align = 'end' }: { trigger: ReactNode; onPick: (t: RelationType) => void; align?: 'start' | 'end' }) {
  return (
    <Menu>
      <MenuTrigger asChild>{trigger}</MenuTrigger>
      <MenuContent align={align} className="w-52">
        <MenuLabel>This issue…</MenuLabel>
        {RELATION_CHOICES.map(([t, label]) => (
          // Let the menu close (and hand back focus) before the search picker opens.
          <MenuItem key={t} onSelect={() => setTimeout(() => onPick(t), 0)}>
            {label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

export function RelationsSection({ detail, pending, onPending }: { detail: IssueDetail; pending: RelationType | null; onPending: (t: RelationType | null) => void }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const app = useAppActions();
  const { issue, relations } = detail;

  const refresh = () => {
    refreshDetail(qc, issue.id);
    qc.invalidateQueries({ queryKey: qk.issuesRoot });
  };

  const link = async (type: RelationType, other: { id: string; identifier: string }) => {
    try {
      await setIssueRelation({ issueId: issue.id, relatedIssueId: other.id, type });
      refresh();
      // The other side of the link changed too.
      qc.invalidateQueries({ queryKey: qk.issue(other.identifier) });
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t link those issues'));
    }
  };

  const unlink = async (r: IssueDetail['relations'][number]) => {
    const rollback = snapshotDetail(qc, issue.id);
    patchDetail(qc, issue.id, d => ({ ...d, relations: d.relations.filter(x => x.id !== r.id) }));
    try {
      await setIssueRelation({ issueId: issue.id, relatedIssueId: r.issueId, type: r.type as never, remove: true });
      const relinkable = RELATION_CHOICES.some(([t]) => t === r.type) || r.type === 'duplicated_by';
      toast.success(`${issue.identifier} no longer ${RELATION_PHRASE[r.type] ?? 'relates to'} ${r.identifier}`, {
        action: relinkable ? { label: 'Undo', onClick: () => setIssueRelation({ issueId: issue.id, relatedIssueId: r.issueId, type: r.type as never }).then(refresh) } : undefined,
      });
    } catch (e) {
      rollback();
      toast.error(errorMessage(e, 'Couldn’t remove that link'));
    } finally {
      refresh();
    }
  };

  if (relations.length === 0 && !pending) return null;
  const groups = Object.keys(RELATION_LABEL).map(t => ({ type: t, items: relations.filter(r => r.type === t) })).filter(g => g.items.length);

  return (
    <DetailSection
      title="Relations"
      count={relations.length || undefined}
      actions={
        <RelationMenu
          onPick={onPending}
          trigger={
            <Button variant="ghost" size="sm" icon aria-label="Add relation">
              <Plus size={15} />
            </Button>
          }
        />
      }
    >
      {pending && (
        <IssueSearchPicker
          open
          onOpenChange={o => !o && onPending(null)}
          excludeIds={[issue.id, ...relations.map(r => r.issueId)]}
          placeholder={`${issue.identifier} ${RELATION_PHRASE[pending]}…`}
          onSelect={other => {
            const t = pending;
            onPending(null);
            link(t, other);
          }}
          trigger={<span className="block h-0" />}
        />
      )}
      {groups.length === 0 ? (
        <div className="h-10 rounded-lg border border-dashed border-line-strong" aria-hidden />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(g => (
            <div key={g.type} className="overflow-hidden rounded-lg border border-line bg-card">
              <div className={cn('flex h-8 items-center border-b border-line bg-sunken px-3 text-micro font-semibold uppercase', g.type === 'blocked_by' ? 'text-danger' : g.type === 'blocks' ? 'text-warning' : 'text-ink-3')}>
                {RELATION_LABEL[g.type]}
              </div>
              {g.items.map(r => {
                const status = r.statusId ? ws.statusById.get(r.statusId) : undefined;
                const assignee = r.assigneeId ? ws.memberById.get(r.assigneeId) : undefined;
                return (
                  <div key={r.id} onClick={() => app.openPeek(r.identifier)} className="group/rel flex h-10 cursor-default items-center gap-2.5 border-b border-line px-3 last:border-b-0 hover:bg-paper/70 dark:hover:bg-hover/40">
                    <StatusGlyph status={status} siblings={status?.teamId ? ws.statusesByTeam.get(status.teamId) : undefined} />
                    <span className="w-[58px] shrink-0 truncate font-mono text-[11px] text-ink-3">{r.identifier}</span>
                    <span title={r.title} className={cn('min-w-0 flex-1 truncate text-ui', isDoneType(status?.type) ? 'text-ink-3' : 'text-ink')}>{r.title}</span>
                    {assignee && <Avatar person={assignee} size={18} />}
                    <Tooltip content="Remove relation">
                      <button type="button" aria-label={`Remove relation to ${r.identifier}`} onClick={e => { e.stopPropagation(); unlink(r); }} className={cn('rounded-xs p-1 text-ink-3 hover:bg-hover hover:text-ink', reveal('rel'))}>
                        <X size={12} />
                      </button>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </DetailSection>
  );
}

// ---- Links ----------------------------------------------------------------------

const LINK_ICON: Record<string, typeof LinkSimple> = { github: GithubLogo, figma: FigmaLogo, loom: VideoCamera, sentry: Bug, doc: FileText, link: LinkSimple };

function normaliseUrl(raw: string) {
  let u = raw.trim();
  if (!u) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function LinksSection({ detail, adding, onAdding }: { detail: IssueDetail; adding: boolean; onAdding: (on: boolean) => void }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const { issue, attachments } = detail;

  if (attachments.length === 0 && !adding) return null;

  const close = () => {
    onAdding(false);
    setUrl('');
    setTitle('');
    setInvalid(false);
  };

  const add = async () => {
    const u = normaliseUrl(url);
    if (!u) {
      setInvalid(Boolean(url.trim()));
      return;
    }
    setBusy(true);
    try {
      await saveAttachment({ issueId: issue.id, url: u, title: title.trim() || undefined });
      close();
      await refreshDetail(qc, issue.id);
      qc.invalidateQueries({ queryKey: qk.issuesRoot });
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t add that link'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: IssueDetail['attachments'][number]) => {
    const rollback = snapshotDetail(qc, issue.id);
    patchDetail(qc, issue.id, d => ({ ...d, attachments: d.attachments.filter(x => x.id !== a.id) }));
    try {
      await saveAttachment({ issueId: issue.id, id: a.id, remove: true });
      toast.success(`Removed ${a.title}`, {
        action: { label: 'Undo', onClick: () => saveAttachment({ issueId: issue.id, url: a.url, title: a.title }).then(() => refreshDetail(qc, issue.id)) },
      });
    } catch (e) {
      rollback();
      toast.error(errorMessage(e, 'Couldn’t remove that link'));
    } finally {
      refreshDetail(qc, issue.id);
      qc.invalidateQueries({ queryKey: qk.issuesRoot });
    }
  };

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <DetailSection
      title="Links"
      count={attachments.length || undefined}
      actions={<Tooltip content="Add link"><Button variant="ghost" size="sm" icon onClick={() => onAdding(true)} aria-label="Add link"><Plus size={15} /></Button></Tooltip>}
    >
      {attachments.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {attachments.map(a => {
            const Icon = LINK_ICON[a.kind ?? 'link'] ?? LinkSimple;
            let host = a.url;
            try {
              host = new URL(a.url).hostname.replace(/^www\./, '');
            } catch {
              /* keep raw */
            }
            const who = ws.memberById.get(a.creatorId ?? '')?.name?.split(' ')[0];
            return (
              <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" title={a.url} className="group/link flex min-w-0 items-center gap-3 rounded-lg border border-line bg-card px-3 py-2.5 shadow-hairline transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-raised">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sunken text-ink">
                  <Icon size={17} weight={a.kind === 'github' || a.kind === 'figma' ? 'fill' : 'regular'} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui font-medium text-ink">{a.title}</span>
                  <span className="block truncate text-meta text-ink-3">{[host, who, timeAgo(a.addedAt)].filter(Boolean).join(' · ')}</span>
                </span>
                <Tooltip content="Remove link">
                  <button type="button" aria-label={`Remove ${a.title}`} onClick={e => { e.preventDefault(); e.stopPropagation(); remove(a); }} className={cn('shrink-0 rounded-xs p-1 text-ink-3 hover:bg-hover hover:text-danger', reveal('link'))}>
                    <Trash size={14} />
                  </button>
                </Tooltip>
              </a>
            );
          })}
        </div>
      )}
      {adding && (
        <div className={cn('rounded-lg bg-card p-2 shadow-hairline ring-1 animate-pop-in', attachments.length > 0 && 'mt-2', invalid ? 'ring-danger/60' : 'ring-line-strong')}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              autoFocus
              value={url}
              aria-label="Link URL"
              aria-invalid={invalid}
              onChange={e => { setUrl(e.target.value); setInvalid(false); }}
              onKeyDown={keys}
              placeholder="Paste a pull request, Figma file, doc…"
              className="h-8 min-w-0 flex-1 rounded-sm bg-transparent px-2 text-ui outline-none placeholder:text-ink-3"
            />
            <input value={title} aria-label="Link title" onChange={e => setTitle(e.target.value)} onKeyDown={keys} placeholder="Title (optional)" className="h-8 rounded-sm bg-sunken px-2 text-ui outline-none placeholder:text-ink-3 sm:w-40" />
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={close}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={add} disabled={!url.trim()} loading={busy}>Add</Button>
            </div>
          </div>
          {invalid && <p className="px-2 pb-0.5 pt-1.5 text-meta text-danger">That doesn’t look like a link — paste the full address.</p>}
        </div>
      )}
    </DetailSection>
  );
}

// ---- Everything attached to an issue ------------------------------------------

const addChip =
  'inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 text-meta font-medium text-ink-2 transition-colors hover:border-control hover:bg-card hover:text-ink data-[state=open]:border-control data-[state=open]:bg-card data-[state=open]:text-ink disabled:opacity-50';

/**
 * Breakdown, links and relations. A section only appears once it has
 * something in it; until then it is one quiet "add" chip in a row, so an issue
 * with nothing attached isn't a stack of empty boxes.
 */
export function IssueExtras({ detail }: { detail: IssueDetail }) {
  const ws = useWorkspace();
  const [addingSub, setAddingSub] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [pendingRelation, setPendingRelation] = useState<RelationType | null>(null);
  const breakdown = useBreakdown(detail);
  const { subIssues, attachments, relations } = detail;

  const showSub = subIssues.length === 0 && !addingSub && !breakdown.suggestions;
  const showLink = attachments.length === 0 && !addingLink;
  const showRelation = relations.length === 0 && !pendingRelation;

  return (
    <>
      <BreakdownSection detail={detail} adding={addingSub} onAdding={setAddingSub} breakdown={breakdown} />
      <LinksSection detail={detail} adding={addingLink} onAdding={setAddingLink} />
      <RelationsSection detail={detail} pending={pendingRelation} onPending={setPendingRelation} />
      {(showSub || showLink || showRelation) && (
        <div className="mt-6 flex flex-wrap items-center gap-1.5">
          {showSub && (
            <button type="button" className={addChip} onClick={() => setAddingSub(true)}>
              <TreeStructure size={14} className="text-ink-3" /> Add sub-issues
            </button>
          )}
          {showSub && ws.aiAvailable && (
            <button type="button" className={addChip} onClick={breakdown.suggest} disabled={breakdown.thinking}>
              {breakdown.thinking ? <CircleNotch size={14} className="animate-spin text-ink-3" /> : <Sparkle size={14} weight="fill" className="text-violet" />}
              {breakdown.thinking ? 'Thinking…' : 'Suggest a breakdown'}
            </button>
          )}
          {showLink && (
            <button type="button" className={addChip} onClick={() => setAddingLink(true)}>
              <LinkSimple size={14} className="text-ink-3" /> Link a PR or doc
            </button>
          )}
          {showRelation && (
            <RelationMenu
              align="start"
              onPick={setPendingRelation}
              trigger={
                <button type="button" className={addChip}>
                  <ArrowsLeftRight size={14} className="text-ink-3" /> Relate to an issue
                </button>
              }
            />
          )}
        </div>
      )}
    </>
  );
}
