import { ArrowClockwise, CaretDown, Plus } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { Mark } from '../glyphs';
import { EnableSprints } from '../features/sprints/EnableSprints';
import { HistoryLedger } from '../features/sprints/HistoryLedger';
import { averageVelocity, cadenceLabel, fmtPts, sprintPhase } from '../features/sprints/sprint-utils';
import { SprintDialogsProvider, useSprintDialogs } from '../features/sprints/SprintDialogs';
import { CurrentSprintHero, NoSprintHero, UnclosedNotice, UpcomingSprintHero } from '../features/sprints/SprintHero';
import { TeamSprintCard } from '../features/sprints/TeamSprintCard';
import { UpNext } from '../features/sprints/UpNext';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useSprints } from '../lib/queries';
import { useScope } from '../lib/scope';
import type { SprintSummary, Team } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import { Button } from '../ui/Button';
import { Card, EmptyState, ListSkeleton, PageBody, PageHeader, Section, Skeleton } from '../ui/Layout';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import { ScopeEyebrow } from '../shell/ScopeEyebrow';

const byStart = (a: SprintSummary, b: SprintSummary) => (a.startDate ?? '').localeCompare(b.startDate ?? '');

/**
 * Sprints, scoped. A team sees its current sprint as a hero, what's planned
 * next and a ledger of what's done. All teams sees every team's sprint side by
 * side, then the combined history.
 */
export function SprintsPage() {
  const scope = useScope();
  useDocumentTitle('Sprints', scope.team?.name ?? 'All teams');
  return (
    <SprintDialogsProvider>
      {scope.team ? <TeamSprints key={scope.team.id} team={scope.team} /> : <AllSprints />}
    </SprintDialogsProvider>
  );
}

function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <Card>
      <EmptyState
        compact
        icon={<ArrowClockwise size={22} weight="duotone" />}
        title={`Couldn’t load ${what}`}
        actions={
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        Check your connection and try again.
      </EmptyState>
    </Card>
  );
}

function HeroSkeleton() {
  return (
    <Card className="grid gap-2 overflow-hidden p-2 lg:grid-cols-2">
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-4 h-16 w-full max-w-md" />
      </div>
      <div className="flex flex-col gap-3 rounded-[10px] bg-sunken p-5">
        <Skeleton className="h-3 w-24 bg-card" />
        <Skeleton className="h-11 w-36 bg-card" />
        <Skeleton className="h-2 w-full bg-card" />
        <Skeleton className="h-16 w-full bg-card" />
      </div>
    </Card>
  );
}

// ---- One team ---------------------------------------------------------------

