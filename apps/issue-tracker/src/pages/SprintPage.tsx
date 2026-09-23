import { ArrowClockwise, CheckCircle, DotsThree, PencilSimple, PushPin, Rows, Timer, Trash } from '@phosphor-icons/react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Mark, SprintGlyph } from '../glyphs';
import { Breakdown, FocusChip, type BreakdownFocus } from '../features/sprints/Breakdown';
import { BurndownChart, BurndownLegend } from '../features/sprints/Burndown';
import { CapacityCard } from '../features/sprints/CapacityCard';
import { CardHeader } from '../features/sprints/CardHeader';
import { RiskCard } from '../features/sprints/RiskCard';
import { Scoreboard } from '../features/sprints/Scoreboard';
import { canComplete, dateRange, elapsedShare, glyphStatus, pts, PHASE_META, sprintPhase, teamSprintsPath, timingLabel } from '../features/sprints/sprint-utils';
import { SprintDialogsProvider, useSprintDialogs } from '../features/sprints/SprintDialogs';
import { useSprintActions } from '../features/sprints/useSprintActions';
import { IssuesView } from '../issues/IssuesView';
import type { CreateDefaults } from '../lib/app-actions';
import { usePinToggle } from '../lib/mutations';
import { useSprint } from '../lib/queries';
import type { IssueFilters, SprintDetail, Team } from '../lib/types';
import { useContextTeam } from '../lib/useContextTeam';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useWorkspace } from '../lib/workspace';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Chip';
import { cn } from '../ui/cn';
import { Card, EmptyState, PageBody, PageHeader, Skeleton } from '../ui/Layout';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';

/**
 * One sprint: the score and the burndown up top, risk and who's carrying what
 * beneath, then the board. The page scrolls as a whole; the issue view gets a
 * viewport of its own underneath so a board still has room to be a board.
 */
export function SprintPage() {
  const { sprintId = '' } = useParams();
  const ws = useWorkspace();
  const known = ws.sprintById.get(sprintId);
  const { data, isError, failureCount, refetch } = useSprint(sprintId);
  const teamId = data?.sprint.teamId ?? known?.teamId;
  const team = teamId ? ws.teamById.get(teamId) : undefined;
  useContextTeam(teamId);
  useDocumentTitle(data?.sprint.name ?? known?.name ?? 'Sprint', team?.name);

  if (!data) {
    // A sprint the workspace has never heard of that also fails to load is gone — don't sit through retries.
    if (!known && (isError || failureCount > 0)) {
      return (
        <>
          <PageHeader eyebrow={<Eyebrow team={undefined} />} title="Sprint" titleAdornment={<SprintGlyph size={28} />} />
          <PageBody>
            <Card>
              <EmptyState
                icon={<Timer size={22} weight="duotone" />}
                title="This sprint doesn’t exist"
                actions={
                  <Button asChild variant="secondary">
                    <Link to="/all/sprints">See all sprints</Link>
                  </Button>
                }
              >
                It may have been deleted, or the link is wrong.
              </EmptyState>
            </Card>
          </PageBody>
        </>
      );
    }
    if (isError) {
      return (
        <>
          <PageHeader eyebrow={<Eyebrow team={team} />} title={known?.name ?? 'Sprint'} titleAdornment={<SprintGlyph size={28} />} />
          <PageBody>
            <Card>
              <EmptyState
                icon={<ArrowClockwise size={22} weight="duotone" />}
                title="Couldn’t load this sprint"
                actions={
                  <Button variant="secondary" onClick={() => refetch()}>
                    Try again
                  </Button>
                }
              >
                Check your connection and try again.
              </EmptyState>
            </Card>
          </PageBody>
        </>
      );
    }
    return <SprintSkeleton title={known?.name} team={team} />;
  }

  return (
    <SprintDialogsProvider>
      <SprintView key={sprintId} detail={data} team={team} />
    </SprintDialogsProvider>
  );
}

function Eyebrow({ team }: { team: Team | undefined }) {
  if (!team) {
    return (
      <Link to="/all/sprints" className="text-ink-2 underline decoration-line-strong underline-offset-[3px] hover:text-ink hover:decoration-ink">
        Sprints
      </Link>
    );
  }
  return (
    <>
      <Mark icon={team.icon} color={team.color} name={team.name} size={16} />
      <span>{team.name}</span>
      <span aria-hidden className="text-ink-3">›</span>
      <Link to={teamSprintsPath(team)} className="text-ink-2 underline decoration-line-strong underline-offset-[3px] hover:text-ink hover:decoration-ink">
        Sprints
      </Link>
    </>
  );
}

