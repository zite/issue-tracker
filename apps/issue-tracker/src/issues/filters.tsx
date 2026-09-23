import {
  CalendarBlank, CaretLeft, Check, Clock, Cube, Diamond, FlagBanner, FunnelSimple, Hash, Prohibit, Shapes, SquaresFour, Tag, Target, TreeStructure, User, UserCirclePlus, X,
} from '@phosphor-icons/react';
import { Command } from 'cmdk';
import { useMemo, useState, type ReactNode } from 'react';
import { Mark, PriorityGlyph, SprintGlyph, StatusGlyph, TypeGlyph } from '../glyphs';
import { ISSUE_TYPES, OPEN_STATUS_TYPES, PRIORITIES, STATUS_TYPES, STATUS_TYPE_LABEL } from '../lib/constants';
import type { IssueFilters } from '../lib/types';
import { useWorkspace, type Workspace } from '../lib/workspace';
import { pickerItem } from '../pickers/OptionPicker';
import { Avatar, Unassigned } from '../ui/Avatar';
import { Swatch } from '../ui/Chip';
import { cn } from '../ui/cn';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';

type Opt = { value: string | number; label: string; icon?: ReactNode; keywords?: string[] };

export type FilterField =
  | 'statusIds' | 'statusTypes' | 'assigneeIds' | 'creatorIds' | 'priorities' | 'labelIds' | 'projectIds' | 'milestoneIds' | 'goalIds'
  | 'sprintIds' | 'issueTypes' | 'teamIds' | 'due' | 'estimated' | 'relation' | 'createdWithinDays' | 'subscriberIds';

type FilterDef = {
  field: FilterField;
  label: string;
  icon: ReactNode;
  multi: boolean;
  options: (ws: Workspace, teamId: string | null) => Opt[];
  hidden?: (teamId: string | null) => boolean;
};

const ic = (Icon: typeof Tag) => <Icon size={14} className="text-ink-3" />;
const TYPE_COLOR: Record<string, string> = { intake: '#D24A22', backlog: '#A39C8F', unstarted: '#8A8275', started: '#BF8300', completed: '#2E9460', canceled: '#A39C8F' };

