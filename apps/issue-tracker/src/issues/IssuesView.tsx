import { ArrowCounterClockwise, CopySimple, DotsThree, DownloadSimple, FloppyDisk, Kanban, MagnifyingGlass, Rows, Stack, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppActions, type CreateDefaults } from '../lib/app-actions';
import { copyText } from '../lib/clipboard';
import type { Grouping } from '../lib/constants';
import { exportIssuesCsv } from '../lib/csv';
import { branchName } from '../lib/format';
import { useHotkeys } from '../lib/hotkeys';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useIssueActions } from '../lib/mutations';
import { useIssues } from '../lib/queries';
import type { Issue, IssueFilters, SavedView } from '../lib/types';
import { effectiveFilters, groupIssues, useViewState, type IssueGroup, type ViewOptions } from '../lib/view';
import { useWorkspace } from '../lib/workspace';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { Segmented } from '../ui/Form';
import { Kbd } from '../ui/Kbd';
import { EmptyState, ListSkeleton } from '../ui/Layout';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import { BulkBar } from './BulkBar';
import { DisplayMenu } from './DisplayMenu';
import { FilterChips, FilterMenu, type FilterField } from './filters';
import { IssueBoard, type BoardMove } from './IssueBoard';
import { IssueLedger } from './IssueLedger';
import type { PickerKind } from './PropertyPicker';
import { SaveViewDialog } from './SaveViewDialog';

export type IssuesViewProps = {
  /** Where this surface's display options and filters are remembered. */
  surfaceKey: string;
  /** The surface's own scope (a team, a sprint, a project) — always applied. */
  baseFilters: IssueFilters;
  /** Filter keys the person can't change here (hidden from the filter menu). */
  lockedFields?: Array<keyof IssueFilters>;
  /** The single team this surface is about, when there is one. */
  teamId?: string | null;
  defaults?: Partial<ViewOptions>;
  defaultFilters?: IssueFilters;
  createDefaults?: CreateDefaults;
  emptyState?: ReactNode;
  savedView?: SavedView;
  hideSaveView?: boolean;
  toolbarStart?: ReactNode;
  className?: string;
  /** Take the remaining height of a flex-column parent (full-page lists). */
  fill?: boolean;
};

