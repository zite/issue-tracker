import { format } from 'date-fns';
import { useMemo, type ReactNode } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { parseDay } from '../../lib/format';
import type { SprintDetail } from '../../lib/types';
import { cn } from '../../ui/cn';
import { fmtPts, type SprintPhase } from './sprint-utils';

type Point = SprintDetail['burndown'][number];
type ChartPoint = Point & { startedToDate: number | null };

/**
 * Colours are read from the theme's CSS variables at paint time, so the chart
 * re-steps with dark mode without re-rendering. Remaining is the story (ink);
 * scope and ideal are context; in flight is a faint warning wash; today is the
 * highlighter.
 */
export const C = {
  ink: 'rgb(var(--ink))',
  ink3: 'rgb(var(--ink-3))',
  lineStrong: 'rgb(var(--line-strong))',
  warning: 'rgb(var(--warning))',
  highlight: 'rgb(var(--highlight))',
  highlightInk: 'rgb(var(--highlight-ink))',
  card: 'rgb(var(--card))',
};

/** A round axis ceiling with 4–6 even steps: 48 becomes 0–50 by 10, not a lopsided 0–48. */
function niceTicks(max: number) {
  const raw = Math.max(1, max) / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw && Number.isInteger(s)) ?? Math.ceil(raw);
  const top = Math.ceil(Math.max(1, max) / step) * step;
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

/**
 * Date labels on an even rhythm (every day, every other day, weekly…) that
 * always ends on the sprint's last day, instead of recharts' gap-dodging which
 * leaves an uneven stretch before the end.
 */
function evenDateTicks(dates: string[], maxLabels = 8) {
  if (dates.length <= 2) return dates;
  const span = dates.length - 1;
  const step = [1, 2, 3, 7, 14, 28].find(s => span / s <= maxLabels - 1) ?? Math.ceil(span / (maxLabels - 1));
  const picked: string[] = [];
  // Count back from the end so the last day is always labelled.
  for (let i = span; i >= 0; i -= step) picked.unshift(dates[i]);
  // Keep the first day too, unless it would crowd the label after it.
  if (picked[0] !== dates[0] && (span % step) / step >= 0.6) picked.unshift(dates[0]);
  return picked;
}

/** The last day the server has actuals for — its "today", where the actual line must stop. */
function lastActual(points: Point[]) {
  for (let i = points.length - 1; i >= 0; i--) if (points[i].remaining != null) return i;
  return -1;
}

function useChartData(burndown: Point[]) {
  return useMemo(() => {
    const cut = lastActual(burndown);
    const data: ChartPoint[] = burndown.map((p, i) => ({ ...p, startedToDate: i <= cut ? p.started : null }));
    return { data, todayIndex: cut };
  }, [burndown]);
}

function LineKey({ color, dashed, width = 14 }: { color: string; dashed?: boolean; width?: number }) {
  return (
    <svg width={width} height="6" aria-hidden className="shrink-0">
      <line x1="1" y1="3" x2={width - 1} y2="3" stroke={color} strokeWidth="2" strokeDasharray={dashed ? '3 2.5' : undefined} strokeLinecap="round" />
    </svg>
  );
}

function AreaKey({ className }: { className: string }) {
  return <span aria-hidden className={cn('h-2.5 w-3 shrink-0 rounded-[3px]', className)} />;
}

function BurndownTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint }> }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const future = p.remaining == null;
  // Days after today have no actuals; list only what the chart draws for them.
  const rows: Array<{ key: string; label: string; value: string; swatch: ReactNode }> = [
    ...(future ? [] : [{ key: 'remaining', label: 'Remaining', value: fmtPts(p.remaining ?? 0), swatch: <LineKey color="rgb(var(--on-primary))" width={12} /> }]),
    { key: 'scope', label: 'Scope', value: fmtPts(p.scope), swatch: <AreaKey className="bg-on-primary/35" /> },
    ...(future
      ? []
      : [
          { key: 'completed', label: 'Done', value: fmtPts(p.completed), swatch: <AreaKey className="bg-transparent" /> },
          { key: 'started', label: 'In flight', value: fmtPts(p.startedToDate ?? 0), swatch: <AreaKey className="bg-warning" /> },
        ]),
    { key: 'ideal', label: 'Ideal', value: fmtPts(p.ideal), swatch: <LineKey color="rgb(var(--on-primary) / 0.6)" dashed width={12} /> },
  ];
  return (
    <div className="min-w-[156px] rounded-md bg-primary px-3 py-2 text-meta text-on-primary shadow-pop">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="font-semibold">{format(parseDay(p.date), 'EEE, MMM d')}</span>
        {future && <span className="opacity-70">Upcoming</span>}
      </div>
      <div className="space-y-0.5">
        {rows.map(r => (
          <div key={r.key} className="flex items-center gap-2">
            <span className="flex w-3.5 justify-center">{r.swatch}</span>
            <span className="flex-1 opacity-80">{r.label}</span>
            <span className="tabular font-semibold">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Only what the chart draws for this phase: a sprint that hasn't started has no actuals yet. */
export function BurndownLegend({ className, phase }: { className?: string; phase: SprintPhase }) {
  const actuals = phase !== 'upcoming';
  const items = [
    ...(actuals ? [{ label: 'Remaining', key: <LineKey color={C.ink} /> }] : []),
    { label: phase === 'upcoming' ? 'Planned scope' : 'Scope', key: <AreaKey className="bg-line-strong" /> },
    ...(actuals ? [{ label: 'In flight', key: <AreaKey className="bg-warning/25 ring-1 ring-inset ring-warning/40" /> }] : []),
    { label: 'Ideal', key: <LineKey color={C.ink3} dashed /> },
    ...(phase === 'current' ? [{ label: 'Today', key: <span aria-hidden className="h-3 w-[3px] rounded-full bg-highlight" /> }] : []),
  ];
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ink-2', className)}>
      {items.map(i => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.key}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Date ticks; the first and last hug the plot edges so neither is clipped by the card. */
function DateTick({ x = 0, y = 0, payload, first, last }: { x?: number; y?: number; payload?: { value: string }; first?: string; last?: string }) {
  if (!payload) return null;
  const anchor = payload.value === last ? 'end' : payload.value === first ? 'start' : 'middle';
  return (
    <text x={x} y={y + 16} textAnchor={anchor} fontSize={12} fill={C.ink3}>
      {format(parseDay(payload.value), 'MMM d')}
    </text>
  );
}

function TodayLabel({ viewBox }: { viewBox?: { x: number; y: number } }) {
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;
  return (
    <g>
      <rect x={x - 21} y={y - 19} width={42} height={17} rx={8.5} fill={C.highlight} />
      <text x={x} y={y - 7} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={C.highlightInk}>
        Today
      </text>
    </g>
  );
}

/** Points remaining day by day, against scope, work in flight and the ideal line. */
export function BurndownChart({ burndown, showToday, height = 280, maxLabels = 8 }: { burndown: Point[]; showToday: boolean; height?: number; maxLabels?: number }) {
  const { data, todayIndex } = useChartData(burndown);
  const today = showToday && todayIndex >= 0 && todayIndex < data.length - 1 ? data[todayIndex].date : null;
  const ticks = niceTicks(Math.max(4, ...data.map(d => Math.max(d.scope, d.ideal))));
  const dateTicks = useMemo(() => evenDateTicks(data.map(d => d.date), maxLabels), [data, maxLabels]);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: -14 }}>
          <CartesianGrid vertical={false} stroke={C.lineStrong} strokeDasharray="3 4" />
          <XAxis
            dataKey="date"
            ticks={dateTicks}
            interval={0}
            tick={<DateTick first={data[0]?.date} last={data[data.length - 1]?.date} />}
            tickLine={false}
            axisLine={{ stroke: C.lineStrong }}
            height={28}
          />
          <YAxis
            allowDecimals={false}
            domain={[0, ticks[ticks.length - 1]]}
            ticks={ticks}
            tick={{ fontSize: 12, fill: C.ink3 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip content={<BurndownTooltip />} cursor={{ stroke: C.ink3, strokeWidth: 1, strokeDasharray: '2 3' }} isAnimationActive={false} />
          <Area type="monotone" dataKey="scope" stroke={C.lineStrong} strokeWidth={1.5} fill={C.lineStrong} fillOpacity={0.35} dot={false} activeDot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="startedToDate" stroke={C.warning} strokeOpacity={0.9} strokeWidth={1.5} fill={C.warning} fillOpacity={0.15} dot={false} activeDot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="ideal" stroke={C.ink3} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="remaining"
            stroke={C.ink}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, fill: C.ink, stroke: C.card, strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {today && <ReferenceLine x={today} stroke={C.highlight} strokeWidth={2.5} label={<TodayLabel />} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A compact trend for summary cards: remaining against ideal, with a highlighter dot on today. */
export function BurndownSparkline({ burndown, height = 64, className }: { burndown: Point[]; height?: number; className?: string }) {
  const { data, todayIndex } = useChartData(burndown);
  const yMax = Math.max(1, ...data.map(d => Math.max(d.scope, d.ideal)));
  const today = todayIndex >= 0 ? data[todayIndex] : null;
  return (
    <div style={{ height }} className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 4, left: 6 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={[0, yMax]} />
          <Tooltip
            content={<BurndownTooltip />}
            cursor={{ stroke: C.ink3, strokeWidth: 1, strokeDasharray: '2 3' }}
            // The tooltip is taller than a sparkline; let it spill past the plot instead of squashing against it.
            allowEscapeViewBox={{ x: false, y: true }}
            wrapperStyle={{ zIndex: 20 }}
            isAnimationActive={false}
          />
          <Line type="linear" dataKey="ideal" stroke={C.lineStrong} strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="remaining" stroke={C.ink} strokeWidth={2} dot={false} activeDot={{ r: 3.5, fill: C.ink, stroke: C.card, strokeWidth: 2 }} isAnimationActive={false} />
          {today && today.remaining != null && <ReferenceDot x={today.date} y={today.remaining} r={4.5} fill={C.highlight} stroke={C.ink} strokeWidth={1.5} isFront />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
