import { StatusGlyph, STATUS_FALLBACK_COLOR } from '../../glyphs';
import { STATUS_TYPE_LABEL } from '../../lib/constants';
import { percent } from '../../lib/format';
import type { Team } from '../../lib/types';
import { useWorkspace, type Workspace } from '../../lib/workspace';
import { Skeleton } from '../../ui/Layout';
import { Tooltip } from '../../ui/Tooltip';
import { cn } from '../../ui/cn';
import { AsideNote, CardEmpty, ReportCard, fmt, type Analytics } from './shared';

const STAGES = ['intake', 'backlog', 'unstarted', 'started', 'completed'] as const;

/** The colour a team's workflow already uses for a stage, so the bar matches every status glyph in the app. */
function stageStatus(ws: Workspace, team: Team | null, type: string) {
  const pool = (team && ws.statusesByTeam.get(team.id)) || [...ws.statuses].sort((a, b) => a.position - b.position);
  const status = pool.find(s => s.type === type);
  return { type, name: STATUS_TYPE_LABEL[type], color: status?.color || STATUS_FALLBACK_COLOR[type] };
}

export function StatusDistribution({ data, team, className }: { data: Analytics; team: Team | null; className?: string }) {
  const ws = useWorkspace();
  const counts = new Map(data.byStatusType.map(s => [s.statusType, s.count]));
  // Canceled work says nothing about delivery, and intake only earns a slot when something is waiting.
  const stages = STAGES.map(type => ({ ...stageStatus(ws, team, type), count: counts.get(type) ?? 0 })).filter(s => s.count > 0 || s.type !== 'intake');
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  const canceled = counts.get('canceled') ?? 0;

  return (
    <ReportCard title="Status distribution" description="Every issue by stage." className={className} aside={total > 0 && <AsideNote>{fmt(total)} issues</AsideNote>}>
      {total === 0 ? (
        <CardEmpty className="h-28" title="No issues yet" />
      ) : (
        <>
          <div className="flex h-3 w-full gap-[2px]" role="img" aria-label={stages.map(s => `${s.name} ${s.count}`).join(', ')}>
            {stages
              .filter(s => s.count > 0)
              .map(s => (
                <Tooltip key={s.type} content={`${s.name} · ${fmt(s.count)} (${percent(s.count, total)}%)`}>
                  <div
                    className="h-full rounded-[3px] transition-[filter] first:rounded-l-[5px] last:rounded-r-[5px] hover:brightness-110"
                    style={{ flexGrow: s.count, flexBasis: 0, minWidth: 4, background: s.color }}
                  />
                </Tooltip>
              ))}
          </div>
          <div className="mt-3.5 grid grid-cols-1 gap-x-6 gap-y-1 min-[420px]:grid-cols-2">
            {stages.map(s => (
              <div key={s.type} className="flex h-6 min-w-0 items-center gap-2 text-ui">
                <StatusGlyph status={{ type: s.type, color: s.color, name: s.name }} size={14} />
                <span className={cn('truncate', s.count ? 'text-ink' : 'text-ink-3')}>{s.name}</span>
                <span className={cn('tabular ml-auto', s.count ? 'text-ink' : 'text-ink-3')}>{fmt(s.count)}</span>
                <span className="tabular w-8 text-right text-meta text-ink-3">{percent(s.count, total)}%</span>
              </div>
            ))}
          </div>
          {canceled > 0 && <p className="mt-2.5 text-meta text-ink-3">{fmt(canceled)} canceled not shown</p>}
        </>
      )}
    </ReportCard>
  );
}

// An ordinal ramp in ink: older buckets are heavier, so a stale backlog reads as weight on the right.
const AGE_FILL = ['bg-ink/20', 'bg-ink/40', 'bg-ink/65', 'bg-ink/90'];
const PLOT = 84;

export function AgeBreakdown({ data, className }: { data: Analytics; className?: string }) {
  const buckets = data.ageing;
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const max = Math.max(1, ...buckets.map(b => b.count));
  const overMonth = buckets.slice(2).reduce((s, b) => s + b.count, 0);

  return (
    <ReportCard
      title="Open issue age"
      description="How long open work has been waiting."
      className={className}
      aside={total > 0 && <AsideNote>{percent(overMonth, total)}% over a month</AsideNote>}
    >
      {total === 0 ? (
        <CardEmpty className="h-28" title="No open issues" />
      ) : (
        <div role="list">
          <div className="flex items-end gap-3 border-b border-line-strong" style={{ height: PLOT + 22 }}>
            {buckets.map((b, i) => (
              <Tooltip key={b.bucket} content={`${fmt(b.count)} open ${b.count === 1 ? 'issue' : 'issues'} · ${b.bucket} old`}>
                <div role="listitem" tabIndex={0} aria-label={`${b.bucket}: ${fmt(b.count)}`} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t-sm outline-none">
                  <span className={cn('tabular mb-1 text-ui', b.count ? 'text-ink' : 'text-ink-3')}>{fmt(b.count)}</span>
                  <div
                    className={cn('w-full max-w-[44px] rounded-t-[4px] transition-[height,filter] duration-500 group-hover:brightness-90 dark:group-hover:brightness-110', AGE_FILL[i])}
                    style={{ height: Math.round((b.count / max) * PLOT), minHeight: b.count ? 2 : 0 }}
                  />
                </div>
              </Tooltip>
            ))}
          </div>
          <div className="mt-1.5 flex gap-3">
            {buckets.map(b => (
              <span key={b.bucket} className="min-w-0 flex-1 truncate text-center text-meta text-ink-3">
                {b.bucket}
              </span>
            ))}
          </div>
        </div>
      )}
    </ReportCard>
  );
}

export function StatusSkeleton({ className }: { className?: string }) {
  return (
    <ReportCard title="Status distribution" className={className}>
      <Skeleton className="h-3 w-full" />
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-3" />
        ))}
      </div>
    </ReportCard>
  );
}

export function AgeSkeleton({ className }: { className?: string }) {
  return (
    <ReportCard title="Open issue age" className={className}>
      <div className="flex items-end gap-3 border-b border-line" style={{ height: PLOT + 22 }}>
        {[60, 85, 40, 30].map((h, i) => (
          <div key={i} className="skeleton mx-auto w-full max-w-[44px] rounded-b-none" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="mt-2 flex gap-3">
        {[0, 1, 2, 3].map(i => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
    </ReportCard>
  );
}
