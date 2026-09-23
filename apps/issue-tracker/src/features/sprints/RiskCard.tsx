import { ArrowClockwise, Sparkle } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { aiSprintRisk, type AiSprintRiskOutputType } from 'zitejs/api';
import { errorMessage } from '../../lib/errors';
import { useWorkspace } from '../../lib/workspace';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Card, Eyebrow, Skeleton } from '../../ui/Layout';
import { CardHeader } from './CardHeader';
import { fmtPts, pts } from './sprint-utils';

type Risk = AiSprintRiskOutputType;
type Verdict = Risk['verdict'];

const VERDICT: Record<Verdict, { label: string; className: string; bar: string }> = {
  on_track: { label: 'On track', className: 'text-success', bar: 'bg-success' },
  at_risk: { label: 'At risk', className: 'text-warning', bar: 'bg-warning' },
  off_track: { label: 'Off track', className: 'text-danger', bar: 'bg-danger' },
  not_started: { label: 'Too early to tell', className: 'text-ink-2', bar: 'bg-ink-3' },
  done: { label: 'Done', className: 'text-success', bar: 'bg-success' },
};

const riskKey = (sprintId: string) => ['sprint-risk', sprintId] as const;
const HALF_HOUR = 30 * 60_000;

/**
 * An on-demand read of whether the sprint will land. It never runs on its own —
 * the model call can take several seconds — and the last result is kept for
 * half an hour so it survives navigating away and back.
 */
