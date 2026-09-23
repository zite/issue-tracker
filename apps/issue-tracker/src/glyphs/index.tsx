import {
  Broom, Bug, CheckSquare, Flask, Sparkle, Target, TrendUp,
} from '@phosphor-icons/react';
import { useId, type CSSProperties, type ReactNode } from 'react';
import { cn } from '../ui/cn';

/*
 * Issue Tracker's glyphs. Meaning lives in the SHAPE, colour is redundant:
 *
 *   Status   — a ledger box. Dotted (intake), dashed (backlog), empty (to do),
 *              filling from the bottom (in flight), ticked (done), struck (canceled).
 *   Priority — a pennant. Outline (low), half (medium), solid (high),
 *              solid with a notch (urgent), dotted (none).
 *   People are circles; teams, projects and goals are rounded squares.
 */

type StatusLike = { id?: string; type: string; color?: string | null; position?: number; name?: string };

export const STATUS_FALLBACK_COLOR: Record<string, string> = {
  intake: '#D24A22',
  backlog: '#A39C8F',
  unstarted: '#8A8275',
  started: '#BF8300',
  completed: '#2E9460',
  canceled: '#A39C8F',
};

export function StatusGlyph({
  status, siblings, size = 14, className,
}: { status: StatusLike | null | undefined; siblings?: StatusLike[]; size?: number; className?: string }) {
  const clip = useId();
  const type = status?.type ?? 'backlog';
  const color = status?.color || STATUS_FALLBACK_COLOR[type] || '#A39C8F';
  // A started status fills in proportion to where it sits among its team's started statuses.
  let fill = 0.5;
  if (type === 'started' && siblings?.length) {
    const started = siblings.filter(s => s.type === 'started').sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const idx = started.findIndex(s => (status?.id ? s.id === status.id : s.name === status?.name));
    fill = started.length ? (Math.max(0, idx) + 1) / (started.length + 1) : 0.5;
  }
  const box = { x: 1.6, y: 1.6, width: 10.8, height: 10.8, rx: 3.2 };
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className={cn('shrink-0', className)} aria-label={status?.name} role="img">
      {type === 'completed' || type === 'canceled' ? (
        <>
          <rect {...box} fill={color} stroke={color} strokeWidth={1.2} opacity={type === 'canceled' ? 0.75 : 1} />
          {type === 'completed' ? (
            <path d="M4.4 7.1l1.8 1.8 3.5-3.8" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M5 5l4 4M9 5l-4 4" fill="none" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" />
          )}
        </>
      ) : (
        <>
          <defs>
            <clipPath id={clip}>
              <rect {...box} />
            </clipPath>
          </defs>
          {type === 'started' && <rect x={0} y={12.4 - 10.8 * fill} width={14} height={14} fill={color} clipPath={`url(#${clip})`} opacity={0.9} />}
          <rect
            {...box}
            fill="none"
            stroke={color}
            strokeWidth={type === 'intake' ? 1.7 : 1.45}
            strokeLinecap="round"
            strokeDasharray={type === 'intake' ? '0.01 2.55' : type === 'backlog' ? '2.3 1.7' : undefined}
          />
          {type === 'intake' && <circle cx={7} cy={7} r={1.5} fill={color} />}
        </>
      )}
    </svg>
  );
}

export const PRIORITY_COLOR: Record<number, string> = { 1: '#D2331F', 2: '#DF7422', 3: '#BF8300', 4: '#8A8275', 0: '#B7AFA2' };

export function PriorityGlyph({ priority, size = 14, className }: { priority: number | null | undefined; size?: number; className?: string }) {
  const p = priority ?? 0;
  const color = PRIORITY_COLOR[p] ?? PRIORITY_COLOR[0];
  const clip = useId();
  const flag = 'M3.4 2.3H11.3L9.3 5.05L11.3 7.8H3.4Z';
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className={cn('shrink-0', className)} role="img" aria-label={['No priority', 'Urgent', 'High', 'Medium', 'Low'][p]}>
      <path d="M3.4 1.8V12.4" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeDasharray={p === 0 ? '0.01 2.4' : undefined} />
      {p === 0 ? (
        <path d={flag} fill="none" stroke={color} strokeWidth={1.3} strokeLinejoin="round" strokeDasharray="0.01 2.2" strokeLinecap="round" />
      ) : p === 3 ? (
        <>
          <defs>
            <clipPath id={clip}>
              <rect x={0} y={0} width={7.2} height={14} />
            </clipPath>
          </defs>
          <path d={flag} fill={color} clipPath={`url(#${clip})`} />
          <path d={flag} fill="none" stroke={color} strokeWidth={1.3} strokeLinejoin="round" />
        </>
      ) : p === 4 ? (
        <path d={flag} fill="none" stroke={color} strokeWidth={1.3} strokeLinejoin="round" />
      ) : (
        <>
          <path d={flag} fill={color} stroke={color} strokeWidth={1.1} strokeLinejoin="round" />
          {p === 1 && <path d="M6.3 3.7V5.1M6.3 6.25V6.3" stroke="#fff" strokeWidth={1.25} strokeLinecap="round" />}
        </>
      )}
    </svg>
  );
}

