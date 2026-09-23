import { PriorityGlyph, TypeGlyph } from '../../glyphs';
import { PRIORITIES } from '../../lib/constants';
import { percent } from '../../lib/format';
import type { Team } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Skeleton } from '../../ui/Layout';
import { Tooltip } from '../../ui/Tooltip';
import { cn } from '../../ui/cn';
import { AsideNote, CardEmpty, LegendKey, LegendRow, Meter, ReportCard, fmt, useChartColors, type Analytics } from './shared';

/* ---------------------------------------------------------------- Priority */

export function PriorityBreakdown({ data, className }: { data: Analytics; className?: string }) {
  const counts = new Map(data.byPriority.map(p => [p.priority, p.open]));
  const rows = PRIORITIES.map(p => ({ value: p.value, label: p.label, open: counts.get(p.value) ?? 0 }));
  const total = rows.reduce((s, r) => s + r.open, 0);
  const max = Math.max(1, ...rows.map(r => r.open));

  return (
    <ReportCard title="Open by priority" description="Where the urgency in open work sits." className={className} aside={total > 0 && <AsideNote>{fmt(total)} open</AsideNote>}>
      {total === 0 ? (
        <CardEmpty className="h-40" title="No open issues" />
      ) : (
        <div>
          {rows.map(r => (
            <div key={r.value} className="grid h-8 grid-cols-[7rem_minmax(0,1fr)_2rem_2.25rem] items-center gap-3 text-ui">
              <span className="flex min-w-0 items-center gap-2">
                <PriorityGlyph priority={r.value} />
                <span className={cn('truncate', r.open ? 'text-ink' : 'text-ink-3')}>{r.label}</span>
              </span>
              <Meter value={r.open} max={max} fillClassName={r.value === 1 ? 'bg-danger' : 'bg-ink'} />
              <span className={cn('tabular text-right', r.open ? 'text-ink' : 'text-ink-3')}>{fmt(r.open)}</span>
              <span className="tabular text-right text-meta text-ink-3">{percent(r.open, total)}%</span>
            </div>
          ))}
        </div>
      )}
    </ReportCard>
  );
}

/* -------------------------------------------------------------------- Type */

/** Open and done on one scale, so "lots open, little finished" shows up as a shape. */
function TwinBars({ open, done, max, label }: { open: number; done: number; max: number; label: string }) {
  return (
    <Tooltip content={label}>
      <div className="flex min-w-0 flex-col gap-[3px] py-1" tabIndex={0} aria-label={label}>
        <Meter value={open} max={max} className="h-[5px] bg-transparent" fillClassName="bg-ink" />
        <Meter value={done} max={max} className="h-[5px] bg-transparent" fillClassName="bg-success" />
      </div>
    </Tooltip>
  );
}

export function TypeBreakdown({ data, weeks, className }: { data: Analytics; weeks: number; className?: string }) {
  const c = useChartColors();
  const rows = data.byType.filter(t => t.open > 0 || t.completed > 0).sort((a, b) => b.open + b.completed - (a.open + a.completed) || a.type.localeCompare(b.type));
  const max = Math.max(1, ...rows.flatMap(r => [r.open, r.completed]));

  return (
    <ReportCard
      title="By type"
      description={`Open now, and done in the last ${weeks} weeks.`}
      className={className}
      aside={
        rows.length > 0 && (
          <LegendRow>
            <LegendKey color={c.ink} label="Open" />
            <LegendKey color={c.success} label="Done" />
          </LegendRow>
        )
      }
    >
      {rows.length === 0 ? (
        <CardEmpty className="h-40" title="Nothing to break down" />
      ) : (
        <div>
          <div className="grid h-6 grid-cols-[7rem_minmax(0,1fr)_2rem_2.25rem] items-center gap-3 text-micro font-semibold uppercase text-ink-3">
            <span>Type</span>
            <span />
            <span className="text-right">Open</span>
            <span className="text-right">Done</span>
          </div>
          {rows.map(r => (
            <div key={r.type} className="grid h-8 grid-cols-[7rem_minmax(0,1fr)_2rem_2.25rem] items-center gap-3 text-ui">
              <span className="flex min-w-0 items-center gap-2">
                <TypeGlyph type={r.type} />
                <span className="truncate text-ink">{r.type}</span>
              </span>
              <TwinBars open={r.open} done={r.completed} max={max} label={`${r.type}: ${fmt(r.open)} open, ${fmt(r.completed)} done in ${weeks} weeks`} />
              <span className={cn('tabular text-right', r.open ? 'text-ink' : 'text-ink-3')}>{fmt(r.open)}</span>
              <span className={cn('tabular text-right', r.completed ? 'text-ink' : 'text-ink-3')}>{fmt(r.completed)}</span>
            </div>
          ))}
        </div>
      )}
    </ReportCard>
  );
}

