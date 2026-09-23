import { useSprints } from '../../lib/queries';
import type { SprintDetail } from '../../lib/types';
import { cn } from '../../ui/cn';
import { Card, Eyebrow, Skeleton } from '../../ui/Layout';
import { CardHeader } from './CardHeader';
import { averageVelocity, fmtPts, pts, sprintPhase } from './sprint-utils';

function Bar({ label, value, max, className, emphasis }: { label: string; value: number; max: number; className: string; emphasis?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className={cn('text-ui', emphasis ? 'font-medium text-ink' : 'text-ink-2')}>{label}</span>
        <span className="tabular text-ui text-ink">
          {fmtPts(value)} <span className="text-meta text-ink-3">pts</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sunken">
        <div className={cn('h-full rounded-full transition-[width] duration-500', className)} style={{ width: `${value > 0 ? Math.max(1.5, (value / max) * 100) : 0}%` }} />
      </div>
    </div>
  );
}

/**
 * Outside a running sprint the useful question isn't risk, it's size: is what's
 * planned more than the team usually finishes, or how did this one compare?
 */
export function CapacityCard({ detail, className }: { detail: SprintDetail; className?: string }) {
  const { sprint, totals } = detail;
  const { data, isPending } = useSprints(sprint.teamId ?? undefined);
  const phase = sprintPhase(sprint);
  const planning = phase === 'upcoming';
  // A finished sprint is compared against the ones before it, not itself.
  const others = (data?.sprints ?? []).filter(s => s.id !== sprint.id && (!sprint.startDate || (s.startDate ?? '') < sprint.startDate));
  const velocity = averageVelocity(planning ? data?.sprints ?? [] : others);
  const value = planning ? totals.points : totals.completedPoints;
  const avg = velocity?.avg ?? 0;
  const max = Math.max(value, avg, 1);
  const diff = Math.round((value - avg) * 10) / 10;

  let verdict: { word: string; tone: string; line: string };
  if (!velocity) {
    verdict = { word: pts(value), tone: 'text-ink', line: 'There’s no finished sprint to compare with yet.' };
  } else if (planning) {
    verdict =
      diff > avg * 0.15
        ? { word: 'Over capacity', tone: 'text-warning', line: `${pts(diff)} more than the team usually finishes.` }
        : diff < -avg * 0.25
          ? { word: 'Room to spare', tone: 'text-ink', line: `About ${pts(-diff)} below the team’s usual pace.` }
          : { word: 'About right', tone: 'text-success', line: 'In line with what the team usually finishes.' };
  } else {
    verdict =
      diff >= 0
        ? { word: diff === 0 ? 'On pace' : 'Above pace', tone: 'text-success', line: diff === 0 ? 'Exactly the team’s average.' : `${pts(diff)} above the team’s average.` }
        : { word: 'Below pace', tone: 'text-warning', line: `${pts(-diff)} below the team’s average.` };
  }

  return (
    <Card as="section" className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader title={planning ? 'Capacity' : 'Velocity'} note={velocity ? `vs last ${velocity.count} sprint${velocity.count === 1 ? '' : 's'}` : undefined} />
      <div className="flex flex-1 flex-col px-5 pb-5 pt-2">
        {isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-44" />
            <Skeleton className="h-3 w-52" />
            <Skeleton className="mt-4 h-2 w-full" />
            <Skeleton className="h-2 w-full" />
          </div>
        ) : (
          <>
            <span className={cn('font-display text-[40px] leading-[44px]', verdict.tone)}>{verdict.word}</span>
            <p className="mt-1 text-ui text-ink-2">{verdict.line}</p>
            <div className="mt-auto flex flex-col gap-3 pt-6">
              <Bar label={planning ? 'Planned' : 'Completed'} value={value} max={max} className="bg-ink" emphasis />
              {velocity && <Bar label="Team average" value={avg} max={max} className="bg-line-strong" />}
            </div>
            {!planning && (
              <div className="mt-4 border-t border-line pt-3">
                <Eyebrow>Pace</Eyebrow>
                <p className="tabular mt-1 text-ui text-ink-2">
                  {fmtPts(totals.completedPoints)} of {fmtPts(totals.points)} pts over {detail.sprint.daysTotal} days ·{' '}
                  {fmtPts(detail.sprint.daysTotal ? (totals.completedPoints / detail.sprint.daysTotal) * 7 : 0)} pts/week
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
