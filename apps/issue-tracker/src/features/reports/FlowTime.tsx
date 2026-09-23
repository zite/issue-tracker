import { Tooltip } from '../../ui/Tooltip';
import { Skeleton } from '../../ui/Layout';
import { cn } from '../../ui/cn';
import { CardEmpty, ReportCard, fmt, fmtDays, shortDays, type Analytics } from './shared';

type Stat = Analytics['cycleTime'];

/** A round ceiling for a day scale with 3–5 even steps. */
function dayTicks(max: number) {
  const steps = [1, 2, 3, 5, 7, 10, 14, 21, 28, 30, 45, 60, 90, 120, 180, 365];
  const step = steps.find(s => max / s <= 4) ?? Math.ceil(max / 4);
  const top = Math.max(step, Math.ceil(max / step) * step);
  return { top, ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step) };
}

function Metric({
  title, stat, top, ticks, explanation, weeks, last,
}: { title: string; stat: Stat; top: number; ticks: number[]; explanation: string; weeks: number; last?: boolean }) {
  const has = stat.sample > 0;
  const median = fmtDays(stat.median);
  const p90 = fmtDays(stat.p90);
  const at = (v: number) => `${Math.max(0, Math.min(100, (v / top) * 100))}%`;

  return (
    <div className={cn('flex flex-col', !last && 'border-b border-line pb-4')}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-micro font-semibold uppercase text-ink-3">{title}</h3>
        {has && <span className="tabular text-meta text-ink-3">{fmt(stat.sample)} {stat.sample === 1 ? 'issue' : 'issues'}</span>}
      </div>
      {!has ? (
        <CardEmpty className="mt-2 h-[112px]" title="Not enough data">
          {title === 'Cycle time' ? `No completed issue in the last ${weeks} weeks was ever moved into flight.` : `No issues were completed in the last ${weeks} weeks.`}
        </CardEmpty>
      ) : (
        <>
          <div className="mt-1 flex items-end justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="tabular font-display text-display leading-9 text-ink">{median.value}</span>
                <span className="text-ui text-ink-2">{median.unit}</span>
              </div>
              <div className="text-meta text-ink-3">median</div>
            </div>
            <div className="text-right">
              <div className="flex items-baseline justify-end gap-1">
                <span className="tabular font-display text-[24px] leading-8 text-ink-2">{p90.value}</span>
                <span className="text-meta text-ink-3">{p90.unit}</span>
              </div>
              <div className="text-meta text-ink-3">90th percentile</div>
            </div>
          </div>

          {/* A range on a scale both metrics share: where half finish, and where nine in ten do. */}
          <div className="relative mt-3 h-6" role="img" aria-label={`${title}: median ${median.value} ${median.unit}, 90th percentile ${p90.value} ${p90.unit}`}>
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sunken" />
            {ticks.slice(1, -1).map(t => (
              <div key={t} className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-card" style={{ left: at(t) }} />
            ))}
            <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line-strong" style={{ left: at(stat.median), width: `calc(${at(stat.p90)} - ${at(stat.median)})` }} />
            <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-l-full bg-ink/15" style={{ left: 0, width: at(stat.median) }} />
            <Tooltip content={`90th percentile · ${shortDays(stat.p90)} — nine in ten finished within this`}>
              <button
                type="button"
                aria-label={`90th percentile ${p90.value} ${p90.unit}`}
                className="absolute top-0 flex h-6 w-3 -translate-x-1/2 justify-center rounded-xs"
                style={{ left: at(stat.p90) }}
              >
                <span className="h-full w-[3px] rounded-full bg-ink-3" />
              </button>
            </Tooltip>
            <Tooltip content={`Median · ${shortDays(stat.median)} — half finished within this`}>
              <button
                type="button"
                aria-label={`Median ${median.value} ${median.unit}`}
                className="absolute top-0 flex h-6 w-3 -translate-x-1/2 justify-center rounded-xs"
                style={{ left: at(stat.median) }}
              >
                <span className="h-full w-[3px] rounded-full bg-ink" />
              </button>
            </Tooltip>
          </div>
          <div className="relative mt-0.5 h-3.5">
            {ticks.map((t, i) => (
              <span
                key={t}
                className={cn(
                  'tabular absolute top-0 text-[10.5px] leading-[14px] text-ink-3',
                  i === 0 ? 'translate-x-0' : i === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
                )}
                style={{ left: at(t) }}
              >
                {t === 0 ? '0' : `${t}d`}
              </span>
            ))}
          </div>
          <p className="mt-2.5 text-meta text-ink-3 text-pretty">{explanation}</p>
        </>
      )}
    </div>
  );
}

/** Cycle time and lead time on one scale: how long work takes once started, and how long whoever asked waits. */
export function FlowTime({ data, weeks, className }: { data: Analytics; weeks: number; className?: string }) {
  const { top, ticks } = dayTicks(Math.max(data.cycleTime.p90, data.leadTime.p90, 1));
  // Both measures come from the same completed issues; with none, say so once rather than twice.
  if (data.cycleTime.sample === 0 && data.leadTime.sample === 0) {
    return (
      <ReportCard title="Flow time" description={`Issues completed in the last ${weeks} weeks.`} className={className} bodyClassName="flex flex-col">
        <CardEmpty className="min-h-[220px] flex-1" title="Nothing completed yet">
          Cycle time and lead time — how long work takes once started, and how long whoever asked waits — appear once issues in this window are done.
        </CardEmpty>
      </ReportCard>
    );
  }
  return (
    <ReportCard
      title="Flow time"
      description={`Issues completed in the last ${weeks} weeks.`}
      className={className}
      bodyClassName="flex flex-col gap-4"
      aside={
        <span className="flex items-center gap-3 text-meta text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-[3px] rounded-full bg-ink" aria-hidden />
            Median
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-[3px] rounded-full bg-ink-3" aria-hidden />
            p90
          </span>
        </span>
      }
    >
      <Metric
        title="Cycle time"
        stat={data.cycleTime}
        top={top}
        ticks={ticks}
        weeks={weeks}
        explanation="From first moving into flight to done. Half of issues finish within the median, nine in ten within the 90th percentile."
      />
      <Metric
        title="Lead time"
        stat={data.leadTime}
        top={top}
        ticks={ticks}
        weeks={weeks}
        last
        explanation="From the issue being created to done — how long whoever asked for it actually waited."
      />
    </ReportCard>
  );
}

export function FlowTimeSkeleton({ className }: { className?: string }) {
  return (
    <ReportCard title="Flow time" className={className} bodyClassName="flex flex-col gap-4">
      {[0, 1].map(i => (
        <div key={i} className={cn(i === 0 && 'border-b border-line pb-4')}>
          <Skeleton className="h-3 w-20" />
          <div className="mt-3 flex items-end justify-between">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-6 w-14" />
          </div>
          <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
          <Skeleton className="mt-4 h-3 w-4/5" />
        </div>
      ))}
    </ReportCard>
  );
}
