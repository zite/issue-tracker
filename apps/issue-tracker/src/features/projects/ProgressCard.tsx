import { Plus } from '@phosphor-icons/react';
import { format } from 'date-fns';
import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip as ChartTip, XAxis, YAxis } from 'recharts';
import { useAppActions } from '../../lib/app-actions';
import { parseDay, plural } from '../../lib/format';
import type { ProjectDetail } from '../../lib/types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Layout';
import { cn } from '../../ui/cn';
import { TONE_TEXT, isClosedStatus, rollupOf, targetNote, type Rollup } from './model';

const WEEK = 7 * 86_400_000;

const SEGMENTS = [
  { key: 'completed', label: 'Completed', cls: 'bg-success' },
  { key: 'started', label: 'In flight', cls: 'bg-warning' },
  { key: 'unstarted', label: 'Not started', cls: 'bg-line-strong' },
  { key: 'canceled', label: 'Canceled', cls: 'bg-[repeating-linear-gradient(135deg,rgb(var(--line-strong))_0_2px,transparent_2px_4px)]' },
] as const;

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { t: number; scope: number; completed: number; started: number } }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const items = [
    { label: 'Completed', value: row.completed, cls: 'bg-success' },
    { label: 'In flight', value: row.started, cls: 'bg-warning' },
    { label: 'Scope', value: row.scope, cls: 'bg-on-primary/50' },
  ];
  return (
    <div className="min-w-[150px] rounded-sm bg-primary px-2.5 py-2 text-meta text-on-primary shadow-pop">
      <div className="mb-1 font-semibold">Week of {format(row.t, 'MMM d')}</div>
      {items.map(i => (
        <div key={i.label} className="flex items-center gap-2 py-px">
          <span className={cn('h-1.5 w-1.5 rounded-full', i.cls)} aria-hidden />
          <span className="text-on-primary/75">{i.label}</span>
          <span className="tabular ml-auto font-medium">{i.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Scope as a dashed step, completed as the line that matters, in flight alongside, the target as a wall. */
function WeeklyChart({ progress, targetDate }: { progress: ProjectDetail['progress']; targetDate: string | null }) {
  const data = useMemo(() => progress.map(p => ({ t: parseDay(p.week).getTime(), scope: p.scope, completed: p.completed, started: p.started })), [progress]);
  const min = data[0].t;
  const max = data[data.length - 1].t;
  const target = targetDate ? parseDay(targetDate).getTime() : null;
  // Show the target when it falls on the chart, or near enough ahead to show the runway left.
  const showTarget = target != null && target >= min && target <= max + 8 * WEEK;
  const domainMax = showTarget && target! > max ? target! : max;
  const tick = { fontSize: 11, fill: 'rgb(var(--ink-3))' };

  return (
    <div>
      <div className="h-[200px] w-full" role="img" aria-label="Weekly progress: scope, in flight and completed issues">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 18, right: 14, bottom: 0, left: -14 }}>
            <CartesianGrid vertical={false} stroke="rgb(var(--line-strong))" strokeDasharray="2 4" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[min, domainMax]}
              tickFormatter={v => format(v, 'MMM d')}
              tick={tick}
              tickLine={false}
              axisLine={{ stroke: 'rgb(var(--line-strong))' }}
              minTickGap={36}
              tickMargin={6}
            />
            <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={40} />
            <ChartTip content={<ChartTooltip />} cursor={{ stroke: 'rgb(var(--ink-3))', strokeWidth: 1, strokeDasharray: '2 3' }} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="scope" stroke="rgb(var(--ink-3))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="started" stroke="rgb(var(--warning))" strokeWidth={1.75} dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: 'rgb(var(--warning))' }} isAnimationActive={false} />
            <Area
              type="monotone"
              dataKey="completed"
              stroke="rgb(var(--success))"
              strokeWidth={2.25}
              fill="rgb(var(--success))"
              fillOpacity={0.1}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--card))', fill: 'rgb(var(--success))' }}
              isAnimationActive={false}
            />
            {showTarget && (
              <ReferenceLine
                x={target!}
                stroke="rgb(var(--danger))"
                strokeDasharray="4 3"
                strokeWidth={1.25}
                label={{ value: 'Target', position: 'insideTopRight', fontSize: 11, fill: 'rgb(var(--danger))', dy: -14, dx: -2 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-[26px] text-meta text-ink-3">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 rounded-full bg-success" />Completed</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 rounded-full bg-warning" />In flight</span>
        <span className="flex items-center gap-1.5"><span className="w-3.5 border-t-[1.5px] border-dashed border-ink-3" />Scope</span>
        {showTarget && <span className="flex items-center gap-1.5"><span className="h-3 border-l-[1.5px] border-dashed border-danger" />Target</span>}
      </div>
    </div>
  );
}

export function useRollup(detail: ProjectDetail): Rollup {
  return useMemo(() => rollupOf(detail.breakdown, detail.project.status), [detail.breakdown, detail.project.status]);
}

/** The headline number, the status breakdown and the shape of the work over time. */
export function ProgressCard({ detail }: { detail: ProjectDetail }) {
  const app = useAppActions();
  const { project, progress } = detail;
  const rollup = useRollup(detail);
  const pct = Math.round(rollup.progress * 100);
  const scope = rollup.total - rollup.canceled;
  const note = targetNote(project, rollup.progress);

  if (rollup.total === 0) {
    return (
      <Card padded className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold text-ink">Progress</h2>
          <p className="mt-0.5 text-ui text-ink-2">No issues in this project yet. Progress, the breakdown and the weekly chart fill in as work is added and moves.</p>
        </div>
        <Button variant="secondary" leading={<Plus size={14} weight="bold" />} onClick={() => app.openCreateIssue({ projectId: project.id, teamId: project.teamId ?? undefined })}>
          Add issue
        </Button>
      </Card>
    );
  }

  return (
    <Card padded>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-micro font-semibold uppercase text-ink-3">Progress</h2>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="tabular font-display text-display text-ink">{pct}%</span>
            <span className="text-ui text-ink-2">complete</span>
          </div>
          <p className="tabular mt-0.5 text-ui text-ink-2">
            {rollup.completed} of {plural(scope, 'issue')}
            <span className="mx-1.5 text-ink-3">·</span>
            {rollup.completedPoints} of {rollup.points} pts
          </p>
        </div>
        <div className={cn('ml-auto pb-0.5 text-ui font-medium', TONE_TEXT[note.tone])}>{note.text}</div>
      </div>

      <div className="mt-4">
        <div
          className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full"
          role="img"
          aria-label={`${rollup.completed} completed, ${rollup.started} in flight, ${rollup.unstarted} not started, ${rollup.canceled} canceled`}
        >
          {SEGMENTS.map(s => {
            const n = rollup[s.key];
            if (!n) return null;
            return <div key={s.key} className={cn('h-full transition-[width] duration-500 first:rounded-l-full last:rounded-r-full', s.cls)} style={{ width: `${(n / rollup.total) * 100}%` }} />;
          })}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-meta text-ink-2">
          {SEGMENTS.map(s => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-[3px]', s.cls)} aria-hidden />
              {s.label}
              <span className="tabular font-semibold text-ink">{rollup[s.key]}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        {progress.length >= 2 ? (
          <WeeklyChart progress={progress} targetDate={isClosedStatus(project.status) ? null : project.targetDate} />
        ) : (
          <p className="text-meta text-ink-3">The weekly chart fills in once the project has a week or more of history.</p>
        )}
      </div>
    </Card>
  );
}
