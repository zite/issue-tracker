import { CaretDown, CaretRight, Checks, Plus } from '@phosphor-icons/react';
import { memo, useMemo, type MouseEvent } from 'react';
import { StatusGlyph, PriorityGlyph } from '../glyphs';
import { isDoneType, type DisplayProperty, type Grouping } from '../lib/constants';
import { plural, timeAgo } from '../lib/format';
import type { Issue } from '../lib/types';
import type { IssueGroup } from '../lib/view';
import { useWorkspace } from '../lib/workspace';
import { Avatar } from '../ui/Avatar';
import { Badge, Count } from '../ui/Chip';
import { cn } from '../ui/cn';
import { Checkbox } from '../ui/Form';
import { Tooltip } from '../ui/Tooltip';
import { BlockedBadge, CommentCount, DueText, GroupGlyph, PropertyValue, SubIssueProgress } from './cells';
import { IssueContextMenu } from './IssueContextMenu';
import { IssuePropertyPicker, type PickerKind } from './PropertyPicker';

type Column = { key: string; label: string; width: number | 'title'; sort?: string; align?: 'end'; picker?: PickerKind };

/** The ledger's columns, in order. Title is always shown; the rest follow the view's properties. */
const COLUMNS: Column[] = [
  { key: 'identifier', label: 'ID', width: 78, sort: 'identifier' },
  { key: 'title', label: 'Title', width: 'title', sort: 'title' },
  { key: 'status', label: 'Status', width: 124, sort: 'status', picker: 'status' },
  { key: 'priority', label: 'Priority', width: 98, sort: 'priority', picker: 'priority' },
  { key: 'assignee', label: 'Assignee', width: 116, picker: 'assignee' },
  { key: 'labels', label: 'Labels', width: 156, picker: 'labels' },
  { key: 'project', label: 'Project', width: 156, picker: 'project' },
  { key: 'milestone', label: 'Milestone', width: 140, picker: 'milestone' },
  { key: 'sprint', label: 'Sprint', width: 76, picker: 'sprint' },
  { key: 'type', label: 'Type', width: 112, picker: 'type' },
  { key: 'estimate', label: 'Est.', width: 52, sort: 'estimate', align: 'end', picker: 'estimate' },
  { key: 'dueDate', label: 'Due', width: 88, sort: 'due', picker: 'due' },
  { key: 'links', label: 'Links', width: 64, align: 'end' },
  { key: 'created', label: 'Created', width: 92, sort: 'created' },
  { key: 'updated', label: 'Updated', width: 92, sort: 'updated' },
];

const SELECT_W = 38;
const ID_W = 78;
const TITLE_MIN = 340;
const HEADER_H = 34;

/** The checkbox, ID and title are frozen on the left, so the title stays in view while other columns scroll. */
const isFrozen = (key: string) => key === 'identifier' || key === 'title';
function frozenStyle(key: string, columns: Column[]) {
  if (!isFrozen(key)) return undefined;
  const hasId = columns.some(c => c.key === 'identifier');
  return { left: key === 'identifier' || !hasId ? SELECT_W : SELECT_W + ID_W };
}

export type LedgerProps = {
  groups: IssueGroup[];
  grouping: Grouping;
  properties: Set<DisplayProperty>;
  selection: Set<string>;
  focusedId: string | null;
  openId: string | null;
  activePicker: { id: string; kind: PickerKind } | null;
  collapsed: Set<string>;
  ordering: string;
  compact: boolean;
  onSort: (ordering: string) => void;
  onToggleCollapse: (key: string) => void;
  onPickerChange: (id: string, kind: PickerKind | null) => void;
  onRowClick: (issue: Issue, e: MouseEvent) => void;
  onToggleSelect: (issue: Issue, e?: MouseEvent) => void;
  onHover: (issue: Issue) => void;
  getTargets: (issue: Issue) => Issue[];
  onCreateInGroup?: (group: IssueGroup) => void;
  onSelectGroup: (group: IssueGroup) => void;
};