const TYPE_ICON: Record<string, { icon: typeof Bug; className: string }> = {
  Feature: { icon: Sparkle, className: 'text-violet' },
  Bug: { icon: Bug, className: 'text-danger' },
  Improvement: { icon: TrendUp, className: 'text-info' },
  Task: { icon: CheckSquare, className: 'text-ink-3' },
  Spike: { icon: Flask, className: 'text-warning' },
  Chore: { icon: Broom, className: 'text-ink-3' },
};

export function TypeGlyph({ type, size = 14, className }: { type: string | null | undefined; size?: number; className?: string }) {
  const entry = TYPE_ICON[type ?? 'Task'] ?? TYPE_ICON.Task;
  const Icon = entry.icon;
  return <Icon size={size} weight={type === 'Feature' ? 'fill' : 'bold'} className={cn('shrink-0', entry.className, className)} aria-label={type ?? 'Task'} />;
}

export const HEALTH: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; dot: string; text: string }> = {
  'On Track': { label: 'On track', tone: 'success', dot: 'bg-success', text: 'text-success' },
  'At Risk': { label: 'At risk', tone: 'warning', dot: 'bg-warning', text: 'text-warning' },
  'Off Track': { label: 'Off track', tone: 'danger', dot: 'bg-danger', text: 'text-danger' },
  Unknown: { label: 'No check-in', tone: 'neutral', dot: 'bg-line-strong', text: 'text-ink-3' },
};

/** Health reads as a word with a pulse-dot: "● On track". */
export function HealthPill({ health, className, compact }: { health: string | null | undefined; className?: string; compact?: boolean }) {
  const h = HEALTH[health ?? 'Unknown'] ?? HEALTH.Unknown;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-ui font-medium', h.text, className)}>
      <span className={cn('h-2 w-2 rounded-full', h.dot)} style={h.tone !== 'neutral' ? { boxShadow: '0 0 0 3px color-mix(in oklab, currentColor 16%, transparent)' } : undefined} />
      {!compact && h.label}
    </span>
  );
}

/** A rounded-square mark for teams, projects and goals: a soft wash of the colour with the icon or initial. */
export function Mark({ icon, color, name, size = 18, className, solid }: { icon?: string | null; color?: string | null; name?: string; size?: number; className?: string; solid?: boolean }) {
  const c = color || '#8A8275';
  const letter = (name ?? '?').trim().charAt(0).toUpperCase();
  const isEmoji = Boolean(icon && /\p{Extended_Pictographic}/u.test(icon));
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: isEmoji ? Math.round(size * 0.62) : Math.round(size * 0.52), ['--c' as string]: c } as CSSProperties}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-[30%] font-semibold leading-none',
        solid
          ? 'bg-[var(--c)] text-white'
          : 'bg-[color:color-mix(in_oklab,var(--c)_20%,rgb(var(--card)))] text-[color:color-mix(in_oklab,var(--c)_60%,rgb(var(--ink)))] ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--c)_22%,transparent)]',
        className,
      )}
    >
      {icon ? icon : letter}
    </span>
  );
}

export function GoalMark({ icon, color, size = 18, className }: { icon?: string | null; color?: string | null; size?: number; className?: string }) {
  if (icon) return <Mark icon={icon} color={color} size={size} className={className} />;
  return (
    <span style={{ width: size, height: size, ['--c' as string]: color || '#8A8275' } as CSSProperties} className={cn('inline-flex shrink-0 items-center justify-center rounded-[30%] bg-[color:color-mix(in_oklab,var(--c)_20%,rgb(var(--card)))] text-[color:color-mix(in_oklab,var(--c)_60%,rgb(var(--ink)))]', className)}>
      <Target size={Math.round(size * 0.66)} weight="bold" />
    </span>
  );
}

