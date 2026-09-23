import { ArrowRight, CheckCircle, Coffee, PushPin, Tray, TrayArrowDown } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useMemo, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { listSprints } from 'zitejs/api';
import { Mark, SprintGlyph } from '../glyphs';
import { IssueMiniRow } from '../issues/IssueMiniRow';
import { IssuesView } from '../issues/IssuesView';
import { useAppActions } from '../lib/app-actions';
import { daysBetween, plural, timeAgo, todayString } from '../lib/format';
import { actorOf, verbFor } from '../lib/notifications';
import { useIssues, useNotifications } from '../lib/queries';
import type { Issue, IssueFilters } from '../lib/types';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useWorkspace } from '../lib/workspace';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/Kbd';
import { cn } from '../ui/cn';
import { Card, EmptyState, PageBody, PageHeader, Skeleton } from '../ui/Layout';
import { ProgressBar } from '../ui/Progress';
import { Tabs } from '../ui/Tabs';

const TABS = ['assigned', 'created', 'subscribed'] as const;

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function Panel({ title, count, action, children, className }: { title: string; count?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex h-11 items-center gap-2 border-b border-line px-4">
        <h2 className="text-title font-semibold">{title}</h2>
        {count != null && <span className="tabular text-ui text-ink-3">{count}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </Card>
  );
}

function Rows({ issues, loading, empty, showAssignee, limit = 8 }: { issues: Issue[]; loading: boolean; empty: ReactNode; showAssignee?: boolean; limit?: number }) {
  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-4" />)}
      </div>
    );
  }
  if (!issues.length) return <div className="px-4 py-6 text-ui text-ink-3">{empty}</div>;
  return (
    <div>
      {issues.slice(0, limit).map(i => <IssueMiniRow key={i.id} issue={i} showAssignee={showAssignee} />)}
    </div>
  );
}