const Row = memo(function Row({
  issue, columns, template, properties, selected, focused, open, activeKind, selecting, onRowClick, onToggleSelect, onHover, onPickerChange, getTargets,
}: {
  issue: Issue; columns: Column[]; template: string; properties: Set<DisplayProperty>; selected: boolean; focused: boolean; open: boolean; activeKind: PickerKind | null; selecting: boolean;
  onRowClick: LedgerProps['onRowClick']; onToggleSelect: LedgerProps['onToggleSelect']; onHover: LedgerProps['onHover']; onPickerChange: LedgerProps['onPickerChange']; getTargets: LedgerProps['getTargets'];
}) {
  const ws = useWorkspace();
  const status = ws.statusOf(issue);
  const done = isDoneType(status?.type);

  const cell = (col: Column) => {
    if (col.key === 'identifier') {
      return <span className="truncate font-mono text-[11.5px] text-ink-3">{issue.identifier}</span>;
    }
    if (col.key === 'title') {
      return (
        <span className="flex min-w-0 items-center gap-2">
          {issue.parentIdentifier && (
            <Tooltip content={issue.parentTitle}>
              <span className="hidden shrink-0 font-mono text-[11px] text-ink-3 lg:inline">{issue.parentIdentifier} ›</span>
            </Tooltip>
          )}
          <span data-issue-title={issue.identifier} className={cn('min-w-0 truncate font-medium', done ? 'text-ink-3' : 'text-ink', status?.type === 'canceled' && 'line-through decoration-line-strong')}>{issue.title}</span>
          {issue.archived && <Badge className="h-[18px] px-1.5 text-micro">Archived</Badge>}
          {properties.has('subIssues') && <SubIssueProgress done={issue.subIssueDone} total={issue.subIssueTotal} />}
          {!done && <BlockedBadge count={issue.blockedBy} />}
          <span className="ml-auto pl-2">
            <CommentCount count={issue.commentCount} />
          </span>
        </span>
      );
    }
    if (col.key === 'created') return <span className="tabular truncate text-ink-3">{timeAgo(issue.openedAt)}</span>;
    if (col.key === 'updated') return <span className="tabular truncate text-ink-3">{timeAgo(issue.updatedAt)}</span>;
    if (!col.picker) return <PropertyValue issue={issue} kind={col.key} />;
    if (col.picker === 'milestone' && !issue.projectId) return <PropertyValue issue={issue} kind="milestone" />;

    const trigger = (
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onPickerChange(issue.id, col.picker!);
        }}
        className={cn(
          '-mx-1.5 flex h-7 w-[calc(100%+12px)] min-w-0 items-center gap-1.5 rounded-sm px-1.5 text-left transition-colors hover:bg-card hover:shadow-hairline hover:ring-1 hover:ring-line-strong data-[state=open]:bg-card data-[state=open]:ring-1 data-[state=open]:ring-line-strong',
          col.align === 'end' && 'justify-end',
        )}
      >
        <PropertyValue issue={issue} kind={col.key} />
      </button>
    );
    if (activeKind !== col.picker) return trigger;
    return (
      <IssuePropertyPicker
        issues={getTargets(issue)}
        kind={col.picker}
        open
        onOpenChange={o => !o && onPickerChange(issue.id, null)}
        trigger={trigger}
      />
    );
  };

  return (
    <IssueContextMenu getIssues={() => getTargets(issue)}>
      <div
        role="row"
        data-issue-id={issue.id}
        aria-selected={selected}
        onClick={e => onRowClick(issue, e)}
        onMouseEnter={() => onHover(issue)}
        style={{ gridTemplateColumns: template }}
        className={cn(
          // Opaque backgrounds, because the frozen columns inherit them and other cells scroll beneath.
          'group/row relative grid h-10 cursor-default items-center border-b border-line text-ui transition-colors duration-75',
          open
            ? 'bg-[color:color-mix(in_oklab,rgb(var(--highlight))_35%,rgb(var(--card)))] dark:bg-[color:color-mix(in_oklab,rgb(var(--highlight))_13%,rgb(var(--card)))]'
            : selected
              ? 'bg-[color:color-mix(in_oklab,rgb(var(--highlight))_20%,rgb(var(--card)))] dark:bg-[color:color-mix(in_oklab,rgb(var(--highlight))_8%,rgb(var(--card)))]'
              : 'bg-card hover:bg-[color:color-mix(in_oklab,rgb(var(--paper))_85%,rgb(var(--card)))] dark:hover:bg-[color:color-mix(in_oklab,rgb(var(--hover))_60%,rgb(var(--card)))]',
        )}
      >
        {focused && <span aria-hidden className="absolute inset-y-0 left-0 z-[3] w-[3px] bg-ink" />}
        <span className="sticky left-0 z-[2] flex items-center justify-center self-stretch bg-inherit">
          <Checkbox
            checked={selected}
            label={`Select ${issue.identifier}`}
            onChange={(_, e) => onToggleSelect(issue, e)}
            className={cn('transition-opacity', selected || selecting ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100 focus:opacity-100')}
          />
        </span>
        {columns.map(col => (
          <span key={col.key} role="cell" style={frozenStyle(col.key, columns)} className={cn('flex min-w-0 items-center gap-1.5 pr-3', col.align === 'end' && 'justify-end', isFrozen(col.key) && 'sticky z-[2] self-stretch bg-inherit', col.key === 'title' && 'shadow-[1px_0_0_rgb(var(--line))]')}>
            {cell(col)}
          </span>
        ))}
      </div>
    </IssueContextMenu>
  );
});

