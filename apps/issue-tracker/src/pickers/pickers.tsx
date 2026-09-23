import { CircleNotch, Diamond, MagnifyingGlass, Prohibit, X } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { addDays, addMonths, endOfMonth, endOfQuarter, endOfWeek, nextMonday } from 'date-fns';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { saveLabel } from 'zitejs/api';
import { Mark, PriorityGlyph, SprintGlyph, StatusGlyph, TypeGlyph } from '../glyphs';
import { ESTIMATE_SCALES, ISSUE_TYPES, PRIORITIES, SWATCHES } from '../lib/constants';
import { errorMessage } from '../lib/errors';
import { parseDay, shortDate, toDayString } from '../lib/format';
import { qk, useIssueSearch } from '../lib/queries';
import type { IssueType } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import { Avatar, Unassigned } from '../ui/Avatar';
import { Calendar } from '../ui/Calendar';
import { Swatch } from '../ui/Chip';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { OptionPicker, pickerItem, type Option } from './OptionPicker';

type PickerBase<V> = {
  value: V;
  onChange: (value: V) => void;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
};

const none = (label: string) => ({ label, icon: <Prohibit size={14} className="text-ink-3" /> });

export function StatusPicker({ teamId, ...p }: PickerBase<string | null> & { teamId: string | null }) {
  const ws = useWorkspace();
  const statuses = teamId ? ws.statusesByTeam.get(teamId) ?? [] : [];
  const options: Option<string>[] = statuses.map((s, i) => ({
    value: s.id,
    label: s.name,
    icon: <StatusGlyph status={s} siblings={statuses} />,
    keywords: [s.type],
    shortcut: i < 9 ? String(i + 1) : undefined,
  }));
  return <OptionPicker {...p} value={p.value} onChange={v => p.onChange(v)} options={options} placeholder="Move to status…" />;
}

export function PriorityPicker(p: PickerBase<number>) {
  const options: Option<number>[] = PRIORITIES.map(pr => ({ value: pr.value, label: pr.label, icon: <PriorityGlyph priority={pr.value} />, shortcut: pr.shortcut }));
  return <OptionPicker {...p} options={options} placeholder="Set priority…" width={220} />;
}

export function AssigneePicker({ teamId, ...p }: PickerBase<string | null> & { teamId?: string | null }) {
  const ws = useWorkspace();
  const members = ws.membersFor(teamId);
  const onTeam = teamId ? members.filter(m => m.teamIds.includes(teamId)) : members;
  const others = teamId ? members.filter(m => !m.teamIds.includes(teamId)) : [];
  const team = teamId ? ws.teamById.get(teamId) : undefined;
  const opt = (m: (typeof members)[number], group?: string): Option<string | null> => ({
    value: m.id,
    label: m.id === ws.me.id ? `${m.name} (you)` : m.name,
    icon: <Avatar person={m} size={18} />,
    keywords: [m.email ?? '', m.jobTitle ?? ''],
    hint: m.jobTitle ? <span className="hidden max-w-[110px] truncate sm:inline">{m.jobTitle}</span> : undefined,
    group,
  });
  const options: Option<string | null>[] = [
    { value: null, label: 'No assignee', icon: <Unassigned size={18} /> },
    ...[...onTeam].sort((a, b) => (a.id === ws.me.id ? -1 : b.id === ws.me.id ? 1 : 0)).map(m => opt(m, team ? team.name : undefined)),
    ...others.map(m => opt(m, 'Everyone else')),
  ];
  return <OptionPicker {...p} options={options} placeholder="Assign to…" width={300} />;
}

export function LabelPicker({ teamId, value, onChange, trigger, open, onOpenChange, align }: PickerBase<string[]> & { teamId?: string | null }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const options: Option<string>[] = ws.labelsFor(teamId).map(l => ({
    value: l.id,
    label: l.name,
    icon: <Swatch color={l.color} />,
    group: l.teamId ? ws.teamById.get(l.teamId)?.name : 'Workspace',
    keywords: [l.description ?? ''],
  }));
  const create = async (name: string) => {
    try {
      const color = SWATCHES[Math.floor(Math.random() * SWATCHES.length)];
      const res = await saveLabel({ name, color, teamId: null });
      await qc.invalidateQueries({ queryKey: qk.bootstrap });
      if (res.id) onChange([...value, res.id]);
      toast.success(`Created label “${name}”`);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't create label"));
    }
  };
  return (
    <OptionPicker multiple value={value} onChange={onChange} trigger={trigger} open={open} onOpenChange={onOpenChange} align={align} options={options} placeholder="Add labels…" onCreate={create} createLabel={q => `Create label “${q}”`} />
  );
}

