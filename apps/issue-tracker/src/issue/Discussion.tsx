import {
  ArrowBendUpLeft, Bell, BellSlash, CaretRight, ChatCircle, CheckCircle, CircleNotch, ClockCounterClockwise, Copy, DotsThree, LinkSimple, PencilSimple, Smiley, Sparkle, Trash, X,
} from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { differenceInMinutes, parseISO } from 'date-fns';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { addComment, aiSummarizeThread, toggleReaction, toggleSubscription, updateComment, type AiSummarizeThreadOutputType } from 'zitejs/api';
import { MarkdownView } from '../editor/MarkdownView';
import { MentionComposer } from '../editor/MentionComposer';
import { useAppActions } from '../lib/app-actions';
import { copyText } from '../lib/clipboard';
import { REACTIONS } from '../lib/constants';
import { errorMessage } from '../lib/errors';
import { dateTime, issueUrl, shortDate, timeAgo } from '../lib/format';
import { qk } from '../lib/queries';
import type { ActivityItem, Comment, IssueDetail } from '../lib/types';
import { useWorkspace, type Workspace } from '../lib/workspace';
import { Avatar, AvatarStack } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { Segmented } from '../ui/Form';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui/Menu';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { Tooltip } from '../ui/Tooltip';
import { patchDetail, refreshDetail, snapshotDetail } from './cache';

type Filter = 'conversation' | 'comments' | 'history';

/** History more than this far apart reads as separate moments, not one burst of edits. */
const CLUSTER_GAP_MINUTES = 180;

const RELATION_VERB: Record<string, string> = {
  blocks: 'marked it as blocking', blocked_by: 'marked it as blocked by', relates: 'linked it to',
  duplicate_of: 'marked it as a duplicate of', duplicated_by: 'marked it as duplicated by',
};

function describe(a: ActivityItem): ReactNode {
  const b = (text: string | null) => <span className="font-medium text-ink">{text}</span>;
  switch (a.type) {
    case 'created': return 'opened the issue';
    case 'status_changed': return <>moved it from {b(a.fromLabel ?? 'none')} to {b(a.toLabel)}</>;
    case 'assignee_changed':
      if (!a.toValue) return <>unassigned {b(a.fromLabel)}</>;
      if (a.toValue === a.actorId) return 'picked it up';
      return a.fromLabel ? <>handed it from {b(a.fromLabel)} to {b(a.toLabel)}</> : <>assigned {b(a.toLabel)}</>;
    case 'priority_changed': return <>set priority to {b(a.toLabel)}</>;
    case 'estimate_changed': return a.toLabel ? <>estimated it at {b(a.toLabel)}</> : 'cleared the estimate';
    case 'title_changed': return <>renamed it {b(a.toValue)}</>;
    case 'description_changed': return 'edited the description';
    case 'type_changed': return <>made it a {b(a.toLabel)}</>;
    case 'label_added': return <>added {b(a.toLabel)}</>;
    case 'label_removed': return <>removed {b(a.fromLabel)}</>;
    case 'project_changed': return a.toLabel ? <>moved it to {b(a.toLabel)}</> : <>took it out of {b(a.fromLabel)}</>;
    case 'milestone_changed': return a.toLabel ? <>set the milestone to {b(a.toLabel)}</> : 'cleared the milestone';
    case 'sprint_changed': return a.toLabel ? <>added it to {b(a.toLabel)}</> : <>took it out of {b(a.fromLabel)}</>;
    case 'due_date_changed': return a.toValue ? <>set it due {b(shortDate(a.toValue))}</> : 'cleared the due date';
    case 'parent_changed': return a.toLabel ? <>made it part of {b(a.toLabel)}</> : 'removed its parent';
    case 'relation_added': return <>{RELATION_VERB[a.fromValue ?? ''] ?? 'linked it to'} {b(a.toLabel)}</>;
    case 'relation_removed': return <>unlinked {b(a.fromLabel)}</>;
    case 'attachment_added': return <>attached {b(a.toLabel)}</>;
    case 'attachment_removed': return <>removed {b(a.fromLabel)}</>;
    case 'archived': return 'archived it';
    case 'unarchived': return 'restored it';
    default: return a.name ?? 'updated it';
  }
}

