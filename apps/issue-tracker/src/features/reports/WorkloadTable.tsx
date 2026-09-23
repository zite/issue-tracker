import { CaretDown, CaretRight, CaretUp } from '@phosphor-icons/react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Member } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Avatar, Unassigned } from '../../ui/Avatar';
import { Skeleton } from '../../ui/Layout';
import { cn } from '../../ui/cn';
import { AsideNote, CardEmpty, Meter, ReportCard, fmt, ptsOf, type Analytics } from './shared';

type SortKey = 'name' | 'open' | 'started' | 'points' | 'overdue' | 'completedInWindow';
type Load = Analytics['workload'][number];
type Row = Load & { name: string; member?: Member };

const COLS = 'grid grid-cols-[minmax(180px,1.6fr)_repeat(2,minmax(64px,0.5fr))_minmax(150px,1.1fr)_repeat(2,minmax(72px,0.5fr))] items-center gap-x-3';

/**
 * Who is carrying what. The unassigned row is pinned last whatever the sort —
 * it isn't a person competing for the top of the list, it's work nobody owns.
 */
export function WorkloadTable({ data, weeks, className }: { data: Analytics; weeks: number; className?: string }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'points', dir: 'desc' });

  const { people, unassigned, maxPoints } = useMemo(() => {
    // People with nothing open and nothing finished in the window add rows without adding information.
    const active = data.workload.filter(w => w.open > 0 || w.started > 0 || w.completedInWindow > 0);
    const named: Row[] = active
      .filter(w => w.assigneeId)
      .map(w => {
        const member = ws.memberById.get(w.assigneeId!);
        return { ...w, member, name: member?.name ?? 'Former member' };
      });
    const none = active.find(w => !w.assigneeId);
    const dir = sort.dir === 'asc' ? 1 : -1;
    named.sort((a, b) => {
      const primary = sort.key === 'name' ? a.name.localeCompare(b.name) : a[sort.key] - b[sort.key];
      return primary * dir || b.points - a.points || a.name.localeCompare(b.name);
    });
    return { people: named, unassigned: none ? ({ ...none, name: 'Unassigned' } as Row) : undefined, maxPoints: Math.max(1, ...active.map(w => w.points)) };
  }, [data.workload, ws.memberById, sort]);

  const toggle = (key: SortKey) =>
    setSort(prev => (prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

  const rows = unassigned ? [...people, unassigned] : people;
  const total = rows.reduce(
    (t, r) => ({ open: t.open + r.open, started: t.started + r.started, points: t.points + r.points, overdue: t.overdue + r.overdue, done: t.done + r.completedInWindow }),
    { open: 0, started: 0, points: 0, overdue: 0, done: 0 },
  );

  // A render function, not a component: a component defined here would remount on every sort and drop focus.
  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => {
    const on = sort.key === key;
    const Caret = sort.dir === 'desc' ? CaretDown : CaretUp;
    return (
      <div role="columnheader" aria-sort={on ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'} className={cn('min-w-0', align === 'right' && 'text-right')}>
        <button
          type="button"
          onClick={() => toggle(key)}
          className={cn(
            'relative -mx-1 inline-flex h-6 items-center rounded-xs px-1 text-micro font-semibold uppercase transition-colors hover:text-ink',
            on ? 'text-ink' : 'text-ink-3',
          )}
        >
          {label}
          {/* The caret hangs outside the label so right-aligned headings stay flush with their numbers. */}
          {on && <Caret size={10} weight="bold" aria-hidden className={cn('absolute top-1/2 -translate-y-1/2', align === 'right' ? '-left-2.5' : '-right-2.5')} />}
        </button>
      </div>
    );
  };

  const open = (r: Row) => r.member && navigate(`/people/${r.member.id}`);
  const onKey = (r: Row) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open(r);
    }
  };

  const who = (r: Row, size: number) => (
    <div className="flex min-w-0 items-center gap-2.5">
      {r.member ? <Avatar person={r.member} size={size} /> : <Unassigned size={size} />}
      <span className={cn('truncate', r.member ? 'text-ink' : 'text-ink-2')}>
        {r.name}
        {r.member?.id === ws.me.id && <span className="text-ink-3"> (you)</span>}
      </span>
      {r.member?.status === 'Deactivated' && <span className="shrink-0 rounded-xs bg-sunken px-1 text-micro text-ink-3">Deactivated</span>}
      {r.member?.jobTitle && <span className="hidden min-w-0 truncate text-meta text-ink-3 2xl:inline">{r.member.jobTitle}</span>}
    </div>
  );

  return (
    <ReportCard
      title="Workload"
      description="Open work by assignee, not counting intake. Select someone to see their issues."
      className={className}
      bodyClassName="px-0 pb-2 sm:px-0 sm:pb-2"
      aside={people.length > 0 && <AsideNote>{people.length === 1 ? '1 person' : `${people.length} people`}</AsideNote>}
    >
      {rows.length === 0 ? (
        <div className="px-4 pb-2 sm:px-5">
          <CardEmpty className="h-36" title="No assigned work">
            Nothing open or recently completed has an assignee.
          </CardEmpty>
        </div>
      ) : (
        <>
          {/* Desktop: a sortable ledger. */}
          <div role="table" aria-label="Workload" className="hidden sm:block">
            <div role="rowgroup">
              <div role="row" className={cn(COLS, 'h-8 border-y border-line bg-sunken px-5')}>
                {header('name', 'Assignee', 'left')}
                {header('open', 'Open')}
                {header('started', 'In flight')}
                {header('points', 'Open points')}
                {header('overdue', 'Overdue')}
                {header('completedInWindow', `Done · ${weeks}w`)}
              </div>
            </div>
            <div role="rowgroup">
              {rows.map(r => {
                const linkable = Boolean(r.member);
                return (
                  <div
                    key={r.assigneeId ?? 'unassigned'}
                    role="row"
                    tabIndex={linkable ? 0 : undefined}
                    aria-label={linkable ? `${r.name}: open their profile` : undefined}
                    onClick={linkable ? () => open(r) : undefined}
                    onKeyDown={linkable ? onKey(r) : undefined}
                    className={cn(
                      COLS,
                      'h-10 border-b border-line px-5 text-ui last:border-b-0',
                      linkable ? 'cursor-pointer transition-colors hover:bg-hover/60 focus-visible:bg-hover/60 focus-visible:outline-offset-[-2px]' : 'bg-sunken/40',
                    )}
                  >
                    <div role="cell" className="min-w-0">{who(r, 22)}</div>
                    <div role="cell" className="tabular text-right text-ink">{fmt(r.open)}</div>
                    <div role="cell" className={cn('tabular text-right', r.started ? 'text-ink' : 'text-ink-3')}>{fmt(r.started)}</div>
                    <div role="cell" className="flex min-w-0 items-center gap-2.5">
                      <Meter value={r.points} max={maxPoints} fillClassName={r.member ? 'bg-ink' : 'bg-line-strong'} />
                      <span className="tabular w-8 shrink-0 text-right text-ink">{fmt(r.points)}</span>
                    </div>
                    <div role="cell" className={cn('tabular text-right', r.overdue ? 'font-semibold text-danger' : 'text-ink-3')}>{fmt(r.overdue)}</div>
                    <div role="cell" className={cn('tabular text-right', r.completedInWindow ? 'text-ink' : 'text-ink-3')}>{fmt(r.completedInWindow)}</div>
                  </div>
                );
              })}
            </div>
            <div role="rowgroup">
              <div role="row" className={cn(COLS, 'h-10 border-t border-line-strong px-5 text-ui')}>
                <div role="rowheader" className="flex min-w-0 items-baseline gap-2">
                  <span className="font-semibold text-ink">Total</span>
                  <span className="truncate text-meta text-ink-3">not counting intake</span>
                </div>
                <div role="cell" className="tabular text-right font-semibold text-ink">{fmt(total.open)}</div>
                <div role="cell" className="tabular text-right font-semibold text-ink">{fmt(total.started)}</div>
                <div role="cell" className="tabular text-right font-semibold text-ink">{fmt(total.points)}</div>
                <div role="cell" className={cn('tabular text-right font-semibold', total.overdue ? 'text-danger' : 'text-ink-3')}>{fmt(total.overdue)}</div>
                <div role="cell" className="tabular text-right font-semibold text-ink">{fmt(total.done)}</div>
              </div>
            </div>
          </div>

          {/* Mobile: the same rows, stacked. */}
          <ul className="border-t border-line sm:hidden">
            {rows.map(r => {
              const linkable = Boolean(r.member);
              const facts = [`${fmt(r.open)} open`, `${fmt(r.started)} in flight`, `${fmt(r.completedInWindow)} done in ${weeks}w`];
              return (
                <li key={r.assigneeId ?? 'unassigned'} className="border-b border-line last:border-b-0">
                  <div
                    role={linkable ? 'link' : undefined}
                    tabIndex={linkable ? 0 : undefined}
                    onClick={linkable ? () => open(r) : undefined}
                    onKeyDown={linkable ? onKey(r) : undefined}
                    className={cn('flex flex-col gap-1.5 px-4 py-3 text-ui', linkable ? 'cursor-pointer active:bg-hover/60' : 'bg-sunken/40')}
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">{who(r, 22)}</div>
                      <span className="tabular shrink-0 text-ink">{ptsOf(r.points)}</span>
                      {linkable && <CaretRight size={12} className="shrink-0 text-ink-3" aria-hidden />}
                    </div>
                    <Meter value={r.points} max={maxPoints} fillClassName={r.member ? 'bg-ink' : 'bg-line-strong'} />
                    <div className="tabular text-meta text-ink-3">
                      {facts.join(' · ')}
                      {r.overdue > 0 && <span className="font-semibold text-danger"> · {fmt(r.overdue)} overdue</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="tabular border-t border-line-strong px-4 pb-1 pt-2.5 text-meta text-ink-3 sm:hidden">
            <span className="font-semibold text-ink">Total</span> · {fmt(total.open)} open · {fmt(total.started)} in flight · {fmt(total.points)} pts ·{' '}
            {fmt(total.done)} done
          </p>
        </>
      )}
    </ReportCard>
  );
}

export function WorkloadSkeleton({ className }: { className?: string }) {
  return (
    <ReportCard title="Workload" description="Open work by assignee, not counting intake." className={className} bodyClassName="px-0 pb-2 sm:px-0 sm:pb-2">
      <div className="h-8 border-y border-line bg-sunken" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex h-10 items-center gap-3 border-b border-line px-5 last:border-b-0">
          <Skeleton className="h-[22px] w-[22px] rounded-full" />
          <Skeleton className="h-3 w-28" />
          <div className="ml-auto flex items-center gap-8">
            <Skeleton className="h-3 w-5" />
            <Skeleton className="hidden h-3 w-5 sm:block" />
            <Skeleton className="h-1.5 w-28 rounded-full" />
            <Skeleton className="hidden h-3 w-5 sm:block" />
            <Skeleton className="h-3 w-5" />
          </div>
        </div>
      ))}
    </ReportCard>
  );
}