export function ProjectPicker({ teamId, ...p }: PickerBase<string | null> & { teamId?: string | null }) {
  const ws = useWorkspace();
  const live = ws.projects.filter(pr => !['Completed', 'Canceled'].includes(pr.status));
  const sorted = [...live].sort((a, b) => Number(b.teamId === teamId) - Number(a.teamId === teamId));
  const options: Option<string | null>[] = [
    { value: null, ...none('No project') },
    ...sorted.map(pr => ({ value: pr.id, label: pr.name, icon: <Mark icon={pr.icon} color={pr.color} name={pr.name} size={16} />, hint: pr.teamId ? ws.teamById.get(pr.teamId)?.key : undefined, keywords: [pr.summary ?? ''] })),
  ];
  return <OptionPicker {...p} options={options} placeholder="Move to project…" width={300} />;
}

export function MilestonePicker({ projectId, ...p }: PickerBase<string | null> & { projectId: string | null }) {
  const ws = useWorkspace();
  const milestones = projectId ? ws.milestonesByProject.get(projectId) ?? [] : [];
  const options: Option<string | null>[] = [
    { value: null, ...none('No milestone') },
    ...milestones.map(m => ({ value: m.id, label: m.name, icon: <Diamond size={14} className="text-ink-3" />, hint: m.targetDate ? shortDate(m.targetDate) : undefined })),
  ];
  return <OptionPicker {...p} options={options} placeholder="Set milestone…" emptyText="This project has no milestones" />;
}

export function SprintPicker({ teamId, ...p }: PickerBase<string | null> & { teamId: string | null }) {
  const ws = useWorkspace();
  const sprints = (teamId ? ws.sprintsByTeam.get(teamId) ?? [] : []).filter(c => c.status !== 'completed' || c.id === p.value);
  const options: Option<string | null>[] = [
    { value: null, ...none('No sprint') },
    ...sprints.map(c => ({
      value: c.id,
      label: c.name,
      icon: <SprintGlyph status={c.status} progress={0.5} />,
      hint: c.status === 'active' ? 'Current' : c.status === 'upcoming' ? shortDate(c.startDate) : 'Done',
    })),
  ];
  return <OptionPicker {...p} options={options} placeholder="Add to sprint…" emptyText="No sprints — turn them on in team settings" />;
}

export function EstimatePicker({ teamId, ...p }: PickerBase<number | null> & { teamId: string | null }) {
  const ws = useWorkspace();
  const scale = (teamId && ws.teamById.get(teamId)?.estimateScale) || 'fibonacci';
  const options: Option<number | null>[] = [
    { value: null, ...none('No estimate'), shortcut: '0' },
    ...(ESTIMATE_SCALES[scale] ?? ESTIMATE_SCALES.fibonacci).map((e, i) => ({
      value: e.value,
      label: e.label,
      icon: <span className="tabular font-mono text-[11px] font-semibold text-ink-2">{scale === 'tshirt' ? e.label : e.value}</span>,
      shortcut: String(i + 1),
    })),
  ];
  return <OptionPicker {...p} options={options} placeholder="Set estimate…" width={220} />;
}

export function TypePicker(p: PickerBase<string | null>) {
  const options: Option<IssueType>[] = ISSUE_TYPES.map((t, i) => ({ value: t, label: t, icon: <TypeGlyph type={t} />, shortcut: String(i + 1) }));
  return <OptionPicker {...p} value={p.value as IssueType} onChange={v => p.onChange(v)} options={options} placeholder="Set type…" width={210} />;
}

export function TeamPicker(p: PickerBase<string>) {
  const ws = useWorkspace();
  const options: Option<string>[] = ws.teams.map(t => ({ value: t.id, label: t.name, icon: <Mark icon={t.icon} color={t.color} name={t.name} size={16} />, hint: t.key }));
  return <OptionPicker {...p} options={options} placeholder="Choose team…" width={230} />;
}