export const FILTERS: FilterDef[] = [
  {
    field: 'statusIds', label: 'Status', icon: ic(SquaresFour), multi: true,
    hidden: teamId => !teamId,
    options: (ws, teamId) => (ws.statusesByTeam.get(teamId ?? '') ?? []).map(s => ({ value: s.id, label: s.name, icon: <StatusGlyph status={s} siblings={ws.statusesByTeam.get(teamId ?? '')} /> })),
  },
  {
    field: 'statusTypes', label: 'Status', icon: ic(SquaresFour), multi: true,
    hidden: teamId => Boolean(teamId),
    options: () => STATUS_TYPES.map(t => ({ value: t, label: STATUS_TYPE_LABEL[t], icon: <StatusGlyph status={{ type: t, color: TYPE_COLOR[t] }} /> })),
  },
  {
    field: 'assigneeIds', label: 'Assignee', icon: ic(User), multi: true,
    options: (ws, teamId) => [
      { value: '__me__', label: 'Me', icon: <Avatar person={ws.memberById.get(ws.me.id)} size={16} /> },
      { value: 'none', label: 'No assignee', icon: <Unassigned size={16} /> },
      ...ws.membersFor(teamId).filter(m => m.id !== ws.me.id).map(m => ({ value: m.id, label: m.name, icon: <Avatar person={m} size={16} />, keywords: [m.email ?? ''] })),
    ],
  },
  {
    field: 'priorities', label: 'Priority', icon: ic(FlagBanner), multi: true,
    options: () => PRIORITIES.map(p => ({ value: p.value, label: p.label, icon: <PriorityGlyph priority={p.value} /> })),
  },
  {
    field: 'labelIds', label: 'Labels', icon: ic(Tag), multi: true,
    options: (ws, teamId) => [
      { value: 'none', label: 'No labels', icon: <Prohibit size={14} className="text-ink-3" /> },
      ...ws.labelsFor(teamId).map(l => ({ value: l.id, label: l.name, icon: <Swatch color={l.color} /> })),
    ],
  },
  {
    field: 'projectIds', label: 'Project', icon: ic(Shapes), multi: true,
    options: ws => [
      { value: 'none', label: 'No project', icon: <Prohibit size={14} className="text-ink-3" /> },
      ...ws.projects.map(p => ({ value: p.id, label: p.name, icon: <Mark icon={p.icon} color={p.color} name={p.name} size={16} /> })),
    ],
  },
  {
    field: 'milestoneIds', label: 'Milestone', icon: ic(Diamond), multi: true,
    options: ws => ws.projects.flatMap(p =>
      (ws.milestonesByProject.get(p.id) ?? []).map(m => ({ value: m.id, label: `${p.name} › ${m.name}`, icon: <Diamond size={14} className="text-ink-3" />, keywords: [p.name, m.name] })),
    ),
  },
  {
    field: 'sprintIds', label: 'Sprint', icon: <SprintGlyph status="upcoming" />, multi: true,
    options: (ws, teamId) => [
      { value: 'active', label: 'Current sprint', icon: <SprintGlyph status="active" progress={0.5} /> },
      { value: 'upcoming', label: 'Next sprint', icon: <SprintGlyph status="upcoming" /> },
      { value: 'none', label: 'No sprint', icon: <Prohibit size={14} className="text-ink-3" /> },
      ...ws.sprints
        .filter(c => !teamId || c.teamId === teamId)
        .slice()
        .reverse()
        .map(c => ({ value: c.id, label: `${teamId ? '' : `${ws.teamById.get(c.teamId ?? '')?.key ?? ''} · `}${c.name}`, icon: <SprintGlyph status={c.status} progress={0.5} /> })),
    ],
  },
  {
    field: 'issueTypes', label: 'Type', icon: ic(Cube), multi: true,
    options: () => ISSUE_TYPES.map(t => ({ value: t, label: t, icon: <TypeGlyph type={t} /> })),
  },
  {
    field: 'teamIds', label: 'Team', icon: ic(SquaresFour), multi: true,
    hidden: teamId => Boolean(teamId),
    options: ws => ws.teams.map(t => ({ value: t.id, label: t.name, icon: <Mark icon={t.icon} color={t.color} name={t.name} size={16} /> })),
  },
  {
    field: 'goalIds', label: 'Goal', icon: ic(Target), multi: true,
    options: ws => ws.goals.map(g => ({ value: g.id, label: g.name, icon: <Mark icon={g.icon} color={g.color} name={g.name} size={16} /> })),
  },
  {
    field: 'creatorIds', label: 'Creator', icon: ic(UserCirclePlus), multi: true,
    options: ws => [
      { value: '__me__', label: 'Me', icon: <Avatar person={ws.memberById.get(ws.me.id)} size={16} /> },
      ...ws.members.filter(m => m.id !== ws.me.id).map(m => ({ value: m.id, label: m.name, icon: <Avatar person={m} size={16} /> })),
    ],
  },
  {
    field: 'due', label: 'Due date', icon: ic(CalendarBlank), multi: false,
    options: () => [
      { value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Due today' }, { value: 'week', label: 'Due within a week' },
      { value: 'month', label: 'Due within a month' }, { value: 'any', label: 'Has a due date' }, { value: 'none', label: 'No due date' },
    ],
  },
  {
    field: 'estimated', label: 'Estimate', icon: ic(Hash), multi: false,
    options: () => [{ value: 'yes', label: 'Estimated' }, { value: 'no', label: 'Not estimated' }],
  },
  {
    field: 'relation', label: 'Relations', icon: ic(TreeStructure), multi: false,
    options: () => [{ value: 'blocked', label: 'Blocked' }, { value: 'blocking', label: 'Blocking others' }, { value: 'any', label: 'Has any relation' }],
  },
  {
    field: 'createdWithinDays', label: 'Created', icon: ic(Clock), multi: false,
    options: () => [{ value: 1, label: 'In the last day' }, { value: 7, label: 'In the last week' }, { value: 30, label: 'In the last month' }, { value: 90, label: 'In the last 3 months' }],
  },
];

function valuesOf(filters: IssueFilters, field: FilterField): Array<string | number> {
  const v = (filters as Record<string, unknown>)[field];
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v as string | number];
}

