import { ArrowRight, CalendarPlus, GearSix, WarningCircle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { Mark, SprintGlyph } from '../../glyphs';
import { percent, plural } from '../../lib/format';
import { useSprint } from '../../lib/queries';
import type { Member, SprintSummary, Team } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { AvatarStack } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Chip';
import { Card, Eyebrow, Skeleton } from '../../ui/Layout';
import { ProgressBar } from '../../ui/Progress';
import { Tooltip } from '../../ui/Tooltip';
import { GUEST_TEAM_SETTINGS, useEnableSprints } from './EnableSprints';
import { dateRange, daysLeft, fmtPts, pts, scopePoints, sprintPhase, teamSprintsPath, timingLabel } from './sprint-utils';
import { useSprintDialogs } from './SprintDialogs';

/** One team's sprint at a glance, for the all-teams overview. */
export function TeamSprintCard({ team, sprints }: { team: Team; sprints: SprintSummary[] }) {
  const current = sprints.find(s => s.status === 'active');
  const upcoming = sprints.filter(s => s.status === 'upcoming').sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
  // With nothing running, the next planned sprint takes the body and the footer looks one further ahead.
  const featured = current ?? upcoming[0];
  const after = current ? upcoming[0] : upcoming[1];
  // Ended but never closed: its unfinished work still needs a decision, so the overview says so too.
  const unclosed = sprints.filter(s => sprintPhase(s) === 'ended');

  return (
    <Card as="section" className="flex min-w-0 flex-col animate-rise-in">
      <header className="flex h-12 items-center gap-2.5 border-b border-line px-4">
        <Mark icon={team.icon} color={team.color} name={team.name} size={20} />
        <Link to={teamSprintsPath(team)} title={team.name} className="min-w-0 truncate text-title font-semibold text-ink hover:underline">
          {team.name}
        </Link>
        <span className="font-mono text-[11px] text-ink-3">{team.key}</span>
        {team.sprintsEnabled && (
          <Button asChild variant="ghost" size="xs" className="ml-auto shrink-0">
            <Link to={teamSprintsPath(team)} aria-label={`All ${team.name} sprints`}>
              All sprints <ArrowRight size={12} weight="bold" />
            </Link>
          </Button>
        )}
      </header>
      <div className="flex flex-1 flex-col p-4">
        {!team.sprintsEnabled ? (
          <SprintsOff team={team} />
        ) : current ? (
          <CurrentBody sprint={current} />
        ) : featured ? (
          <UpcomingBody sprint={featured} />
        ) : (
          <NoneRunning team={team} />
        )}
      </div>
      {team.sprintsEnabled && unclosed.length > 0 && <UnclosedStrip sprints={unclosed} />}
      {team.sprintsEnabled && (
        <footer className="flex min-h-10 items-center gap-2 border-t border-line px-4 py-2 text-meta text-ink-3">
          {after ? (
            <>
              <SprintGlyph status="upcoming" size={13} />
              <span className="min-w-0 truncate">
                Then{' '}
                <Link to={`/sprint/${after.id}`} className="font-medium text-ink-2 hover:text-ink hover:underline">
                  {after.name}
                </Link>{' '}
                · {timingLabel(after).replace(/^Starts/, 'starts')}
              </span>
              <span className="tabular ml-auto shrink-0">{pts(scopePoints(after))} planned</span>
            </>
          ) : featured ? (
            <span>Nothing planned after this one.</span>
          ) : (
            <span>Nothing planned yet.</span>
          )}
        </footer>
      )}
    </Card>
  );
}

function CurrentBody({ sprint }: { sprint: SprintSummary }) {
  const ws = useWorkspace();
  const { data } = useSprint(sprint.id);
  const points = data ? data.totals.points : scopePoints(sprint);
  const done = data ? data.totals.completedPoints : sprint.completedPoints;
  const inFlight = data?.totals.startedPoints ?? 0;
  const left = daysLeft(sprint);
  const people = (data?.byAssignee ?? []).map(r => (r.id ? ws.memberById.get(r.id) : undefined)).filter((m): m is Member => Boolean(m));

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Current sprint</Eyebrow>
        <Badge tone={left <= 2 ? 'warning' : 'neutral'}>{timingLabel(sprint)}</Badge>
      </div>
      <Link to={`/sprint/${sprint.id}`} title={sprint.name} className="mt-1 truncate font-display text-[26px] leading-8 text-ink decoration-highlight decoration-[3px] underline-offset-[5px] hover:underline">
        {sprint.name}
      </Link>
      <p className="tabular text-meta text-ink-3">{dateRange(sprint.startDate, sprint.endDate)}</p>
      <div className="mt-auto pt-5">
        <div className="mb-2 flex items-baseline gap-1.5">
          <span className="tabular text-title font-semibold text-ink">{fmtPts(done)}</span>
          <span className="tabular text-ui text-ink-3">/ {fmtPts(points)} pts</span>
          <span className="tabular ml-auto text-ui font-medium text-ink-2">{percent(done, points)}%</span>
        </div>
        <ProgressBar
          height={6}
          max={Math.max(points, 1)}
          segments={[
            { value: done, className: 'bg-success', label: `${fmtPts(done)} pts done` },
            { value: inFlight, className: 'bg-warning', label: `${fmtPts(inFlight)} pts in flight` },
          ]}
        />
        <div className="mt-3 flex h-6 items-center justify-between gap-2">
          {people.length ? (
            <span title={people.map(p => p.name).join(', ')}>
              <AvatarStack people={people} size={22} max={5} />
            </span>
          ) : data ? (
            <span className="text-meta text-ink-3">Nobody assigned yet</span>
          ) : (
            <Skeleton className="h-5 w-20 rounded-full" />
          )}
          {data ? <span className="tabular text-meta text-ink-3">{plural(data.totals.issues, 'issue')}</span> : <Skeleton className="h-3 w-12" />}
        </div>
      </div>
    </div>
  );
}

