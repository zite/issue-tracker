import { ArrowRight, CalendarPlus, PushPin, WarningCircle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { SprintGlyph } from '../../glyphs';
import { percent, plural, shortDate } from '../../lib/format';
import { useSprint } from '../../lib/queries';
import type { Member, SprintSummary, Team } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { AvatarStack } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Chip';
import { cn } from '../../ui/cn';
import { Card, EmptyState, Eyebrow, Skeleton } from '../../ui/Layout';
import { ProgressBar } from '../../ui/Progress';
import { BurndownSparkline } from './Burndown';
import { cadenceLabel, dateRange, daysLeft, fmtPts, pts, scopePoints, sprintDay, timingLabel } from './sprint-utils';
import { useSprintDialogs } from './SprintDialogs';
import { SprintMenu } from './SprintMenu';

/** The goal as a pull quote: serif italic with a highlighter rule. */
export function GoalQuote({ goal, className, clamp = true }: { goal: string; className?: string; clamp?: boolean }) {
  return (
    <blockquote
      className={cn(
        'whitespace-pre-line border-l-2 border-highlight pl-4 font-display text-[19px] italic leading-[27px] text-ink-2 text-pretty sm:text-[21px] sm:leading-[29px]',
        clamp && 'line-clamp-4',
        className,
      )}
    >
      {goal}
    </blockquote>
  );
}

export function StatColumn({ label, value, sub, swatch }: { label: string; value: string | number | null; sub?: string; swatch?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-micro font-semibold uppercase text-ink-3">
        {swatch && <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-[2px]', swatch)} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-title font-semibold text-ink">
        {value == null ? <Skeleton className="mt-1 h-4 w-6" /> : <span className="tabular">{value}</span>}
      </div>
      {sub && <div className="truncate text-meta text-ink-3">{sub}</div>}
    </div>
  );
}

const assigneesOf = (rows: Array<{ id: string | null }> | undefined, byId: Map<string, Member>) =>
  (rows ?? []).map(r => (r.id ? byId.get(r.id) : undefined)).filter((m): m is Member => Boolean(m));

/** The team's sprint in flight: the story on the left, the scoreboard on the right. */
export function CurrentSprintHero({ sprint }: { sprint: SprintSummary }) {
  const ws = useWorkspace();
  const { data } = useSprint(sprint.id);
  const t = data?.totals;
  const points = t ? t.points : scopePoints(sprint);
  const done = t ? t.completedPoints : sprint.completedPoints;
  const inFlight = t?.startedPoints ?? 0;
  const pct = percent(done, points);
  const day = sprintDay(sprint);
  const left = daysLeft(sprint);
  const people = assigneesOf(data?.byAssignee, ws.memberById);
  const hasBurn = (data?.burndown.length ?? 0) > 1 && (t?.points ?? 0) > 0;
  const to = `/sprint/${sprint.id}`;
  const pinned = ws.isPinned('Sprint', sprint.id);

  return (
    <Card as="section" className="grid overflow-hidden animate-rise-in lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col p-5 sm:p-7">
        <div className="flex h-5 items-center gap-2">
          <Eyebrow className="flex min-w-0 items-center gap-2">
            <SprintGlyph status="active" progress={day ? day.day / day.length : 0.5} size={14} />
            <span className="truncate">Current sprint{day ? ` · Day ${day.day} of ${day.length}` : ''}</span>
          </Eyebrow>
          {pinned && <PushPin size={12} weight="fill" className="shrink-0 text-ink-3" aria-label="Pinned" />}
          <SprintMenu sprint={sprint} issueCount={sprint.issues} className="-mr-2 ml-auto" />
        </div>
        <h2 className="mt-2.5 min-w-0 font-display text-[30px] leading-9 text-ink sm:text-display">
          <Link to={to} className="decoration-highlight decoration-[3px] underline-offset-[6px] hover:underline">
            {sprint.name}
          </Link>
        </h2>
        <p className="tabular mt-0.5 text-ui text-ink-2">{dateRange(sprint.startDate, sprint.endDate)}</p>
        {sprint.goal ? (
          <GoalQuote goal={sprint.goal} className="mt-5 max-w-[46ch]" />
        ) : (
          <p className="mt-5 border-l-2 border-line-strong pl-4 font-display text-[19px] italic leading-7 text-ink-3">No goal set for this sprint.</p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-3 pt-7">
          {people.length > 0 ? (
            <span className="flex items-center gap-2.5" title={people.map(p => p.name).join(', ')}>
              <AvatarStack people={people} size={26} max={6} />
              <span className="text-meta text-ink-3">{plural(people.length, 'person', 'people')}</span>
            </span>
          ) : data ? (
            <span className="text-meta text-ink-3">Nobody assigned yet</span>
          ) : (
            <Skeleton className="h-6 w-28 rounded-full" />
          )}
          <Button asChild variant="secondary" className="ml-auto">
            <Link to={to}>
              Open sprint <ArrowRight size={14} weight="bold" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="m-2 mt-0 flex min-w-0 flex-col rounded-[10px] bg-sunken p-5 sm:p-6 lg:ml-0 lg:mt-2">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>Scoreboard</Eyebrow>
          <Badge tone={left <= 2 ? 'warning' : 'neutral'} className={cn(left > 2 && 'bg-card')}>
            {timingLabel(sprint)}
          </Badge>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="tabular font-display text-display-lg text-ink">{fmtPts(done)}</span>
          <span className="tabular text-title text-ink-3">/ {fmtPts(points)} pts</span>
          <span className="tabular ml-auto text-title font-semibold text-ink">{pct}%</span>
        </div>
        <ProgressBar
          className="mt-3 bg-card"
          height={8}
          max={Math.max(points, 1)}
          segments={[
            { value: done, className: 'bg-success', label: `${fmtPts(done)} pts done` },
            { value: inFlight, className: 'bg-warning', label: `${fmtPts(inFlight)} pts in flight` },
            { value: Math.max(0, points - done - inFlight), className: 'bg-line-strong', label: 'To do' },
          ]}
        />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <StatColumn label="Done" swatch="bg-success" value={t ? t.completed : null} sub="issues" />
          <StatColumn label="In flight" swatch="bg-warning" value={t ? t.started : null} sub="issues" />
          <StatColumn label="To do" swatch="bg-line-strong" value={t ? t.unstarted : null} sub="issues" />
        </div>
        <div className="mt-4 border-t border-line-strong/70 pt-3">
          <div className="flex items-center justify-between">
            <Eyebrow>Burndown</Eyebrow>
            {t && <span className="tabular text-meta text-ink-3">{fmtPts(t.points - t.completedPoints)} pts remaining</span>}
          </div>
          {!data ? (
            <Skeleton className="mt-2 h-[72px] w-full rounded-md" />
          ) : hasBurn ? (
            <BurndownSparkline burndown={data.burndown} height={76} className="mt-1" />
          ) : (
            <div className="mt-2 flex h-[72px] items-center justify-center rounded-md border border-dashed border-line-strong text-meta text-ink-3">No estimated work yet</div>
          )}
        </div>
      </div>
    </Card>
  );
}

/** With nothing in flight, the next sprint is what matters. */
export function UpcomingSprintHero({ sprint, velocity }: { sprint: SprintSummary; velocity: number | null }) {
  const ws = useWorkspace();
  const points = scopePoints(sprint);
  const to = `/sprint/${sprint.id}`;
  const over = velocity != null && velocity > 0 && points > velocity;
  const pinned = ws.isPinned('Sprint', sprint.id);
  return (
    <Card as="section" className="grid overflow-hidden animate-rise-in lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col p-5 sm:p-7">
        <div className="flex h-5 items-center gap-2">
          <Eyebrow className="flex min-w-0 items-center gap-2">
            <SprintGlyph status="upcoming" size={14} />
            <span className="truncate">Next up · {timingLabel(sprint)}</span>
          </Eyebrow>
          {pinned && <PushPin size={12} weight="fill" className="shrink-0 text-ink-3" aria-label="Pinned" />}
          <SprintMenu sprint={sprint} issueCount={sprint.issues} className="-mr-2 ml-auto" />
        </div>
        <h2 className="mt-2.5 min-w-0 font-display text-[30px] leading-9 text-ink sm:text-display">
          <Link to={to} className="decoration-highlight decoration-[3px] underline-offset-[6px] hover:underline">
            {sprint.name}
          </Link>
        </h2>
        <p className="tabular mt-0.5 text-ui text-ink-2">{dateRange(sprint.startDate, sprint.endDate)}</p>
        {sprint.goal ? (
          <GoalQuote goal={sprint.goal} className="mt-5 max-w-[46ch]" />
        ) : (
          <p className="mt-5 border-l-2 border-line-strong pl-4 font-display text-[19px] italic leading-7 text-ink-3">No goal set for this sprint yet.</p>
        )}
        <p className="mt-auto pt-6 text-ui text-ink-3">No sprint is running right now — this one starts {sprint.startDate ? shortDate(sprint.startDate) : 'soon'}.</p>
      </div>
      <div className="m-2 mt-0 flex min-w-0 flex-col rounded-[10px] bg-sunken p-5 sm:p-6 lg:ml-0 lg:mt-2">
        <Eyebrow>Planned so far</Eyebrow>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="tabular font-display text-display-lg text-ink">{fmtPts(points)}</span>
          <span className="text-title text-ink-3">pts · {plural(sprint.issues, 'issue')}</span>
        </div>
        {velocity != null && (
          <p className={cn('mt-2 text-ui', over ? 'text-warning' : 'text-ink-2')}>
            {over ? `${pts(points - velocity)} more than the team usually finishes` : `The team usually finishes about ${pts(velocity)}`}
          </p>
        )}
        <div className="mt-auto flex pt-6">
          <Button asChild variant="secondary" className="ml-auto">
            <Link to={to}>
              Plan sprint <ArrowRight size={14} weight="bold" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function NoSprintHero({ team, first }: { team: Team; first?: boolean }) {
  const dialogs = useSprintDialogs();
  return (
    <Card as="section" className="animate-rise-in">
      <EmptyState
        compact
        icon={<CalendarPlus size={22} weight="duotone" />}
        title="No sprint running"
        actions={
          <Button variant="secondary" leading={<CalendarPlus size={15} />} onClick={() => dialogs.openEditor(team.id)}>
            New sprint
          </Button>
        }
      >
        {cadenceLabel(team)} give the team a shared deadline and a burndown to watch. {first ? 'Plan the first one to get started.' : 'Nothing is planned — plan the next one.'}
      </EmptyState>
    </Card>
  );
}

/** An ended sprint nobody closed still holds unfinished work; say so above everything else. */
export function UnclosedNotice({ sprint }: { sprint: SprintSummary }) {
  const dialogs = useSprintDialogs();
  const open = sprint.issues - sprint.completed;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-warning/10 px-4 py-2.5 ring-1 ring-inset ring-warning/25 animate-rise-in">
      <WarningCircle size={18} weight="fill" className="shrink-0 text-warning" />
      <p className="min-w-0 flex-1 text-ui text-ink">
        <Link to={`/sprint/${sprint.id}`} className="font-semibold hover:underline">
          {sprint.name}
        </Link>{' '}
        {timingLabel(sprint).toLowerCase()} and isn’t closed.{' '}
        {open > 0 && <span className="text-ink-2">{plural(open, 'issue')} may still need a home.</span>}
      </p>
      <Button size="sm" variant="secondary" onClick={() => dialogs.openComplete(sprint)}>
        Complete sprint…
      </Button>
    </div>
  );
}
