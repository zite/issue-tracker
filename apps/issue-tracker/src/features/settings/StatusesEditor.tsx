import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowsLeftRight, DotsSixVertical, DotsThree, Plus, Trash, Warning } from '@phosphor-icons/react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { listIssues, saveStatus } from 'zitejs/api';
import { STATUS_FALLBACK_COLOR, StatusGlyph } from '../../glyphs';
import { useAppActions } from '../../lib/app-actions';
import { STATUS_TYPE_LABEL, STATUS_TYPES } from '../../lib/constants';
import { plural } from '../../lib/format';
import { qk } from '../../lib/queries';
import type { Bootstrap, IssueFilters, Status, StatusType, Team } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '../../ui/Dialog';
import { Field, Input } from '../../ui/Form';
import { Card, Skeleton } from '../../ui/Layout';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from '../../ui/Menu';
import { Tooltip } from '../../ui/Tooltip';
import { ColorPopover, InlineInput, Locked, SelectMenu, useSettingsLock, useSettingsMutation } from './kit';

/** What each category means for the numbers — the reason to pick one over another. */
const CATEGORY_ABOUT: Record<StatusType, string> = {
  intake: 'New issues wait here to be accepted, declined or merged. They stay out of workload and unassigned counts until someone accepts them.',
  backlog: 'Accepted but not planned. Counts as open scope, not as progress.',
  unstarted: 'Planned and ready to pick up. Open scope — the cycle-time clock hasn’t started yet.',
  started: 'Being worked on. Entering one starts the cycle-time clock and counts as in flight in sprints and reports.',
  completed: 'Finished. Stops the clock and counts toward velocity, burndown and project progress.',
  canceled: 'Won’t be done. Dropped from scope, so it never drags progress down.',
};

/** How an issue counts once its status is in this category, as the end of "… will …". */
const COUNTS_AS: Record<StatusType, string> = {
  intake: 'wait in intake and drop out of workload counts',
  backlog: 'count as open scope in sprints and reports, not as progress',
  unstarted: 'count as planned but not started in sprints and reports',
  started: 'count as in flight in sprints and reports',
  completed: 'count as done toward velocity, burndown and project progress',
  canceled: 'drop out of scope in sprints, projects and reports',
};

/** The endpoint refuses to delete the last of these; changing its category would dodge that rule, so the UI holds it too. */
const REQUIRED: StatusType[] = ['backlog', 'unstarted', 'started', 'completed', 'canceled'];

const typeOf = (s: Pick<Status, 'type'>): StatusType => ((STATUS_TYPES as string[]).includes(s.type) ? (s.type as StatusType) : 'backlog');

const patchStatus = (id: string, patch: Partial<Status>) => (data: Bootstrap): Bootstrap => ({
  ...data,
  statuses: data.statuses.map(s => (s.id === id ? { ...s, ...patch } : s)),
});

const withPositions = (order: string[], extra?: { id: string; patch: Partial<Status> }) => (data: Bootstrap): Bootstrap => {
  const pos = new Map(order.map((id, i) => [id, i]));
  return {
    ...data,
    statuses: data.statuses.map(s => {
      const next = pos.has(s.id) ? { ...s, position: pos.get(s.id)! } : s;
      return extra && s.id === extra.id ? { ...next, ...extra.patch } : next;
    }),
  };
};

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** Issues in a status, archived ones included — the number a delete has to move. */
const countFilters = (statusId: string): IssueFilters => ({ statusIds: [statusId], includeArchived: true });
const countKey = (statusId: string) => qk.issues(countFilters(statusId), 'settings:count');
const countQuery = (statusId: string, enabled = true) => ({
  queryKey: countKey(statusId),
  queryFn: () => listIssues({ filters: countFilters(statusId), limit: 1 }),
  staleTime: 30_000,
  enabled,
});

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

type RowActions = {
  rename: (s: Status, name: string) => void;
  describe: (s: Status, description: string) => void;
  recolor: (s: Status, color: string) => void;
  retype: (s: Status, type: StatusType) => void;
  remove: (s: Status) => void;
  isLast: (s: Status) => boolean;
  categories: StatusType[];
  counts: Map<string, number | undefined>;
};