function useCollapsed(key: string) {
  const storage = `issue-tracker:collapsed:${key}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(storage) ?? '[]'));
    } catch {
      return new Set();
    }
  });
  const toggle = useCallback(
    (group: string) =>
      setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(group)) next.delete(group);
        else next.add(group);
        try {
          localStorage.setItem(storage, JSON.stringify([...next]));
        } catch {
          /* ignore */
        }
        return next;
      }),
    [storage],
  );
  return [collapsed, toggle] as const;
}

/**
 * Every issue list and board in Issue Tracker is this component. It owns fetching,
 * filtering, grouping, sorting, selection, keyboard and bulk actions, so a
 * surface only says what it is scoped to.
 */
export function IssuesView({
  surfaceKey, baseFilters, lockedFields = [], teamId = null, defaults, defaultFilters, createDefaults, emptyState, savedView, hideSaveView, toolbarStart, className, fill,
}: IssuesViewProps) {
  const ws = useWorkspace();
  const app = useAppActions();
  const actions = useIssueActions();
  const navigate = useNavigate();
  const compact = useMediaQuery('(max-width: 767px)');
  // Phones always get stacked rows; from a small tablet up the board is available too.
  const phone = useMediaQuery('(max-width: 639px)');
  const view = useViewState(surfaceKey, defaults, defaultFilters);
  const { options, setOptions, filters, setFilters } = view;
  const locked = lockedFields as FilterField[];

  const [searchOpen, setSearchOpen] = useState(Boolean(filters.search));
  const [searchText, setSearchText] = useState(filters.search ?? '');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setFilters(f => ({ ...f, search: searchText.trim() || undefined })), 220);
    return () => window.clearTimeout(t);
  }, [searchText, setFilters]);

  const query = useMemo(() => effectiveFilters(baseFilters, filters, options, ws.me.id), [baseFilters, filters, options, ws.me.id]);
  const { data, isPending, isFetching, isError, refetch } = useIssues(query, options.ordering);
  const issues = data?.issues ?? [];

  const layout = phone ? 'list' : options.layout;
  const grouping: Grouping = layout === 'board' && options.grouping === 'none' ? 'status' : options.grouping;
  const groups = useMemo(
    () => groupIssues(issues, grouping, ws, { teamId, emptyGroups: layout === 'board' ? grouping === 'status' || options.emptyGroups : options.emptyGroups, meId: ws.me.id, allowedStatusTypes: query.statusTypes }),
    [issues, grouping, ws, teamId, layout, options.emptyGroups, query.statusTypes],
  );
  const [collapsed, toggleCollapsed] = useCollapsed(surfaceKey);

  // Visible order for keyboard navigation (a label-grouped issue can appear twice; first wins).
  const visible = useMemo(() => {
    const seen = new Set<string>();
    const out: Issue[] = [];
    for (const g of groups) {
      if (layout === 'list' && collapsed.has(g.key)) continue;
      for (const i of g.issues) {
        if (seen.has(i.id)) continue;
        seen.add(i.id);
        out.push(i);
      }
    }
    return out;
  }, [groups, collapsed, layout]);
  const byId = useMemo(() => new Map(issues.map(i => [i.id, i])), [issues]);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<{ id: string; kind: PickerKind } | null>(null);
  const [bulkKind, setBulkKind] = useState<PickerKind | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveCopyOpen, setSaveCopyOpen] = useState(false);
  const anchor = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelection(prev => {
      const next = new Set([...prev].filter(id => byId.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [byId]);
  useEffect(() => {
    setSelection(new Set());
    setFocusedId(null);
  }, [surfaceKey]);

  const selectedIssues = useMemo(() => visible.filter(i => selection.has(i.id)), [visible, selection]);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const byIdRef = useRef(byId);
  byIdRef.current = byId;

  const getTargets = useCallback((issue: Issue) => {
    const sel = selectionRef.current;
    if (sel.size > 1 && sel.has(issue.id)) return [...sel].map(id => byIdRef.current.get(id)).filter(Boolean) as Issue[];
    return [byIdRef.current.get(issue.id) ?? issue];
  }, []);

  const toggleSelect = useCallback(
    (issue: Issue, e?: MouseEvent | KeyboardEvent) => {
      setSelection(prev => {
        const next = new Set(prev);
        if (e?.shiftKey && anchor.current) {
          const a = visible.findIndex(i => i.id === anchor.current);
          const b = visible.findIndex(i => i.id === issue.id);
          if (a >= 0 && b >= 0) {
            for (let n = Math.min(a, b); n <= Math.max(a, b); n++) next.add(visible[n].id);
            return next;
          }
        }
        if (next.has(issue.id)) next.delete(issue.id);
        else next.add(issue.id);
        anchor.current = issue.id;
        return next;
      });
      setFocusedId(issue.id);
    },
    [visible],
  );

  // A click opens the issue in the sheet — the list stays put. Modifier-clicks select.
  const onRowClick = useCallback(
    (issue: Issue, e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey) {
        e.preventDefault();
        toggleSelect(issue, e);
        return;
      }
      if (selectionRef.current.size > 0) {
        toggleSelect(issue, e);
        return;
      }
      setFocusedId(issue.id);
      app.openPeek(issue.identifier);
    },
    [app, toggleSelect],
  );

  const onHover = useCallback((issue: Issue) => {
    if (!app.peekId) setFocusedId(issue.id);
  }, [app.peekId]);
  const onPickerChange = useCallback((id: string, kind: PickerKind | null) => setActivePicker(kind ? { id, kind } : null), []);

  const focusIndex = visible.findIndex(i => i.id === focusedId);
  const focusAt = (idx: number, extend?: boolean) => {
    const next = visible[Math.max(0, Math.min(visible.length - 1, idx))];
    if (!next) return;
    setFocusedId(next.id);
    if (extend) setSelection(prev => new Set(prev).add(next.id).add(focusedId ?? next.id));
    // With the sheet open, J/K walk through issues in it.
    if (app.peekId && !extend) app.openPeek(next.identifier);
    window.setTimeout(() => scrollRef.current?.querySelector(`[data-issue-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' }), 0);
  };
  const focused = focusedId ? byId.get(focusedId) : undefined;

  const openPickerFor = (kind: PickerKind) => {
    if (selection.size > 0) setBulkKind(kind);
    else if (focused) {
      if (layout === 'board') {
        setSelection(new Set([focused.id]));
        setBulkKind(kind);
      } else setActivePicker({ id: focused.id, kind });
    }
  };

  useHotkeys({
    j: () => focusAt(focusIndex + 1),
    down: () => focusAt(focusIndex + 1),
    k: () => focusAt(focusIndex < 0 ? 0 : focusIndex - 1),
    up: () => focusAt(focusIndex < 0 ? 0 : focusIndex - 1),
    'shift+j': () => focusAt(focusIndex + 1, true),
    'shift+down': () => focusAt(focusIndex + 1, true),
    'shift+k': () => focusAt(focusIndex - 1, true),
    'shift+up': () => focusAt(focusIndex - 1, true),
    x: () => focused && toggleSelect(focused),
    'mod+a': () => setSelection(new Set(visible.map(i => i.id))),
    esc: () => {
      if (selection.size) setSelection(new Set());
      else setFocusedId(null);
    },
    enter: () => focused && app.openPeek(focused.identifier),
    'mod+enter': () => focused && navigate(`/issue/${focused.identifier}`),
    space: () => {
      if (!focused) return;
      if (app.peekId) app.closePeek();
      else app.openPeek(focused.identifier);
    },
    // While the sheet is open it owns the property shortcuts for the issue it shows.
    ...(app.peekId && selection.size === 0
      ? {}
      : {
          s: () => openPickerFor('status'),
          p: () => openPickerFor('priority'),
          a: () => openPickerFor('assignee'),
          l: () => openPickerFor('labels'),
          'shift+p': () => openPickerFor('project'),
          'shift+s': () => openPickerFor('sprint'),
          'shift+d': () => openPickerFor('due'),
          'shift+e': () => openPickerFor('estimate'),
          'shift+t': () => openPickerFor('type'),
          i: () => {
            const targets = selection.size ? selectedIssues : focused ? [focused] : [];
            if (targets.length === 1) actions.update(targets[0], { assigneeId: ws.me.id }).catch(() => undefined);
            else if (targets.length > 1) actions.bulkUpdate(targets, { assigneeId: ws.me.id });
          },
          'mod+backspace': () => {
            const targets = selection.size ? selectedIssues : focused ? [focused] : [];
            if (targets.length) actions.archive(targets);
          },
          'mod+.': () => focused && copyText(focused.identifier, `Copied ${focused.identifier}`),
          'mod+shift+.': () => focused && copyText(branchName(focused.identifier, focused.title, ws.memberById.get(focused.assigneeId ?? '')?.name), 'Copied branch name'),
        }),
    '/': () => {
      setSearchOpen(true);
      window.setTimeout(() => searchRef.current?.focus(), 0);
    },
  });

  const onMove = useCallback(
    (m: BoardMove) => {
      const drop = m.toGroup.drop;
      const moved = m.fromKey !== m.toGroup.key;
      const args: Parameters<typeof actions.move>[1] = { prevId: m.prevId, nextId: m.nextId, columnIds: m.columnIds };
      if (moved && drop) {
        if (drop.field === 'statusId') {
          // Across teams a lane is a status NAME; resolve it inside the dragged issue's own workflow.
          const own = m.issue.teamId ? ws.statusesByTeam.get(m.issue.teamId) ?? [] : [];
          const target = own.find(s => s.id === drop.value) ?? own.find(s => s.name.toLowerCase() === drop.statusName?.toLowerCase() && s.type === drop.statusType) ?? own.find(s => s.type === drop.statusType);
          if (!target) return;
          args.statusId = target.id;
        } else if (drop.field === 'issueType') {
          actions.update(m.issue, { issueType: drop.value as never }).catch(() => undefined);
          return;
        } else if (drop.field === 'sprintId' && drop.value && ws.sprintById.get(String(drop.value))?.teamId !== m.issue.teamId) {
          return;
        } else {
          (args as Record<string, unknown>)[drop.field] = drop.value;
        }
      }
      actions.move(m.issue, args, m.position);
    },
    [actions, ws],
  );

  const onCreateInGroup = useCallback(
    (group: IssueGroup) => {
      const d: CreateDefaults = { ...createDefaults };
      const drop = group.drop;
      if (drop?.field === 'statusId') {
        const team = createDefaults?.teamId ?? teamId;
        if (team && ws.statusById.get(String(drop.value))?.teamId === team) d.statusId = String(drop.value);
      } else if (drop) {
        (d as Record<string, unknown>)[drop.field] = drop.value;
      }
      app.openCreateIssue(d);
    },
    [app, createDefaults, teamId, ws],
  );

  const properties = useMemo(() => new Set(options.properties), [options.properties]);
  const hasUserFilters = Object.keys(filters).some(k => k !== 'search');
  const canReorder = options.ordering === 'manual';
  const openId = app.peekId;

  return (
    <div className={cn('relative flex min-h-[440px] flex-col', fill ? 'min-h-0 flex-1' : 'h-[calc(100dvh-9rem)]', className)}>
      <div className="flex min-h-12 flex-wrap items-center gap-1.5 px-4 py-2 sm:px-7">
        {toolbarStart}
        <FilterMenu filters={filters} onChange={setFilters} teamId={teamId} locked={locked} />
        <FilterChips filters={filters} onChange={setFilters} teamId={teamId} locked={locked} />
        <div className="ml-auto flex items-center gap-1">
          {isFetching && !isPending && <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-highlight" aria-label="Refreshing" />}
          {searchOpen ? (
            <div className="flex h-7 items-center gap-1.5 rounded-sm bg-card px-2 shadow-hairline ring-1 ring-line-strong animate-pop-in focus-within:ring-ink/50">
              <MagnifyingGlass size={13} className="text-ink-3" />
              <input
                ref={searchRef}
                autoFocus
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setSearchText('');
                    setSearchOpen(false);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Search this list…"
                className="w-36 bg-transparent text-ui outline-none placeholder:text-ink-3 sm:w-44"
              />
              <button type="button" aria-label="Clear search" onClick={() => { setSearchText(''); setSearchOpen(false); }} className="text-ink-3 hover:text-ink">
                <X size={12} weight="bold" />
              </button>
            </div>
          ) : (
            <Tooltip content="Search this list" shortcut="/">
              <Button variant="ghost" size="sm" icon aria-label="Search this list" onClick={() => setSearchOpen(true)}>
                <MagnifyingGlass size={15} />
              </Button>
            </Tooltip>
          )}
          <span className="tabular hidden px-1.5 text-meta text-ink-3 sm:inline" title={data?.truncated ? `Showing the first ${data.issues.length}. Narrow the filters to see the rest.` : undefined}>
            {data ? (data.truncated ? `${data.issues.length} of ${data.total} issues` : `${data.total} issue${data.total === 1 ? '' : 's'}`) : ''}
          </span>
          {!phone && (
            <Segmented
              value={layout}
              onChange={l => setOptions({ layout: l })}
              options={[
                { value: 'list', icon: <Rows size={14} />, title: 'Ledger' },
                { value: 'board', icon: <Kanban size={14} />, title: 'Board' },
              ]}
            />
          )}
          <DisplayMenu options={options} onChange={setOptions} onReset={view.reset} isDirty={view.optionsDirty} />
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="sm" icon aria-label="More list actions">
                <DotsThree size={16} weight="bold" />
              </Button>
            </MenuTrigger>
            <MenuContent align="end" className="w-56">
              {!hideSaveView && (
                <MenuItem icon={<FloppyDisk size={15} />} disabled={Boolean(savedView) && !view.isDirty} onSelect={() => setSaveOpen(true)}>
                  {savedView ? 'Save changes to view' : 'Save as view…'}
                </MenuItem>
              )}
              {!hideSaveView && savedView && (
                <MenuItem icon={<CopySimple size={15} />} onSelect={() => setSaveCopyOpen(true)}>
                  Save as new view…
                </MenuItem>
              )}
              <MenuItem icon={<DownloadSimple size={15} />} onSelect={() => exportIssuesCsv(visible, ws, `${surfaceKey.replace(/[^a-z0-9]+/gi, '-')}.csv`)}>
                Export CSV
              </MenuItem>
              {view.isDirty && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={<ArrowCounterClockwise size={15} />} onSelect={view.reset}>
                    Reset view
                  </MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'relative min-h-0 flex-1',
          layout === 'list' ? 'mx-0 mb-0 overflow-auto border-y border-line bg-card sm:mx-7 sm:mb-6 sm:rounded-lg sm:border sm:shadow-hairline' : 'overflow-hidden px-1 pb-3 sm:px-4',
        )}
      >
        {isPending ? (
          <ListSkeleton rows={12} />
        ) : isError ? (
          <EmptyState compact icon={<Stack size={22} weight="duotone" />} title="Couldn’t load issues" actions={<Button onClick={() => refetch()}>Try again</Button>}>
            Check your connection and try again.
          </EmptyState>
        ) : issues.length === 0 ? (
          hasUserFilters || filters.search ? (
            <EmptyState
              compact
              icon={<MagnifyingGlass size={22} weight="duotone" />}
              title="Nothing matches"
              actions={<Button onClick={() => { setFilters(Object.fromEntries(Object.entries(filters).filter(([k]) => locked.includes(k as FilterField))) as IssueFilters); setSearchText(''); }}>Clear filters</Button>}
            >
              Try removing a filter or searching for something else.
            </EmptyState>
          ) : (
            emptyState ?? (
              <EmptyState compact icon={<Stack size={22} weight="duotone" />} title="No issues here yet" actions={<Button variant="primary" onClick={() => app.openCreateIssue(createDefaults)}>New issue <Kbd tone="inverse">C</Kbd></Button>}>
                Anything you add here shows up in this list.
              </EmptyState>
            )
          )
        ) : layout === 'board' ? (
          <IssueBoard
            groups={groups}
            grouping={grouping}
            properties={properties}
            selection={selection}
            focusedId={focusedId}
            openId={openId}
            canReorder={canReorder}
            onMove={onMove}
            onCardClick={onRowClick}
            getTargets={getTargets}
            onCreateInGroup={onCreateInGroup}
          />
        ) : (
          <IssueLedger
            groups={groups}
            grouping={grouping}
            properties={properties}
            selection={selection}
            focusedId={focusedId}
            openId={openId}
            activePicker={activePicker}
            collapsed={collapsed}
            ordering={options.ordering}
            compact={compact}
            onSort={o => setOptions({ ordering: o as ViewOptions['ordering'] })}
            onToggleCollapse={toggleCollapsed}
            onPickerChange={onPickerChange}
            onRowClick={onRowClick}
            onToggleSelect={toggleSelect}
            onHover={onHover}
            getTargets={getTargets}
            onCreateInGroup={onCreateInGroup}
            onSelectGroup={g => setSelection(prev => new Set([...prev, ...g.issues.map(i => i.id)]))}
          />
        )}
      </div>

      <BulkBar issues={selectedIssues} onClear={() => setSelection(new Set())} openKind={bulkKind} onOpenKind={setBulkKind} />
      <SaveViewDialog open={saveOpen} onOpenChange={setSaveOpen} filters={{ ...baseFilters, ...filters, search: undefined }} options={options} teamId={teamId} existing={savedView} />
      {savedView && (
        <SaveViewDialog open={saveCopyOpen} onOpenChange={setSaveCopyOpen} filters={{ ...baseFilters, ...filters, search: undefined }} options={options} teamId={teamId ?? savedView.teamId} existing={null} initialName={`${savedView.name} copy`} />
      )}
    </div>
  );
}
