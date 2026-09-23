import type { CSSProperties, ReactNode } from 'react';
import { cn } from './cn';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'highlight' | 'signal' | 'ink';

const TONES: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2 ring-line',
  success: 'bg-success/10 text-success ring-success/20',
  warning: 'bg-warning/10 text-warning ring-warning/20',
  danger: 'bg-danger/10 text-danger ring-danger/20',
  info: 'bg-info/10 text-info ring-info/20',
  violet: 'bg-violet/10 text-violet ring-violet/20',
  highlight: 'bg-highlight/70 text-highlight-ink ring-highlight dark:bg-highlight/90',
  signal: 'bg-signal/10 text-signal ring-signal/25',
  ink: 'bg-primary text-on-primary ring-primary',
};

/** A small status word: "At risk", "Current", "Archived". */
export function Badge({ tone = 'neutral', children, icon, className, dot }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-meta font-medium ring-1 ring-inset', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {icon}
      {children}
    </span>
  );
}

/** Numbers in pills, e.g. a tab or group count. */
export function Count({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'highlight' | 'signal'; className?: string }) {
  return (
    <span
      className={cn(
        'tabular inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-micro font-semibold',
        tone === 'neutral' && 'bg-sunken text-ink-2',
        tone === 'highlight' && 'bg-highlight text-highlight-ink',
        tone === 'signal' && 'bg-signal text-white dark:text-paper',
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A label: a soft wash of its colour with the name in the colour mixed toward
 * ink, so any user-chosen colour stays readable on both themes.
 */
export function LabelChip({ name, color, className, onRemove }: { name: string; color: string; className?: string; onRemove?: () => void }) {
  return (
    <span
      style={{ ['--c' as string]: color } as CSSProperties}
      className={cn(
        'inline-flex h-5 max-w-[160px] shrink-0 items-center gap-1 rounded-xs px-1.5 text-meta font-medium',
        'bg-[color:color-mix(in_oklab,var(--c)_16%,transparent)] text-[color:color-mix(in_oklab,var(--c)_58%,rgb(var(--ink)))]',
        className,
      )}
    >
      <span className="truncate">{name}</span>
      {onRemove && (
        <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} className="-mr-0.5 opacity-60 hover:opacity-100">
          ×
        </button>
      )}
    </span>
  );
}

/** A colour swatch dot for pickers. */
export function Swatch({ color, size = 10, className }: { color: string; size?: number; className?: string }) {
  return <span className={cn('inline-block shrink-0 rounded-[3px]', className)} style={{ width: size, height: size, background: color }} />;
}
