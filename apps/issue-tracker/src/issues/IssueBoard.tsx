import {
  closestCorners, DndContext, DragOverlay, MouseSensor, pointerWithin, TouchSensor, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from '@phosphor-icons/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Mark, PriorityGlyph, StatusGlyph, TypeGlyph } from '../glyphs';
import { estimateLabel, isDoneType, type DisplayProperty, type Grouping } from '../lib/constants';
import { plural } from '../lib/format';
import type { Issue } from '../lib/types';
import type { IssueGroup } from '../lib/view';
import { useWorkspace } from '../lib/workspace';
import { Avatar } from '../ui/Avatar';
import { Count, LabelChip } from '../ui/Chip';
import { cn } from '../ui/cn';
import { BlockedBadge, CommentCount, DueText, GroupGlyph, SubIssueProgress } from './cells';
import { IssueContextMenu } from './IssueContextMenu';

export type BoardMove = {
  issue: Issue;
  fromKey: string;
  toGroup: IssueGroup;
  prevId: string | null;
  nextId: string | null;
  columnIds: string[];
  position: number;
};

type Props = {
  groups: IssueGroup[];
  grouping: Grouping;
  properties: Set<DisplayProperty>;
  selection: Set<string>;
  focusedId: string | null;
  openId: string | null;
  canReorder: boolean;
  onMove: (move: BoardMove) => void;
  onCardClick: (issue: Issue, e: MouseEvent) => void;
  getTargets: (issue: Issue) => Issue[];
  onCreateInGroup?: (group: IssueGroup) => void;
};

/** A presentational index card — rendered in the lane and, as a copy, in the drag overlay. */
const CardBody = memo(function CardBody({ issue, properties, grouping, selected, focused, open, overlay }: {
  issue: Issue; properties: Set<DisplayProperty>; grouping: Grouping; selected?: boolean; focused?: boolean; open?: boolean; overlay?: boolean;
}) {
  const ws = useWorkspace();
  const status = ws.statusOf(issue);
  const assignee = issue.assigneeId ? ws.memberById.get(issue.assigneeId) : undefined;
  const project = issue.projectId ? ws.projectById.get(issue.projectId) : undefined;
  const team = issue.teamId ? ws.teamById.get(issue.teamId) : undefined;
  const labels = issue.labelIds.map(id => ws.labelById.get(id)).filter(Boolean);
  const done = isDoneType(status?.type);
  const has = (p: DisplayProperty) => properties.has(p);
  const estimate = has('estimate') ? estimateLabel(issue.estimate, team?.estimateScale, true) : null;

  return (
    <div
      className={cn(
        'group/card relative rounded-lg border bg-card p-3 text-ui shadow-hairline transition-[box-shadow,border-color] duration-100',
        'border-line hover:border-line-strong hover:shadow-raised',
        open && 'border-ink/40 bg-[color:color-mix(in_oklab,rgb(var(--highlight))_16%,rgb(var(--card)))]',
        selected && 'ring-2 ring-highlight',
        focused && !selected && !open && 'border-ink/35',
        overlay && 'rotate-[1.2deg] cursor-grabbing border-line-strong shadow-pop',
      )}
    >
      <div className="flex items-center gap-1.5">
        {has('type') && <TypeGlyph type={issue.issueType} size={13} />}
        {has('identifier') && <span className="font-mono text-[11px] text-ink-3">{issue.identifier}</span>}
        {!done && <BlockedBadge count={issue.blockedBy} />}
        <span className="ml-auto">{has('assignee') && assignee && <Avatar person={assignee} size={20} />}</span>
      </div>
      <p className={cn('mt-1.5 line-clamp-3 text-body font-medium leading-[1.35]', done ? 'text-ink-3' : 'text-ink')}>
        {grouping !== 'status' && has('status') && (
          <StatusGlyph status={status} siblings={issue.teamId ? ws.statusesByTeam.get(issue.teamId) : undefined} className="mr-1.5 inline -translate-y-px align-middle" />
        )}
        {issue.title}
      </p>
      {(has('labels') && labels.length > 0) || (has('project') && project && grouping !== 'project') ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {has('project') && project && grouping !== 'project' && (
            <span className="inline-flex h-5 max-w-[150px] items-center gap-1 rounded-xs bg-sunken px-1.5 text-meta text-ink-2">
              <Mark icon={project.icon} color={project.color} name={project.name} size={13} />
              <span className="truncate">{project.name}</span>
            </span>
          )}
          {has('labels') &&
            labels.slice(0, 2).map((l, i) =>
              i === 1 && labels.length > 2 ? (
                // Keep "+N" on the same line as the last chip it counts on from.
                <span key={l!.id} className="inline-flex items-center gap-1" title={labels.slice(1).map(x => x!.name).join(', ')}>
                  <LabelChip name={l!.name} color={l!.color} className="max-w-[110px]" />
                  <span className="text-meta text-ink-3">+{labels.length - 2}</span>
                </span>
              ) : (
                <LabelChip key={l!.id} name={l!.name} color={l!.color} className="max-w-[110px]" />
              ),
            )}
        </div>
      ) : null}
      <div className="mt-2.5 flex items-center gap-2.5 border-t border-dashed border-line pt-2 text-meta text-ink-2">
        {has('priority') && grouping !== 'priority' && <PriorityGlyph priority={issue.priority} size={13} />}
        {estimate && <span className="tabular font-medium">{estimate}{team?.estimateScale === 'tshirt' ? '' : String(estimate) === '1' ? ' pt' : ' pts'}</span>}
        {has('dueDate') && issue.dueDate && <DueText day={issue.dueDate} done={done} />}
        {has('subIssues') && <SubIssueProgress done={issue.subIssueDone} total={issue.subIssueTotal} />}
        <span className="ml-auto">
          <CommentCount count={issue.commentCount} />
        </span>
      </div>
    </div>
  );
});