function SprintView({ detail, team }: { detail: SprintDetail; team: Team | undefined }) {
  const { sprint, totals } = detail;
  const ws = useWorkspace();
  const navigate = useNavigate();
  const togglePin = usePinToggle();
  const dialogs = useSprintDialogs();
  const { remove } = useSprintActions();
  const wide = useMediaQuery('(min-width: 1024px)');
  const [focus, setFocus] = useState<BreakdownFocus | null>(null);
  const issuesRef = useRef<HTMLDivElement>(null);

  const phase = sprintPhase(sprint);
  const meta = PHASE_META[phase];
  const pinned = ws.isPinned('Sprint', sprint.id);
  const hasScope = detail.burndown.some(p => p.scope > 0);

  // The breakdown narrows the list through baseFilters, so it intersects with whatever the viewer filtered.
  const baseFilters = useMemo<IssueFilters>(() => ({ sprintIds: [sprint.id], ...(focus ? { [focus.field]: [focus.value] } : {}) }), [sprint.id, focus]);
  const createDefaults = useMemo<CreateDefaults>(() => {
    const d: CreateDefaults = { teamId: sprint.teamId ?? undefined, sprintId: sprint.id };
    if (focus && focus.value !== 'none') {
      if (focus.field === 'assigneeIds') d.assigneeId = focus.value;
      if (focus.field === 'projectIds') d.projectId = focus.value;
      if (focus.field === 'labelIds') d.labelIds = [focus.value];
    }
    return d;
  }, [sprint.teamId, sprint.id, focus]);

  const onFocus = (next: BreakdownFocus | null) => {
    setFocus(next);
    // setTimeout, not rAF: the list re-renders first, and rAF is paused in background tabs.
    if (next) window.setTimeout(() => issuesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const onDelete = async () => {
    const deleted = await remove(sprint, totals.issues);
    if (deleted) navigate(teamSprintsPath(team), { replace: true });
  };

  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow team={team} />}
        title={sprint.name}
        titleAdornment={<SprintGlyph size={28} status={glyphStatus(sprint)} progress={elapsedShare(sprint)} />}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Badge tone={meta.tone} className={cn(meta.tone === 'highlight' && 'dark:text-highlight-ink')}>{meta.label}</Badge>
            <span className="tabular">
              {dateRange(sprint.startDate, sprint.endDate)} · {timingLabel(sprint)}
            </span>
          </span>
        }
        actions={
          // Full width below sm so the actions wrap under the title instead of squeezing it.
          <div className="flex w-[calc(100vw-2rem)] items-center gap-2 sm:w-auto">
            <Tooltip content={pinned ? 'Unpin' : 'Pin'}>
              <Button variant="ghost" icon aria-label={pinned ? 'Unpin sprint' : 'Pin sprint'} aria-pressed={pinned} onClick={() => togglePin('Sprint', sprint.id, !pinned)}>
                <PushPin size={17} weight={pinned ? 'fill' : 'regular'} className={cn(pinned && 'text-ink')} />
              </Button>
            </Tooltip>
            {sprint.teamId && (
              <Tooltip content="Edit sprint">
                <Button variant="ghost" icon aria-label="Edit sprint" onClick={() => dialogs.openEditor(sprint.teamId!, sprint)}>
                  <PencilSimple size={17} />
                </Button>
              </Tooltip>
            )}
            <Menu>
              <Tooltip content="More">
                <MenuTrigger asChild>
                  <Button variant="ghost" icon aria-label="Sprint actions" className="data-[state=open]:bg-pressed">
                    <DotsThree size={18} weight="bold" />
                  </Button>
                </MenuTrigger>
              </Tooltip>
              <MenuContent align="end" className="w-56">
                <MenuItem icon={<Rows size={15} />} onSelect={() => navigate(teamSprintsPath(team))}>
                  {team ? `All ${team.name} sprints` : 'All sprints'}
                </MenuItem>
                {sprint.teamId && (
                  <>
                    <MenuSeparator />
                    <MenuItem destructive icon={<Trash size={15} />} onSelect={onDelete}>
                      Delete sprint…
                    </MenuItem>
                  </>
                )}
              </MenuContent>
            </Menu>
            {canComplete(sprint) && (
              <Button variant="primary" className="ml-auto sm:ml-1" leading={<CheckCircle size={15} weight="bold" />} onClick={() => dialogs.openComplete(sprint)}>
                Complete sprint
              </Button>
            )}
          </div>
        }
      />

      <PageBody className="grid gap-4 xl:grid-cols-3">
        <Scoreboard detail={detail} className="animate-rise-in" />

        <Card as="section" className="flex min-w-0 flex-col animate-rise-in xl:col-span-2">
          <CardHeader
            title="Burndown"
            note={hasScope ? (phase === 'upcoming' ? `${pts(totals.points)} planned` : `${pts(totals.points - totals.completedPoints)} remaining`) : undefined}
            action={hasScope ? <BurndownLegend phase={phase} className="hidden md:flex" /> : undefined}
          />
          {hasScope && <BurndownLegend phase={phase} className="px-5 pt-1 md:hidden" />}
          <div className="flex flex-1 flex-col justify-center px-2 pb-3 pt-2 sm:px-3">
            {detail.burndown.length === 0 ? (
              <ChartMessage>This sprint has no dates, so there’s nothing to chart.</ChartMessage>
            ) : !hasScope ? (
              <ChartMessage>No issues in this sprint yet — add some below and the burndown starts drawing.</ChartMessage>
            ) : (
              <BurndownChart burndown={detail.burndown} showToday={phase === 'current'} height={wide ? 320 : 240} maxLabels={wide ? 8 : 5} />
            )}
          </div>
        </Card>

        {phase === 'current' ? <RiskCard sprintId={sprint.id} className="animate-rise-in" /> : <CapacityCard detail={detail} className="animate-rise-in" />}
        <Breakdown detail={detail} focus={focus} onFocus={onFocus} className="animate-rise-in xl:col-span-2" />
      </PageBody>

      {/* One viewport tall (under the top bar), so a scrolled-down board fills the screen. */}
      <div ref={issuesRef} className="flex h-[calc(100dvh-56px)] min-h-[480px] scroll-mt-0 flex-col border-t border-line">
        <IssuesView
          key={sprint.id}
          surfaceKey={`sprint:${sprint.id}`}
          baseFilters={baseFilters}
          lockedFields={['sprintIds']}
          teamId={sprint.teamId}
          defaults={{ layout: 'board', grouping: 'status' }}
          createDefaults={createDefaults}
          fill
          toolbarStart={
            <div className="mr-1 flex min-w-0 items-center gap-2">
              <span className="px-1 text-title font-semibold text-ink">Issues</span>
              {focus && <FocusChip focus={focus} onClear={() => setFocus(null)} />}
            </div>
          }
          emptyState={
            <EmptyState
              compact
              icon={<Timer size={22} weight="duotone" />}
              title={focus ? `Nothing for ${focus.label} in this sprint` : 'No issues in this sprint'}
            >
              {focus ? 'Clear the breakdown filter to see everything.' : 'Press C to create one here, or move issues in from the backlog.'}
            </EmptyState>
          }
        />
      </div>
    </>
  );
}

function ChartMessage({ children }: { children: string }) {
  return <div className="flex h-[240px] items-center justify-center px-6 text-center text-ui text-ink-3 lg:h-[320px]">{children}</div>;
}

function SprintSkeleton({ title, team }: { title?: string; team?: Team }) {
  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow team={team} />}
        title={title ?? <span className="skeleton inline-block h-7 w-44 align-middle" />}
        titleAdornment={<SprintGlyph size={28} />}
        description={<span className="skeleton mt-1.5 inline-block h-3.5 w-56" />}
      />
      <PageBody className="grid gap-4 xl:grid-cols-3" >
        <Card className="flex flex-col gap-4 p-5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-11 w-32" />
          <Skeleton className="h-2 w-full" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-2.5 w-14" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </Card>
        <Card className="flex flex-col gap-4 p-5 xl:col-span-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-[280px] w-full" />
        </Card>
      </PageBody>
    </>
  );
}