/** Phones get a two-line row: what it is, then its key facts. */
const CompactRow = memo(function CompactRow({ issue, selected, open, onRowClick, getTargets }: { issue: Issue; selected: boolean; open: boolean; onRowClick: LedgerProps['onRowClick']; getTargets: LedgerProps['getTargets'] }) {
  const ws = useWorkspace();
  const status = ws.statusOf(issue);
  const assignee = issue.assigneeId ? ws.memberById.get(issue.assigneeId) : undefined;
  const done = isDoneType(status?.type);
  return (
    <IssueContextMenu getIssues={() => getTargets(issue)}>
      <div
        role="row"
        data-issue-id={issue.id}
        onClick={e => onRowClick(issue, e)}
        className={cn('flex gap-3 border-b border-line px-4 py-3', open ? 'bg-highlight/35 dark:bg-highlight/[0.13]' : selected && 'bg-highlight/20')}
      >
        <StatusGlyph status={status} siblings={issue.teamId ? ws.statusesByTeam.get(issue.teamId) : undefined} className="mt-[3px]" />
        <div className="min-w-0 flex-1">
          <p className={cn('line-clamp-2 text-body font-medium leading-snug', done ? 'text-ink-3' : 'text-ink')}>{issue.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-meta text-ink-3">
            <span className="font-mono text-[11px]">{issue.identifier}</span>
            {issue.priority > 0 && <PriorityGlyph priority={issue.priority} size={13} />}
            {issue.dueDate && <DueText day={issue.dueDate} done={done} />}
            <SubIssueProgress done={issue.subIssueDone} total={issue.subIssueTotal} />
            {!done && <BlockedBadge count={issue.blockedBy} />}
            <CommentCount count={issue.commentCount} />
          </div>
        </div>
        {assignee && <Avatar person={assignee} size={22} />}
      </div>
    </IssueContextMenu>
  );
});

function GroupBand({ group, grouping, collapsed, top, onToggle, onCreate, onSelect }: { group: IssueGroup; grouping: Grouping; collapsed: boolean; top: number; onToggle: () => void; onCreate?: () => void; onSelect: () => void }) {
  const points = group.issues.reduce((a, i) => a + (i.estimate ?? 0), 0);
  const done = group.issues.filter(i => i.completedAt).length;
  return (
    <div
      role="rowgroup"
      style={{ top }}
      className="group/band sticky z-10 flex h-10 items-center gap-2 border-b border-line bg-paper px-2.5 dark:bg-sunken"
    >
      <div className="sticky left-2.5 flex min-w-0 items-center gap-2 bg-paper pr-2 dark:bg-sunken">
        <button type="button" onClick={onToggle} aria-expanded={!collapsed} className="flex min-w-0 items-center gap-2 rounded-sm py-1 pl-1 pr-2 hover:bg-hover">
          {collapsed ? <CaretRight size={12} weight="bold" className="text-ink-3" /> : <CaretDown size={12} weight="bold" className="text-ink-3" />}
          <GroupGlyph group={group} grouping={grouping} />
          <span className="truncate text-ui font-semibold text-ink">{group.label}</span>
          <Count>{group.issues.length}</Count>
        </button>
        {points > 0 && <span className="tabular whitespace-nowrap text-meta text-ink-3">{plural(points, 'pt')}</span>}
        {grouping !== 'status' && done > 0 && <span className="tabular hidden whitespace-nowrap text-meta text-ink-3 sm:inline">· {done} done</span>}
      </div>
      <div className="sticky right-2.5 ml-auto flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/band:opacity-100">
        {group.issues.length > 0 && (
          <Tooltip content="Select all in group">
            <button type="button" onClick={onSelect} aria-label={`Select all in ${group.label}`} className="flex h-7 w-7 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink">
              <Checks size={15} />
            </button>
          </Tooltip>
        )}
        {onCreate && (
          <Tooltip content={`New issue in ${group.label}`}>
            <button type="button" onClick={onCreate} aria-label={`New issue in ${group.label}`} className="flex h-7 w-7 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink">
              <Plus size={15} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/**
 * The ledger: a real table with sortable column headers, group bands and
 * editable cells. Clicking a row opens the issue in the sheet; clicking a
 * cell edits that property in place.
 */
function IssueLedgerInner(props: LedgerProps) {
  const { groups, grouping, properties, selection, focusedId, openId, activePicker, collapsed, ordering, compact } = props;
  const columns = useMemo(() => COLUMNS.filter(c => c.key === 'title' || properties.has(c.key as DisplayProperty)), [properties]);
  const template = useMemo(() => `${SELECT_W}px ${columns.map(c => (c.width === 'title' ? `minmax(${TITLE_MIN}px, 1fr)` : `${c.width}px`)).join(' ')}`, [columns]);
  const minWidth = useMemo(() => SELECT_W + columns.reduce((a, c) => a + (c.width === 'title' ? TITLE_MIN : c.width), 0), [columns]);
  const grouped = grouping !== 'none';
  const selecting = selection.size > 0;

  if (compact) {
    return (
      <div role="table">
        {groups.map(group => (
          <div key={group.key}>
            {grouped && <GroupBand group={group} grouping={grouping} top={0} collapsed={collapsed.has(group.key)} onToggle={() => props.onToggleCollapse(group.key)} onCreate={props.onCreateInGroup ? () => props.onCreateInGroup!(group) : undefined} onSelect={() => props.onSelectGroup(group)} />}
            {!collapsed.has(group.key) && group.issues.map(issue => <CompactRow key={`${group.key}:${issue.id}`} issue={issue} selected={selection.has(issue.id)} open={openId === issue.id || openId === issue.identifier} onRowClick={props.onRowClick} getTargets={props.getTargets} />)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div role="table" className="min-w-full" style={{ minWidth }}>
      <div role="row" style={{ gridTemplateColumns: template, height: HEADER_H }} className="sticky top-0 z-20 grid items-center border-b border-line bg-sunken text-micro font-semibold uppercase text-ink-3">
        <span className="sticky left-0 z-[2] self-stretch bg-sunken" />
        {columns.map(col => {
          const active = col.sort && (ordering === col.sort || (col.sort === 'created' && ordering === 'oldest'));
          return (
            <span key={col.key} role="columnheader" aria-sort={active ? 'descending' : undefined} style={frozenStyle(col.key, columns)} className={cn('flex min-w-0 items-center pr-3', col.align === 'end' && 'justify-end', isFrozen(col.key) && 'sticky z-[2] self-stretch bg-sunken', col.key === 'title' && 'shadow-[1px_0_0_rgb(var(--line))]')}>
              {col.sort ? (
                <button
                  type="button"
                  onClick={() => props.onSort(active ? (col.sort === 'created' && ordering === 'created' ? 'oldest' : 'manual') : col.sort!)}
                  className={cn('-mx-1 inline-flex items-center gap-1 rounded-xs px-1 py-0.5 uppercase hover:bg-hover hover:text-ink', active && 'text-ink')}
                  title={active ? 'Sorted — click to clear' : `Sort by ${col.label.toLowerCase()}`}
                >
                  {col.label}
                  {active && <CaretDown size={9} weight="bold" className={cn(ordering === 'oldest' && 'rotate-180')} />}
                </button>
              ) : (
                col.label
              )}
            </span>
          );
        })}
      </div>
      {groups.map(group => (
        <div key={group.key} role="rowgroup">
          {grouped && (
            <GroupBand
              group={group}
              grouping={grouping}
              top={HEADER_H}
              collapsed={collapsed.has(group.key)}
              onToggle={() => props.onToggleCollapse(group.key)}
              onCreate={props.onCreateInGroup ? () => props.onCreateInGroup!(group) : undefined}
              onSelect={() => props.onSelectGroup(group)}
            />
          )}
          {!collapsed.has(group.key) &&
            group.issues.map(issue => (
              <Row
                key={`${group.key}:${issue.id}`}
                issue={issue}
                columns={columns}
                template={template}
                properties={properties}
                selected={selection.has(issue.id)}
                focused={focusedId === issue.id}
                open={openId === issue.id || openId === issue.identifier}
                activeKind={activePicker?.id === issue.id ? activePicker.kind : null}
                selecting={selecting}
                onRowClick={props.onRowClick}
                onToggleSelect={props.onToggleSelect}
                onHover={props.onHover}
                onPickerChange={props.onPickerChange}
                getTargets={props.getTargets}
              />
            ))}
          {grouped && !collapsed.has(group.key) && group.issues.length === 0 && (
            <div className="flex h-10 items-center border-b border-line pl-[52px] text-ui text-ink-3">Nothing here</div>
          )}
        </div>
      ))}
    </div>
  );
}

export const IssueLedger = memo(IssueLedgerInner);
