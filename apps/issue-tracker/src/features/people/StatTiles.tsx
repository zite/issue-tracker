import { Link } from 'react-router-dom';
import { listLink } from '../../lib/format';
import type { IssueFilters } from '../../lib/types';
import { cn } from '../../ui/cn';
import { Card, Skeleton } from '../../ui/Layout';

export type Stat = {
  label: string;
  /** A lower-case qualifier after the label, e.g. "14d" in "Done · 14d". */
  unit?: string;
  value: number | undefined;
  hint: string;
  loading?: boolean;
  /** The list behind the number. */
  filters: IssueFilters;
  listTitle: string;
};



/**
 * Three numbers in one card, split by hairlines. Each is a link to the issues
 * it counts, so "In flight 4" is one click from those four issues.
 */
export function StatTiles({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <Card className={cn('grid grid-cols-3 divide-x divide-line overflow-hidden', className)}>
      {stats.map(s => (
        <Link
          key={s.label}
          to={listLink(s.filters, s.listTitle)}
          className="group flex min-w-0 flex-col px-3.5 py-3 transition-colors hover:bg-hover/60 focus-visible:-outline-offset-2 sm:px-5 sm:py-3.5"
        >
          <span className="truncate text-micro font-semibold uppercase text-ink-3">
            {s.label}
            {s.unit && <span className="normal-case"> · {s.unit}</span>}
          </span>
          <span className="mt-1 flex h-[38px] items-center">
            {s.loading ? (
              <Skeleton className="h-7 w-10" />
            ) : (
              <span className="tabular font-display text-display leading-none text-ink">{s.value ?? '–'}</span>
            )}
          </span>
          <span className="mt-0.5 truncate text-meta text-ink-3 group-hover:text-ink-2">{s.hint}</span>
        </Link>
      ))}
    </Card>
  );
}
