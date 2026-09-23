import {
  ArrowLeft, ArrowUpRight, Check, CheckCircle, Checks, Clock, DotsThree, EnvelopeOpen, EnvelopeSimple, Tray,
} from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { addDays, addHours, differenceInCalendarDays, format, isThisWeek, nextMonday, parseISO, set as setTime } from 'date-fns';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { updateNotifications } from 'zitejs/api';
import { MarkdownView } from '../editor/MarkdownView';
import { HealthPill, Mark, StatusGlyph } from '../glyphs';
import { IssueDetailView } from '../issue/IssueDetail';
import { errorMessage } from '../lib/errors';
import { timeAgo } from '../lib/format';
import { useHotkeys } from '../lib/hotkeys';
import { actorOf, kindOf, verbFor } from '../lib/notifications';
import { qk, useIssue, useNotifications } from '../lib/queries';
import type { Notification } from '../lib/types';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useWorkspace } from '../lib/workspace';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { Kbd } from '../ui/Kbd';
import { EmptyState, PageHeader, Skeleton } from '../ui/Layout';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '../ui/Menu';
import { Tabs } from '../ui/Tabs';
import { Tooltip } from '../ui/Tooltip';

type Filter = 'inbox' | 'unread' | 'snoozed' | 'archived';
type Group = { key: string; latest: Notification; items: Notification[]; unread: boolean };

function dayBucket(iso: string | null) {
  if (!iso) return 'Earlier';
  const d = parseISO(iso);
  const diff = differenceInCalendarDays(new Date(), d);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (isThisWeek(d, { weekStartsOn: 1 })) return 'Earlier this week';
  return 'Earlier';
}

/** When a snooze ends, said the way people say it: "6 PM", "Tomorrow 9 AM", "Mon 9 AM". `weekday` names tomorrow too. */
function wakeLabel(iso: string | null, weekday = false) {
  if (!iso) return '';
  const d = parseISO(iso);
  const days = differenceInCalendarDays(d, new Date());
  const time = format(d, d.getMinutes() ? 'h:mm a' : 'h a');
  if (days <= 0) return time;
  if (days === 1 && !weekday) return `Tomorrow ${time}`;
  if (days < 7) return `${format(d, 'EEE')} ${time}`;
  return format(d, 'EEE, MMM d');
}

