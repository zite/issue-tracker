import { ArrowCounterClockwise, Crosshair, MapTrifold, Plus, SlidersHorizontal } from '@phosphor-icons/react';
import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { isDoneProject } from '../features/roadmap/projectMath';
import {
  isRoadmapGrouping,
  RoadmapSkeleton,
  RoadmapTimeline,
  ROADMAP_GROUPINGS,
  type RoadmapGrouping,
  type RoadmapTimelineHandle,
} from '../features/roadmap/RoadmapTimeline';
import { isZoom, ZOOMS, type Zoom } from '../features/roadmap/scale';
import { usePersistentState } from '../features/roadmap/usePersistentState';
import { ZoomToggle } from '../features/roadmap/ZoomToggle';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useHotkeys } from '../lib/hotkeys';
import { useProjects } from '../lib/queries';
import { useScope } from '../lib/scope';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { Kbd } from '../ui/Kbd';
import { Card, EmptyState, PageBody, PageHeader } from '../ui/Layout';
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import { ScopeEyebrow } from '../shell/ScopeEyebrow';

type Prefs = { zoom: Zoom; grouping: RoadmapGrouping; hideCompleted: boolean };
const DEFAULT_PREFS: Prefs = { zoom: 'months', grouping: 'goal', hideCompleted: false };

function sanitize(raw: unknown): Prefs {
  const v = (raw ?? {}) as Partial<Prefs>;
  return {
    zoom: isZoom(v.zoom) ? v.zoom : DEFAULT_PREFS.zoom,
    grouping: isRoadmapGrouping(v.grouping) ? v.grouping : DEFAULT_PREFS.grouping,
    hideCompleted: typeof v.hideCompleted === 'boolean' ? v.hideCompleted : DEFAULT_PREFS.hideCompleted,
  };
}

/**
 * Every dated project on one timeline, scoped to the team switcher. Drag a bar
 * to move it, drag an edge to change one date, drag across an unscheduled row
 * to give it dates.
 */
export function RoadmapPage() {
  const scope = useScope();
  useDocumentTitle('Roadmap', scope.team?.name ?? 'All teams');
  const { data, isPending, isError, refetch } = useProjects();
  const [prefs, setPrefs] = usePersistentState('issue-tracker:roadmap', sanitize);
  const timeline = useRef<RoadmapTimelineHandle>(null);
  const set = (patch: Partial<Prefs>) => setPrefs(p => ({ ...p, ...patch }));

  const all = useMemo(() => (data?.projects ?? []).filter(p => !scope.team || p.teamId === scope.team.id), [data, scope.team]);
  const projects = useMemo(() => (prefs.hideCompleted ? all.filter(p => !isDoneProject(p)) : all), [all, prefs.hideCompleted]);
  const hiddenCount = all.length - projects.length;
  const customized = prefs.grouping !== DEFAULT_PREFS.grouping || prefs.hideCompleted !== DEFAULT_PREFS.hideCompleted;
  const ready = !isPending && !isError && projects.length > 0;

  useHotkeys({ t: () => timeline.current?.scrollToToday() }, { enabled: ready });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow={<ScopeEyebrow />}
        title="Roadmap"
        description="Every dated project on one timeline. Drag a bar to reschedule."
        actions={
          <>
            <Tooltip content="Scroll to today" shortcut="T">
              <Button variant="secondary" size="md" leading={<Crosshair size={14} />} onClick={() => timeline.current?.scrollToToday()} disabled={!ready}>
                Today
                <Kbd className="ml-0.5 hidden sm:inline-flex">T</Kbd>
              </Button>
            </Tooltip>
            <ZoomToggle value={prefs.zoom} onChange={zoom => set({ zoom })} className="hidden sm:inline-flex" />
            <Menu>
              <MenuTrigger asChild>
                <Button variant="secondary" size="md" leading={<SlidersHorizontal size={14} />} className="data-[state=open]:bg-hover" aria-label="Display options">
                  <span className="hidden sm:inline">Display</span>
                  {customized && <span className="-mr-0.5 h-1.5 w-1.5 rounded-full bg-signal" aria-label="Customized" />}
                </Button>
              </MenuTrigger>
              <MenuContent align="end" className="w-60">
                <div className="sm:hidden">
                  <MenuLabel>Zoom</MenuLabel>
                  <MenuRadioGroup value={prefs.zoom} onValueChange={v => isZoom(v) && set({ zoom: v })}>
                    {ZOOMS.map(z => (
                      <MenuRadioItem key={z.value} value={z.value} onSelect={e => e.preventDefault()}>
                        {z.label}
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                  <MenuSeparator />
                </div>
                <MenuLabel>Group by</MenuLabel>
                <MenuRadioGroup value={prefs.grouping} onValueChange={v => isRoadmapGrouping(v) && set({ grouping: v })}>
                  {ROADMAP_GROUPINGS.map(g => (
                    <MenuRadioItem key={g.value} value={g.value} onSelect={e => e.preventDefault()}>
                      {g.label}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
                <MenuSeparator />
                <MenuCheckboxItem checked={prefs.hideCompleted} onCheckedChange={v => set({ hideCompleted: Boolean(v) })} onSelect={e => e.preventDefault()} hint={hiddenCount > 0 ? String(hiddenCount) : undefined}>
                  Hide completed
                </MenuCheckboxItem>
                <MenuSeparator />
                <MenuItem
                  icon={<ArrowCounterClockwise size={15} />}
                  disabled={!customized}
                  onSelect={() => set({ grouping: DEFAULT_PREFS.grouping, hideCompleted: DEFAULT_PREFS.hideCompleted })}
                >
                  Reset to default
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
      />

      <PageBody className="flex min-h-0 flex-1 flex-col pb-4 sm:pb-6">
        <Card className={cn('flex min-h-[420px] flex-1 flex-col overflow-hidden')}>
          {isPending ? (
            <RoadmapSkeleton className="min-h-0 flex-1" />
          ) : isError ? (
            <EmptyState
              icon={<MapTrifold size={22} weight="duotone" />}
              title="The roadmap couldn’t load"
              className="flex-1"
              actions={
                <Button variant="secondary" onClick={() => refetch()}>
                  Try again
                </Button>
              }
            >
              Projects didn’t come back from the server. Check your connection and try again.
            </EmptyState>
          ) : all.length === 0 ? (
            <EmptyState
              icon={<MapTrifold size={22} weight="duotone" />}
              title={scope.team ? `${scope.team.name} has no projects yet` : 'Nothing on the roadmap yet'}
              className="flex-1"
              actions={
                <Button variant="primary" asChild>
                  <Link to={`${scope.to('projects')}?new=1`}>
                    <Plus size={14} weight="bold" />
                    New project
                  </Link>
                </Button>
              }
            >
              Create a project and give it a start and target date — it shows up here as a bar you can drag.
            </EmptyState>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={<MapTrifold size={22} weight="duotone" />}
              title="Every project is finished"
              className="flex-1"
              actions={
                <Button variant="secondary" onClick={() => set({ hideCompleted: false })}>
                  Show completed
                </Button>
              }
            >
              {hiddenCount} completed or canceled {hiddenCount === 1 ? 'project is' : 'projects are'} hidden.
            </EmptyState>
          ) : (
            <RoadmapTimeline key={scope.key} ref={timeline} projects={projects} grouping={prefs.grouping} zoom={prefs.zoom} className="min-h-0 flex-1 animate-fade-in" />
          )}
        </Card>
      </PageBody>
    </div>
  );
}