/** Nothing running, but the next one is planned: show that instead of asking to plan one. */
function UpcomingBody({ sprint }: { sprint: SprintSummary }) {
  const points = scopePoints(sprint);
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Next sprint · none running</Eyebrow>
        <Badge>{timingLabel(sprint)}</Badge>
      </div>
      <Link to={`/sprint/${sprint.id}`} title={sprint.name} className="mt-1 truncate font-display text-[26px] leading-8 text-ink decoration-highlight decoration-[3px] underline-offset-[5px] hover:underline">
        {sprint.name}
      </Link>
      <p className="tabular text-meta text-ink-3">{dateRange(sprint.startDate, sprint.endDate)}</p>
      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
        <div className="text-meta text-ink-3">
          <span className="tabular text-title font-semibold text-ink">{fmtPts(points)}</span> pts planned · {plural(sprint.issues, 'issue')}
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to={`/sprint/${sprint.id}`}>
            Plan <ArrowRight size={12} weight="bold" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function UnclosedStrip({ sprints }: { sprints: SprintSummary[] }) {
  const dialogs = useSprintDialogs();
  const first = sprints[0];
  return (
    <div className="flex min-h-10 items-center gap-2 border-t border-warning/25 bg-warning/10 px-4 py-1.5 text-meta text-ink">
      <WarningCircle size={15} weight="fill" className="shrink-0 text-warning" />
      <span className="min-w-0 truncate">
        <Link to={`/sprint/${first.id}`} className="font-semibold hover:underline">
          {first.name}
        </Link>{' '}
        {sprints.length > 1 ? `and ${sprints.length - 1} more aren’t closed` : 'ended and isn’t closed'}
      </span>
      <Button variant="ghost" size="xs" className="ml-auto shrink-0 text-ink" onClick={() => dialogs.openComplete(first)}>
        Complete…
      </Button>
    </div>
  );
}

function NoneRunning({ team }: { team: Team }) {
  const dialogs = useSprintDialogs();
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-1 rounded-md bg-sunken px-4 py-5">
      <span className="font-display text-[22px] leading-7 text-ink">No sprint running</span>
      <span className="text-ui text-ink-2">Nothing is planned yet. Give the team a shared deadline.</span>
      <Button variant="secondary" size="sm" className="mt-3" leading={<CalendarPlus size={15} />} onClick={() => dialogs.openEditor(team.id)}>
        New sprint
      </Button>
    </div>
  );
}

function SprintsOff({ team }: { team: Team }) {
  const { enable, busy, guest } = useEnableSprints(team);
  const button = (
    <Button variant="secondary" size="sm" onClick={enable} loading={busy} disabled={guest}>
      Turn on sprints
    </Button>
  );
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-1 rounded-md border border-dashed border-line-strong px-4 py-5">
      <span className="font-display text-[22px] leading-7 text-ink-2">Sprints are off</span>
      <span className="text-ui text-ink-3">This team works without time boxes.</span>
      <div className="mt-3 flex flex-wrap items-center gap-1">
        {guest ? (
          <Tooltip content={GUEST_TEAM_SETTINGS}>
            <span tabIndex={0}>{button}</span>
          </Tooltip>
        ) : (
          button
        )}
        <Button asChild variant="ghost" size="sm">
          <Link to={`/settings/teams/${team.id}`}>
            <GearSix size={15} /> Team settings
          </Link>
        </Button>
      </div>
    </div>
  );
}
