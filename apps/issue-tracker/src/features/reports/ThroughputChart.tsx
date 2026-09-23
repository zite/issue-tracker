import { Minus, TrendDown, TrendUp } from '@phosphor-icons/react';
import { format } from 'date-fns';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { parseDay } from '../../lib/format';
import { Badge } from '../../ui/Chip';
import { Skeleton } from '../../ui/Layout';
import { Tooltip } from '../../ui/Tooltip';
import { cn } from '../../ui/cn';
import {
  AXIS_FONT, ChartTip, ChartTipRow, LegendKey, LegendRow, ReportCard, TipLine, fmt, signed, useChartColors, type Analytics,
} from './shared';

type Point = Analytics['throughput'][number] & {
  current: boolean;
  /** Full weeks draw solid; the week in progress draws dashed, so a half-week never reads as a slump. */
  createdDone: number | null;
  createdNow: number | null;
  completedDone: number | null;
  completedNow: number | null;
};

/** Whether the pile of open work grew or shrank over the window. */
export function NetFlow({ created, completed, weeks }: { created: number; completed: number; weeks: number }) {
  const net = created - completed;
  const explain =
    net === 0
      ? `As many issues were completed as created in the last ${weeks} weeks.`
      : `${fmt(Math.abs(net))} ${net > 0 ? 'more' : 'fewer'} issues were created than completed in the last ${weeks} weeks, so open work ${net > 0 ? 'grew' : 'shrank'}.`;
  const Icon = net > 0 ? TrendUp : net < 0 ? TrendDown : Minus;
  return (
    <Tooltip content={explain}>
      <button type="button" className="rounded-full" aria-label={explain}>
        <Badge tone={net > 0 ? 'warning' : net < 0 ? 'success' : 'neutral'} icon={<Icon size={12} weight="bold" />} className="tabular h-6 px-2.5">
          {net === 0 ? 'Balanced' : `${signed(net)} net`}
        </Badge>
      </button>
    </Tooltip>
  );
}

export function ThroughputChart({ data, weeks, className }: { data: Analytics; weeks: number; className?: string }) {
  const c = useChartColors();
  const last = data.throughput.length - 1;
  const points: Point[] = data.throughput.map((p, i) => ({
    ...p,
    current: i === last,
    createdDone: i < last ? p.created : null,
    completedDone: i < last ? p.completed : null,
    createdNow: i >= last - 1 ? p.created : null,
    completedNow: i >= last - 1 ? p.completed : null,
  }));
  const { createdInWindow, completedInWindow } = data.summary;
  const quiet = points.every(p => p.created === 0 && p.completed === 0);
  const peak = Math.max(0, ...points.map(p => Math.max(p.created, p.completed)));

  const Tick = (props: unknown) => {
    const { x, y, payload, index } = props as { x: number; y: number; payload: { value: string }; index: number };
    const isNow = payload.value === data.throughput[last]?.week;
    return (
      <g transform={`translate(${x},${y})`}>
        {isNow ? (
          <>
            <rect x={-30} y={4} width={60} height={16} rx={4} fill={c.highlight} />
            <text dy={16} textAnchor={'middle'} fontSize={10.5} fontWeight={600} fill={c.highlightInk}>
              This week
            </text>
          </>
        ) : (
          <text dy={16} textAnchor={index === 0 ? 'start' : 'middle'} {...AXIS_FONT} fill={c.ink3}>
            {format(parseDay(payload.value), 'MMM d')}
          </text>
        )}
      </g>
    );
  };

  const line = (key: keyof Point, color: string, dashed?: boolean) => (
    <Line
      key={String(key)}
      type="linear"
      dataKey={key}
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dashed ? '4 4' : undefined}
      dot={false}
      activeDot={dashed ? false : { r: 4, fill: color, stroke: c.card, strokeWidth: 2 }}
      connectNulls={false}
      isAnimationActive={false}
    />
  );

  return (
    <ReportCard
      title="Throughput"
      description="Issues created and completed each week."
      className={className}
      bodyClassName="flex flex-col"
      aside={<NetFlow created={createdInWindow} completed={completedInWindow} weeks={weeks} />}
    >
      <LegendRow className="mb-3">
        <LegendKey
          kind="line"
          color={c.success}
          label={
            <>
              Completed <span className="tabular font-semibold text-ink">{fmt(completedInWindow)}</span>
            </>
          }
        />
        <LegendKey
          kind="line"
          color={c.ink3}
          label={
            <>
              Created <span className="tabular font-semibold text-ink">{fmt(createdInWindow)}</span>
            </>
          }
        />
        <LegendKey kind="line" dashed color={c.ink3} label="Week so far" />
      </LegendRow>
      <div className={cn('relative min-h-[264px] flex-1', quiet && 'opacity-60')}>
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 34, bottom: 0, left: -8 }}>
              <CartesianGrid vertical={false} stroke={c.lineStrong} strokeDasharray="3 4" />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={{ stroke: c.lineStrong }}
                tick={Tick}
                height={30}
                minTickGap={24}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ ...AXIS_FONT, fill: c.ink3 }}
                width={40}
                tickCount={5}
                domain={[0, peak === 0 ? 4 : 'auto']}
              />
              <ChartTooltip
                cursor={{ stroke: c.ink3, strokeWidth: 1, strokeDasharray: '2 3' }}
                content={<ThroughputTip success={c.success} onPrimary={c.onPrimary} />}
                isAnimationActive={false}
                wrapperStyle={{ outline: 'none' }}
              />
              {line('createdDone', c.ink3)}
              {line('createdNow', c.ink3, true)}
              {line('completedDone', c.success)}
              {line('completedNow', c.success, true)}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {quiet && <p className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-meta text-ink-2">No issues were created or completed in this window.</p>}
      </div>
    </ReportCard>
  );
}

function ThroughputTip({ active, payload, success, onPrimary }: { active?: boolean; payload?: Array<{ payload: Point }>; success: string; onPrimary: string }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const net = p.created - p.completed;
  return (
    <ChartTip title={`Week of ${format(parseDay(p.week), 'MMM d')}`} subtitle={p.current ? 'This week, so far' : undefined}>
      <ChartTipRow swatch={<TipLine color={success} />} label="Completed" value={fmt(p.completed)} />
      {/* On the ink panel the created stroke takes the panel's own tone to stay visible. */}
      <ChartTipRow swatch={<TipLine color={onPrimary} />} label="Created" value={fmt(p.created)} />
      <ChartTipRow label="Net" value={signed(net)} />
    </ChartTip>
  );
}

export function ThroughputSkeleton({ className }: { className?: string }) {
  return (
    <ReportCard title="Throughput" description="Issues created and completed each week." className={className} aside={<Skeleton className="h-6 w-20 rounded-full" />}>
      <div className="mb-3 flex gap-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex h-[264px] flex-col justify-between pb-8 pl-9 pt-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-px border-t border-dashed border-line-strong" />
        ))}
      </div>
    </ReportCard>
  );
}
