import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Plus } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectSummary } from '../../lib/types';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Skeleton } from '../../ui/Layout';
import { Tooltip } from '../../ui/Tooltip';
import { ProjectStatusGlyph } from './bits';
import { BoardCardBody, fromControl, useOpenProject } from './ProjectCard';
import { STATUS_LABEL, progressOf, type ProjectStatus } from './model';
import { useProjectActions } from './useProjectActions';

/** Pointer first — it's what the person is aiming with — then the nearest column when between lanes. */
const collision: CollisionDetection = args => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCorners(args);
};

function DraggableCard({ project, onEdit, showTeam }: { project: ProjectSummary; onEdit: (p: ProjectSummary) => void; showTeam: boolean }) {
  const open = useOpenProject();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: project.id });
  // No transform on the source: the overlay follows the pointer, and moving both makes the card leap.
  return (
    <div
      ref={setNodeRef}
      data-project-id={project.id}
      {...attributes}
      {...listeners}
      role="link"
      tabIndex={0}
      aria-label={project.name}
      aria-roledescription="Draggable project"
      style={{ touchAction: 'none' }}
      onClick={e => !fromControl(e) && open(project.id, e)}
      onKeyDown={e => {
        if (e.key === 'Enter' && e.target === e.currentTarget) open(project.id, e);
      }}
      className={cn('cursor-grab rounded-md focus-visible:[border-radius:8px]', isDragging && 'opacity-40')}
    >
      <BoardCardBody project={project} onEdit={onEdit} showTeam={showTeam} />
    </div>
  );
}

function Lane({ status, projects, onEdit, onCreate, showTeam }: {
  status: ProjectStatus;
  projects: ProjectSummary[];
  onEdit: (p: ProjectSummary) => void;
  onCreate: (status: ProjectStatus) => void;
  showTeam: boolean;
}) {
  // The whole lane is the drop target, header included, so there is no dead strip.
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${status}` });
  const label = STATUS_LABEL[status];
  const avg = projects.length ? projects.reduce((a, p) => a + progressOf(p), 0) / projects.length : 0.5;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex h-full w-[288px] shrink-0 flex-col rounded-lg bg-sunken ring-1 ring-inset ring-transparent transition-[background-color,box-shadow] duration-100',
        isOver && 'bg-highlight/15 ring-highlight dark:bg-highlight/10',
      )}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 px-3">
        <ProjectStatusGlyph status={status} progress={avg} />
        <span className="truncate text-ui font-semibold text-ink">{label}</span>
        <span className="tabular text-ui text-ink-3">{projects.length}</span>
        <Tooltip content={`New project · ${label}`}>
          <Button variant="ghost" size="xs" icon aria-label={`New project · ${label}`} onClick={() => onCreate(status)} className="ml-auto">
            <Plus size={13} weight="bold" />
          </Button>
        </Tooltip>
      </div>
      <div data-lane-scroll="true" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <div className="flex flex-col gap-2">
          {projects.map(p => (
            <DraggableCard key={p.id} project={p} onEdit={onEdit} showTeam={showTeam} />
          ))}
          <button
            type="button"
            onClick={() => onCreate(status)}
            className={cn(
              'flex h-9 w-full items-center gap-1.5 rounded-md px-2.5 text-ui text-ink-3 transition-colors hover:bg-hover hover:text-ink',
              projects.length === 0 && 'h-16 justify-center border border-dashed border-line-strong',
            )}
          >
            <Plus size={12} weight="bold" /> New project
          </button>
        </div>
      </div>
    </div>
  );
}

/** Projects as lanes by status; dropping a card in a lane sets its status. */
export function ProjectBoard({ projects, statuses, onEdit, onCreate, showTeam }: {
  projects: ProjectSummary[];
  statuses: readonly ProjectStatus[];
  onEdit: (p: ProjectSummary) => void;
  onCreate: (status: ProjectStatus) => void;
  showTeam: boolean;
}) {
  const actions = useProjectActions();
  const [activeId, setActiveId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStatus = useMemo(() => {
    const m = new Map<string, ProjectSummary[]>(statuses.map(s => [s, []]));
    for (const p of projects) m.get(p.status)?.push(p);
    return m;
  }, [projects, statuses]);
  const active = activeId ? projects.find(p => p.id === activeId) : undefined;

  // Edge scrolling keyed to the pointer, not the dragged card's rect, so it can't run away.
  useEffect(() => {
    if (!activeId) return;
    const onMove = (e: PointerEvent) => (pointer.current = { x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', onMove);
    const timer = window.setInterval(() => {
      const el = scroller.current;
      const p = pointer.current;
      if (!el || !p) return;
      const r = el.getBoundingClientRect();
      const edge = 72;
      if (p.x < r.left + edge) el.scrollLeft -= Math.ceil((r.left + edge - p.x) / 4);
      else if (p.x > r.right - edge) el.scrollLeft += Math.ceil((p.x - (r.right - edge)) / 4);
      // Lanes scroll vertically too: nudge the lane under the pointer.
      const lane = document.elementsFromPoint(p.x, p.y).find(n => n instanceof HTMLElement && n.dataset.laneScroll === 'true') as HTMLElement | undefined;
      if (lane) {
        const lr = lane.getBoundingClientRect();
        if (p.y < lr.top + 48) lane.scrollTop -= Math.ceil((lr.top + 48 - p.y) / 4);
        else if (p.y > lr.bottom - 48) lane.scrollTop += Math.ceil((p.y - (lr.bottom - 48)) / 4);
      }
    }, 16);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.clearInterval(timer);
    };
  }, [activeId]);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    setActiveId(null);
    pointer.current = null;
    const overId = over ? String(over.id) : '';
    if (!overId.startsWith('lane:')) return;
    const status = overId.slice(5) as ProjectStatus;
    const project = projects.find(p => p.id === dragged.id);
    if (project && project.status !== status) actions.update(project.id, { status });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={collision} autoScroll={false} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div ref={scroller} className="flex h-full gap-3 overflow-x-auto overflow-y-hidden px-4 pb-5 pt-1 sm:px-7">
        {statuses.map(s => (
          <Lane key={s} status={s} projects={byStatus.get(s) ?? []} onEdit={onEdit} onCreate={onCreate} showTeam={showTeam} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{active ? <BoardCardBody project={active} overlay showTeam={showTeam} /> : null}</DragOverlay>
    </DndContext>
  );
}

export function BoardSkeleton() {
  return (
    <div className="flex h-full gap-3 overflow-hidden px-4 pb-5 pt-1 sm:px-7" aria-hidden>
      {[2, 3, 4, 1, 2].map((n, c) => (
        <div key={c} className="flex w-[288px] shrink-0 flex-col gap-2 rounded-lg bg-sunken p-2">
          <div className="flex h-7 items-center gap-2 px-1">
            <Skeleton className="h-3.5 w-3.5" />
            <Skeleton className="h-3 w-20" />
          </div>
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className="rounded-md border border-line bg-card p-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded-[30%]" />
                <Skeleton className={i % 2 ? 'h-3 w-32' : 'h-3 w-44'} />
              </div>
              <Skeleton className="mt-3 h-1 w-full rounded-full" />
              <div className="mt-3 flex items-center gap-2">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="ml-auto h-5 w-5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
