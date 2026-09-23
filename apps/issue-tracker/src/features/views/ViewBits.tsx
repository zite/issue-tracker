import { GlobeSimple, LockSimple, PushPin } from '@phosphor-icons/react';
import type { SavedView, Team } from '../../lib/types';
import { Mark } from '../../glyphs';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Tooltip } from '../../ui/Tooltip';
import { clauseChip, type FilterClause } from './filter-summary';

/** A saved view's mark: its emoji on a wash of its colour, or its initial when it has no emoji. */
export function ViewMark({ view, size = 32, className }: { view: Pick<SavedView, 'icon' | 'color' | 'name'>; size?: number; className?: string }) {
  return <Mark icon={view.icon || null} color={view.color} name={view.name} size={size} className={className} />;
}

/** The filter summary as a row of small sunken chips: "Assignee · Me", "Priority · Urgent, High", then "+2". */
export function FilterChips({ clauses, max = 3, className }: { clauses: FilterClause[]; max?: number; className?: string }) {
  const shown = clauses.slice(0, max);
  const hidden = clauses.slice(max);
  if (clauses.length === 0) {
    return (
      <div className={cn('flex flex-wrap gap-1', className)}>
        <span className="inline-flex h-5 items-center rounded-xs bg-sunken px-1.5 text-meta text-ink-2 dark:bg-hover">All issues</span>
      </div>
    );
  }
  return (
    <ul className={cn('flex min-w-0 flex-wrap gap-1', className)} aria-label="Filters">
      {shown.map(c => {
        const chip = clauseChip(c);
        return (
          <li key={c.key} title={c.sentence} className="inline-flex h-5 min-w-0 max-w-full items-center gap-1 rounded-xs bg-sunken px-1.5 text-meta dark:bg-hover">
            <span className="shrink-0 text-ink-3">{chip.field}</span>
            <span aria-hidden className="shrink-0 text-ink-3">·</span>
            <span className="truncate font-medium text-ink-2">{chip.value}</span>
          </li>
        );
      })}
      {hidden.length > 0 && (
        <li title={hidden.map(c => c.sentence).join('\n')} className="tabular inline-flex h-5 items-center rounded-xs px-1 text-meta font-medium text-ink-3">
          +{hidden.length}
        </li>
      )}
    </ul>
  );
}

export const SCOPE_COPY: Record<string, { label: string; section: string; hint: string }> = {
  Workspace: { label: 'Workspace view', section: 'Workspace views', hint: 'Shared with everyone' },
  Team: { label: 'Team view', section: 'Team views', hint: 'Shared with a team' },
  Personal: { label: 'Personal view', section: 'Only you', hint: 'Private to you' },
};

/** "🌐 Workspace view", "[Mark] Design team view", "🔒 Personal view". */
export function ScopeChip({ scope, team, className }: { scope: string; team?: Team | null; className?: string }) {
  const copy = SCOPE_COPY[scope] ?? SCOPE_COPY.Workspace;
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full bg-sunken pl-1.5 pr-2.5 text-meta font-medium text-ink-2', className)}>
      {scope === 'Team' && team ? (
        <Mark icon={team.icon} color={team.color} name={team.name} size={16} />
      ) : scope === 'Personal' ? (
        <LockSimple size={13} weight="bold" className="text-ink-3" />
      ) : (
        <GlobeSimple size={13} weight="bold" className="text-ink-3" />
      )}
      {scope === 'Team' && team ? `${team.name} team view` : copy.label}
    </span>
  );
}

/** Pin / unpin. The pin fills when pinned, so the state doesn't rely on colour. */
export function PinButton({
  pinned, onToggle, size = 'sm', className, label = 'view',
}: { pinned: boolean; onToggle: () => void; size?: 'xs' | 'sm' | 'md'; className?: string; label?: string }) {
  return (
    <Tooltip content={pinned ? `Unpin ${label}` : `Pin ${label}`}>
      <Button
        variant="ghost"
        size={size}
        icon
        aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
        aria-pressed={pinned}
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
        className={cn(pinned && 'text-ink hover:text-ink', className)}
      >
        <PushPin size={size === 'md' ? 17 : 15} weight={pinned ? 'fill' : 'regular'} />
      </Button>
    </Tooltip>
  );
}