/**
 * A sprint: a small tile filling left-to-right with elapsed time. The current
 * sprint fills in highlighter, finished ones in ink.
 */
export function SprintGlyph({ progress = 0, status = 'upcoming', size = 14, className }: { progress?: number; status?: 'active' | 'upcoming' | 'completed'; size?: number; className?: string }) {
  const clip = useId();
  const v = status === 'completed' ? 1 : status === 'upcoming' ? 0 : Math.max(0.12, Math.min(1, progress));
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className={cn('shrink-0', className)} aria-hidden>
      <defs>
        <clipPath id={clip}>
          <rect x={1.5} y={3} width={11} height={8} rx={2.5} />
        </clipPath>
      </defs>
      <rect x={0} y={0} width={1.5 + 11 * v} height={14} clipPath={`url(#${clip})`} className={status === 'active' ? 'fill-highlight' : 'fill-ink-3'} opacity={status === 'active' ? 1 : 0.55} />
      <rect x={1.5} y={3} width={11} height={8} rx={2.5} fill="none" strokeWidth={1.4} className={status === 'active' ? 'stroke-ink' : 'stroke-ink-3'} />
    </svg>
  );
}

/** The Issue Tracker mark: a ticket stub with a tick, on a highlighter tile. */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={cn('shrink-0', className)} aria-label="Issue Tracker">
      <rect width="32" height="32" rx="8" fill="#FFD447" />
      <path d="M7 11a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.6a2.4 2.4 0 0 0 0 4.8V21a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-2.6a2.4 2.4 0 0 0 0-4.8V11Z" fill="#1F1D1A" />
      <path d="M19.5 11.5v9" stroke="#FFD447" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="0.1 2.6" />
      <path d="M10.6 16.2l1.7 1.7 3.3-3.6" stroke="#FFD447" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A glyph + text pair used in cells, chips and menus. */
export function GlyphLabel({ glyph, children, className, muted }: { glyph: ReactNode; children: ReactNode; className?: string; muted?: boolean }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', muted ? 'text-ink-2' : 'text-ink', className)}>
      {glyph}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

const PROJECT_STATUS_COLOR: Record<string, string> = {
  Backlog: '#A39C8F',
  Planned: '#8A8275',
  'In Progress': '#BF8300',
  Paused: '#8A8275',
  Completed: '#2E9460',
  Canceled: '#A39C8F',
};

/**
 * A project status in Issue Tracker's ledger-box language: dashed (backlog), empty
 * (planned), filling with progress (in progress), barred (paused), ticked
 * (completed), struck (canceled).
 */
export function ProjectStatusGlyph({ status, progress = 0.5, size = 14, className }: { status: string; progress?: number; size?: number; className?: string }) {
  const clip = useId();
  const s = PROJECT_STATUS_COLOR[status] ? status : 'Planned';
  const color = PROJECT_STATUS_COLOR[s];
  const box = { x: 1.6, y: 1.6, width: 10.8, height: 10.8, rx: 3.2 };
  if (s === 'Backlog') return <StatusGlyph status={{ type: 'backlog', color, name: 'Backlog' }} size={size} className={className} />;
  if (s === 'Planned') return <StatusGlyph status={{ type: 'unstarted', color, name: 'Planned' }} size={size} className={className} />;
  if (s === 'Completed') return <StatusGlyph status={{ type: 'completed', color, name: 'Completed' }} size={size} className={className} />;
  if (s === 'Canceled') return <StatusGlyph status={{ type: 'canceled', color, name: 'Canceled' }} size={size} className={className} />;
  if (s === 'Paused') {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" className={cn('shrink-0', className)} role="img" aria-label="Paused">
        <rect {...box} fill="none" stroke={color} strokeWidth={1.45} />
        <path d="M5.6 4.9v4.2M8.4 4.9v4.2" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    );
  }
  const fill = Math.max(0.22, Math.min(0.86, progress));
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className={cn('shrink-0', className)} role="img" aria-label="In progress">
      <defs>
        <clipPath id={clip}>
          <rect {...box} />
        </clipPath>
      </defs>
      <rect x={0} y={12.4 - 10.8 * fill} width={14} height={14} fill={color} clipPath={`url(#${clip})`} opacity={0.9} />
      <rect {...box} fill="none" stroke={color} strokeWidth={1.45} />
    </svg>
  );
}
