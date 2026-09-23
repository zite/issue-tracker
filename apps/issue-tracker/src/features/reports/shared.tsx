import { useEffect, useState, type ReactNode } from 'react';
import type { GetAnalyticsOutputType } from 'zitejs/api';
import { Card } from '../../ui/Layout';
import { cn } from '../../ui/cn';

export type Analytics = GetAnalyticsOutputType;

export const WINDOWS = [4, 8, 12, 26] as const;
export type WindowWeeks = (typeof WINDOWS)[number];

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** "1 pt", "12 pts". */
export const ptsOf = (n: number) => `${fmt(n)} ${Math.round(n) === 1 ? 'pt' : 'pts'}`;

/** A signed count the way a ledger writes it: +12, −3, 0. */
export const signed = (n: number) => (n === 0 ? '0' : `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`);

/** The ad-hoc list behind a number. */
export { listLink } from '../../lib/format';

/** Durations the way people say them: "6 hours", "3.2 days", "14 days". */
export function fmtDays(days: number): { value: string; unit: string } {
  if (days < 1) {
    const h = Math.max(1, Math.round(days * 24));
    return { value: String(h), unit: h === 1 ? 'hour' : 'hours' };
  }
  const v = days < 10 ? Math.round(days * 10) / 10 : Math.round(days);
  return { value: String(v), unit: v === 1 ? 'day' : 'days' };
}

export const shortDays = (days: number) => {
  const d = fmtDays(days);
  return `${d.value}${d.unit.startsWith('hour') ? 'h' : 'd'}`;
};

/* ------------------------------------------------------------ chart colours */

const TOKENS = {
  ink: 'ink',
  ink2: 'ink-2',
  ink3: 'ink-3',
  line: 'line',
  lineStrong: 'line-strong',
  card: 'card',
  sunken: 'sunken',
  hover: 'hover',
  primary: 'primary',
  onPrimary: 'on-primary',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  highlight: 'highlight',
  highlightInk: 'highlight-ink',
} as const;

type TokenKey = keyof typeof TOKENS;

export type ChartColors = Record<TokenKey, string> & {
  /** A token at an opacity, e.g. `c.alpha('ink', 0.4)`. */
  alpha: (token: TokenKey, a: number) => string;
  dark: boolean;
};

const FALLBACK: Record<TokenKey, string> = {
  ink: '31 29 26', ink2: '90 85 76', ink3: '110 104 94', line: '232 227 218', lineStrong: '214 207 194', card: '255 255 255',
  sunken: '239 236 229', hover: '238 235 227', primary: '31 29 26', onPrimary: '251 250 247', success: '31 122 74',
  warning: '143 90 0', danger: '191 58 46', info: '42 98 176', highlight: '255 212 71', highlightInk: '31 29 26',
};

function readColors(): ChartColors {
  const style = getComputedStyle(document.documentElement);
  const raw = {} as Record<TokenKey, string>;
  for (const key of Object.keys(TOKENS) as TokenKey[]) raw[key] = style.getPropertyValue(`--${TOKENS[key]}`).trim() || FALLBACK[key];
  const colors = Object.fromEntries((Object.keys(raw) as TokenKey[]).map(k => [k, `rgb(${raw[k]})`])) as Record<TokenKey, string>;
  return { ...colors, alpha: (token, a) => `rgb(${raw[token]} / ${a})`, dark: document.documentElement.classList.contains('dark') };
}

/**
 * SVG marks can't take Tailwind classes through recharts, so charts read the
 * theme's tokens once and again whenever the `dark` class flips.
 */
export function useChartColors() {
  const [colors, setColors] = useState(readColors);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(prev => (prev.dark === document.documentElement.classList.contains('dark') ? prev : readColors())));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return colors;
}

export const AXIS_FONT = { fontSize: 11, fontFamily: 'inherit' };

/* ---------------------------------------------------------------- chrome */

/** A report card: title, one line of context, an aside on the right (a summary or a badge). */
export function ReportCard({
  title, description, aside, children, className, bodyClassName, id,
}: {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <Card as="section" className={cn('flex min-w-0 flex-col', className)}>
      <header id={id} className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-title font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-meta text-ink-3 text-pretty">{description}</p>}
        </div>
        {aside && <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">{aside}</div>}
      </header>
      <div className={cn('min-w-0 flex-1 px-4 pb-4 pt-3 sm:px-5 sm:pb-5', bodyClassName)}>{children}</div>
    </Card>
  );
}

/** A legend entry above a chart. The key mirrors the mark: a square for bars, a stroke for lines. */
export function LegendKey({
  color, label, kind = 'square', dashed, outline,
}: { color: string; label: ReactNode; kind?: 'square' | 'line'; dashed?: boolean; outline?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-meta text-ink-2">
      {kind === 'line' ? (
        <svg width="14" height="6" aria-hidden className="shrink-0">
          <line x1="1" y1="3" x2="13" y2="3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={dashed ? '3 2.5' : undefined} />
        </svg>
      ) : outline ? (
        <svg width="10" height="10" aria-hidden className="shrink-0">
          <rect x="0.75" y="0.75" width="8.5" height="8.5" rx="2" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="2 1.5" />
        </svg>
      ) : (
        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} aria-hidden />
      )}
      {label}
    </span>
  );
}

export function LegendRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', className)}>{children}</div>;
}

/** Ink tooltip panel, the same material as the app's Tooltip. Values lead; labels follow. */
export function ChartTip({ title, subtitle, children }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-[176px] rounded-sm bg-primary px-2.5 py-2 text-meta text-on-primary shadow-pop">
      {title && <div className="font-semibold">{title}</div>}
      {subtitle && <div className="text-on-primary/70">{subtitle}</div>}
      <div className={cn('space-y-0.5', (title || subtitle) && 'mt-1.5')}>{children}</div>
    </div>
  );
}

export function ChartTipRow({ swatch, label, value }: { swatch?: ReactNode; label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-3 shrink-0 justify-center">{swatch}</span>
      <span className="text-on-primary/70">{label}</span>
      <span className="tabular ml-auto pl-4 font-semibold">{value}</span>
    </div>
  );
}

export const TipLine = ({ color, dashed }: { color: string; dashed?: boolean }) => (
  <svg width="12" height="6" aria-hidden>
    <line x1="1" y1="3" x2="11" y2="3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={dashed ? '2.5 2' : undefined} />
  </svg>
);

export const TipSquare = ({ color }: { color: string }) => <span className="block h-2 w-2 rounded-[2px]" style={{ background: color }} aria-hidden />;

/** A quiet in-card empty message; a full EmptyState would outweigh the card it sits in. */
export function CardEmpty({ title, children, className, action }: { title: string; children?: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-md border border-dashed border-line-strong bg-sunken/40 px-6 py-6 text-center', className)}>
      <p className="font-display text-[20px] leading-7 text-ink">{title}</p>
      {children && <p className="mt-0.5 max-w-xs text-meta text-ink-3 text-pretty">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** A thin horizontal meter: the track is the whole, the fill the share. */
export function Meter({ value, max, className, fillClassName = 'bg-ink', title }: { value: number; max: number; className?: string; fillClassName?: string; title?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div title={title} className={cn('h-1.5 w-full overflow-hidden rounded-full bg-sunken', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', fillClassName)} style={{ width: `${pct * 100}%`, minWidth: value > 0 ? 3 : 0 }} />
    </div>
  );
}

/** A small caps count in a card's aside: "63 open". */
export function AsideNote({ children }: { children: ReactNode }) {
  return <span className="tabular whitespace-nowrap text-meta text-ink-3">{children}</span>;
}