function SortableCard(props: {
  issue: Issue; properties: Set<DisplayProperty>; grouping: Grouping; selected: boolean; focused: boolean; open: boolean; disabled: boolean; dragging: boolean;
  onClick: (issue: Issue, e: MouseEvent) => void; getTargets: (issue: Issue) => Issue[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.issue.id, disabled: props.disabled });
  return (
    <IssueContextMenu getIssues={() => props.getTargets(props.issue)}>
      <div
        ref={setNodeRef}
        data-issue-id={props.issue.id}
        // The source never moves with the pointer while the overlay is showing — only its siblings shift.
        style={{ transform: isDragging ? undefined : transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition, touchAction: 'manipulation' }}
        className={cn('cursor-default outline-none', isDragging && 'opacity-30')}
        onClick={e => props.onClick(props.issue, e)}
        {...attributes}
        {...listeners}
      >
        <CardBody issue={props.issue} properties={props.properties} grouping={props.grouping} selected={props.selected} focused={props.focused} open={props.open} />
      </div>
    </IssueContextMenu>
  );
}

function Lane({ group, grouping, ids, byId, children, onCreate, droppable }: {
  group: IssueGroup; grouping: Grouping; ids: string[]; byId: Map<string, Issue>; children: ReactNode; onCreate?: () => void; droppable: boolean;
}) {
  // The droppable is the WHOLE lane, header included — otherwise the header is a dead zone.
  const { setNodeRef, isOver } = useDroppable({ id: `col:${group.key}`, disabled: !droppable });
  const points = ids.reduce((a, id) => a + (byId.get(id)?.estimate ?? 0), 0);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex h-full w-[300px] shrink-0 flex-col rounded-xl bg-sunken ring-1 ring-inset ring-line transition-[background-color,box-shadow]',
        isOver && droppable && 'bg-[color:color-mix(in_oklab,rgb(var(--highlight))_18%,rgb(var(--sunken)))] ring-highlight',
      )}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 px-3">
        <GroupGlyph group={group} grouping={grouping} />
        <span className="truncate text-ui font-semibold text-ink">{group.label}</span>
        <Count className="bg-card">{ids.length}</Count>
        {points > 0 && <span className="tabular text-meta text-ink-3">{plural(points, 'pt')}</span>}
        {onCreate && (
          <button type="button" onClick={onCreate} aria-label={`New issue in ${group.label}`} className="ml-auto flex h-7 w-7 items-center justify-center rounded-sm text-ink-3 hover:bg-card hover:text-ink">
            <Plus size={15} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <SortableContext id={group.key} items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex min-h-[72px] flex-col gap-2">{children}</div>
        </SortableContext>
        {ids.length === 0 && (
          <div className="mt-[-72px] flex h-[72px] items-center justify-center rounded-lg border border-dashed border-line-strong text-meta text-ink-3">
            {droppable ? 'Drop issues here' : 'Nothing here'}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The board. Dropping into a lane sets whatever the lane represents (status,
 * assignee, priority, project, sprint, type). Collision uses the pointer, not
 * the dragged card's rectangle; edge scrolling is keyed to the pointer so it
 * can't run away; there's no drop animation because the move is optimistic.
 */
function IssueBoardInner({ groups, grouping, properties, selection, focusedId, openId, canReorder, onMove, onCardClick, getTargets, onCreateInGroup }: Props) {
  const byId = useMemo(() => new Map(groups.flatMap(g => g.issues.map(i => [i.id, i] as const))), [groups]);
  const fromGroups = useCallback(() => Object.fromEntries(groups.map(g => [g.key, g.issues.map(i => i.id)])), [groups]);
  const [columns, setColumns] = useState<Record<string, string[]>>(fromGroups);
  const [activeId, setActiveId] = useState<string | null>(null);
  const origin = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!activeId) setColumns(fromGroups());
  }, [fromGroups, activeId]);

  // A mouse drags after a small move; a finger has to press and hold, so a swipe still scrolls the board.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );
  const dropOf = (key: string) => groups.find(g => g.key === key);
  const droppable = (key: string) => Boolean(dropOf(key)?.drop);

  const collision: CollisionDetection = useCallback(args => {
    const hits = pointerWithin(args);
    if (hits.length) {
      const cards = hits.filter(h => !String(h.id).startsWith('col:'));
      return cards.length ? cards : hits;
    }
    return closestCorners(args);
  }, []);

  const columnOf = (id: string) => {
    if (id.startsWith('col:')) return id.slice(4);
    return Object.keys(columns).find(k => columns[k].includes(id));
  };

  useEffect(() => {
    if (!activeId) return;
    const onMoveEvt = (e: PointerEvent) => (pointer.current = { x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', onMoveEvt);
    const timer = window.setInterval(() => {
      const el = scroller.current;
      const p = pointer.current;
      if (!el || !p) return;
      const r = el.getBoundingClientRect();
      const edge = 72;
      if (p.x < r.left + edge) el.scrollLeft -= Math.ceil((r.left + edge - p.x) / 4);
      else if (p.x > r.right - edge) el.scrollLeft += Math.ceil((p.x - (r.right - edge)) / 4);
    }, 16);
    return () => {
      window.removeEventListener('pointermove', onMoveEvt);
      window.clearInterval(timer);
    };
  }, [activeId]);

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveId(id);
    origin.current = columnOf(id) ?? null;
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const activeKey = columnOf(String(active.id));
    const overKey = columnOf(String(over.id));
    if (!activeKey || !overKey || activeKey === overKey || !droppable(overKey)) return;
    setColumns(prev => {
      const from = prev[activeKey].filter(id => id !== active.id);
      const to = [...prev[overKey]];
      const overIndex = String(over.id).startsWith('col:') ? to.length : Math.max(0, to.indexOf(String(over.id)));
      to.splice(overIndex, 0, String(active.id));
      return { ...prev, [activeKey]: from, [overKey]: to };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    const fromKey = origin.current;
    setActiveId(null);
    origin.current = null;
    if (!over || !fromKey) {
      setColumns(fromGroups());
      return;
    }
    const key = columnOf(id);
    if (!key) return;
    let list = columns[key];
    const overId = String(over.id);
    if (!overId.startsWith('col:') && overId !== id && list.includes(overId)) list = arrayMove(list, list.indexOf(id), list.indexOf(overId));
    const moved = key !== fromKey;
    const reordered = !moved && JSON.stringify(list) !== JSON.stringify(fromGroups()[key]);
    if (!moved && (!reordered || !canReorder)) {
      setColumns(fromGroups());
      return;
    }
    setColumns(prev => ({ ...prev, [key]: list }));
    const idx = list.indexOf(id);
    const prevId = idx > 0 ? list[idx - 1] : null;
    const nextId = idx < list.length - 1 ? list[idx + 1] : null;
    const prevPos = prevId ? byId.get(prevId)?.position : undefined;
    const nextPos = nextId ? byId.get(nextId)?.position : undefined;
    const position = prevPos != null && nextPos != null ? (prevPos + nextPos) / 2 : prevPos != null ? prevPos + 1024 : nextPos != null ? nextPos - 1024 : 0;
    const issue = byId.get(id);
    const toGroup = dropOf(key);
    if (issue && toGroup) onMove({ issue, fromKey, toGroup, prevId, nextId, columnIds: list, position });
  };

  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      autoScroll={false}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setColumns(fromGroups());
      }}
    >
      <div ref={scroller} data-board-scroller className="flex h-full gap-3 overflow-x-auto overflow-y-hidden p-3">
        {groups.map(group => {
          const ids = columns[group.key] ?? [];
          return (
            <Lane key={group.key} group={group} grouping={grouping} ids={ids} byId={byId} droppable={droppable(group.key)} onCreate={onCreateInGroup ? () => onCreateInGroup(group) : undefined}>
              {ids.map(id => {
                const issue = byId.get(id);
                if (!issue) return null;
                return (
                  <SortableCard
                    key={id}
                    issue={issue}
                    properties={properties}
                    grouping={grouping}
                    selected={selection.has(id)}
                    focused={focusedId === id}
                    open={openId === id || openId === issue.identifier}
                    disabled={grouping === 'label' || grouping === 'team'}
                    dragging={activeId === id}
                    onClick={onCardClick}
                    getTargets={getTargets}
                  />
                );
              })}
            </Lane>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>{active ? <CardBody issue={active} properties={properties} grouping={grouping} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

export const IssueBoard = memo(IssueBoardInner);
