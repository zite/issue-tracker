import { cn } from './cn';

export type Segment = { value: number; className: string; label?: string };

/** A rounded bar; pass segments for a stacked breakdown (done / started / rest). */
export function ProgressBar({
  value, max = 100, segments, className, height = 6, tone = 'ink',
}: { value?: number; max?: number; segments?: Segment[]; className?: string; height?: number; tone?: 'ink' | 'success' | 'highlight' | 'warning' | 'danger' }) {
  const total = Math.max(max, 0.0001);
  const parts = segments ?? [{ value: value ?? 0, className: { ink: 'bg-ink', success: 'bg-success', highlight: 'bg-highlight', warning: 'bg-warning', danger: 'bg-danger' }[tone] }];
  return (
    <div className={cn('flex w-full overflow-hidden rounded-full bg-sunken ring-1 ring-inset ring-line', className)} style={{ height }}>
      {parts.map((s, i) => (
        <div key={i} title={s.label} className={cn('h-full transition-[width] duration-500 ease-out first:rounded-l-full', s.className)} style={{ width: `${Math.min(100, (Math.max(0, s.value) / total) * 100)}%` }} />
      ))}
    </div>
  );
}

/** A thin ring for compact progress (a project in a row, a sprint in a card). */
export function ProgressRing({ value, size = 16, stroke = 2, className, trackClassName = 'text-line-strong', barClassName = 'text-ink' }: { value: number; size?: number; stroke?: number; className?: string; trackClassName?: string; barClassName?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('shrink-0 -rotate-90', className)} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className={trackClassName} />
      {v > 0 && (
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeDasharray={`${c * v} ${c}`} strokeLinecap="round" className={barClassName} />
      )}
    </svg>
  );
}