const ROW_GRID = 'grid grid-cols-[20px_32px_minmax(0,1fr)_32px] items-center gap-x-1 sm:grid-cols-[20px_32px_minmax(0,0.85fr)_minmax(0,1.3fr)_76px_32px]';

function StatusRow({ status, siblings, actions, handle }: { status: Status; siblings: Status[]; actions: RowActions; handle: ReactNode }) {
  const type = typeOf(status);
  const last = actions.isLast(status);
  const lastHint = `A team needs at least one ${STATUS_TYPE_LABEL[type].toLowerCase()} status`;
  const count = actions.counts.get(status.id);
  return (
    <div className={cn(ROW_GRID, 'min-h-10 py-1 pl-1.5 pr-3 sm:py-0')}>
      <div className="row-span-2 self-center sm:row-span-1">{handle}</div>
      <div>
        <ColorPopover value={status.color} onChange={c => actions.recolor(status, c)} title="Colour">
          <button
            type="button"
            aria-label={`Colour of ${status.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-sm transition-colors hover:bg-hover disabled:hover:bg-transparent data-[state=open]:bg-pressed"
          >
            <StatusGlyph status={status} siblings={siblings} size={16} />
          </button>
        </ColorPopover>
      </div>
      <div className="min-w-0">
        <InlineInput value={status.name} required maxLength={60} aria-label="Status name" className="font-medium" onCommit={name => actions.rename(status, name)} />
      </div>
      <div className="col-start-3 row-start-2 min-w-0 sm:col-start-4 sm:row-start-1">
        <InlineInput
          value={status.description}
          maxLength={300}
          placeholder="Add a description"
          aria-label={`Description of ${status.name}`}
          className="h-7 text-ink-3 focus:text-ink sm:h-8"
          onCommit={d => actions.describe(status, d)}
        />
      </div>
      <div className="hidden text-right sm:block">
        {count === undefined ? (
          <Skeleton className="ml-auto h-3 w-12" />
        ) : (
          <Tooltip content={count ? `${plural(count, 'issue')} in ${status.name}, archived included` : null}>
            <span className={cn('tabular text-meta', count ? 'text-ink-2' : 'text-ink-3')}>{count ? plural(count, 'issue') : 'No issues'}</span>
          </Tooltip>
        )}
      </div>
      <div className="col-start-4 row-start-1 sm:col-start-6">
        <Menu modal={false}>
          <MenuTrigger asChild>
            <Button variant="ghost" size="sm" icon aria-label={`Actions for ${status.name}`} className="data-[state=open]:bg-pressed">
              <DotsThree size={16} weight="bold" />
            </Button>
          </MenuTrigger>
          <MenuContent align="end" className="w-60">
            {last ? (
              <MenuItem disabled icon={<ArrowsLeftRight size={15} />}>
                Change category
              </MenuItem>
            ) : (
              <MenuSub>
                <MenuSubTrigger icon={<ArrowsLeftRight size={15} />}>Change category</MenuSubTrigger>
                <MenuSubContent className="w-48">
                  {actions.categories.map(t => (
                    <MenuItem key={t} disabled={t === type} hint={t === type ? 'Current' : undefined} icon={<StatusGlyph status={{ type: t, color: status.color }} />} onSelect={() => actions.retype(status, t)}>
                      {STATUS_TYPE_LABEL[t]}
                    </MenuItem>
                  ))}
                </MenuSubContent>
              </MenuSub>
            )}
            <MenuSeparator />
            <MenuItem disabled={last} destructive={!last} icon={<Trash size={15} />} onSelect={() => actions.remove(status)}>
              Delete status…
            </MenuItem>
            {last && <MenuLabel className="normal-case tracking-normal">{lastHint}.</MenuLabel>}
          </MenuContent>
        </Menu>
      </div>
    </div>
  );
}

function SortableStatusRow({ status, siblings, actions, disabled }: { status: Status; siblings: Status[]; actions: RowActions; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: status.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('group relative bg-card transition-colors hover:bg-hover/30', isDragging && 'z-10 bg-sunken [&>*]:invisible')}
    >
      <StatusRow
        status={status}
        siblings={siblings}
        actions={actions}
        handle={
          // Only the handle starts a drag, so the inputs in the row stay clickable and selectable.
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${status.name}`}
            style={{ touchAction: 'none' }}
            className="flex h-8 w-5 cursor-grab items-center justify-center rounded-xs text-ink-3 transition-opacity hover:text-ink focus-visible:opacity-100 active:cursor-grabbing disabled:cursor-default disabled:opacity-0 sm:opacity-0 sm:group-hover:opacity-100 sm:disabled:group-hover:opacity-0"
          >
            <DotsSixVertical size={15} weight="bold" />
          </button>
        }
      />
    </div>
  );
}

