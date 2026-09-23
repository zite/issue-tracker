import { format } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Customized, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Mark } from '../../glyphs';
import { parseDay, percent, shortDate } from '../../lib/format';
import type { Team } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Layout';
import { cn } from '../../ui/cn';
import {
  AXIS_FONT,
  CardEmpty,
  ChartTip,
  ChartTipRow,
  LegendKey,
  LegendRow,
  ReportCard,
  TipSquare,
  fmt,
  ptsOf,
  useChartColors,
  type Analytics,
  type ChartColors,
} from './shared';

type Velocity = Analytics['velocity'][number];

type Row = {
  key: string;
  spacer?: boolean;
  sprint?: Velocity;
  team?: Team;
  label: string;
  sub: string;
  color: string;
  completed: number;
  remaining: number;
};

type TeamAverage = {
  teamId: string | null;
  team?: Team;
  firstKey: string;
  lastKey: string;
  avg: number | null;
  rate: number | null;
  sampled: number;
};

const MAX_SPRINTS_PER_TEAM = 8;
const GAP = 2;
const RADIUS = 4;
const PLOT_HEIGHT = 248;

function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}L${x},${y + rr}Q${x},${y} ${x + rr},${y}L${x + w - rr},${y}Q${x + w},${y} ${x + w},${y + rr}L${x + w},${y + h}Z`;
}

type ShapeProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  payload: Row;
};

/**
 * Points completed sprint by sprint against the scope each sprint carried.
 * Across all teams every team keeps its own group, colour and average — one
 * team's points mean nothing on another team's scale, so they're never blended.
 */
export function VelocityChart({ data, team, className }: { data: Analytics; team: Team | null; className?: string }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const c = useChartColors();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    const next = { left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 };
    setEdges(prev => (prev.left === next.left && prev.right === next.right ? prev : next));
  };
  const multi = !team;

  const { rows, averages } = useMemo(() => {
    const byTeam = new Map<string | null, Velocity[]>();
    for (const v of data.velocity) {
      if (team && v.teamId !== team.id) continue;
      if (multi && v.teamId && !ws.teamById.has(v.teamId)) continue;
      const list = byTeam.get(v.teamId) ?? [];
      list.push(v);
      byTeam.set(v.teamId, list);
    }
    const order = (id: string | null) => (id ? (ws.teamById.get(id)?.position ?? 999) : 1000);
    const groups = [...byTeam.entries()].sort((a, b) => order(a[0]) - order(b[0]));

    const out: Row[] = [];
    const avgs: TeamAverage[] = [];
    groups.forEach(([teamId, sprints], gi) => {
      const t = teamId ? ws.teamById.get(teamId) : undefined;
      const shown = [...sprints].sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '')).slice(-MAX_SPRINTS_PER_TEAM);
      if (gi > 0)
        out.push({
          key: `spacer-${gi}`,
          spacer: true,
          label: '',
          sub: '',
          color: 'transparent',
          completed: 0,
          remaining: 0,
        });
      for (const s of shown) {
        out.push({
          key: s.sprintId,
          sprint: s,
          team: t,
          label: multi ? `${t?.key ?? '—'} ${s.number}` : `Sprint ${s.number}`,
          sub: s.status === 'active' ? 'Current' : s.startDate ? format(parseDay(s.startDate), 'MMM d') : '',
          color: '',
          completed: s.completed,
          remaining: Math.max(0, s.scope - s.completed),
        });
      }
      const done = shown.filter(s => s.status === 'completed');
      const avg = done.length ? done.reduce((sum, s) => sum + s.completed, 0) / done.length : null;
      const scoped = done.filter(s => s.scope > 0);
      const rate = scoped.length ? scoped.reduce((sum, s) => sum + Math.min(1, s.completed / s.scope), 0) / scoped.length : null;
      if (shown.length)
        avgs.push({
          teamId,
          team: t,
          firstKey: shown[0].sprintId,
          lastKey: shown[shown.length - 1].sprintId,
          avg,
          rate,
          sampled: done.length,
        });
    });
    return { rows: out, averages: avgs };
  }, [data.velocity, team, multi, ws.teamById]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const fillFor = (row: Row) => (multi ? row.team?.color || c.ink2 : c.ink);
  // line-strong nearly vanishes on a dark card; the unfinished part of a bar still has to read as part of it.
  const restFill = c.dark ? c.alpha('ink3', 0.45) : c.lineStrong;
  const hovered = hoverIndex != null ? rows[hoverIndex] : undefined;
  const hasUpcoming = rows.some(r => r.sprint?.status === 'upcoming');
  const empty = rows.length === 0;
  const sprintsOff = team ? !team.sprintsEnabled : !ws.teams.some(t => t.sprintsEnabled);

  const aside = !empty && (
    <>
      {averages.map(a => (
        <div key={a.teamId ?? 'none'} className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            {multi && a.team && <Mark icon={a.team.icon} color={a.team.color} name={a.team.name} size={16} className="self-center" />}
            <span className="tabular font-display text-[26px] leading-7 text-ink">{a.avg == null ? '–' : fmt(a.avg)}</span>
            <span className="text-meta text-ink-3">{multi && a.team ? `${a.team.key} pts / sprint` : 'pts / sprint'}</span>
          </div>
          <div className="mt-0.5 text-meta text-ink-3">
            {a.avg == null ? 'No finished sprints yet' : `Avg of ${a.sampled} completed${a.rate != null ? ` · ${Math.round(a.rate * 100)}% of scope` : ''}`}
          </div>
        </div>
      ))}
    </>
  );

  const CompletedShape = (props: unknown) => {
    const { x, y, width, height, payload } = props as ShapeProps;
    if (!height || height <= 0 || payload.spacer) return <g />;
    const isTop = payload.remaining <= 0;
    const h = isTop ? height : Math.max(1, height - GAP);
    return <path d={topRounded(x, y + (height - h), width, h, isTop ? RADIUS : 0)} fill={fillFor(payload)} />;
  };

  const RemainingShape = (props: unknown) => {
    const { x, y, width, height, payload } = props as ShapeProps;
    if (!height || height <= 0 || payload.spacer) return <g />;
    if (payload.sprint?.status === 'upcoming') {
      // Planned, not yet happened: an outline of the scope rather than a filled mark.
      return (
        <path
          d={topRounded(x + 0.75, y + 0.75, width - 1.5, height - 0.75, RADIUS)}
          fill={c.alpha('ink3', 0.06)}
          stroke={c.alpha('ink3', 0.5)}
          strokeWidth={1.5}
          strokeDasharray="3 2.5"
        />
      );
    }
    return <path d={topRounded(x, y, width, height, RADIUS)} fill={restFill} />;
  };

  const Tick = (props: unknown) => {
    const { x, y, payload } = props as {
      x: number;
      y: number;
      payload: { value: string };
    };
    const row = rows.find(r => r.key === payload.value);
    if (!row || row.spacer) return <g />;
    const active = row.sprint?.status === 'active';
    return (
      <g transform={`translate(${x},${y})`}>
        <text dy={13} textAnchor="middle" {...AXIS_FONT} fontWeight={active ? 600 : 400} fill={active ? c.ink : c.ink3}>
          {row.label}
        </text>
        {active ? (
          <>
            <rect x={-24} y={19} width={48} height={16} rx={4} fill={c.highlight} />
            <text dy={31} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={c.highlightInk}>
              Current
            </text>
          </>
        ) : (
          <text dy={30} textAnchor="middle" fontSize={10.5} fill={c.ink3}>
            {row.sub}
          </text>
        )}
      </g>
    );
  };

  const Cursor = (props: unknown) => {
    const { x, y, width, height, payloadIndex } = props as {
      x: number;
      y: number;
      width: number;
      height: number;
      payloadIndex: number;
    };
    if (rows[payloadIndex]?.spacer) return <g />;
    return <rect x={x} y={y} width={width} height={height} rx={6} fill={c.hover} opacity={c.dark ? 0.7 : 0.85} />;
  };

  /** Drawn in chart coordinates: each team's average spans its own group of bars, which a ReferenceLine can't do. */
  const Overlay = (props: unknown) => {
    const { xAxisMap, yAxisMap } = props as {
      xAxisMap?: Record<string, { scale: any }>;
      yAxisMap?: Record<string, { scale: any }>;
    };
    const xs = xAxisMap && Object.values(xAxisMap)[0]?.scale;
    const ys = yAxisMap && Object.values(yAxisMap)[0]?.scale;
    if (!xs || !ys) return null;
    const band = typeof xs.bandwidth === 'function' ? xs.bandwidth() : 0;
    return (
      <g pointerEvents="none">
        {averages.map(a => {
          if (a.avg == null) return null;
          const x1 = xs(a.firstKey) + band * 0.08;
          const x2 = xs(a.lastKey) + band * 0.92;
          const y = ys(a.avg);
          if (![x1, x2, y].every(Number.isFinite)) return null;
          return <line key={a.teamId ?? 'none'} x1={x1} x2={x2} y1={y} y2={y} stroke={c.ink2} strokeWidth={1.25} strokeDasharray="4 3" />;
        })}
        {rows.map(r => {
          if (r.spacer || !r.sprint || !r.sprint.scope) return null;
          const cx = xs(r.key) + band / 2;
          const y = ys(r.sprint.scope) - 7;
          if (!Number.isFinite(cx) || !Number.isFinite(y)) return null;
          const text = r.sprint.status === 'upcoming' ? fmt(r.sprint.scope) : `${fmt(r.sprint.completed)}/${fmt(r.sprint.scope)}`;
          return (
            // A card-coloured halo keeps the value legible where the average line crosses it.
            <text
              key={r.key}
              x={cx}
              y={y}
              textAnchor="middle"
              {...AXIS_FONT}
              fill={r.sprint.status === 'active' ? c.ink : c.ink3}
              fontWeight={r.sprint.status === 'active' ? 600 : 400}
              stroke={c.card}
              strokeWidth={3}
              strokeLinejoin="round"
              paintOrder="stroke"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {text}
            </text>
          );
        })}
      </g>
    );
  };

  return (
    <ReportCard
      title="Velocity"
      description="Points completed per sprint against its scope. Unestimated issues count as 1 point."
      aside={aside}
      className={className}
      bodyClassName="flex flex-col"
    >
      {empty ? (
        <CardEmpty
          className="min-h-[260px] flex-1"
          title={team && sprintsOff ? `${team.name} doesn’t run sprints` : 'No sprints in this window'}
          action={
            team && sprintsOff ? (
              <Button asChild variant="secondary" size="sm">
                <Link to={`/settings/teams/${team.id}`}>Team settings</Link>
              </Button>
            ) : undefined
          }
        >
          {team && sprintsOff
            ? 'Turn on sprints in team settings to track velocity.'
            : sprintsOff
              ? 'No team runs sprints yet. Turn them on in team settings to track velocity.'
              : 'Velocity appears once a team plans work into sprints.'}
        </CardEmpty>
      ) : (
        <>
          <LegendRow className="mb-3">
            {multi ? (
              averages.map(a => <LegendKey key={a.teamId ?? 'none'} color={a.team?.color || c.ink2} label={`${a.team?.key ?? 'No team'} completed`} />)
            ) : (
              <LegendKey color={c.ink} label="Completed" />
            )}
            <LegendKey color={restFill} label="Not completed" />
            {hasUpcoming && <LegendKey outline color={c.alpha('ink3', 0.6)} label="Planned" />}
            <LegendKey kind="line" dashed color={c.ink2} label="Average" />
          </LegendRow>
          <div className="relative -mx-2 flex-1" style={{ minHeight: PLOT_HEIGHT }}>
            <div ref={scroller} onScroll={measure} className="absolute inset-0 overflow-x-auto overflow-y-hidden no-scrollbar">
              <div style={{ minWidth: Math.max(340, rows.length * 62) }} className={cn('h-full', hovered?.sprint && 'cursor-pointer')}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={rows}
                    margin={{ top: 22, right: 8, bottom: 0, left: -8 }}
                    barCategoryGap="30%"
                    onMouseMove={(s: { activeTooltipIndex?: number } | null) => setHoverIndex(typeof s?.activeTooltipIndex === 'number' ? s.activeTooltipIndex : null)}
                    onMouseLeave={() => setHoverIndex(null)}
                    onClick={(s: { activeTooltipIndex?: number } | null) => {
                      const row = typeof s?.activeTooltipIndex === 'number' ? rows[s.activeTooltipIndex] : undefined;
                      if (row?.sprint) navigate(`/sprint/${row.sprint.sprintId}`);
                    }}
                  >
                    <CartesianGrid vertical={false} stroke={c.lineStrong} strokeDasharray="3 4" />
                    <XAxis dataKey="key" interval={0} height={42} tickLine={false} axisLine={{ stroke: c.lineStrong }} tick={Tick} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ ...AXIS_FONT, fill: c.ink3 }} width={40} tickCount={5} />
                    <Tooltip
                      cursor={<Cursor />}
                      content={<VelocityTip colors={c} fillFor={fillFor} multi={multi} />}
                      isAnimationActive={false}
                      wrapperStyle={{ outline: 'none' }}
                    />
                    <Bar dataKey="completed" stackId="v" maxBarSize={26} shape={CompletedShape} isAnimationActive={false} />
                    <Bar dataKey="remaining" stackId="v" maxBarSize={26} shape={RemainingShape} isAnimationActive={false} />
                    <Customized component={Overlay} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* On a narrow screen the sprints scroll sideways; a fade at the cut edge says there's more. */}
            {edges.left && <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent" />}
            {edges.right && <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent" />}
          </div>
          {edges.right && !edges.left && <p className="mt-1 text-meta text-ink-3 sm:hidden">Swipe to see every sprint</p>}
          {/* The bars are pointer targets; keyboard and screen-reader users get the same sprints as links. */}
          <ul className="sr-only">
            {rows
              .filter(r => r.sprint)
              .map(r => (
                <li key={r.key}>
                  <Link to={`/sprint/${r.sprint!.sprintId}`}>
                    {r.team ? `${r.team.name} ` : ''}
                    {r.sprint!.name}: {fmt(r.sprint!.completed)} of {fmt(r.sprint!.scope)} points completed
                  </Link>
                </li>
              ))}
          </ul>
        </>
      )}
    </ReportCard>
  );
}

function VelocityTip({
  active,
  payload,
  colors: c,
  fillFor,
  multi,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  colors: ChartColors;
  fillFor: (r: Row) => string;
  multi: boolean;
}) {
  const ws = useWorkspace();
  const row = payload?.[0]?.payload;
  if (!active || !row?.sprint) return null;
  const s = row.sprint;
  const sprint = ws.sprintById.get(s.sprintId);
  const range = s.startDate ? `${shortDate(s.startDate)}${sprint?.endDate ? ` – ${shortDate(sprint.endDate)}` : ''}` : undefined;
  const state = s.status === 'active' ? 'Current sprint' : s.status === 'upcoming' ? 'Upcoming' : sprint && !sprint.completedAt ? 'Ended, not closed' : 'Finished';
  const onPrimary = c.onPrimary;
  return (
    <ChartTip title={`${multi && row.team ? `${row.team.key} · ` : ''}${s.name}`} subtitle={[state, range].filter(Boolean).join(' · ')}>
      {s.status === 'upcoming' ? (
        <ChartTipRow swatch={<TipSquare color={c.alpha('onPrimary', 0.45)} />} label="Planned scope" value={ptsOf(s.scope)} />
      ) : (
        <>
          <ChartTipRow swatch={<TipSquare color={multi ? fillFor(row) : onPrimary} />} label="Completed" value={ptsOf(s.completed)} />
          <ChartTipRow
            swatch={<TipSquare color={c.alpha('onPrimary', 0.45)} />}
            label={s.status === 'active' ? 'Remaining' : 'Not completed'}
            value={ptsOf(Math.max(0, s.scope - s.completed))}
          />
          <ChartTipRow label="Of scope" value={`${percent(s.completed, s.scope)}%`} />
          <ChartTipRow label="Issues done" value={fmt(s.completedCount)} />
        </>
      )}
      <div className="pt-1 text-on-primary/70">Click to open the sprint</div>
    </ChartTip>
  );
}

export function VelocitySkeleton({ className }: { className?: string }) {
  const heights = [52, 64, 58, 72, 48, 66, 40, 30];
  return (
    <ReportCard title="Velocity" description="Points completed per sprint against its scope." className={className} aside={<Skeleton className="h-10 w-32" />}>
      <div className="mb-3 flex gap-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="pl-8">
        <div className="flex h-[206px] items-end justify-around border-b border-line pt-4">
          {heights.map((h, i) => (
            <div key={i} className="skeleton w-6 rounded-b-none" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="flex h-[42px] justify-around pt-2">
          {heights.map((_, i) => (
            <Skeleton key={i} className="h-2.5 w-10" />
          ))}
        </div>
      </div>
    </ReportCard>
  );
}