export function MemberMultiPicker({ value, onChange, trigger, align, open, onOpenChange }: { value: string[]; onChange: (v: string[]) => void; trigger: ReactNode; align?: 'start' | 'end'; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  const ws = useWorkspace();
  const options: Option<string>[] = ws.activeMembers.map(m => ({ value: m.id, label: m.name, icon: <Avatar person={m} size={18} />, keywords: [m.email ?? ''] }));
  return <OptionPicker multiple value={value} onChange={onChange} trigger={trigger} options={options} placeholder="Add people…" align={align} open={open} onOpenChange={onOpenChange} width={280} />;
}

/** Quick picks first — nobody wants a calendar to say "end of the week". */
export function DatePicker({ value, onChange, trigger, open, onOpenChange, align = 'start', label = 'Due date', presets = 'due' }: PickerBase<string | null> & { label?: string; presets?: 'due' | 'target' }) {
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const today = new Date();
  // Due dates are days away; targets for projects and goals are months away.
  const quick = presets === 'target'
    ? [
        { label: 'End of month', date: endOfMonth(today) },
        { label: 'In a month', date: addMonths(today, 1) },
        { label: 'End of quarter', date: endOfQuarter(today) },
        { label: 'In three months', date: addMonths(today, 3) },
        { label: 'End of next quarter', date: endOfQuarter(addMonths(today, 3)) },
      ]
    : [
        { label: 'Today', date: today },
        { label: 'Tomorrow', date: addDays(today, 1) },
        // On a Sunday "end of this week" is today; offer the end of next week instead.
        today.getDay() === 0
          ? { label: 'End of next week', date: addDays(today, 7) }
          : { label: 'End of week', date: endOfWeek(today, { weekStartsOn: 1 }) },
        { label: 'Next Monday', date: nextMonday(today) },
        { label: 'In two weeks', date: addDays(today, 14) },
      ];
  const choose = (d: Date | null) => {
    onChange(d ? toDayString(d) : null);
    setOpen(false);
  };
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
        <div className="flex flex-col sm:flex-row">
          <div className="border-b border-line p-1 sm:w-auto sm:min-w-44 sm:border-b-0 sm:border-r">
            <div className="px-2 pb-1 pt-2 text-micro font-semibold uppercase text-ink-3">{label}</div>
            {quick.map(q => (
              <button key={q.label} type="button" onClick={() => choose(q.date)} className="flex h-8 w-full items-center justify-between gap-4 whitespace-nowrap rounded-sm px-2 text-ui hover:bg-sunken">
                <span>{q.label}</span>
                <span className="text-meta text-ink-3">{shortDate(toDayString(q.date))}</span>
              </button>
            ))}
            {value && (
              <button type="button" onClick={() => choose(null)} className="mt-1 flex h-8 w-full items-center gap-2 rounded-sm border-t border-line px-2 text-ui text-ink-2 hover:bg-sunken hover:text-ink">
                <X size={13} /> Clear date
              </button>
            )}
          </div>
          <Calendar selected={value ? parseDay(value) : undefined} defaultMonth={value ? parseDay(value) : today} onSelect={d => d && choose(d)} initialFocus />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Search any issue — for parents, relations and duplicates. */
export function IssueSearchPicker({
  trigger, onSelect, excludeIds = [], placeholder = 'Find an issue…', open, onOpenChange, align = 'start',
}: {
  trigger: ReactNode; onSelect: (issue: { id: string; identifier: string; title: string }) => void; excludeIds?: string[];
  placeholder?: string; open?: boolean; onOpenChange?: (open: boolean) => void; align?: 'start' | 'end';
}) {
  const ws = useWorkspace();
  const [q, setQ] = useState('');
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = (v: boolean) => {
    (onOpenChange ?? setInnerOpen)(v);
    if (!v) setQ('');
  };
  const { data, isFetching } = useIssueSearch(q.length >= 1 ? q : '');
  const results = (data?.issues ?? []).filter(i => !excludeIds.includes(i.id));
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-[400px] max-w-[calc(100vw-24px)] p-0" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
        <Command shouldFilter={false} loop>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <MagnifyingGlass size={14} className="text-ink-3" />
            <Command.Input value={q} onValueChange={setQ} placeholder={placeholder} className="h-10 w-full bg-transparent text-ui outline-none placeholder:text-ink-3" />
            {isFetching && <CircleNotch size={14} className="animate-spin text-ink-3" />}
          </div>
          <Command.List className="max-h-[320px] overflow-y-auto p-1">
            {q.length === 0 ? (
              <div className="px-3 py-5 text-ui text-ink-3">Type an ID like ENG-12, or words from a title.</div>
            ) : (
              <>
                <Command.Empty className="px-3 py-6 text-center text-ui text-ink-3">{isFetching ? 'Searching…' : 'No matching issues'}</Command.Empty>
                {results.map(i => {
                  const status = i.statusId ? ws.statusById.get(i.statusId) : undefined;
                  return (
                    <Command.Item key={i.id} value={i.id} onSelect={() => { onSelect(i); setOpen(false); }} className={pickerItem}>
                      <StatusGlyph status={status} siblings={status?.teamId ? ws.statusesByTeam.get(status.teamId) : undefined} />
                      <span className="w-16 shrink-0 font-mono text-[11.5px] text-ink-3">{i.identifier}</span>
                      <span className="truncate">{i.title}</span>
                    </Command.Item>
                  );
                })}
              </>
            )}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