/** A static copy for the drag overlay — never the sortable itself, or dnd-kit registers the id twice. */
function StatusRowPreview({ status, siblings }: { status: Status; siblings: Status[] }) {
  return (
    <div className={cn(ROW_GRID, 'h-10 cursor-grabbing rounded-md bg-card pl-1.5 pr-3 shadow-pop ring-1 ring-line-strong')}>
      <span className="flex justify-center text-ink">
        <DotsSixVertical size={15} weight="bold" />
      </span>
      <span className="flex justify-center">
        <StatusGlyph status={status} siblings={siblings} size={16} />
      </span>
      <span className="truncate px-2 text-ui font-medium text-ink">{status.name}</span>
      <span className="hidden truncate px-2 text-ui text-ink-3 sm:block">{status.description}</span>
    </div>
  );
}

function AddStatusRow({ type, onAdd, onCancel }: { type: StatusType; onAdd: (name: string, color: string) => Promise<boolean>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(STATUS_FALLBACK_COLOR[type]);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const ok = await onAdd(name.trim(), color);
    setSaving(false);
    if (ok) setName('');
  };
  return (
    <form
      className="flex items-center gap-1.5 rounded-b-lg border-t border-line bg-sunken/70 py-2 pl-[26px] pr-3 animate-rise-in"
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
    >
      <ColorPopover value={color} onChange={setColor} title="Colour">
        <button type="button" aria-label="Colour for the new status" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm hover:bg-hover data-[state=open]:bg-pressed">
          <StatusGlyph status={{ type, color }} size={16} />
        </button>
      </ColorPopover>
      <Input
        autoFocus
        value={name}
        maxLength={60}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
        placeholder={`New ${STATUS_TYPE_LABEL[type].toLowerCase()} status`}
        aria-label="New status name"
        className="min-w-0 flex-1"
      />
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" variant="primary" size="sm" disabled={!name.trim()} loading={saving}>
        Add
      </Button>
    </form>
  );
}