function setField(filters: IssueFilters, def: FilterDef, values: Array<string | number>): IssueFilters {
  const next = { ...filters } as Record<string, unknown>;
  if (values.length === 0) delete next[def.field];
  else next[def.field] = def.multi ? values : values[values.length - 1];
  return next as IssueFilters;
}

function OptionList({ def, filters, onChange, teamId, onBack }: { def: FilterDef; filters: IssueFilters; onChange: (f: IssueFilters) => void; teamId: string | null; onBack?: () => void }) {
  const ws = useWorkspace();
  const [q, setQ] = useState('');
  const options = useMemo(() => def.options(ws, teamId), [def, ws, teamId]);
  const current = valuesOf(filters, def.field);
  return (
    <Command loop>
      <div className="flex items-center gap-1 border-b border-line px-2">
        {onBack && (
          <button type="button" onClick={onBack} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs text-ink-3 hover:bg-hover hover:text-ink" aria-label="Back">
            <CaretLeft size={13} />
          </button>
        )}
        <Command.Input
          value={q}
          onValueChange={setQ}
          placeholder={`${def.label}…`}
          className="h-10 w-full bg-transparent px-1 text-ui outline-none placeholder:text-ink-3"
          onKeyDown={e => {
            if (e.key === 'Backspace' && !q && onBack) onBack();
          }}
        />
      </div>
      <Command.List className="max-h-[300px] overflow-y-auto p-1">
        <Command.Empty className="py-5 text-center text-ui text-ink-3">No options</Command.Empty>
        {options.map(o => {
          const on = current.includes(o.value);
          return (
            <Command.Item
              key={String(o.value)}
              value={`${o.label} ${o.value}`}
              keywords={o.keywords}
              onSelect={() => onChange(setField(filters, def, def.multi ? (on ? current.filter(v => v !== o.value) : [...current, o.value]) : on ? [] : [o.value]))}
              className={pickerItem}
            >
              <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center border', def.multi ? 'rounded-[4px]' : 'rounded-full', on ? 'border-primary bg-primary text-on-primary' : 'border-control')}>
                {on && (def.multi ? <Check size={10} weight="bold" /> : <span className="h-1.5 w-1.5 rounded-full bg-on-primary" />)}
              </span>
              {o.icon && <span className="flex w-4 shrink-0 justify-center">{o.icon}</span>}
              <span className="truncate">{o.label}</span>
            </Command.Item>
          );
        })}
      </Command.List>
    </Command>
  );
}