export function RiskCard({ sprintId, className }: { sprintId: string; className?: string }) {
  const ws = useWorkspace();
  const { data, error, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: riskKey(sprintId),
    queryFn: () => aiSprintRisk({ sprintId }),
    enabled: false,
    staleTime: HALF_HOUR,
    gcTime: HALF_HOUR,
    retry: false,
  });

  const run = () => refetch();

  return (
    <Card as="section" className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader
        title="Risk"
        note={data && !isFetching ? `Assessed ${new Date(dataUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : undefined}
        action={
          data ? (
            <Button variant="ghost" size="sm" leading={<ArrowClockwise size={14} />} onClick={run} loading={isFetching}>
              {isFetching ? 'Assessing…' : 'Re-assess'}
            </Button>
          ) : (
            <Button variant="highlight" size="sm" leading={<Sparkle size={14} weight="fill" />} onClick={run} loading={isFetching}>
              {isFetching ? 'Assessing…' : 'Assess risk'}
            </Button>
          )
        }
      />
      <div className="flex flex-1 flex-col px-5 pb-5 pt-2" aria-live="polite">
        {isFetching && !data ? (
          <div className="flex flex-col gap-2.5" aria-label="Assessing">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-3 w-48" />
            <Skeleton className="mt-4 h-2 w-full" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="mt-4 h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        ) : error && !data ? (
          <div className="flex flex-col items-start gap-3">
            <span className="font-display text-[40px] leading-[44px] text-ink-3">Will it land?</span>
            <p className="text-ui text-danger">{errorMessage(error, 'Couldn’t assess this sprint.')}</p>
            <Button variant="secondary" size="sm" leading={<ArrowClockwise size={14} />} onClick={run}>
              Try again
            </Button>
          </div>
        ) : data ? (
          <RiskResult data={data} stale={isFetching} aiAttached={ws.aiAvailable} />
        ) : (
          <div className="flex flex-1 flex-col">
            <span className="font-display text-[40px] leading-[44px] text-ink-3">Will it land?</span>
            <p className="mt-2 text-ui text-ink-2 text-pretty">
              Compares the pace this sprint needs with the pace the team has kept so far, and flags blocked, unassigned and unstarted work.
              {ws.aiAvailable ? ' Claude writes up the risks and what to do about them.' : ''}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function RiskList({ title, items, dot }: { title: string; items: string[]; dot: string }) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <Eyebrow className="mb-1.5">{title}</Eyebrow>
      <ul className="flex flex-col gap-1.5">
        {items.map((r, i) => (
          <li key={i} className="flex gap-2.5 text-ui leading-[19px] text-ink">
            <span aria-hidden className={cn('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-[2px]', dot)} />
            <span className="text-pretty">{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaceBar({ label, value, max, className }: { label: string; value: number; max: number; className: string }) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)_76px] items-center gap-3">
      <span className="text-meta text-ink-2">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-sunken">
        <span className={cn('block h-full rounded-full transition-[width] duration-500', className)} style={{ width: `${value > 0 ? Math.max(2, (value / max) * 100) : 0}%` }} />
      </span>
      <span className="tabular text-right text-ui text-ink">
        {fmtPts(value)} <span className="text-meta text-ink-3">pts/day</span>
      </span>
    </div>
  );
}

/**
 * The sentence under the verdict. Claude writes it when an integration is
 * attached; otherwise it's said in words from the same numbers, rather than
 * repeating the numbers the card already shows.
 */
function explain(data: Risk) {
  if (data.available && data.headline) return data.headline;
  const s = data.stats;
  const left = pts(s.pointsRemaining);
  if (s.pointsTotal === 0) return 'There’s nothing in this sprint to assess yet. Add issues, then run it again.';
  switch (data.verdict) {
    case 'done':
      return 'Everything planned for this sprint is done.';
    case 'not_started':
      return 'The sprint has only just begun, so there’s no pace to read yet. Check back after a day of work.';
    case 'on_track':
      return `At the pace so far, the remaining ${left} land before the sprint ends.`;
    default: {
      if (s.daysLeft === 0) return `The sprint ends today with ${left} still open.`;
      if (s.observedPerDay === 0) return `Nothing in the sprint is finished yet, and ${left} ${s.pointsRemaining === 1 ? 'is' : 'are'} still open.`;
      const shortfall = Math.round(s.pointsRemaining - s.observedPerDay * s.daysLeft);
      return shortfall > 0
        ? `At the pace so far, about ${pts(shortfall)} will still be open when the sprint ends.`
        : 'It’s tight: the pace so far only just covers what’s left.';
    }
  }
}

function RiskResult({ data, stale, aiAttached }: { data: Risk; stale: boolean; aiAttached: boolean }) {
  const s = data.stats;
  // An empty sprint has "no points remaining", which the server reads as done.
  const v = s.pointsTotal === 0 ? { label: 'Nothing planned', className: 'text-ink-3', bar: 'bg-ink-3' } : VERDICT[data.verdict];
  const flags = [s.blocked > 0 && `${s.blocked} blocked`, s.unassigned > 0 && `${s.unassigned} unassigned`, s.notStarted > 0 && `${s.notStarted} not started`].filter(Boolean) as string[];
  const showPace = data.verdict !== 'done' && data.verdict !== 'not_started' && s.pointsTotal > 0;
  const paceMax = Math.max(s.requiredPerDay, s.observedPerDay, 0.1);

  return (
    <div className={cn('flex flex-1 flex-col animate-rise-in transition-opacity', stale && 'opacity-55')}>
      <span className={cn('font-display text-[40px] leading-[44px]', v.className)}>{v.label}</span>
      <p className="mt-2 text-body text-ink text-pretty">{explain(data)}</p>

      {showPace && (
        <div className="mt-4 flex flex-col gap-2 rounded-md bg-sunken/60 px-3 py-2.5" role="img" aria-label={`Needs ${fmtPts(s.requiredPerDay)} points a day; ${fmtPts(s.observedPerDay)} a day so far`}>
          <PaceBar label="Needed" value={s.requiredPerDay} max={paceMax} className={v.bar} />
          <PaceBar label="So far" value={s.observedPerDay} max={paceMax} className="bg-ink" />
        </div>
      )}

      <RiskList title="Risks" items={data.risks} dot="bg-warning" />
      <RiskList title="Suggestions" items={data.suggestions} dot="bg-ink" />

      <div className="mt-auto pt-4">
        <div className="tabular flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-line pt-3 text-meta text-ink-3">
          <span>
            {fmtPts(s.pointsRemaining)} of {fmtPts(s.pointsTotal)} pts left
          </span>
          {flags.map(f => (
            <span key={f}>· {f}</span>
          ))}
        </div>
      </div>
      {/* An empty sprint also skips the model, so only mention the integration when it's genuinely missing. */}
      {!data.available && !aiAttached && (
        <p className="mt-2 flex items-start gap-1.5 text-meta text-ink-3 text-pretty">
          <Sparkle size={13} className="mt-px shrink-0" />
          Worked out from the numbers. With an Anthropic integration attached, Claude also names the issues at risk and suggests what to do.
        </p>
      )}
    </div>
  );
}