function CategoryRows({ type, statuses, siblings, actions, onReorder, disabled }: {
  type: StatusType;
  statuses: Status[];
  siblings: Status[];
  actions: RowActions;
  onReorder: (ids: string[]) => void;
  disabled: boolean;
}) {
  const propIds = useMemo(() => statuses.map(s => s.id), [statuses]);
  const [ids, setIds] = useState(propIds);
  const [activeId, setActiveId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(statuses.map(s => [s.id, s])), [statuses]);
  const propKey = propIds.join('|');

  useEffect(() => {
    if (!activeId) setIds(propIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propKey, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // The pointer, not the dragged rectangle, decides where a row lands.
  const collision: CollisionDetection = args => {
    const hits = pointerWithin(args);
    return hits.length ? hits : closestCenter(args);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    setIds(next);
    onReorder(next);
  };

  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      modifiers={[verticalOnly]}
      autoScroll={false}
      onDragStart={e => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setIds(propIds);
      }}
      accessibility={{
        screenReaderInstructions: { draggable: 'To reorder, press space, move with the arrow keys, then press space again to drop, or escape to cancel.' },
      }}
    >
      <SortableContext id={type} items={ids} strategy={verticalListSortingStrategy}>
        <div className="divide-y divide-line">
          {ids.map(id => {
            const s = byId.get(id);
            return s ? <SortableStatusRow key={id} status={s} siblings={siblings} actions={actions} disabled={disabled} /> : null;
          })}
        </div>
      </SortableContext>
      {/*
        No drop animation: the reorder is optimistic, so the row is already where it landed.
        Portalled to body: the overlay is position:fixed, and any ancestor with a transform
        (an entrance animation's fill, say) would otherwise become its containing block and
        throw it hundreds of pixels away from the pointer.
      */}
      {createPortal(
        <DragOverlay dropAnimation={null} modifiers={[verticalOnly]}>
          {active ? <StatusRowPreview status={active} siblings={siblings} /> : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

function DeleteStatusDialog({ status: requested, team, statuses, onOpenChange }: {
  status: Status | null;
  team: Team;
  statuses: Status[];
  onOpenChange: (open: boolean) => void;
}) {
  const run = useSettingsMutation();
  // Keep showing the last status while the dialog animates closed, instead of an empty title.
  const last = useRef(requested);
  if (requested) last.current = requested;
  const status = requested ?? last.current;
  const others = statuses.filter(s => s.id !== status?.id);
  const fallback = status ? others.find(s => s.type === status.type) ?? others.find(s => s.type === 'backlog') ?? others[0] : undefined;
  // The pick lives in state; until someone picks, the target is derived, so it's ready the moment the dialog opens
  // (a target set by an effect would leave Delete disabled for the first render, and autofocus would miss it).
  // Remembered per status, so reopening the dialog for another one never shows the last pick.
  const [picked, setPicked] = useState<{ statusId: string; targetId: string } | null>(null);
  const pickedId = picked && picked.statusId === status?.id ? picked.targetId : undefined;
  const target = pickedId && others.some(s => s.id === pickedId) ? pickedId : fallback?.id;
  const setTarget = (targetId: string) => status && setPicked({ statusId: status.id, targetId });
  const [saving, setSaving] = useState(false);
  const count = useQuery(countQuery(status?.id ?? '', Boolean(requested)));
  const total = count.data?.total ?? 0;
  const counting = count.isPending;
  const deleteRef = useRef<HTMLButtonElement>(null);

  // If the count lands after the dialog opened and there's nothing to move, the picker that held focus is gone.
  useEffect(() => {
    if (!requested || counting || total > 0) return;
    const active = document.activeElement;
    if (!active || active === document.body) deleteRef.current?.focus();
  }, [requested, counting, total]);


  const destination = others.find(s => s.id === target);
  const options = STATUS_TYPES.flatMap(t =>
    others.filter(s => typeOf(s) === t).map(s => ({ value: s.id, label: s.name, group: STATUS_TYPE_LABEL[t], icon: <StatusGlyph status={s} siblings={statuses} /> })),
  );

  const submit = async () => {
    if (!status || !target || saving) return;
    setSaving(true);
    const res = await run(() => saveStatus({ id: status.id, teamId: team.id, remove: true, reassignToStatusId: target }), {
      optimistic: data => ({ ...data, statuses: data.statuses.filter(s => s.id !== status.id) }),
      success: r => (r.movedIssues ? `Deleted “${status.name}” · moved ${plural(r.movedIssues, 'issue')} to “${destination?.name ?? 'another status'}”` : `Deleted “${status.name}”`),
      error: 'Couldn’t delete the status',
      alsoInvalidate: [qk.issuesRoot, qk.issueRoot],
    });
    setSaving(false);
    if (res) onOpenChange(false);
  };

  return (
    <Dialog open={Boolean(requested)} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader
          title={`Delete “${status?.name ?? ''}”?`}
          description={
            counting ? (
              <Skeleton className="mt-1 inline-block h-3.5 w-56 align-middle" />
            ) : total === 0 ? (
              'No issues are in this status, so nothing needs to move.'
            ) : (
              <>
                <span className="font-semibold text-ink">{plural(total, 'issue')}</span> {total === 1 ? 'is' : 'are'} in this status, archived ones included. Choose where {total === 1 ? 'it goes' : 'they go'}.
              </>
            )
          }
        />
        {!counting && total === 0 && <div className="h-3" />}
        {(counting || total > 0) && (
          <DialogBody className="pb-5">
            <Field
              label="Move issues to"
              hint={
                destination && status && destination.type !== status.type ? (
                  <span className="flex items-start gap-1.5 text-warning">
                    <Warning size={13} weight="bold" className="mt-px shrink-0" />
                    They’ll become {STATUS_TYPE_LABEL[destination.type]?.toLowerCase()}, which changes how they count in sprints and reports.
                  </span>
                ) : undefined
              }
            >
              <SelectMenu autoFocus value={target} onChange={setTarget} options={options} ariaLabel="Move issues to" className="h-9 text-body" contentClassName="w-[var(--radix-dropdown-menu-trigger-width)]" />
            </Field>
          </DialogBody>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button ref={deleteRef} variant="danger" onClick={submit} disabled={!target || counting} loading={saving} data-autofocus={total === 0 && !counting ? true : undefined}>
            Delete status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export function StatusesEditor({ team }: { team: Team }) {
  const ws = useWorkspace();
  const run = useSettingsMutation();
  const app = useAppActions();
  const lock = useSettingsLock();
  const statuses = useMemo(() => ws.statusesByTeam.get(team.id) ?? [], [ws.statusesByTeam, team.id]);
  // `?add=intake` arrives from the General tab's "no Intake status yet" warning, with the add row open.
  const [params, setParams] = useSearchParams();
  const requestedAdd = params.get('add');
  const [adding, setAdding] = useState<StatusType | null>(() => ((STATUS_TYPES as string[]).includes(requestedAdd ?? '') && !lock ? (requestedAdd as StatusType) : null));
  useEffect(() => {
    if (!requestedAdd) return;
    const next = new URLSearchParams(params);
    next.delete('add');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [deleting, setDeleting] = useState<Status | null>(null);
  // The latest grouping, for handlers that fire after a drag or a menu closes.
  const byTypeRef = useRef<Record<StatusType, Status[]>>({} as never);

  const byType = useMemo(() => {
    const m = Object.fromEntries(STATUS_TYPES.map(t => [t, [] as Status[]])) as Record<StatusType, Status[]>;
    for (const s of statuses) m[typeOf(s)].push(s);
    return m;
  }, [statuses]);
  byTypeRef.current = byType;

  const countResults = useQueries({ queries: statuses.map(s => countQuery(s.id)) });
  const counts = new Map(statuses.map((s, i) => [s.id, countResults[i]?.data?.total]));

  const hasIntakeStatus = byType.intake.length > 0;
  const categories = STATUS_TYPES.filter(t => t !== 'intake' || team.intakeEnabled || hasIntakeStatus || adding === 'intake');

  /**
   * The team's full order with one category's ids replaced — the endpoint takes
   * every id at once. Ids in `ids` are pulled out of whatever category held
   * them, which is how a recategorised status leaves its old group.
   */
  const fullOrder = (type: StatusType, ids: string[]) => {
    const moving = new Set(ids);
    return STATUS_TYPES.flatMap(t => (t === type ? ids : byTypeRef.current[t].map(s => s.id).filter(id => !moving.has(id))));
  };

  const actions: RowActions = {
    categories,
    counts,
    isLast: s => REQUIRED.includes(typeOf(s)) && byType[typeOf(s)].length <= 1,
    rename: (s, name) => run(() => saveStatus({ id: s.id, teamId: team.id, name }), { optimistic: patchStatus(s.id, { name }), error: 'Couldn’t rename the status' }),
    describe: (s, description) =>
      run(() => saveStatus({ id: s.id, teamId: team.id, description: description || null }), {
        optimistic: patchStatus(s.id, { description: description || null }),
        error: 'Couldn’t save the description',
      }),
    recolor: (s, color) => run(() => saveStatus({ id: s.id, teamId: team.id, color }), { optimistic: patchStatus(s.id, { color }), error: 'Couldn’t change the colour' }),
    retype: async (s, type) => {
      // Moving a status that holds issues changes what those issues count as, so say so first.
      const held = counts.get(s.id) ?? 0;
      if (held > 0) {
        const ok = await app.confirm({
          title: `Move “${s.name}” to ${STATUS_TYPE_LABEL[type]}?`,
          description: `${held === 1 ? 'The issue' : `All ${plural(held, 'issue')}`} in it will ${COUNTS_AS[type]}.`,
          confirmLabel: 'Change category',
        });
        if (!ok) return;
      }
      // Land it at the end of its new category so the board keeps its left-to-right shape.
      const ids = [...byTypeRef.current[type].map(x => x.id), s.id];
      const order = fullOrder(type, ids);
      run(
        async () => {
          await saveStatus({ id: s.id, teamId: team.id, type });
          return saveStatus({ teamId: team.id, order });
        },
        {
          optimistic: withPositions(order, { id: s.id, patch: { type } }),
          success: `Moved “${s.name}” to ${STATUS_TYPE_LABEL[type]}`,
          error: 'Couldn’t change the category',
          alsoInvalidate: [qk.issuesRoot, qk.issueRoot],
        },
      );
    },
    remove: s => setDeleting(s),
  };

  const reorder = (type: StatusType, ids: string[]) => {
    const order = fullOrder(type, ids);
    run(() => saveStatus({ teamId: team.id, order }), { optimistic: withPositions(order), error: 'Couldn’t reorder the statuses' });
  };

  const add = async (type: StatusType, name: string, color: string) => {
    const res = await run(() => saveStatus({ teamId: team.id, name, type, color }), {
      success: `Added “${name}” to ${STATUS_TYPE_LABEL[type]}`,
      error: 'Couldn’t add the status',
    });
    return Boolean(res);
  };

  return (
    <div>
      <p className="mb-6 max-w-[640px] text-ui text-ink-2 text-pretty">
        Statuses are the steps an issue moves through and the columns of {team.name}’s board. Drag to reorder within a category; the category decides how an issue counts in sprints, projects and reports.
      </p>
      <Locked>
        <div className="flex flex-col gap-5">
          {categories.map(type => {
            const list = byType[type];
            const glyphColor = list[0]?.color ?? STATUS_FALLBACK_COLOR[type];
            return (
              <Card as="section" key={type} className="overflow-hidden">
                <header className="flex items-start gap-3 border-b border-line px-4 py-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-sunken">
                    <StatusGlyph status={{ type, color: glyphColor }} size={15} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-title font-semibold text-ink">{STATUS_TYPE_LABEL[type]}</h3>
                      <span className="tabular text-meta text-ink-3">{list.length}</span>
                    </div>
                    <p className="text-ui text-ink-3 text-pretty">{CATEGORY_ABOUT[type]}</p>
                  </div>
                </header>
                {type === 'intake' && !team.intakeEnabled && (
                  <p className="flex items-start gap-1.5 border-b border-line bg-warning/10 px-4 py-2 text-meta text-warning">
                    <Warning size={14} weight="bold" className="mt-px shrink-0" />
                    Intake is turned off for this team, so this status isn’t used. Turn it on in General.
                  </p>
                )}
                <CategoryRows type={type} statuses={list} siblings={statuses} actions={actions} onReorder={ids => reorder(type, ids)} disabled={Boolean(lock)} />
                {list.length === 0 && adding !== type && (
                  <div className="px-4 py-3 text-ui text-ink-3">
                    {type === 'intake' ? 'No Intake status yet — add one so new issues have somewhere to wait.' : `No ${STATUS_TYPE_LABEL[type].toLowerCase()} statuses.`}
                  </div>
                )}
                {adding === type ? (
                  <AddStatusRow type={type} onAdd={(name, color) => add(type, name, color)} onCancel={() => setAdding(null)} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdding(type)}
                    className="flex h-10 w-full items-center gap-2.5 rounded-b-lg border-t border-dashed border-line pl-[34px] pr-4 text-ui text-ink-3 transition-colors hover:bg-hover/50 hover:text-ink disabled:hidden"
                  >
                    <Plus size={14} weight="bold" />
                    Add status
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      </Locked>
      <DeleteStatusDialog status={deleting} team={team} statuses={statuses} onOpenChange={open => !open && setDeleting(null)} />
    </div>
  );
}
