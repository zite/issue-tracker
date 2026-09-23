import { HEALTH } from '../../glyphs';
import { plural } from '../../lib/format';
import { cn } from '../../ui/cn';
import { Tooltip } from '../../ui/Tooltip';
import { HEALTH_KEYS, type Rollup } from '../roadmap/projectMath';

const SEGMENTS = [
  { key: 'On Track', className: 'bg-success' },
  { key: 'At Risk', className: 'bg-warning' },
  { key: 'Off Track', className: 'bg-danger' },
  { key: 'Unknown', className: 'bg-line-strong' },
] as const;

function countOf(r: Pick<Rollup, 'health' | 'unknown'>, key: (typeof SEGMENTS)[number]['key']) {
  return key === 'Unknown' ? r.unknown : r.health[key];
}

/** "2 on track · 1 at risk" — or why there's nothing to say yet. */
export function healthSentence(r: Pick<Rollup, 'health' | 'active'>) {
  const parts = HEALTH_KEYS.filter(k => r.health[k] > 0).map(k => `${r.health[k]} ${HEALTH[k].label.toLowerCase()}`);
  if (parts.length) return parts.join(' · ');
  return r.active ? 'No check-ins yet' : 'No active projects';
}

/**
 * The health of a goal's active projects as one stacked bar: green, amber and
 * red for the latest check-ins, a stone segment for projects nobody has checked
 * in on. Segments are separated by a hairline gap so small counts stay legible.
 */
export function HealthBar({ rollup, className, height = 6 }: { rollup: Pick<Rollup, 'health' | 'unknown' | 'active'>; className?: string; height?: number }) {
  const segments = SEGMENTS.map(s => ({ ...s, n: countOf(rollup, s.key) })).filter(s => s.n > 0);
  const label = rollup.active ? `${plural(rollup.active, 'active project')}: ${healthSentence(rollup)}${rollup.unknown && rollup.unknown < rollup.active ? `, ${rollup.unknown} without a check-in` : ''}` : 'No active projects';
  return (
    <Tooltip content={label}>
      <div role="img" aria-label={label} className={cn('flex w-full gap-[2px] overflow-hidden rounded-full', !segments.length && 'bg-sunken ring-1 ring-inset ring-line', className)} style={{ height }}>
        {segments.map(s => (
          <span key={s.key} className={cn('h-full first:rounded-l-full last:rounded-r-full', s.className)} style={{ flexGrow: s.n, flexBasis: 0 }} />
        ))}
      </div>
    </Tooltip>
  );
}

/** Coloured dots with counts, for tight rows: ● 2 ● 1. */
export function HealthDots({ rollup, className }: { rollup: Pick<Rollup, 'health' | 'active'>; className?: string }) {
  const shown = HEALTH_KEYS.filter(k => rollup.health[k] > 0);
  if (!shown.length) return <span className={cn('text-ui text-ink-3', className)}>{rollup.active ? 'No check-ins yet' : 'No active projects'}</span>;
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      {shown.map(k => (
        <span key={k} className={cn('inline-flex items-center gap-1.5 text-ui font-medium', HEALTH[k].text)}>
          <span className={cn('h-2 w-2 rounded-full', HEALTH[k].dot)} aria-hidden />
          <span className="tabular">{rollup.health[k]}</span>
          <span>{HEALTH[k].label.toLowerCase()}</span>
        </span>
      ))}
    </span>
  );
}
