import { useMemo, type ReactNode } from 'react';
import { Mark } from '../../glyphs';
import { OptionPicker, type Option } from '../../pickers/OptionPicker';
import { useWorkspace } from '../../lib/workspace';
import { Avatar, Unassigned } from '../../ui/Avatar';
import { isDoneProject } from '../roadmap/projectMath';

/** Every project, live ones first; a project already under another goal says so, since picking it moves it. */
export function ProjectsMultiPicker({
  goalId, value, onChange, trigger, open, onOpenChange, align = 'start',
}: {
  goalId: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
}) {
  const ws = useWorkspace();
  const options = useMemo<Option<string>[]>(() => {
    const sorted = [...ws.projects].sort((a, b) => Number(isDoneProject(a)) - Number(isDoneProject(b)) || a.name.localeCompare(b.name));
    return sorted.map(p => {
      const elsewhere = p.goalId && p.goalId !== goalId ? ws.goalById.get(p.goalId) : undefined;
      const team = p.teamId ? ws.teamById.get(p.teamId) : undefined;
      return {
        value: p.id,
        label: p.name,
        icon: <Mark icon={p.icon} color={p.color} name={p.name} size={16} />,
        group: isDoneProject(p) ? 'Completed & canceled' : undefined,
        keywords: [p.summary ?? '', p.status, team?.name ?? ''],
        hint: elsewhere ? <span className="block max-w-[120px] truncate">in {elsewhere.name}</span> : <span className="font-mono text-[11px]">{team?.key}</span>,
      };
    });
  }, [ws.projects, ws.goalById, ws.teamById, goalId]);

  return (
    <OptionPicker
      multiple
      value={value}
      onChange={onChange}
      options={options}
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      align={align}
      width={340}
      placeholder="Add projects…"
      emptyText="No matching projects"
    />
  );
}

/** Who answers for the goal. Unlike assigning an issue, "no owner" is a gap worth saying out loud. */
export function OwnerPicker({
  value, onChange, trigger, align = 'start',
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  trigger: ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  const ws = useWorkspace();
  const options = useMemo<Option<string | null>[]>(() => {
    const people = [...ws.activeMembers].sort((a, b) => (a.id === ws.me.id ? -1 : b.id === ws.me.id ? 1 : a.name.localeCompare(b.name)));
    return [
      { value: null, label: 'No owner', icon: <Unassigned size={18} /> },
      ...people.map(m => ({
        value: m.id,
        label: m.id === ws.me.id ? `${m.name} (you)` : m.name,
        icon: <Avatar person={m} size={18} />,
        keywords: [m.email ?? '', m.jobTitle ?? ''],
        hint: m.jobTitle ? <span className="hidden max-w-[120px] truncate sm:inline">{m.jobTitle}</span> : undefined,
      })),
    ];
  }, [ws.activeMembers, ws.me.id]);
  return <OptionPicker value={value} onChange={onChange} options={options} trigger={trigger} align={align} width={300} placeholder="Choose an owner…" />;
}