/** The noun for a change, so a folded cluster can say what moved: "status, labels and assignee". */
const KIND: Record<string, string> = {
  created: 'opened', status_changed: 'status', assignee_changed: 'assignee', priority_changed: 'priority', estimate_changed: 'estimate',
  title_changed: 'title', description_changed: 'description', type_changed: 'type', label_added: 'labels', label_removed: 'labels',
  project_changed: 'project', milestone_changed: 'milestone', sprint_changed: 'sprint', due_date_changed: 'due date', parent_changed: 'parent',
  relation_added: 'relations', relation_removed: 'relations', attachment_added: 'links', attachment_removed: 'links', archived: 'archived', unarchived: 'restored', team_changed: 'team',
};

function listWords(words: string[]) {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

function firstName(ws: Workspace, id: string | null | undefined) {
  if (!id) return 'Someone';
  if (id === ws.me.id) return 'You';
  return ws.memberById.get(id)?.name.split(' ')[0] ?? 'Someone';
}

function HistoryLine({ item }: { item: ActivityItem }) {
  const ws = useWorkspace();
  const actor = item.actorId ? ws.memberById.get(item.actorId) : undefined;
  return (
    <div className="flex min-h-7 items-start gap-2 py-1 text-meta text-ink-2">
      <span className="flex h-5 w-7 shrink-0 items-center justify-center">
        <Avatar person={actor} size={16} />
      </span>
      <span className="min-w-0 pt-0.5 leading-4">
        <span className="font-medium text-ink">{firstName(ws, item.actorId)}</span> {describe(item)}
        <Tooltip content={dateTime(item.occurredAt)}>
          <span className="ml-1.5 whitespace-nowrap text-ink-3">{timeAgo(item.occurredAt)}</span>
        </Tooltip>
      </span>
    </div>
  );
}

/** Three or more changes in a row fold into one line, so the conversation stays readable. */
function HistoryCluster({ items, ws }: { items: ActivityItem[]; ws: Workspace }) {
  const [open, setOpen] = useState(false);
  if (items.length < 3) return <div className="py-0.5">{items.map(i => <HistoryLine key={i.id} item={i} />)}</div>;
  const actorIds = [...new Set(items.map(i => i.actorId).filter(Boolean) as string[])];
  const people = actorIds.map(id => ws.memberById.get(id)).filter(Boolean);
  const names = actorIds.map(id => firstName(ws, id));
  const who = names.length <= 2 ? listWords(names) : `${names[0]} and ${names.length - 1} others`;
  const kinds = [...new Set(items.map(i => KIND[i.type]).filter(Boolean))];
  const what = kinds.length && kinds.length <= 3 ? ` · ${listWords(kinds)}` : '';
  const last = items[items.length - 1];
  return (
    <div className="py-0.5">
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="group/cluster flex min-h-7 w-full items-start gap-2 rounded-sm py-1 text-left text-meta text-ink-2 hover:text-ink">
        <span className="flex h-5 w-7 shrink-0 items-center justify-center">
          <AvatarStack people={people as never} size={16} max={2} />
        </span>
        <span className="min-w-0 pt-0.5 leading-4">
          <span className="font-medium text-ink">{who}</span> made {items.length} changes<span className="text-ink-3">{what}</span>
          <Tooltip content={dateTime(last.occurredAt)}>
            <span className="ml-1.5 whitespace-nowrap text-ink-3">{timeAgo(last.occurredAt)}</span>
          </Tooltip>
          <CaretRight size={10} weight="bold" className={cn('mb-px ml-1.5 inline text-ink-3 transition-transform group-hover/cluster:text-ink', open && 'rotate-90')} />
        </span>
      </button>
      {open && (
        <div className="ml-3.5 border-l border-line pl-2 animate-rise-in">
          {items.map(i => <HistoryLine key={i.id} item={i} />)}
        </div>
      )}
    </div>
  );
}

function ReactionPicker({ onPick, className, bare }: { onPick: (emoji: string) => void; className?: string; bare?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* No tooltip wrapper: it would take over the trigger's data-state, which keeps the hover actions visible while open. */}
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Add reaction"
          title="React"
          className={cn(
            'flex items-center justify-center text-ink-3 hover:bg-hover hover:text-ink data-[state=open]:bg-hover data-[state=open]:text-ink',
            bare ? 'h-6 w-6 rounded-xs' : 'h-6 w-7 rounded-full ring-1 ring-inset ring-line',
            className,
          )}
        >
          <Smiley size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto gap-0.5 p-1">
        {REACTIONS.map(e => (
          <button
            key={e}
            type="button"
            aria-label={`React ${e}`}
            onClick={() => {
              setOpen(false);
              onPick(e);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-sm text-base hover:bg-sunken"
          >
            {e}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function useReact(issueId: string) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  return async (comment: Comment, emoji: string) => {
    const rollback = snapshotDetail(qc, issueId);
    patchDetail(qc, issueId, old => ({
      ...old,
      comments: old.comments.map(c => {
        if (c.id !== comment.id) return c;
        const existing = c.reactions.find(r => r.emoji === emoji);
        let reactions = c.reactions;
        if (existing?.mine) reactions = reactions.map(r => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false, memberIds: r.memberIds.filter(m => m !== ws.me.id) } : r)).filter(r => r.count > 0);
        else if (existing) reactions = reactions.map(r => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true, memberIds: [...r.memberIds, ws.me.id] } : r));
        else reactions = [...reactions, { emoji, count: 1, mine: true, memberIds: [ws.me.id] }];
        return { ...c, reactions };
      }),
    }));
    try {
      await toggleReaction({ commentId: comment.id, emoji });
    } catch (e) {
      rollback();
      toast.error(errorMessage(e, 'Couldn’t add that reaction'));
    }
  };
}

function Reactions({ comment, onReact }: { comment: Comment; onReact: (emoji: string) => void }) {
  const ws = useWorkspace();
  if (comment.reactions.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {comment.reactions.map(r => {
        const names = r.memberIds.map(id => (id === ws.me.id ? 'You' : ws.memberById.get(id)?.name ?? 'Someone'));
        return (
          <Tooltip key={r.emoji} content={listWords(names)}>
            <button
              type="button"
              aria-pressed={r.mine}
              aria-label={`${r.emoji} ${r.count}, ${r.mine ? 'remove your reaction' : 'react'}`}
              onClick={() => onReact(r.emoji)}
              className={cn('tabular flex h-6 items-center gap-1 rounded-full px-2 text-meta ring-1 ring-inset transition-colors', r.mine ? 'bg-highlight/40 text-ink ring-highlight dark:bg-highlight/15' : 'bg-card text-ink-2 ring-line-strong hover:bg-hover')}
            >
              <span className="text-[13px] leading-none">{r.emoji}</span>
              {r.count}
            </button>
          </Tooltip>
        );
      })}
      <ReactionPicker onPick={onReact} />
    </div>
  );
}

const actionBtn = 'flex h-6 w-6 items-center justify-center rounded-xs text-ink-3 hover:bg-hover hover:text-ink';

function Thread({ comment, replies, detail, onReply, replying }: { comment: Comment; replies: Comment[]; detail: IssueDetail; onReply: (id: string | null) => void; replying: boolean }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const app = useAppActions();
  const react = useReact(detail.issue.id);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const author = comment.authorId ? ws.memberById.get(comment.authorId) : undefined;
  const issueId = detail.issue.id;
  const key = detail.issue.identifier;
  const refresh = () => refreshDetail(qc, issueId);

  const save = async (c: Comment, body: string) => {
    const rollback = snapshotDetail(qc, issueId);
    patchDetail(qc, issueId, d => ({ ...d, comments: d.comments.map(x => (x.id === c.id ? { ...x, body, editedAt: new Date().toISOString() } : x)) }));
    setEditingId(null);
    try {
      await updateComment({ id: c.id, body });
    } catch (e) {
      rollback();
      setEditingId(c.id);
      toast.error(errorMessage(e, 'Couldn’t save that edit'));
      throw e;
    } finally {
      refresh();
    }
  };

  const remove = async (c: Comment) => {
    const isRoot = c.id === comment.id;
    const ok = await app.confirm({
      title: isRoot && replies.length ? 'Delete this thread?' : 'Delete this comment?',
      description: isRoot && replies.length ? `The ${replies.length === 1 ? 'reply goes' : `${replies.length} replies go`} with it.` : 'This can’t be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    const rollback = snapshotDetail(qc, issueId);
    patchDetail(qc, issueId, d => ({ ...d, comments: d.comments.filter(x => x.id !== c.id && (!isRoot || x.parentId !== c.id)) }));
    try {
      await updateComment({ id: c.id, remove: true });
      qc.invalidateQueries({ queryKey: qk.issuesRoot });
    } catch (e) {
      rollback();
      toast.error(errorMessage(e, 'Couldn’t delete that comment'));
    } finally {
      refresh();
    }
  };

  const resolve = async (resolved: boolean) => {
    const rollback = snapshotDetail(qc, issueId);
    patchDetail(qc, issueId, d => ({ ...d, comments: d.comments.map(x => (x.id === comment.id ? { ...x, resolved } : x)) }));
    setShowResolved(false);
    if (resolved) onReply(null);
    try {
      await updateComment({ id: comment.id, resolved });
    } catch (e) {
      rollback();
      toast.error(errorMessage(e, resolved ? 'Couldn’t resolve that thread' : 'Couldn’t reopen that thread'));
    } finally {
      refresh();
    }
  };

  if (comment.resolved && !showResolved) {
    return (
      <button type="button" onClick={() => setShowResolved(true)} className="my-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-left text-meta text-ink-2 transition-colors hover:bg-card">
        <CheckCircle size={15} weight="fill" className="shrink-0 text-success" />
        <span className="shrink-0 font-medium text-ink">Resolved</span>
        <span className="min-w-0 truncate text-ink-3">{author?.name.split(' ')[0] ?? 'Someone'}: {comment.body.replace(/\s+/g, ' ').slice(0, 120)}</span>
        <span className="ml-auto shrink-0 text-ink-3">{replies.length > 0 ? `${replies.length + 1} comments` : 'Show'}</span>
      </button>
    );
  }

  const one = (c: Comment, isReply: boolean) => {
    const a = c.authorId ? ws.memberById.get(c.authorId) : undefined;
    const mine = c.authorId === ws.me.id;
    const editing = editingId === c.id;
    return (
      <div key={c.id} id={`comment-${c.id}`} className={cn('group/comment flex gap-2.5', isReply ? 'border-t border-line py-3 pl-3 pr-3 sm:pl-4' : 'pb-3 pl-3 pr-3 pt-3 sm:pl-4')}>
        <span className="flex w-7 shrink-0 justify-center pt-px">
          <Avatar person={a} size={isReply ? 22 : 28} className={cn(isReply && 'mt-0.5')} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-h-6 flex-wrap items-center gap-x-2">
            <span className="text-ui font-semibold text-ink">{a?.name ?? 'Someone'}</span>
            <Tooltip content={dateTime(c.postedAt)}>
              <span className="text-meta text-ink-3">{c.id.startsWith('tmp-') ? 'Posting…' : timeAgo(c.postedAt)}{c.editedAt && ' · edited'}</span>
            </Tooltip>
            {!c.id.startsWith('tmp-') && !editing && (
              <div className="ml-auto flex items-center gap-0.5 transition-opacity focus-within:opacity-100 has-[[data-state=open]]:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/comment:opacity-100">
                {c.reactions.length === 0 && <ReactionPicker bare onPick={e => react(c, e)} />}
                {!isReply && (
                  <Tooltip content="Reply">
                    <button type="button" onClick={() => onReply(comment.id)} className={actionBtn} aria-label="Reply">
                      <ArrowBendUpLeft size={14} />
                    </button>
                  </Tooltip>
                )}
                {!isReply && (
                  <Tooltip content={comment.resolved ? 'Reopen thread' : 'Resolve thread'}>
                    <button type="button" onClick={() => resolve(!comment.resolved)} className={cn(actionBtn, 'hover:text-success')} aria-label={comment.resolved ? 'Reopen thread' : 'Resolve thread'}>
                      <CheckCircle size={15} weight={comment.resolved ? 'fill' : 'regular'} className={cn(comment.resolved && 'text-success')} />
                    </button>
                  </Tooltip>
                )}
                <Menu>
                  <MenuTrigger asChild>
                    <button type="button" className={cn(actionBtn, 'data-[state=open]:bg-hover data-[state=open]:text-ink')} aria-label="Comment actions">
                      <DotsThree size={15} weight="bold" />
                    </button>
                  </MenuTrigger>
                  <MenuContent align="end" className="w-48">
                    <MenuItem icon={<LinkSimple size={15} />} onSelect={() => copyText(issueUrl(key), 'Copied link to the issue')}>Copy link</MenuItem>
                    <MenuItem icon={<Copy size={15} />} onSelect={() => copyText(c.body, 'Copied comment')}>Copy text</MenuItem>
                    {mine && (
                      <>
                        <MenuSeparator />
                        <MenuItem icon={<PencilSimple size={15} />} onSelect={() => setEditingId(c.id)}>Edit</MenuItem>
                        <MenuItem icon={<Trash size={15} />} destructive onSelect={() => remove(c)}>
                          Delete…
                        </MenuItem>
                      </>
                    )}
                  </MenuContent>
                </Menu>
              </div>
            )}
          </div>
          {editing ? (
            <div className="mt-1.5">
              <MentionComposer initialValue={c.body} onSubmit={body => save(c, body)} onCancel={() => setEditingId(null)} submitLabel="Save" autoFocus />
            </div>
          ) : (
            <MarkdownView className="mt-0.5">{c.body}</MarkdownView>
          )}
          <Reactions comment={c} onReact={e => react(c, e)} />
        </div>
      </div>
    );
  };

  return (
    <div className={cn('my-3 overflow-hidden rounded-xl border border-line bg-card shadow-hairline animate-rise-in', comment.resolved && 'border-dashed')}>
      {comment.resolved && (
        <div className="flex h-8 items-center gap-2 border-b border-line bg-sunken px-3 text-meta text-ink-2 sm:px-4">
          <CheckCircle size={14} weight="fill" className="text-success" />
          <span className="font-medium text-ink">Resolved</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="xs" onClick={() => resolve(false)}>Reopen</Button>
            <Button variant="ghost" size="xs" onClick={() => setShowResolved(false)}>Collapse</Button>
          </div>
        </div>
      )}
      {one(comment, false)}
      {replies.map(r => one(r, true))}
      {replying ? (
        <div className="border-t border-line bg-paper/70 p-2.5 dark:bg-paper/30">
          <MentionComposer
            compact
            autoFocus
            placeholder={`Reply to ${author?.name.split(' ')[0] ?? 'the thread'}…`}
            submitLabel="Reply"
            onCancel={() => onReply(null)}
            onSubmit={async text => {
              try {
                await addComment({ issueId, body: text, parentId: comment.id });
                onReply(null);
                refresh();
                qc.invalidateQueries({ queryKey: qk.issuesRoot });
              } catch (e) {
                toast.error(errorMessage(e, 'Couldn’t post that reply'));
                throw e;
              }
            }}
          />
        </div>
      ) : (
        replies.length > 0 && !comment.resolved && (
          <button type="button" onClick={() => onReply(comment.id)} className="flex w-full items-center gap-2 border-t border-line px-4 py-2 text-left text-meta text-ink-3 transition-colors hover:bg-paper/70 hover:text-ink dark:hover:bg-hover/40">
            <ArrowBendUpLeft size={13} /> Reply to thread
          </button>
        )
      )}
    </div>
  );
}

type Summary = AiSummarizeThreadOutputType;

function CatchMeUp({ issueId, onResult }: { issueId: string; onResult: (r: Summary) => void }) {
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try {
      const result = await aiSummarizeThread({ issueId });
      if (!result.available) toast.info('AI isn’t connected, so the thread is shown in full.');
      else onResult(result);
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t summarize this thread'));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button variant="ghost" size="sm" onClick={run} disabled={loading} leading={loading ? <CircleNotch size={14} className="animate-spin" /> : <Sparkle size={14} weight="fill" className="text-violet" />}>
      {loading ? 'Reading…' : 'Catch me up'}
    </Button>
  );
}

function SummaryCard({ summary, onDismiss }: { summary: Summary; onDismiss: () => void }) {
  return (
    <div className="mb-4 rounded-xl border border-violet/25 bg-violet/[0.05] p-4 animate-rise-in">
      <div className="flex items-center gap-1.5 text-micro font-semibold uppercase text-violet">
        <Sparkle size={12} weight="fill" /> Where this stands
        <button type="button" onClick={onDismiss} className="ml-auto rounded-xs p-0.5 text-ink-3 hover:bg-hover hover:text-ink" aria-label="Dismiss summary">
          <X size={13} />
        </button>
      </div>
      {summary.summary ? <p className="mt-2 font-display text-[19px] leading-7 text-ink">{summary.summary}</p> : <p className="mt-2 text-ui text-ink-2">This thread is short enough to read as it is.</p>}
      {([['Decided', summary.decisions], ['Still open', summary.openQuestions], ['Next', summary.nextSteps]] as Array<[string, string[]]>).map(
        ([title, items]) =>
          items.length > 0 && (
            <div key={title} className="mt-3">
              <div className="text-micro font-semibold uppercase text-ink-3">{title}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ui marker:text-ink-3">{items.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          ),
      )}
    </div>
  );
}

/** Follow or unfollow an issue — optimistic, and shared by the Discussion header and the ⋯ menu. */
export function useFollow(detail: IssueDetail) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const key = detail.issue.identifier;
  const following = detail.subscriberIds.includes(ws.me.id);
  const toggle = async () => {
    const next = !following;
    const rollback = snapshotDetail(qc, detail.issue.id);
    patchDetail(qc, detail.issue.id, old => ({ ...old, subscriberIds: next ? [...old.subscriberIds, ws.me.id] : old.subscriberIds.filter(id => id !== ws.me.id) }));
    try {
      await toggleSubscription({ issueId: detail.issue.id, subscribed: next });
      toast.success(next ? `You’ll hear about changes to ${key}` : `You won’t hear about ${key} unless you’re mentioned or assigned`);
    } catch (e) {
      rollback();
      toast.error(errorMessage(e, next ? 'Couldn’t follow this issue' : 'Couldn’t unfollow this issue'));
    }
  };
  return { following, toggle };
}

function FollowToggle({ detail }: { detail: IssueDetail }) {
  const ws = useWorkspace();
  const { following, toggle } = useFollow(detail);
  const watchers = detail.subscriberIds.map(id => ws.memberById.get(id)).filter(Boolean);
  const names = detail.subscriberIds.map(id => (id === ws.me.id ? 'you' : ws.memberById.get(id)?.name)).filter(Boolean) as string[];
  return (
    <Tooltip content={names.length ? `Following: ${listWords(names)}` : 'Nobody is following this yet'}>
      <Button variant="ghost" size="sm" onClick={toggle} aria-pressed={following} leading={following ? <BellSlash size={14} /> : <Bell size={14} />}>
        {following ? 'Unfollow' : 'Follow'}
        {watchers.length > 0 && <AvatarStack people={watchers as never} size={16} max={3} className="ml-1" />}
      </Button>
    </Tooltip>
  );
}

/**
 * The conversation. Comments are threads; history between them folds into
 * single "made N changes" lines, so the discussion reads top to bottom. The
 * composer sits at the end, where the latest message is.
 */
export function Discussion({ detail }: { detail: IssueDetail }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('conversation');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const issueId = detail.issue.id;

  type Entry = { kind: 'history'; at: string; items: ActivityItem[] } | { kind: 'comment'; at: string; item: Comment; replies: Comment[] };
  const timeline = useMemo(() => {
    const roots = detail.comments.filter(c => !c.parentId);
    const repliesOf = new Map<string, Comment[]>();
    for (const c of detail.comments) if (c.parentId) repliesOf.set(c.parentId, [...(repliesOf.get(c.parentId) ?? []), c]);
    const raw: Array<{ at: string; history?: ActivityItem; comment?: Comment }> = [
      ...(filter === 'comments' ? [] : detail.activity.map(a => ({ at: a.occurredAt ?? '', history: a }))),
      ...(filter === 'history' ? [] : roots.map(c => ({ at: c.postedAt ?? '', comment: c }))),
    ].sort((a, b) => a.at.localeCompare(b.at));
    const out: Entry[] = [];
    for (const r of raw) {
      if (r.comment) out.push({ kind: 'comment', at: r.at, item: r.comment, replies: repliesOf.get(r.comment.id) ?? [] });
      else if (r.history) {
        const last = out[out.length - 1];
        const lastItem = last?.kind === 'history' ? last.items[last.items.length - 1] : null;
        const close = lastItem?.occurredAt && r.history.occurredAt
          ? Math.abs(differenceInMinutes(parseISO(r.history.occurredAt), parseISO(lastItem.occurredAt))) <= CLUSTER_GAP_MINUTES
          : false;
        if (filter === 'conversation' && last?.kind === 'history' && close) last.items.push(r.history);
        else out.push({ kind: 'history', at: r.at, items: [r.history] });
      }
    }
    return out;
  }, [detail, filter]);

  const post = async (body: string) => {
    const optimistic: Comment = { id: `tmp-${Date.now()}`, body, postedAt: new Date().toISOString(), editedAt: null, parentId: null, authorId: ws.me.id, resolved: false, reactions: [] };
    patchDetail(qc, issueId, old => ({ ...old, comments: [...old.comments, optimistic], subscriberIds: old.subscriberIds.includes(ws.me.id) ? old.subscriberIds : [...old.subscriberIds, ws.me.id] }));
    if (filter === 'history') setFilter('conversation');
    try {
      await addComment({ issueId, body });
      await refreshDetail(qc, issueId);
      qc.invalidateQueries({ queryKey: qk.issuesRoot });
    } catch (e) {
      patchDetail(qc, issueId, old => ({ ...old, comments: old.comments.filter(c => c.id !== optimistic.id) }));
      toast.error(errorMessage(e, 'Couldn’t post that comment'));
      throw e;
    }
  };

  const commentCount = detail.comments.filter(c => !c.id.startsWith('tmp-')).length;
  return (
    <section className="mt-10" aria-label="Discussion">
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-line pb-3">
        <h3 className="font-display text-[22px] leading-7 text-ink">Discussion</h3>
        {commentCount > 0 && <span className="tabular text-ui text-ink-3">{commentCount}</span>}
        <Segmented
          size="xs"
          className="order-last sm:order-none sm:ml-2"
          value={filter}
          onChange={v => setFilter(v as Filter)}
          options={[
            { value: 'conversation', label: 'Everything', title: 'Comments with history folded between them' },
            { value: 'comments', label: <span className="inline-flex items-center gap-1"><ChatCircle size={11} />Comments</span>, title: 'Only comments' },
            { value: 'history', label: <span className="inline-flex items-center gap-1"><ClockCounterClockwise size={11} />History</span>, title: 'Every change, no comments' },
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {ws.aiAvailable && commentCount >= 3 && !summary && <CatchMeUp issueId={issueId} onResult={setSummary} />}
          <FollowToggle detail={detail} />
        </div>
      </div>
      {summary && <SummaryCard summary={summary} onDismiss={() => setSummary(null)} />}
      <div>
        {timeline.length === 0 && (
          <p className="py-3 text-ui text-ink-3">{filter === 'comments' ? 'No comments yet — start the conversation below.' : 'No history yet.'}</p>
        )}
        {timeline.map(e =>
          e.kind === 'history' ? (
            <HistoryCluster key={e.items[0].id} items={e.items} ws={ws} />
          ) : (
            <Thread key={e.item.id} comment={e.item} replies={e.replies} detail={detail} replying={replyTo === e.item.id} onReply={setReplyTo} />
          ),
        )}
      </div>
      <div className="mt-4 flex gap-2.5 sm:pl-1">
        <span className="hidden w-7 shrink-0 justify-center pt-1.5 sm:flex">
          <Avatar person={ws.memberById.get(ws.me.id)} size={28} />
        </span>
        <MentionComposer className="min-w-0 flex-1" onSubmit={post} placeholder="Add to the discussion… @ to mention someone" />
      </div>
    </section>
  );
}
