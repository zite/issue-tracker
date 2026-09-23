import type { ReactNode } from 'react';
import { daysBetween, percent, plural, shortDate, todayString } from '../../lib/format';
import type { SprintDetail } from '../../lib/types';
import { cn } from '../../ui/cn';
import { Card } from '../../ui/Layout';
import { ProgressBar } from '../../ui/Progress';
import { GoalEditor } from './GoalEditor';
import { fmtPts, pts, sprintDay, sprintPhase } from './sprint-utils';

function Stat({ label, value, sub, swatch, tone }: { label: string; value: ReactNode; sub?: ReactNode; swatch?: string; tone?: 'warning' }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-micro font-semibold uppercase text-ink-3">
        {swatch && <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-[2px]', swatch)} />}
        <span className="truncate">{label}</span>
      </dt>
      <dd className={cn('tabular mt-1 truncate text-title font-semibold', tone === 'warning' ? 'text-warning' : 'text-ink')}>{value}</dd>
      {sub && <dd className="truncate text-meta text-ink-3">{sub}</dd>}
    </div>
  );
}

/** The sprint's numbers: goal on top as a pull quote, then the score and what's behind it. */
export function Scoreboard({ detail, className }: { detail: SprintDetail; className?: string }) {
  const { sprint, totals } = detail;
  const phase = sprintPhase(sprint);
  const live = totals.issues - totals.canceled;
  const notStartedPts = Math.max(0, totals.points - totals.completedPoints - totals.startedPoints);
  const pct = percent(totals.completedPoints, totals.points);
  const added = totals.scopeAddedPoints > 0;

  let timing: { label: string; value: string; sub: string };
  if (phase === 'current' && sprint.startDate && sprint.endDate) {
    // The viewer's calendar, not the server's UTC one, so this agrees with the header's "N days left".
    const left = Math.max(0, daysBetween(todayString(), sprint.endDate));
    const d = sprintDay(sprint);
    timing = { label: 'Days left', value: String(left), sub: left === 0 ? 'Ends today' : d ? `Day ${d.day} of ${d.length}` : '' };
  } else if (phase === 'upcoming' || phase === 'current') {
    const n = sprint.startDate ? Math.max(0, daysBetween(todayString(), sprint.startDate)) : 0;
    timing = { label: 'Starts', value: shortDate(sprint.startDate) || '—', sub: n <= 1 ? (n === 1 ? 'Tomorrow' : 'Today') : `In ${n} days` };
  } else if (phase === 'done') {
    timing = { label: 'Ran for', value: plural(sprint.daysTotal, 'day'), sub: `Closed ${shortDate(sprint.completedAt)}` };
  } else {
    timing = { label: 'Ended', value: shortDate(sprint.endDate) || '—', sub: 'Not closed yet' };
  }

  return (
    <Card as="section" className={cn('flex min-w-0 flex-col p-5', className)}>
      <GoalEditor sprint={sprint} />

      <div className="mt-6 flex items-baseline gap-2">
        <span className="tabular font-display text-display-lg text-ink">{fmtPts(totals.completedPoints)}</span>
        <span className="tabular text-title text-ink-3">/ {fmtPts(totals.points)} pts</span>
        <span className="tabular ml-auto text-title font-semibold text-ink">{pct}%</span>
      </div>
      <ProgressBar
        className="mt-3"
        height={8}
        max={Math.max(1, totals.points)}
        segments={[
          { value: totals.completedPoints, className: 'bg-success', label: `${fmtPts(totals.completedPoints)} pts done` },
          { value: totals.startedPoints, className: 'bg-warning', label: `${fmtPts(totals.startedPoints)} pts in flight` },
          { value: notStartedPts, className: 'bg-line-strong', label: `${fmtPts(notStartedPts)} pts not started` },
        ]}
      />

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-4">
        <Stat label="Scope" value={pts(totals.points)} sub={`${plural(live, 'issue')}${totals.canceled ? ` · ${totals.canceled} canceled` : ''}`} />
        <Stat label="Completed" swatch="bg-success" value={pts(totals.completedPoints)} sub={`${pct}% · ${plural(totals.completed, 'issue')}`} />
        <Stat label="In flight" swatch="bg-warning" value={pts(totals.startedPoints)} sub={plural(totals.started, 'issue')} />
        <Stat label="Not started" swatch="bg-line-strong" value={pts(notStartedPts)} sub={plural(totals.unstarted, 'issue')} />
        <Stat
          label="Scope added"
          value={`${added ? '+' : ''}${pts(totals.scopeAddedPoints)}`}
          sub={added ? `+${plural(totals.scopeAddedIssues, 'issue')} after start` : 'Nothing added mid-sprint'}
          tone={added ? 'warning' : undefined}
        />
        <Stat label={timing.label} value={timing.value} sub={timing.sub} />
      </dl>
    </Card>
  );
}
