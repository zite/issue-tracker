import { PushPin } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { Mark, SprintGlyph } from '../../glyphs';
import { percent } from '../../lib/format';
import type { SprintSummary } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Badge } from '../../ui/Chip';
import { cn } from '../../ui/cn';
import { Card } from '../../ui/Layout';
import { ProgressRing } from '../../ui/Progress';
import { Tooltip } from '../../ui/Tooltip';
import { completedEarly, dateRange, fmtPts, pointsPerWeek, scopePoints, sprintPhase } from './sprint-utils';
import { SprintMenu } from './SprintMenu';

// Literal class strings so Tailwind sees every grid template.
const GRID = {
  team: 'sm:grid-cols-[minmax(150px,1.6fr)_minmax(120px,0.9fr)_minmax(128px,0.9fr)_minmax(56px,0.45fr)_minmax(48px,0.4fr)_minmax(150px,1.1fr)_minmax(84px,0.55fr)_28px]',
  plain: 'sm:grid-cols-[minmax(180px,2.2fr)_minmax(132px,1fr)_minmax(64px,0.5fr)_minmax(56px,0.45fr)_minmax(170px,1.3fr)_minmax(96px,0.6fr)_28px]',
};

const head = 'text-micro font-semibold uppercase text-ink-3';

/** Past sprints, newest first, as a ledger you can compare down the columns. */
export function HistoryLedger({ sprints, showTeam }: { sprints: SprintSummary[]; showTeam?: boolean }) {
  const ws = useWorkspace();
  const grid = showTeam ? GRID.team : GRID.plain;
  const velocities = sprints.map(s => pointsPerWeek(s) ?? 0);
  const maxVelocity = Math.max(1, ...velocities);

  return (
    <Card className="overflow-hidden">
      <div role="table" aria-label="Sprint history">
        <div role="row" className={cn('hidden h-9 items-center gap-x-6 border-b border-line bg-sunken px-4 sm:grid', grid)}>
          <span role="columnheader" className={head}>Sprint</span>
          {showTeam && <span role="columnheader" className={head}>Team</span>}
          <span role="columnheader" className={head}>Dates</span>
          <span role="columnheader" className={cn(head, 'text-right')}>Scope</span>
          <span role="columnheader" className={cn(head, 'text-right')}>Done</span>
          <Tooltip content="Completed points per week, so sprints of different lengths compare">
            <span role="columnheader" className={cn(head, 'w-fit cursor-help underline decoration-line-strong decoration-dotted underline-offset-4')}>
              Velocity
            </span>
          </Tooltip>
          <span role="columnheader" className={cn(head, 'text-right')}>Completion</span>
          <span />
        </div>
        {sprints.map((s, i) => {
          const team = s.teamId ? ws.teamById.get(s.teamId) : undefined;
          const teamSprints = s.teamId ? ws.sprintsByTeam.get(s.teamId) ?? [] : [];
          return (
            <LedgerRow
              key={s.id}
              sprint={s}
              grid={grid}
              team={showTeam ? team : undefined}
              velocity={velocities[i]}
              maxVelocity={maxVelocity}
              early={completedEarly(s, teamSprints, team?.sprintDurationWeeks ?? 2)}
              className={i > 0 ? 'border-t border-line' : undefined}
            />
          );
        })}
      </div>
    </Card>
  );
}

function LedgerRow({ sprint, grid, team, velocity, maxVelocity, early, className }: {
  sprint: SprintSummary;
  grid: string;
  team?: { name: string; icon: string | null; color: string | null };
  velocity: number;
  maxVelocity: number;
  early: boolean;
  className?: string;
}) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const phase = sprintPhase(sprint);
  const points = scopePoints(sprint);
  const pct = percent(sprint.completedPoints, points);
  const pinned = ws.isPinned('Sprint', sprint.id);
  const open = () => navigate(`/sprint/${sprint.id}`);

  const badges = (
    <>
      {phase === 'ended' && <Badge tone="warning">Not closed</Badge>}
      {early && <Badge>Closed early</Badge>}
      {pinned && <PushPin size={12} weight="fill" className="shrink-0 text-ink-3" aria-label="Pinned" />}
    </>
  );

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={open}
      onKeyDown={e => e.key === 'Enter' && e.target === e.currentTarget && open()}
      className={cn(
        'group grid min-h-11 cursor-pointer grid-cols-[minmax(0,1fr)_28px] items-center gap-x-6 px-4 py-2 text-ui transition-colors hover:bg-hover/60 focus-visible:bg-hover/60 focus-visible:outline-offset-[-2px] sm:py-0',
        grid,
        className,
      )}
    >
      <div role="cell" className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2.5">
        <span className="flex min-w-0 items-center gap-2.5">
          <SprintGlyph status="completed" size={15} />
          <span className="max-w-[60%] shrink-0 truncate font-medium text-ink">{sprint.name}</span>
          {team && (
            <span className="flex min-w-0 items-center gap-1 text-meta text-ink-3 sm:hidden">
              <Mark icon={team.icon} color={team.color} name={team.name} size={14} />
              <span className="truncate">{team.name}</span>
            </span>
          )}
          {badges}
          {sprint.goal && <span className="hidden min-w-0 truncate text-ink-3 lg:inline">{sprint.goal}</span>}
        </span>
        {/* Mobile: the numbers collapse into one line under the name. */}
        <span className="tabular truncate pl-[25px] text-meta text-ink-3 sm:hidden">
          {dateRange(sprint.startDate, sprint.endDate)} · {fmtPts(sprint.completedPoints)}/{fmtPts(points)} pts · {pct}%
        </span>
      </div>
      {team && (
        <span role="cell" className="hidden min-w-0 items-center gap-2 text-ink-2 sm:flex">
          <Mark icon={team.icon} color={team.color} name={team.name} size={16} />
          <span className="truncate">{team.name}</span>
        </span>
      )}
      <span role="cell" className="tabular hidden truncate text-ink-2 sm:block">
        {dateRange(sprint.startDate, sprint.endDate)}
      </span>
      <span role="cell" className="tabular hidden text-right text-ink sm:block">
        {fmtPts(points)} <span className="text-meta text-ink-3">pts</span>
      </span>
      <span role="cell" className="tabular hidden text-right text-ink sm:block">
        {fmtPts(sprint.completedPoints)}
      </span>
      <span role="cell" className="hidden items-center gap-2.5 sm:flex">
        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken">
          <span className="block h-full rounded-full bg-ink-2" style={{ width: `${velocity > 0 ? Math.max(2, (velocity / maxVelocity) * 100) : 0}%` }} />
        </span>
        <span className="tabular w-[60px] shrink-0 text-right text-ink">
          {fmtPts(velocity)} <span className="text-meta text-ink-3">/wk</span>
        </span>
      </span>
      <span role="cell" className="hidden items-center justify-end gap-2 sm:flex">
        <ProgressRing value={points ? sprint.completedPoints / points : 0} size={14} barClassName={pct >= 80 ? 'text-success' : 'text-ink'} />
        <span className="tabular w-9 text-right text-ink">{pct}%</span>
      </span>
      <span role="cell" className="flex justify-end">
        <SprintMenu sprint={sprint} issueCount={sprint.issues} className="sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 sm:data-[state=open]:opacity-100" />
      </span>
    </div>
  );
}