function TeamSprints({ team }: { team: Team }) {
  const dialogs = useSprintDialogs();
  const { data, isPending, isError, refetch } = useSprints(team.id);

  const groups = useMemo(() => {
    const sprints = data?.sprints ?? [];
    const current = sprints.filter(s => s.status === 'active').sort(byStart)[0];
    const upcoming = sprints.filter(s => s.status === 'upcoming').sort(byStart);
    // Newest first; an ended sprint nobody closed sits with the past, flagged.
    const past = sprints.filter(s => s.status === 'completed').sort((a, b) => byStart(b, a));
    const unclosed = past.filter(s => sprintPhase(s) === 'ended');
    return { current, upcoming, past, unclosed, velocity: averageVelocity(sprints), total: sprints.length };
  }, [data]);

  const { current, upcoming, past, unclosed, velocity } = groups;
  const heroUpcoming = !current ? upcoming[0] : undefined;
  const laterUpcoming = heroUpcoming ? upcoming.slice(1) : upcoming;

  const velocityHint = velocity && `Mean points completed per sprint over the last ${velocity.count === 1 ? 'finished sprint' : `${velocity.count} finished sprints`}`;
  const description = !team.sprintsEnabled ? (
    'Sprints are turned off for this team'
  ) : velocity ? (
    <>
      {cadenceLabel(team)} ·{' '}
      <Tooltip content={velocityHint}>
        <span className="cursor-help">
          <span className="hl tabular font-medium text-ink">{fmtPts(velocity.avg)} pts</span> a sprint on average
        </span>
      </Tooltip>
    </>
  ) : (
    `${cadenceLabel(team)} · velocity shows up once a sprint finishes`
  );

  return (
    <>
      <PageHeader
        eyebrow={<ScopeEyebrow />}
        title="Sprints"
        description={description}
        actions={
          team.sprintsEnabled && (
            <Button variant="primary" leading={<Plus size={15} weight="bold" />} onClick={() => dialogs.openEditor(team.id)}>
              New sprint
            </Button>
          )
        }
      />
      <PageBody className="flex flex-col gap-8 pb-16">
        {!team.sprintsEnabled ? (
          <EnableSprints team={team} />
        ) : isPending ? (
          <>
            <HeroSkeleton />
            <Card>
              <ListSkeleton rows={4} />
            </Card>
          </>
        ) : isError ? (
          <LoadError what="sprints" onRetry={() => refetch()} />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {unclosed.map(s => (
                <UnclosedNotice key={s.id} sprint={s} />
              ))}
              {current ? (
                <CurrentSprintHero sprint={current} />
              ) : heroUpcoming ? (
                <UpcomingSprintHero sprint={heroUpcoming} velocity={velocity?.avg ?? null} />
              ) : (
                <NoSprintHero team={team} first={groups.total === 0} />
              )}
            </div>

            {/* A team with no sprints at all has one next step, and the hero already offers it. */}
            {groups.total > 0 && (
              <>
                <Section title="Up next" count={laterUpcoming.length || undefined} description={laterUpcoming.length ? 'Planned sprints, soonest first' : undefined}>
                  <UpNext sprints={laterUpcoming} team={team} />
                </Section>

                <Section title="History" count={past.length || undefined} description={past.length ? 'Finished sprints, newest first' : undefined}>
                  {past.length ? (
                    <HistoryLedger sprints={past} />
                  ) : (
                    <div className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-ui text-ink-2">
                      Finished sprints land here with their scope, what got done and the team’s velocity.
                    </div>
                  )}
                </Section>
              </>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}

// ---- All teams --------------------------------------------------------------

function AllSprints() {
  const ws = useWorkspace();
  const dialogs = useSprintDialogs();
  const { data, isPending, isError, refetch } = useSprints();

  const byTeam = useMemo(() => {
    const m = new Map<string, SprintSummary[]>();
    for (const s of data?.sprints ?? []) {
      if (!s.teamId) continue;
      if (!m.has(s.teamId)) m.set(s.teamId, []);
      m.get(s.teamId)!.push(s);
    }
    return m;
  }, [data]);
  const past = useMemo(() => (data?.sprints ?? []).filter(s => s.status === 'completed').sort((a, b) => byStart(b, a)), [data]);
  const enabledTeams = ws.teams.filter(t => t.sprintsEnabled);
  // Teams running sprints first, in their usual order.
  const teams = [...ws.teams].sort((a, b) => Number(b.sprintsEnabled) - Number(a.sprintsEnabled) || a.position - b.position);

  return (
    <>
      <PageHeader
        eyebrow={<ScopeEyebrow />}
        title="Sprints"
        description="What every team is working on right now"
        actions={
          enabledTeams.length > 0 && (
            <Menu>
              <MenuTrigger asChild>
                <Button variant="primary" leading={<Plus size={15} weight="bold" />} trailing={<CaretDown size={12} weight="bold" className="opacity-70" />}>
                  New sprint
                </Button>
              </MenuTrigger>
              <MenuContent align="end" className="w-56">
                <MenuLabel>Plan a sprint for</MenuLabel>
                {enabledTeams.map(t => (
                  <MenuItem key={t.id} icon={<Mark icon={t.icon} color={t.color} name={t.name} size={16} />} hint={<span className="font-mono text-[11px]">{t.key}</span>} onSelect={() => dialogs.openEditor(t.id)}>
                    {t.name}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          )
        }
      />
      <PageBody className="flex flex-col gap-8 pb-16">
        {isError ? (
          <LoadError what="sprints" onRetry={() => refetch()} />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {isPending
                ? ws.teams.map(t => (
                    <Card key={t.id} className="flex h-[272px] flex-col gap-3 p-4">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="mt-3 h-3 w-24" />
                      <Skeleton className="h-7 w-40" />
                      <Skeleton className="mt-auto h-2 w-full" />
                    </Card>
                  ))
                : teams.map(t => <TeamSprintCard key={t.id} team={t} sprints={byTeam.get(t.id) ?? []} />)}
            </div>

            <Section title="History" count={past.length || undefined} description={past.length ? 'Finished sprints across every team, newest first' : undefined}>
              {isPending ? (
                <Card>
                  <ListSkeleton rows={5} />
                </Card>
              ) : past.length ? (
                <HistoryLedger sprints={past} showTeam />
              ) : (
                <div className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-ui text-ink-2">
                  Finished sprints from every team land here with their scope, what got done and velocity.
                </div>
              )}
            </Section>
          </>
        )}
      </PageBody>
    </>
  );
}
