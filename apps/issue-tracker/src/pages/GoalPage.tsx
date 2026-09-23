import { Crosshair, DotsThree, PushPin, Target } from '@phosphor-icons/react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CardHeader } from '../features/goals/CardHeader';
import { GoalDialog } from '../features/goals/GoalDialog';
import { GoalDescriptionEditor, GoalSummaryEditor, GoalTitleEditor, type SaveState } from '../features/goals/GoalEditors';
import { GoalFactsCard, GoalStatTiles } from '../features/goals/GoalFacts';
import { GoalMenu } from '../features/goals/GoalMenu';
import { GoalProjects } from '../features/goals/GoalProjects';
import { IconColorPicker } from '../features/goals/IconColorPicker';
import { useGoalActions } from '../features/goals/useGoalActions';
import { rollup } from '../features/roadmap/projectMath';
import { RoadmapTimeline, type RoadmapTimelineHandle, type TimelineMarker } from '../features/roadmap/RoadmapTimeline';
import { isZoom } from '../features/roadmap/scale';
import { usePersistentState } from '../features/roadmap/usePersistentState';
import { ZoomToggle } from '../features/roadmap/ZoomToggle';
import { GoalMark } from '../glyphs';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { usePinToggle } from '../lib/mutations';
import { useProjects } from '../lib/queries';
import type { Goal } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { Card, EmptyState, PageBody, PageHeader } from '../ui/Layout';
import { Tooltip } from '../ui/Tooltip';

function GoalsCrumb() {
  return (
    <>
      <Target size={15} weight="bold" className="text-ink-3" />
      <span className="font-medium text-ink-2">Company-wide</span>
      <span aria-hidden className="text-ink-3">›</span>
      <Link to="/goals" className="font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline">
        Goals
      </Link>
    </>
  );
}

function GoalView({ goal }: { goal: Goal }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const actions = useGoalActions();
  const togglePin = usePinToggle();
  const { data, isPending } = useProjects();
  const [editOpen, setEditOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [zoom, setZoom] = usePersistentState('issue-tracker:goal:zoom', v => (isZoom(v) ? v : 'months'));
  const timeline = useRef<RoadmapTimelineHandle>(null);

  const pinned = ws.isPinned('Goal', goal.id);
  const memberIds = useMemo(() => ws.projects.filter(p => p.goalId === goal.id).map(p => p.id), [ws.projects, goal.id]);
  const projects = useMemo(() => (data?.projects ?? []).filter(p => p.goalId === goal.id), [data, goal.id]);
  const r = useMemo(() => rollup(projects), [projects]);
  const marker = useMemo<TimelineMarker | null>(() => (goal.targetDate ? { date: goal.targetDate, label: 'Target' } : null), [goal.targetDate]);

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow={<GoalsCrumb />}
        titleAdornment={
          <IconColorPicker icon={goal.icon} color={goal.color} onChange={p => void actions.update(goal, p)}>
            <button type="button" aria-label="Change icon and colour" className="shrink-0 rounded-[14px] outline-offset-2 transition-[transform,box-shadow] hover:shadow-raised active:scale-[0.97] data-[state=open]:shadow-raised">
              <GoalMark icon={goal.icon} color={goal.color} size={40} />
            </button>
          </IconColorPicker>
        }
        title={<GoalTitleEditor goal={goal} />}
        description={<GoalSummaryEditor goal={goal} />}
        actions={
          <>
            <Tooltip content={pinned ? 'Unpin' : 'Pin'}>
              <Button variant="ghost" size="md" icon aria-label={pinned ? 'Unpin goal' : 'Pin goal'} aria-pressed={pinned} onClick={() => togglePin('Goal', goal.id, !pinned)} className={cn(pinned && 'text-ink')}>
                <PushPin size={17} weight={pinned ? 'fill' : 'regular'} />
              </Button>
            </Tooltip>
            <GoalMenu
              goal={goal}
              onEdit={() => setEditOpen(true)}
              onDeleted={() => navigate('/goals')}
              trigger={
                <Button variant="ghost" size="md" icon aria-label="Goal actions" className="data-[state=open]:bg-hover">
                  <DotsThree size={17} weight="bold" />
                </Button>
              }
            />
          </>
        }
      />

      <PageBody>
        <div className="grid max-w-[1600px] items-start gap-5 animate-rise-in lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-5">
            {/* A goal with no projects has nothing to total; the projects card says what to do. */}
            {memberIds.length > 0 && <GoalStatTiles rollup={r} count={memberIds.length} loading={isPending} />}
            <GoalProjects goal={goal} projects={projects} memberIds={memberIds} loading={isPending} />
            {!isPending && projects.length > 0 && (
              <Card as="section" className="overflow-hidden">
                <CardHeader
                  title="Timeline"
                  hint="Drag a bar to reschedule"
                  action={
                    <>
                      <Tooltip content="Scroll to today">
                        <Button variant="ghost" size="sm" icon aria-label="Scroll to today" onClick={() => timeline.current?.scrollToToday()}>
                          <Crosshair size={15} />
                        </Button>
                      </Tooltip>
                      <ZoomToggle value={zoom} onChange={setZoom} />
                    </>
                  }
                />
                <RoadmapTimeline ref={timeline} compact projects={projects} grouping="none" zoom={zoom} marker={marker} />
              </Card>
            )}
          </div>
          {/* Facts lead on a phone: what the goal is comes before how its projects are doing. */}
          <aside className="order-first flex min-w-0 flex-col gap-5 lg:order-none">
            <GoalFactsCard goal={goal} rollup={r} loading={isPending} />
            <Card padded>
              <div className="mb-2 flex min-h-6 items-center gap-2">
                <h2 className="text-title font-semibold text-ink">Description</h2>
                <span aria-live="polite" className={cn('ml-auto text-meta text-ink-3 transition-opacity', saveState === 'idle' && 'opacity-0')}>
                  {saveState === 'saving' ? 'Saving…' : 'Saved'}
                </span>
              </div>
              <GoalDescriptionEditor goal={goal} onStateChange={setSaveState} />
            </Card>
          </aside>
        </div>
      </PageBody>

      <GoalDialog open={editOpen} onOpenChange={setEditOpen} goal={goal} />
    </div>
  );
}

export function GoalPage() {
  const { goalId = '' } = useParams();
  const ws = useWorkspace();
  const goal = ws.goalById.get(goalId);
  useDocumentTitle(goal?.name ?? 'Goal not found');

  if (!goal) {
    return (
      <>
        <PageHeader eyebrow={<GoalsCrumb />} title="Goal not found" />
        <PageBody>
          <EmptyState
            icon={<Target size={22} weight="duotone" />}
            title="This goal doesn’t exist"
            actions={
              <Button variant="secondary" asChild>
                <Link to="/goals">Back to goals</Link>
              </Button>
            }
          >
            It may have been deleted, or the link is wrong.
          </EmptyState>
        </PageBody>
      </>
    );
  }
  return <GoalView key={goal.id} goal={goal} />;
}
