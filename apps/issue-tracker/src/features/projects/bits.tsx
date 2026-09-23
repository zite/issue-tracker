import { Check, Prohibit } from '@phosphor-icons/react';
import { useId, type ReactNode } from 'react';
import { GoalMark, HEALTH, Mark, ProjectStatusGlyph } from '../../glyphs';
import { PROJECT_HEALTH, PROJECT_ICONS, SWATCHES } from '../../lib/constants';
import { useWorkspace } from '../../lib/workspace';
import { OptionPicker, type Option } from '../../pickers/OptionPicker';
import { Avatar, Unassigned } from '../../ui/Avatar';
import { cn } from '../../ui/cn';
import { Segmented } from '../../ui/Form';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/Popover';
import { BOARD_ORDER, STATUS_LABEL, asStatus, type Health, type ProjectStatus } from './model';

/** A property value that opens its picker: bordered like a small secondary button. */
export const chip =
  'inline-flex h-7 max-w-full shrink-0 items-center gap-1.5 rounded-md border border-line-strong bg-card px-2 text-ui text-ink shadow-hairline transition-colors hover:bg-hover data-[state=open]:bg-hover disabled:opacity-50';

/** An inline value in a table cell or facts row: no border until hovered. */
export const inlineValue =
  'inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-sm px-1.5 text-ui text-ink transition-colors hover:bg-hover data-[state=open]:bg-hover';

// Shared with the roadmap and goals, so it lives in the glyph kit.
export { ProjectStatusGlyph };

/** Milestone nodes: hollow until work lands, half-filled while it moves, solid ink when done. */
export function MilestoneNode({ done, total, size = 16, className, dashed }: { done: number; total: number; size?: number; className?: string; dashed?: boolean }) {
  const clip = useId();
  const complete = total > 0 && done === total;
  const started = done > 0 && !complete;
  const d = 'M8 1.6L14.4 8L8 14.4L1.6 8Z';
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={cn('shrink-0', complete || started ? 'text-ink' : 'text-ink-3', className)} aria-hidden>
      <defs>
        <clipPath id={clip}>
          <rect x={0} y={8} width={16} height={8} />
        </clipPath>
      </defs>
      <path d={d} fill={complete ? 'currentColor' : 'rgb(var(--card))'} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeDasharray={dashed ? '2 2' : undefined} />
      {started && <path d={d} fill="currentColor" clipPath={`url(#${clip})`} />}
      {complete && <path d="M5.6 8.1l1.6 1.6 3.2-3.4" fill="none" stroke="rgb(var(--card))" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

export const HEALTH_STRIPE: Record<string, string> = {
  'On Track': 'bg-success',
  'At Risk': 'bg-warning',
  'Off Track': 'bg-danger',
  Unknown: 'bg-line-strong',
};

/** On track / At risk / Off track as one control, each with its pulse dot. */
export function HealthSegmented({ value, onChange, className }: { value: Health; onChange: (h: Health) => void; className?: string }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      className={className}
      options={PROJECT_HEALTH.map(h => ({
        value: h,
        title: HEALTH[h].label,
        icon: <span className={cn('h-2 w-2 rounded-full', HEALTH[h].dot)} aria-hidden />,
        label: <span className={cn(value === h && HEALTH[h].text)}>{HEALTH[h].label}</span>,
      }))}
    />
  );
}

type PickerProps<V> = {
  value: V;
  onChange: (v: V) => void;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
};

export function ProjectStatusPicker({ value, onChange, ...p }: PickerProps<string>) {
  const options: Option<ProjectStatus>[] = BOARD_ORDER.map((s, i) => ({
    value: s,
    label: STATUS_LABEL[s],
    icon: <ProjectStatusGlyph status={s} />,
    shortcut: String(i + 1),
  }));
  return <OptionPicker {...p} value={asStatus(value)} onChange={v => onChange(v)} options={options} placeholder="Change status…" width={220} />;
}

export function LeadPicker({ teamId, value, onChange, ...p }: PickerProps<string | null> & { teamId: string | null }) {
  const ws = useWorkspace();
  const members = ws.membersFor(teamId);
  const team = teamId ? ws.teamById.get(teamId) : undefined;
  const options: Option<string | null>[] = [
    { value: null, label: 'No lead', icon: <Unassigned size={18} /> },
    ...members.map(m => ({
      value: m.id,
      label: m.id === ws.me.id ? `${m.name} (you)` : m.name,
      icon: <Avatar person={m} size={18} />,
      keywords: [m.email ?? '', m.jobTitle ?? ''],
      group: team ? (m.teamIds.includes(team.id) ? team.name : 'Everyone else') : undefined,
    })),
  ];
  return <OptionPicker {...p} value={value} onChange={onChange} options={options} placeholder="Choose a lead…" width={280} />;
}

export function GoalPicker({ value, onChange, ...p }: PickerProps<string | null>) {
  const ws = useWorkspace();
  const options: Option<string | null>[] = [
    { value: null, label: 'No goal', icon: <Prohibit size={14} className="text-ink-3" /> },
    ...ws.goals.map(g => ({ value: g.id, label: g.name, icon: <GoalMark icon={g.icon} color={g.color} size={16} />, hint: g.status, keywords: [g.summary ?? ''] })),
  ];
  return <OptionPicker {...p} value={value} onChange={onChange} options={options} placeholder="Contribute to a goal…" width={300} emptyText="No goals yet" />;
}

/** The emoji grid and colour swatches behind a project's mark. */
export function ProjectIconPicker({ icon, color, name, onChange, size = 32, className, align = 'start' }: {
  icon: string | null;
  color: string | null;
  name: string;
  onChange: (patch: { icon?: string; color?: string }) => void;
  size?: number;
  className?: string;
  align?: 'start' | 'end';
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change icon and colour"
          className={cn('shrink-0 rounded-[30%] outline-offset-2 transition-[transform,box-shadow] hover:shadow-raised active:scale-[0.97] data-[state=open]:shadow-raised', className)}
        >
          <Mark icon={icon} color={color} name={name} size={size} />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[272px] p-3" onClick={e => e.stopPropagation()}>
        <div className="pb-2 text-micro font-semibold uppercase text-ink-3">Icon</div>
        <div className="grid grid-cols-7 gap-1">
          {PROJECT_ICONS.map(i => (
            <button
              key={i}
              type="button"
              onClick={() => onChange({ icon: i })}
              aria-label={`Icon ${i}`}
              aria-pressed={icon === i}
              className={cn('flex h-8 w-8 items-center justify-center rounded-sm transition-colors hover:bg-hover', icon === i && 'bg-highlight/35 ring-1 ring-inset ring-highlight dark:bg-highlight/15')}
            >
              <span className="text-[17px] leading-none">{i}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 border-t border-line pb-2 pt-3 text-micro font-semibold uppercase text-ink-3">Colour</div>
        <div className="grid grid-cols-8 gap-1.5">
          {SWATCHES.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ color: c })}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              className={cn('flex h-6 w-6 items-center justify-center rounded-[30%] ring-offset-2 ring-offset-card transition-transform hover:scale-110', color === c && 'ring-2 ring-ink')}
              style={{ background: c }}
            >
              {color === c && <Check size={12} weight="bold" className="text-white" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