/** "Filter" → pick a property → pick values. Changes apply as you click. */
export function FilterMenu({ filters, onChange, teamId, locked = [] }: { filters: IssueFilters; onChange: (f: IssueFilters) => void; teamId: string | null; locked?: FilterField[] }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<FilterField | null>(null);
  // A filter that doesn't apply to this scope still shows while it has values, so it can be cleared.
  const defs = FILTERS.filter(d => (!d.hidden?.(teamId) || valuesOf(filters, d.field).length > 0) && !locked.includes(d.field));
  const def = defs.find(d => d.field === step);
  const activeCount = defs.filter(d => valuesOf(filters, d.field).length > 0).length;

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setStep(null); }}>
      <PopoverTrigger asChild>
        <button type="button" className={cn('inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-ui font-medium transition-colors hover:bg-hover', activeCount ? 'text-ink' : 'text-ink-2')}>
          <FunnelSimple size={14} weight={activeCount ? 'fill' : 'regular'} /> Filter
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[270px] overflow-hidden p-0">
        {def ? (
          <OptionList def={def} filters={filters} onChange={onChange} teamId={teamId} onBack={() => setStep(null)} />
        ) : (
          <Command loop>
            <div className="border-b border-line px-3">
              <Command.Input placeholder="Filter by…" autoFocus className="h-10 w-full bg-transparent text-ui outline-none placeholder:text-ink-3" />
            </div>
            <Command.List className="max-h-[360px] overflow-y-auto p-1">
              <Command.Empty className="py-5 text-center text-ui text-ink-3">No filters</Command.Empty>
              {defs.map(d => {
                const count = valuesOf(filters, d.field).length;
                return (
                  <Command.Item key={d.field} value={d.label} onSelect={() => setStep(d.field)} className={pickerItem}>
                    <span className="flex w-4 justify-center">{d.icon}</span>
                    <span className="flex-1">{d.label}</span>
                    {count > 0 && <span className="rounded-full bg-highlight px-1.5 text-micro font-semibold text-highlight-ink">{count}</span>}
                  </Command.Item>
                );
              })}
            </Command.List>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

function summarize(def: FilterDef, values: Array<string | number>, ws: Workspace, teamId: string | null) {
  const options = def.options(ws, teamId);
  const chosen = values.map(v => options.find(o => o.value === v)).filter(Boolean) as Opt[];
  if (chosen.length === 0) return { text: `${values.length} selected`, icons: [] as ReactNode[] };
  if (def.field === 'statusTypes' && values.length === OPEN_STATUS_TYPES.length && OPEN_STATUS_TYPES.every(t => values.includes(t))) {
    return { text: 'Open', icons: [] as ReactNode[] };
  }
  if (chosen.length <= 2) return { text: chosen.map(c => c.label).join(' or '), icons: chosen.map(c => c.icon) };
  // Name what's chosen rather than counting it: "Bug, API +2", not "4 labels".
  return { text: `${chosen.slice(0, 2).map(c => c.label).join(', ')} +${chosen.length - 2}`, icons: chosen.slice(0, 3).map(c => c.icon) };
}

/** Active filters as sentence chips: "Priority · Urgent or High ×". */
export function FilterChips({ filters, onChange, teamId, locked = [] }: { filters: IssueFilters; onChange: (f: IssueFilters) => void; teamId: string | null; locked?: FilterField[] }) {
  const ws = useWorkspace();
  const active = FILTERS.filter(d => !locked.includes(d.field) && valuesOf(filters, d.field).length > 0);
  if (active.length === 0) return null;
  return (
    <>
      {active.map(def => {
        const values = valuesOf(filters, def.field);
        const { text, icons } = summarize(def, values, ws, teamId);
        return (
          <span key={def.field} className="inline-flex h-7 items-center rounded-full bg-card pl-2.5 text-meta shadow-hairline ring-1 ring-line-strong animate-pop-in">
            <span className="text-ink-3">{def.label}</span>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="ml-1.5 flex h-full max-w-[240px] items-center gap-1.5 font-medium text-ink hover:underline hover:decoration-line-strong hover:underline-offset-2">
                  {icons.length > 0 && <span className="flex items-center gap-0.5">{icons.slice(0, 3).map((icon, i) => <span key={i} className="flex">{icon}</span>)}</span>}
                  <span className="truncate">{text}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[270px] overflow-hidden p-0">
                <OptionList def={def} filters={filters} onChange={onChange} teamId={teamId} />
              </PopoverContent>
            </Popover>
            <button type="button" onClick={() => onChange(setField(filters, def, []))} aria-label={`Remove ${def.label} filter`} className="ml-1 mr-1 flex h-5 w-5 items-center justify-center rounded-full text-ink-3 hover:bg-hover hover:text-ink">
              <X size={11} weight="bold" />
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={() => onChange(Object.fromEntries(Object.entries(filters).filter(([k]) => locked.includes(k as FilterField) || k === 'search')) as IssueFilters)}
        className="h-7 rounded-sm px-2 text-meta font-medium text-ink-2 hover:bg-hover hover:text-ink"
      >
        Clear all
      </button>
    </>
  );
}