/** The same moment inside a sentence: "back at 6 PM", "back tomorrow at 9 AM". */
function wakePhrase(iso: string) {
  const d = parseISO(iso);
  const days = differenceInCalendarDays(d, new Date());
  const time = format(d, d.getMinutes() ? 'h:mm a' : 'h a');
  if (days <= 0) return `at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  if (days < 7) return `${format(d, 'EEEE')} at ${time}`;
  return `on ${format(d, 'MMM d')}`;
}

function snoozePresets(now = new Date()) {
  const at = (d: Date, h: number) => setTime(d, { hours: h, minutes: 0, seconds: 0, milliseconds: 0 });
  const presets: Array<{ label: string; until: Date }> = [];
  if (now.getHours() < 20) presets.push({ label: 'Later today', until: addHours(now, 3) });
  if (now.getHours() < 16) presets.push({ label: 'This evening', until: at(now, 18) });
  presets.push({ label: 'Tomorrow morning', until: at(addDays(now, 1), 9) });
  // On a Sunday next Monday is tomorrow — "next week" should still mean a week out.
  const monday = nextMonday(now);
  presets.push({ label: 'Next week', until: at(differenceInCalendarDays(monday, now) <= 1 ? addDays(monday, 7) : monday, 9) });
  return presets.map(p => ({
    ...p,
    hours: Math.max(0.25, (p.until.getTime() - now.getTime()) / 3_600_000),
    hint: wakeLabel(p.until.toISOString(), true),
    phrase: wakePhrase(p.until.toISOString()),
  }));
}

/** The sentence a notification reads as — sharper than the kind's generic verb where the record says more. */
function NotificationMark({ n }: { n: Notification }) {
  const ws = useWorkspace();
  const actor = actorOf(ws, n);
  const kind = kindOf(n);
  const KindIcon = kind.icon;
  if (!actor) {
    return (
      <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', kind.tone)} aria-hidden>
        <KindIcon size={15} weight="bold" />
      </span>
    );
  }
  return (
    <span className="relative mt-0.5 h-8 w-8 shrink-0" aria-hidden>
      <Avatar person={actor} size={32} className="!text-[11.5px] tracking-[0.01em]" />
      <span className={cn('absolute -bottom-[5px] -right-[7px] flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-card', kind.tone)}>
        <KindIcon size={9} weight="bold" />
      </span>
    </span>
  );
}

function IssuePane({ n, onDeleted }: { n: Notification; onDeleted: () => void }) {
  // Opened by identifier when there is one, so this shares its cache with lists, the sheet and the page.
  const { data, isPending } = useIssue(n.identifier ?? n.issueId);
  if (isPending) {
    return (
      <div className="space-y-4 p-8">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-4/5" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }
  if (!data) return <EmptyState compact icon={<Tray size={22} weight="duotone" />} title="That issue is gone">It was deleted after this notification arrived. Mark it done to clear it.</EmptyState>;
  return <IssueDetailView key={data.issue.id} detail={data} mode="sheet" onDeleted={onDeleted} />;
}

function CheckInPane({ group }: { group: Group }) {
  const ws = useWorkspace();
  const project = ws.projectById.get(group.latest.projectId ?? '');
  const actor = ws.memberById.get(group.latest.actorId ?? '');
  if (!project) return <EmptyState compact icon={<Tray size={22} weight="duotone" />} title="That project is gone">It was deleted after this check-in was posted.</EmptyState>;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-5 py-8 animate-rise-in sm:px-8 sm:py-10">
        <Link to={`/project/${project.id}`} className="group flex items-center gap-3 rounded-lg border border-line bg-card p-4 shadow-hairline transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-raised">
          <Mark icon={project.icon} color={project.color} name={project.name} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-title font-semibold">{project.name}</span>
              <HealthPill health={project.health} className="text-meta" />
            </div>
            {project.summary && <div className="truncate text-ui text-ink-2">{project.summary}</div>}
          </div>
          <ArrowUpRight size={15} className="shrink-0 text-ink-3 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
        </Link>
        <div className="mt-8 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-ui">
          <Avatar person={actor} size={26} />
          <span className="font-semibold">{actor?.name ?? 'Someone'}</span>
          <span className="text-ink-3">posted a check-in · {timeAgo(group.latest.occurredAt)}</span>
        </div>
        <MarkdownView className="mt-4">{group.latest.body ?? ''}</MarkdownView>
        <Link to={`/project/${project.id}/check-ins`} className="mt-8 inline-flex items-center gap-1 text-ui font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          All check-ins <ArrowUpRight size={12} />
        </Link>
      </div>
    </div>
  );
}

const EMPTY: Record<Filter, { icon: ReactNode; title: string; body: ReactNode }> = {
  inbox: {
    icon: <Check size={22} weight="bold" />,
    title: 'Inbox zero',
    body: 'Mentions, assignments and changes to the issues you follow land here.',
  },
  unread: {
    icon: <Checks size={22} weight="bold" />,
    title: 'Nothing unread',
    body: 'You’ve read everything. What you haven’t marked done is still in For you.',
  },
  snoozed: {
    icon: <Clock size={22} weight="duotone" />,
    title: 'Nothing snoozed',
    body: <>Snooze a notification with <Kbd keys="shift+h" /> and it comes back when you choose.</>,
  },
  archived: {
    icon: <CheckCircle size={22} weight="duotone" />,
    title: 'Nothing done yet',
    body: <>Press <Kbd>E</Kbd> on a notification to clear it from For you. It’s kept here.</>,
  },
};

function ListSkeleton() {
  return (
    <div aria-busy="true">
      <div className="h-[29px] border-b border-line bg-sunken" />
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex gap-3 border-b border-line py-3 pl-5 pr-4">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <Skeleton className="h-3 w-2/5" />
            <div className="skeleton h-3" style={{ width: `${55 + ((i * 23) % 35)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The inbox: a reader. Notifications about one issue fold into a single line,
 * grouped by day; the selected one opens on the right. Getting to zero means
 * marking things done, not deleting them.
 */
export function InboxPage() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const wide = useMediaQuery('(min-width: 1024px)');
  const [filter, setFilter] = useState<Filter>('inbox');
  const { data, isPending, isPlaceholderData } = useNotifications(filter);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [snoozeKey, setSnoozeKey] = useState<string | null>(null);
  // Unread is a snapshot while you're on it: what you read stays put (without its dot) until you leave the tab.
  const [keptRead, setKeptRead] = useState<Map<string, Notification>>(new Map());
  const loading = isPending || isPlaceholderData;
  useDocumentTitle(data?.unreadCount ? `Inbox (${data.unreadCount})` : 'Inbox');

  const groups = useMemo<Group[]>(() => {
    if (isPlaceholderData) return [];
    const map = new Map<string, Group>();
    const fresh = data?.notifications ?? [];
    const present = new Set(fresh.map(n => n.id));
    const all = filter === 'unread' && keptRead.size
      ? [...fresh, ...[...keptRead.values()].filter(n => !present.has(n.id))].sort((a, b) => (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''))
      : fresh;
    for (const n of all) {
      const key = n.issueId ? `i:${n.issueId}` : n.projectId ? `p:${n.projectId}:${n.id}` : `n:${n.id}`;
      const g = map.get(key);
      if (g) {
        g.items.push(n);
        g.unread = g.unread || !n.read;
      } else map.set(key, { key, latest: n, items: [n], unread: !n.read });
    }
    return [...map.values()];
  }, [data, isPlaceholderData, filter, keptRead]);

  const buckets = useMemo(() => {
    const out: Array<{ label: string; groups: Group[] }> = [];
    for (const g of groups) {
      const label = filter === 'snoozed' ? 'Coming back' : dayBucket(g.latest.occurredAt);
      const last = out[out.length - 1];
      if (last?.label === label) last.groups.push(g);
      else out.push({ label, groups: [g] });
    }
    return out;
  }, [groups, filter]);

  const selected = groups.find(g => g.key === selectedKey) ?? null;
  const index = selected ? groups.indexOf(selected) : -1;

  // Wide screens always show something to read: the first item, or whatever was next to the one that left.
  useEffect(() => {
    if (wide && !loading && !selected && groups.length) setSelectedKey(groups[0].key);
  }, [wide, loading, selected, groups]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: qk.bootstrap });
  };

  const mutate = async (targets: Group[], patch: { read?: boolean; archived?: boolean; snoozeHours?: number }, message?: string) => {
    const ids = new Set(targets.flatMap(g => g.items.map(n => n.id)));
    const key = qk.notifications(filter);
    if (filter === 'unread') {
      setKeptRead(prev => {
        const next = new Map(prev);
        for (const g of targets) for (const n of g.items) {
          if (patch.read === true && patch.archived === undefined && patch.snoozeHours === undefined) next.set(n.id, { ...n, read: true });
          else next.delete(n.id);
        }
        return next;
      });
    }
    const previous = qc.getQueryData(key);
    qc.setQueryData(key, (old: typeof data) => {
      if (!old) return old;
      // Done, un-done, snoozed and woken items all leave the tab they were in.
      const leaves = patch.archived !== undefined || patch.snoozeHours !== undefined;
      const readDelta = targets.filter(g => g.unread && patch.read === true).length - targets.filter(g => !g.unread && patch.read === false).length;
      return {
        ...old,
        unreadCount: Math.max(0, old.unreadCount - readDelta),
        notifications: leaves
          ? old.notifications.filter(n => !ids.has(n.id))
          : old.notifications.map(n => (ids.has(n.id) ? { ...n, read: patch.read ?? n.read } : n)),
      };
    });
    try {
      await updateNotifications({ ids: [...ids], ...patch });
      if (message) toast.success(message);
    } catch (e) {
      qc.setQueryData(key, previous);
      toast.error(errorMessage(e, 'Couldn’t update your inbox'));
    } finally {
      refresh();
    }
  };

  /** A notification is leaving the list: keep the reader on its neighbour rather than dropping to nothing. */
  const leave = (g: Group) => {
    if (g.key !== selectedKey) return;
    const i = groups.indexOf(g);
    const next = groups[i + 1] ?? groups[i - 1];
    setSelectedKey(next ? next.key : null);
    if (next?.unread) mutate([next], { read: true });
  };

  const done = (g: Group) => {
    leave(g);
    mutate([g], { archived: filter !== 'archived' }, filter === 'archived' ? 'Back in For you' : undefined);
  };
  const snooze = (g: Group, hours: number, phrase?: string) => {
    leave(g);
    mutate([g], { snoozeHours: hours }, hours === 0 ? 'Back in For you' : `Snoozed — back ${phrase ?? 'later'}`);
  };
  const toggleRead = (g: Group) => mutate([g], { read: g.unread });

  const select = (g: Group) => {
    setSelectedKey(g.key);
    if (g.unread) mutate([g], { read: true });
  };

  const move = (delta: number) => {
    if (!groups.length) return;
    const next = groups[index < 0 ? 0 : Math.max(0, Math.min(groups.length - 1, index + delta))];
    if (next) {
      select(next);
      document.querySelector(`[data-inbox-key="${next.key}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  };

  const markAll = async (patch: { read?: boolean; archived?: boolean; onlyRead?: boolean }, message: string) => {
    try {
      const res = await updateNotifications(patch);
      toast.success(res.updated ? message : 'Nothing to change');
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t update your inbox'));
    } finally {
      refresh();
    }
  };

  useHotkeys({
    j: () => move(1),
    down: () => move(1),
    k: () => move(-1),
    up: () => move(-1),
    e: () => selected && done(selected),
    backspace: () => selected && done(selected),
    u: () => selected && toggleRead(selected),
    'shift+h': () => selected && setSnoozeKey(selected.key),
    'mod+enter': () => {
      if (!selected) return;
      if (selected.latest.identifier) navigate(`/issue/${selected.latest.identifier}`);
      else if (selected.latest.projectId) navigate(`/project/${selected.latest.projectId}/check-ins`);
    },
    // On a phone the reader is a screen of its own; Esc goes back to the list.
    ...(!wide && selected ? { esc: () => setSelectedKey(null) } : {}),
  });

  const snoozeItems = (g: Group) => (
    <>
      <MenuLabel>Snooze until</MenuLabel>
      {snoozePresets().map(p => (
        <MenuItem key={p.label} hint={p.hint} onSelect={() => snooze(g, p.hours, p.phrase)}>
          {p.label}
        </MenuItem>
      ))}
      {filter === 'snoozed' && (
        <>
          <MenuSeparator />
          <MenuItem onSelect={() => snooze(g, 0)}>Bring it back now</MenuItem>
        </>
      )}
    </>
  );

  const actionBtn = 'flex h-7 w-7 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink data-[state=open]:bg-hover data-[state=open]:text-ink';
  const readerOpen = Boolean(selected) && !wide;
  const empty = !loading && groups.length === 0;

  const header = (
    <PageHeader
      title="Inbox"
      description={
        data && !isPlaceholderData
          ? data.unreadCount
            ? <><span className="hl font-medium text-ink">{data.unreadCount} unread</span> · mentions, assignments and changes to what you follow</>
            : 'You’re all caught up.'
          : <span className="invisible">Loading</span>
      }
      actions={
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="sm" icon aria-label="Inbox actions"><DotsThree size={16} weight="bold" /></Button>
          </MenuTrigger>
          <MenuContent align="end" className="w-60">
            <MenuItem icon={<Checks size={15} />} disabled={!data?.unreadCount} onSelect={() => markAll({ read: true }, 'Marked everything read')}>
              Mark everything read
            </MenuItem>
            <MenuItem icon={<CheckCircle size={15} />} onSelect={() => markAll({ archived: true, onlyRead: true }, 'Cleared everything you’ve read')}>
              Mark everything read as done
            </MenuItem>
          </MenuContent>
        </Menu>
      }
      tabs={
        <Tabs
          value={filter}
          onChange={v => {
            setFilter(v as Filter);
            setSelectedKey(null);
            setKeptRead(new Map());
          }}
          items={[
            { value: 'inbox', label: 'For you', count: data?.counts.inbox },
            { value: 'unread', label: 'Unread', count: data?.unreadCount },
            { value: 'snoozed', label: 'Snoozed', count: data?.counts.snoozed },
            { value: 'archived', label: 'Done' },
          ]}
        />
      }
    />
  );

  return (
    <div className="flex h-full flex-col">
      {!readerOpen && header}
      {empty ? (
        <div className="flex min-h-0 flex-1 lg:px-7 lg:pb-6 lg:pt-4">
          <div className="flex w-full items-start justify-center bg-card pt-[8vh] lg:rounded-lg lg:border lg:border-line lg:shadow-hairline">
            <EmptyState icon={EMPTY[filter].icon} title={EMPTY[filter].title}>{EMPTY[filter].body}</EmptyState>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-0 lg:gap-4 lg:px-7 lg:pb-6 lg:pt-4">
          <div className={cn('flex w-full flex-col overflow-hidden bg-card lg:w-[420px] lg:shrink-0 lg:rounded-lg lg:border lg:border-line lg:shadow-hairline', readerOpen && 'hidden')}>
            {/* Not role="listbox": the shortcut layer treats any listbox on the page as an open picker. */}
            <div className="min-h-0 flex-1 overflow-y-auto" aria-label="Notifications">
              {loading ? (
                <ListSkeleton />
              ) : (
                buckets.map(b => (
                  <div key={b.label}>
                    <div className="sticky top-0 z-10 border-b border-line bg-sunken px-4 py-1.5 text-micro font-semibold uppercase text-ink-3">{b.label}</div>
                    {b.groups.map(g => {
                      const n = g.latest;
                      const actor = actorOf(ws, n);
                      const status = n.statusId ? ws.statusById.get(n.statusId) : undefined;
                      const project = n.projectId ? ws.projectById.get(n.projectId) : undefined;
                      const verb = verbFor(n);
                      const active = g.key === selectedKey;
                      const subject = n.issueTitle ?? project?.name ?? n.name;
                      return (
                        <div
                          key={g.key}
                          data-inbox-key={g.key}
                          aria-current={active || undefined}
                          onClick={() => select(g)}
                          className={cn('group relative flex cursor-default gap-3 border-b border-line py-3 pl-5 pr-4 transition-colors', active ? 'bg-highlight/30 dark:bg-highlight/[0.10]' : 'hover:bg-paper/80 dark:hover:bg-hover/50')}
                        >
                          {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-ink" />}
                          {g.unread && <span className="absolute left-2 top-[25px] h-1.5 w-1.5 rounded-full bg-signal" aria-label="Unread" />}
                          <NotificationMark n={n} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className={cn('min-w-0 truncate text-ui', g.unread ? 'text-ink' : 'text-ink-2')}>
                                {actor ? (
                                  <>
                                    <span className={cn(g.unread ? 'font-semibold' : 'font-medium', 'text-ink')}>{actor.id === ws.me.id ? 'You' : actor.name.split(' ')[0]}</span> {verb}
                                  </>
                                ) : (
                                  <span className={cn('font-semibold', /overdue/i.test(verb) ? 'text-danger' : 'text-ink')}>{verb}</span>
                                )}
                              </span>
                              {g.items.length > 1 && (
                                <Tooltip content={`${g.items.length} notifications about this`}>
                                  <span className="tabular shrink-0 rounded-full bg-sunken px-1.5 text-micro font-semibold text-ink-2">+{g.items.length - 1}</span>
                                </Tooltip>
                              )}
                              <span className="ml-auto shrink-0 text-meta text-ink-3">
                                {filter === 'snoozed' && n.snoozedUntil ? (
                                  <span className="inline-flex items-center gap-1"><Clock size={11} />{wakeLabel(n.snoozedUntil)}</span>
                                ) : (
                                  timeAgo(n.occurredAt).replace(' ago', '')
                                )}
                              </span>
                            </div>
                            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-meta text-ink-2">
                              {status && <StatusGlyph status={status} siblings={ws.statusesByTeam.get(status.teamId ?? '')} size={12} />}
                              {project && !n.issueId && <Mark icon={project.icon} color={project.color} name={project.name} size={14} />}
                              {n.identifier && <span className="shrink-0 font-mono text-[11px] text-ink-3">{n.identifier}</span>}
                              <span title={subject ?? undefined} className={cn('truncate', g.unread && 'font-medium text-ink')}>{subject}</span>
                            </div>
                            {n.body && ['mentioned', 'commented', 'check_in', 'reaction'].includes(n.type) && (
                              <p className="mt-1 line-clamp-2 text-meta text-ink-3">{n.body}</p>
                            )}
                          </div>
                          <div className={cn('absolute right-3 top-2 hidden items-center gap-0.5 rounded-md border border-line bg-card p-0.5 shadow-raised has-[[data-state=open]]:flex', wide && 'group-hover:flex')}>
                            <Tooltip content={g.unread ? 'Mark read' : 'Mark unread'} shortcut="u">
                              <button type="button" className={actionBtn} onClick={e => { e.stopPropagation(); toggleRead(g); }} aria-label={g.unread ? 'Mark read' : 'Mark unread'}>
                                {g.unread ? <EnvelopeOpen size={15} /> : <EnvelopeSimple size={15} />}
                              </button>
                            </Tooltip>
                            <Menu open={snoozeKey === g.key} onOpenChange={o => setSnoozeKey(o ? g.key : null)}>
                              <MenuTrigger asChild>
                                <button type="button" className={actionBtn} onClick={e => e.stopPropagation()} aria-label="Snooze" title="Snooze (⇧H)">
                                  <Clock size={15} />
                                </button>
                              </MenuTrigger>
                              <MenuContent align="end" className="w-60" onClick={e => e.stopPropagation()}>
                                {snoozeItems(g)}
                              </MenuContent>
                            </Menu>
                            <Tooltip content={filter === 'archived' ? 'Back to For you' : 'Done'} shortcut="e">
                              <button type="button" className={cn(actionBtn, 'hover:text-success')} onClick={e => { e.stopPropagation(); done(g); }} aria-label={filter === 'archived' ? 'Back to For you' : 'Done'}>
                                <Check size={15} weight="bold" />
                              </button>
                            </Tooltip>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            {groups.length > 0 && (
              <div className="hidden shrink-0 items-center gap-3 border-t border-line bg-paper/70 px-4 py-2 text-meta text-ink-3 lg:flex dark:bg-paper/30">
                <span className="flex items-center gap-1"><Kbd>J</Kbd><Kbd>K</Kbd> move</span>
                <span className="flex items-center gap-1"><Kbd>E</Kbd> done</span>
                <span className="flex items-center gap-1"><Kbd>U</Kbd> unread</span>
                <span className="flex items-center gap-1"><Kbd keys="shift+h" /> snooze</span>
              </div>
            )}
          </div>
          <div className={cn('min-w-0 flex-1 overflow-hidden bg-card lg:rounded-lg lg:border lg:border-line lg:shadow-hairline', !selected && !wide && 'hidden')}>
            {selected ? (
              <div className="flex h-full flex-col">
                {!wide && (
                  <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-paper px-2">
                    <Button variant="ghost" size="sm" leading={<ArrowLeft size={14} />} onClick={() => setSelectedKey(null)}>
                      Inbox
                    </Button>
                    <div className="ml-auto flex items-center gap-0.5">
                      <Button variant="ghost" size="sm" icon aria-label={selected.unread ? 'Mark read' : 'Mark unread'} onClick={() => toggleRead(selected)}>
                        {selected.unread ? <EnvelopeOpen size={16} /> : <EnvelopeSimple size={16} />}
                      </Button>
                      <Menu>
                        <MenuTrigger asChild>
                          <Button variant="ghost" size="sm" icon aria-label="Snooze"><Clock size={16} /></Button>
                        </MenuTrigger>
                        <MenuContent align="end" className="w-60">{snoozeItems(selected)}</MenuContent>
                      </Menu>
                      <Button variant="secondary" size="sm" leading={<Check size={14} weight="bold" />} onClick={() => done(selected)}>
                        {filter === 'archived' ? 'Not done' : 'Done'}
                      </Button>
                    </div>
                  </div>
                )}
                <div className="min-h-0 flex-1">
                  {selected.latest.issueId ? <IssuePane n={selected.latest} onDeleted={() => done(selected)} /> : <CheckInPane group={selected} />}
                </div>
              </div>
            ) : loading ? (
              <div className="space-y-4 p-8">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-9 w-3/5" />
                <Skeleton className="h-28 w-full rounded-lg" />
              </div>
            ) : (
              <EmptyState icon={<Tray size={22} weight="duotone" />} title="Pick something to read" className="h-full">
                Use <Kbd>J</Kbd> and <Kbd>K</Kbd> to move through your inbox.
              </EmptyState>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
