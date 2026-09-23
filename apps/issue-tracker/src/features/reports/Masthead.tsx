import { ArrowUpRight } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { OPEN_STATUS_TYPES } from '../../lib/constants';
import { percent } from '../../lib/format';
import type { IssueFilters, Team } from '../../lib/types';
import { Card, Skeleton } from '../../ui/Layout';
import { cn } from '../../ui/cn';
import { fmt, listLink, signed, type Analytics } from './shared';

type Cell = {
  key: string;
  label: string;
  value: number;
  hint: string;
  tone?: 'danger' | 'warning';
  filters: IssueFilters;
  title: string;
};

const GRID = 'grid grid-cols-2 gap-px bg-line lg:grid-cols-4';

/**
 * The headline counts, set like a newspaper masthead: one sheet ruled into
 * eight cells. Every number opens the list behind it, scoped the same way as
 * the report. Tones colour only the number, and only when it's non-zero — a
 * colour that is always on stops meaning anything.
 */
export function Masthead({ data, weeks, team }: { data: Analytics; weeks: number; team: Team | null }) {
  const s = data.summary;
  const openPoints = data.workload.reduce((sum, w) => sum + w.points, 0);
  const net = s.createdInWindow - s.completedInWindow;
  const perWeek = s.completedInWindow / weeks;
  const scope = (f: IssueFilters): IssueFilters => (team ? { teamIds: [team.id], ...f } : f);
  const titled = (t: string) => (team ? `${t} · ${team.name}` : t);

  const cells: Cell[] = [
    {
      key: 'open', label: 'Open', value: s.open, hint: s.open ? `${fmt(openPoints)} ${openPoints === 1 ? 'point' : 'points'} of work` : 'Nothing open',
      title: titled('Open issues'), filters: scope({ statusTypes: OPEN_STATUS_TYPES }),
    },
    {
      key: 'flight', label: 'In flight', value: s.inProgress, hint: s.inProgress ? `${percent(s.inProgress, s.open)}% of open` : 'Nothing started',
      title: titled('In flight'), filters: scope({ statusTypes: ['started'] }),
    },
    {
      key: 'completed', label: 'Completed', value: s.completedInWindow,
      hint: s.completedInWindow ? `≈ ${perWeek >= 10 ? fmt(perWeek) : Math.round(perWeek * 10) / 10} a week` : `None in ${weeks} weeks`,
      title: titled(`Completed · last ${weeks} weeks`), filters: scope({ statusTypes: ['completed'], completedWithinDays: weeks * 7 }),
    },
    {
      key: 'created', label: 'Created', value: s.createdInWindow,
      hint: s.createdInWindow === 0 ? `None in ${weeks} weeks` : net === 0 ? 'Even with completed' : `${signed(net)} vs completed`,
      title: titled(`Created · last ${weeks} weeks`), filters: scope({ createdWithinDays: weeks * 7 }),
    },
    {
      key: 'overdue', label: 'Overdue', value: s.overdue, hint: s.overdue ? 'Open and past due' : 'Nothing past due',
      tone: s.overdue ? 'danger' : undefined, title: titled('Overdue'), filters: scope({ due: 'overdue' }),
    },
    {
      key: 'blocked', label: 'Blocked', value: s.blocked, hint: s.blocked ? 'Waiting on open blockers' : 'Nothing blocked',
      tone: s.blocked ? 'danger' : undefined, title: titled('Blocked'), filters: scope({ relation: 'blocked', statusTypes: OPEN_STATUS_TYPES }),
    },
    {
      key: 'unassigned', label: 'Unassigned', value: s.unassigned, hint: s.unassigned ? 'Accepted, no owner yet' : 'Everything has an owner',
      title: titled('Unassigned'), filters: scope({ assigneeIds: ['none'], statusTypes: ['backlog', 'unstarted', 'started'] }),
    },
    {
      key: 'urgent', label: 'Urgent', value: s.urgent, hint: s.urgent ? 'Open at urgent priority' : 'Nothing urgent open',
      tone: s.urgent ? 'warning' : undefined, title: titled('Urgent'), filters: scope({ priorities: [1], statusTypes: OPEN_STATUS_TYPES }),
    },
  ];

  return (
    <Card as="section" className="overflow-hidden">
      <h2 className="sr-only">Summary</h2>
      <div className={GRID}>
        {cells.map(c => (
          <Link
            key={c.key}
            to={listLink(c.filters, c.title)}
            aria-label={`${c.label}: ${fmt(c.value)}. ${c.hint}. Open the list.`}
            className="group relative min-w-0 bg-card outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/80"
          >
            <div className="h-full px-4 pb-3.5 pt-3 transition-colors duration-100 group-hover:bg-hover/60 sm:px-5 sm:pb-4 sm:pt-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-micro font-semibold uppercase text-ink-3">{c.label}</span>
                <ArrowUpRight
                  size={14}
                  weight="bold"
                  aria-hidden
                  className="shrink-0 -translate-x-0.5 translate-y-0.5 text-ink-2 opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:translate-x-0 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-60"
                />
              </div>
              <div
                className={cn(
                  'tabular mt-1 font-display text-display',
                  c.tone === 'danger' ? 'text-danger' : c.tone === 'warning' ? 'text-warning' : 'text-ink',
                )}
              >
                {fmt(c.value)}
              </div>
              <div className="mt-0.5 truncate text-meta text-ink-3" title={c.hint}>
                {c.hint}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

export function MastheadSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className={GRID}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="bg-card px-4 pb-4 pt-3.5 sm:px-5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-9 w-14" />
            <Skeleton className="mt-2.5 h-3 w-24" />
          </div>
        ))}
      </div>
    </Card>
  );
}