/* ------------------------------------------------------------------ Labels */

const TOP_LABELS = 8;

export function LabelBreakdown({ data, weeks, team, className }: { data: Analytics; weeks: number; team: Team | null; className?: string }) {
  const ws = useWorkspace();
  const c = useChartColors();
  const rows = data.byLabel
    .map(l => ({ ...l, label: ws.labelById.get(l.labelId) }))
    .filter(l => l.label && (l.open > 0 || l.completed > 0))
    .slice(0, TOP_LABELS);
  const max = Math.max(1, ...rows.flatMap(r => [r.open, r.completed]));
  const half = Math.ceil(rows.length / 2);
  const columns = [rows.slice(0, half), rows.slice(half)].filter(col => col.length);

  const head = (
    <div className="grid h-6 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_2rem_2.25rem] items-center gap-3 text-micro font-semibold uppercase text-ink-3">
      <span>Label</span>
      <span />
      <span className="text-right">Open</span>
      <span className="text-right">Done</span>
    </div>
  );

  return (
    <ReportCard
      title="Top labels"
      description={`The labels most open work carries, with what was done in the last ${weeks} weeks.`}
      className={className}
      aside={
        rows.length > 0 && (
          <LegendRow>
            <LegendKey color={c.ink} label="Open" />
            <LegendKey color={c.success} label="Done" />
          </LegendRow>
        )
      }
    >
      {rows.length === 0 ? (
        <CardEmpty className="h-40" title="No labelled issues">
          Labels applied to issues show up here.
        </CardEmpty>
      ) : (
        <div className="grid gap-x-10 md:grid-cols-2">
          {columns.map((col, ci) => (
            <div key={ci} className="min-w-0">
              <div className={cn(ci > 0 && 'hidden md:block')}>{head}</div>
              {col.map(r => {
                const labelTeam = !team && r.label!.teamId ? ws.teamById.get(r.label!.teamId) : undefined;
                return (
                  <div key={r.labelId} className="grid h-8 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_2rem_2.25rem] items-center gap-3 text-ui">
                    <span className="flex min-w-0 items-center gap-2" title={r.label!.description ?? r.label!.name}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.label!.color }} aria-hidden />
                      <span className="truncate text-ink">{r.label!.name}</span>
                      {labelTeam && <span className="shrink-0 font-mono text-[10.5px] text-ink-3">{labelTeam.key}</span>}
                    </span>
                    <TwinBars open={r.open} done={r.completed} max={max} label={`${r.label!.name}: ${fmt(r.open)} open, ${fmt(r.completed)} done in ${weeks} weeks`} />
                    <span className={cn('tabular text-right', r.open ? 'text-ink' : 'text-ink-3')}>{fmt(r.open)}</span>
                    <span className={cn('tabular text-right', r.completed ? 'text-ink' : 'text-ink-3')}>{fmt(r.completed)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </ReportCard>
  );
}

/* --------------------------------------------------------------- Skeletons */

export function BarListSkeleton({ title, rows = 5, className }: { title: string; rows?: number; className?: string }) {
  return (
    <ReportCard title={title} className={className}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid h-8 grid-cols-[7rem_minmax(0,1fr)_2rem] items-center gap-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-1.5 rounded-full" />
          <Skeleton className="ml-auto h-3 w-5" />
        </div>
      ))}
    </ReportCard>
  );
}