function SprintPulse() {
  const ws = useWorkspace();
  const me = ws.memberById.get(ws.me.id);
  const { data } = useQuery({ queryKey: ['sprints', 'all'], queryFn: () => listSprints({}), staleTime: 30_000 });
  const teams = ws.teams.filter(t => t.sprintsEnabled && (!me || me.teamIds.includes(t.id)));
  const today = todayString();
  if (!teams.length) return null;
  return (
    <Panel title="Sprint pulse">
      <div className="divide-y divide-line">
        {teams.map(t => {
          const s = data?.sprints.find(x => x.teamId === t.id && x.status === 'active');
          if (!s) {
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 text-ui">
                <Mark icon={t.icon} color={t.color} name={t.name} size={22} />
                <span className="flex-1 text-ink-2">{t.name}</span>
                <span className="text-meta text-ink-3">No sprint running</span>
              </div>
            );
          }
          const total = s.startDate && s.endDate ? Math.max(1, daysBetween(s.startDate, s.endDate)) : 1;
          const left = s.endDate ? Math.max(0, daysBetween(today, s.endDate)) : 0;
          const pct = s.points ? s.completedPoints / s.points : 0;
          const timePct = 1 - left / total;
          return (
            <Link key={t.id} to={`/sprint/${s.id}`} className="block px-4 py-3 transition-colors hover:bg-paper/80 dark:hover:bg-hover/50">
              <div className="flex items-center gap-2.5">
                <Mark icon={t.icon} color={t.color} name={t.name} size={22} />
                <span className="min-w-0 flex-1 truncate text-ui font-semibold">{t.name} · {s.name}</span>
                <span className={cn('tabular text-meta', left <= 2 ? 'font-medium text-warning' : 'text-ink-3')}>{plural(left, 'day')} left</span>
              </div>
              <div className="mt-2.5 flex items-center gap-3">
                <ProgressBar value={s.completedPoints} max={Math.max(1, s.points)} tone="success" height={6} />
                <span className="tabular w-10 shrink-0 text-right text-meta font-medium text-ink">{Math.round(pct * 100)}%</span>
              </div>
              <div className="mt-1 text-meta text-ink-3">
                {s.completedPoints} of {s.points} pts done · {Math.round(timePct * 100)}% of the time gone
                {pct + 0.15 < timePct && <span className="ml-1 font-medium text-warning">· behind</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}

function InboxPeek() {
  const ws = useWorkspace();
  const app = useAppActions();
  const { data, isPending } = useNotifications('unread');
  const items = (data?.notifications ?? []).slice(0, 5);
  return (
    <Panel
      title="Inbox"
      count={data?.unreadCount ? `${data.unreadCount} unread` : undefined}
      action={<Link to="/inbox" className="flex items-center gap-1 text-meta font-medium text-ink-2 hover:text-ink">Open <ArrowRight size={12} /></Link>}
    >
      {isPending ? (
        <div className="space-y-3 p-4"><Skeleton className="h-4" /><Skeleton className="h-4" /></div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-5 text-ui text-ink-3"><CheckCircle size={16} className="text-success" /> You’re all caught up.</div>
      ) : (
        <div className="divide-y divide-line">
          {items.map(n => {
            const actor = actorOf(ws, n);
            return (
              <button key={n.id} type="button" onClick={() => (n.identifier ? app.openPeek(n.identifier) : undefined)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-paper/80 dark:hover:bg-hover/50">
                <Avatar person={actor} size={22} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui">
                    {actor ? <><span className="font-medium">{actor.name.split(' ')[0]}</span> <span className="text-ink-2">{verbFor(n)}</span></> : <span className="font-medium">{verbFor(n)}</span>}
                  </span>
                  <span className="block truncate text-meta text-ink-3">{n.identifier ? `${n.identifier} · ${n.issueTitle}` : n.body}</span>
                </span>
                <span className="shrink-0 text-meta text-ink-3">{timeAgo(n.occurredAt).replace(' ago', '')}</span>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function Pins() {
  const ws = useWorkspace();
  const app = useAppActions();
  if (!ws.pins.length) return null;
  return (
    <Panel title="Pinned" count={ws.pins.length}>
      <div className="flex flex-col p-1.5">
        {ws.pins.map(p => {
          let icon: ReactNode = <PushPin size={15} className="text-ink-3" />;
          let label = '';
          let to: string | null = null;
          if (p.entityType === 'Project') {
            const x = ws.projectById.get(p.entityId);
            if (!x) return null;
            icon = <Mark icon={x.icon} color={x.color} name={x.name} size={18} />;
            label = x.name;
            to = `/project/${x.id}`;
          } else if (p.entityType === 'Goal') {
            const x = ws.goalById.get(p.entityId);
            if (!x) return null;
            icon = <Mark icon={x.icon} color={x.color} name={x.name} size={18} />;
            label = x.name;
            to = `/goal/${x.id}`;
          } else if (p.entityType === 'View') {
            const x = ws.viewById.get(p.entityId);
            if (!x) return null;
            icon = <Mark icon={x.icon} color={x.color} name={x.name} size={18} />;
            label = x.name;
            to = `/view/${x.id}`;
          } else if (p.entityType === 'Sprint') {
            const x = ws.sprintById.get(p.entityId);
            if (!x) return null;
            icon = <SprintGlyph status={x.status} progress={0.5} size={16} />;
            label = `${ws.teamById.get(x.teamId ?? '')?.key ?? ''} ${x.name}`;
            to = `/sprint/${x.id}`;
          } else if (p.entityType === 'Issue') {
            label = p.issueIdentifier ? `${p.issueIdentifier} · ${p.issueTitle ?? ''}` : 'Issue';
          }
          const cls = 'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-ui text-ink hover:bg-sunken';
          return to ? (
            <Link key={p.id} to={to} className={cls}>{icon}<span className="truncate">{label}</span></Link>
          ) : (
            <button key={p.id} type="button" onClick={() => p.issueIdentifier && app.openPeek(p.issueIdentifier)} className={cls}>{icon}<span className="truncate">{label}</span></button>
          );
        })}
      </div>
    </Panel>
  );
}

function Today() {
  const ws = useWorkspace();
  const app = useAppActions();
  const me = ws.me.id;
  const inFlight = useIssues({ assigneeIds: [me], statusTypes: ['started'] }, 'priority');
  // Everything assigned and not started — planned work first, then backlog you've taken on.
  const upNext = useIssues({ assigneeIds: [me], statusTypes: ['unstarted', 'backlog'] }, 'priority', { limit: 12 });
  const upNextSorted = useMemo(
    () => [...(upNext.data?.issues ?? [])].sort((a, b) => Number(ws.statusOf(a)?.type === 'backlog') - Number(ws.statusOf(b)?.type === 'backlog')),
    [upNext.data, ws],
  );
  const overdue = useIssues({ assigneeIds: [me], due: 'overdue' }, 'due');
  const blocked = useIssues({ assigneeIds: [me], relation: 'blocked', statusTypes: ['backlog', 'unstarted', 'started'] }, 'priority');
  const dueSoon = useIssues({ assigneeIds: [me], due: 'week', statusTypes: ['backlog', 'unstarted', 'started'] }, 'due');
  const myTeams = ws.memberById.get(me)?.teamIds ?? [];
  const intake = Object.entries(ws.counts.intakeByTeam).filter(([t, n]) => n > 0 && myTeams.includes(t));
  // Someone with nothing on their plate (a new teammate, or a clear week) sees work they could pick up.
  const clearDesk = !inFlight.isPending && !upNext.isPending && !inFlight.data?.total && !upNext.data?.total;
  const grabs = useIssues(
    { assigneeIds: ['none'], statusTypes: ['unstarted', 'backlog'], teamIds: myTeams.length ? myTeams : undefined, topLevelOnly: true },
    'priority',
    { limit: 6, enabled: clearDesk },
  );

  const attention = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ issue: Issue; why: string }> = [];
    for (const i of overdue.data?.issues ?? []) if (!seen.has(i.id)) { seen.add(i.id); out.push({ issue: i, why: 'Overdue' }); }
    for (const i of blocked.data?.issues ?? []) if (!seen.has(i.id)) { seen.add(i.id); out.push({ issue: i, why: 'Blocked' }); }
    for (const i of dueSoon.data?.issues ?? []) if (!seen.has(i.id)) { seen.add(i.id); out.push({ issue: i, why: 'Due soon' }); }
    return out;
  }, [overdue.data, blocked.data, dueSoon.data]);

  return (
    <PageBody className="grid gap-4 pb-16 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-4">
        {(attention.length > 0 || intake.length > 0) && (
          <Panel title="Needs you" count={attention.length + intake.length} className="border-warning/30">
            {intake.map(([teamId, n]) => {
              const t = ws.teamById.get(teamId);
              return t ? (
                <Link key={teamId} to={`/${t.key.toLowerCase()}/intake`} className="flex min-h-11 items-center gap-3 border-b border-line px-4 py-2 text-ui transition-colors hover:bg-paper/80 dark:hover:bg-hover/50">
                  <TrayArrowDown size={16} className="text-signal" />
                  <span className="flex-1"><span className="font-medium">{plural(n, 'report')}</span> waiting in {t.name} intake</span>
                  <span className="flex items-center gap-1 text-meta font-medium text-ink-2">Review <ArrowRight size={12} /></span>
                </Link>
              ) : null;
            })}
            {attention.slice(0, 6).map(({ issue, why }) => (
              <IssueMiniRow key={issue.id} issue={issue} trailing={why === 'Blocked' ? undefined : <span className={cn('rounded-full px-1.5 text-micro font-semibold uppercase', why === 'Overdue' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning')}>{why}</span>} />
            ))}
          </Panel>
        )}
        {clearDesk ? (
          <Panel title="Up for grabs" count={grabs.data?.total || undefined} action={<Link to={myTeams.length === 1 ? `/${ws.teamById.get(myTeams[0])?.key.toLowerCase() ?? 'all'}/issues/backlog` : '/all/issues/backlog'} className="flex items-center gap-1 text-meta font-medium text-ink-2 hover:text-ink">Backlog <ArrowRight size={12} /></Link>}>
            {grabs.isPending ? (
              <Rows issues={[]} loading empty="" />
            ) : grabs.data?.issues.length ? (
              <>
                <p className="border-b border-line bg-paper/60 px-4 py-2.5 text-ui text-ink-2 dark:bg-sunken/60">
                  Nothing has your name on it yet. These are unassigned in your teams, most urgent first — open one and press <Kbd>I</Kbd> to take it.
                </p>
                <Rows issues={grabs.data.issues} loading={false} empty="" showAssignee={false} limit={6} />
              </>
            ) : (
              <EmptyState compact icon={<Coffee size={22} weight="duotone" />} title="Your desk is clear" actions={<Button variant="primary" onClick={() => app.openCreateIssue()}>New issue <Kbd tone="inverse">C</Kbd></Button>}>
                Nothing is assigned to you and nothing in your teams is waiting for an owner.
              </EmptyState>
            )}
          </Panel>
        ) : (
          <>
            <Panel title="In flight" count={inFlight.data?.total} action={<Link to="/home/assigned" className="flex items-center gap-1 text-meta font-medium text-ink-2 hover:text-ink">All my issues <ArrowRight size={12} /></Link>}>
              <Rows issues={inFlight.data?.issues ?? []} loading={inFlight.isPending} empty="Nothing in flight. Pick something from up next." />
            </Panel>
            <Panel title="Up next" count={upNext.data?.total}>
              <Rows issues={upNextSorted} loading={upNext.isPending} empty={<span className="inline-flex items-center gap-2"><Coffee size={16} /> Your queue is empty.</span>} limit={6} />
            </Panel>
          </>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <SprintPulse />
        <InboxPeek />
        <Pins />
      </div>
    </PageBody>
  );
}

export function HomePage() {
  const { tab } = useParams();
  const ws = useWorkspace();
  const firstName = ws.me.name.split(' ')[0];
  useDocumentTitle(tab === 'assigned' ? 'Assigned to me' : tab === 'created' ? 'Created by me' : tab === 'subscribed' ? 'Following' : 'Home');
  const overdue = useIssues({ assigneeIds: [ws.me.id], due: 'overdue' }, 'due', { limit: 1 });
  const inFlight = useIssues({ assigneeIds: [ws.me.id], statusTypes: ['started'] }, 'priority', { limit: 1 });

  if (tab && !TABS.includes(tab as (typeof TABS)[number])) return <Navigate to="/home" replace />;

  const base: IssueFilters | null = tab === 'assigned' ? { assigneeIds: [ws.me.id] } : tab === 'created' ? { creatorIds: [ws.me.id] } : tab === 'subscribed' ? { subscriberIds: [ws.me.id] } : null;
  const overdueCount = overdue.data?.total ?? 0;

  return (
    <div className={cn(base && 'flex h-full flex-col')}>
      {/* One header for every tab, so switching Today → Assigned only swaps what's below it. */}
      <PageHeader
        eyebrow={<span className="font-medium text-ink-2">{format(new Date(), 'EEEE, MMMM d')}</span>}
        title={`${greeting()}, ${firstName}`}
        description={
          <>
            {inFlight.data && !inFlight.data.total ? (ws.counts.myOpen ? 'Nothing in flight' : 'Nothing assigned to you yet') : `${plural(inFlight.data?.total ?? 0, 'issue')} in flight`}
            {overdueCount > 0 && <> · <span className="hl font-medium text-ink">{overdueCount} overdue</span></>}
            {ws.counts.inboxUnread > 0 && <> · {ws.counts.inboxUnread} unread in your inbox</>}
          </>
        }
        tabs={
          <Tabs
            value={tab ?? 'today'}
            items={[
              { value: 'today', label: 'Today', to: '/home' },
              { value: 'assigned', label: 'Assigned', count: ws.counts.myOpen, to: '/home/assigned' },
              { value: 'created', label: 'Created', to: '/home/created' },
              { value: 'subscribed', label: 'Following', to: '/home/subscribed' },
            ]}
          />
        }
      />
      {base ? (
        <IssuesView
          key={tab}
          fill
          surfaceKey={`home:${tab}`}
          baseFilters={base}
          lockedFields={tab === 'assigned' ? ['assigneeIds'] : tab === 'created' ? ['creatorIds'] : []}
          defaults={{ grouping: 'status', ordering: 'priority', completed: 'week' }}
          createDefaults={tab === 'assigned' ? { assigneeId: ws.me.id } : undefined}
          emptyState={
            <EmptyState compact icon={<Tray size={22} weight="duotone" />} title={tab === 'assigned' ? 'Nothing assigned to you' : tab === 'created' ? 'You haven’t filed anything yet' : 'You’re not following anything'}>
              {tab === 'subscribed' ? 'Follow an issue from its discussion to hear about every change.' : 'Press C to file an issue.'}
            </EmptyState>
          }
        />
      ) : (
        <Today />
      )}
    </div>
  );
}
