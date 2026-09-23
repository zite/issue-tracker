import type { ReactNode } from 'react';
import { HEALTH } from '../../glyphs';
import { dueLabel, shortDate } from '../../lib/format';
import type { Goal } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { OptionPicker } from '../../pickers/OptionPicker';
import { DatePicker } from '../../pickers/pickers';
import { Avatar } from '../../ui/Avatar';
import { cn } from '../../ui/cn';
import { Card, FactRow, Skeleton } from '../../ui/Layout';
import { ProgressBar } from '../../ui/Progress';
import { Tooltip } from '../../ui/Tooltip';
import { inlineValue } from '../projects/bits';
import { type Rollup } from '../roadmap/projectMath';
import { targetHint } from './GoalCard';
import { HealthDots } from './GoalHealth';
import { OwnerPicker } from './pickers';
import { GoalStatusGlyph, goalStatusOptions, toGoalStatus } from './status';
import { useGoalActions } from './useGoalActions';

/** Status, owner and target edit in place; health rolls up from the goal's projects and is read-only. Same card as a project's details. */
export function GoalFactsCard({ goal, rollup, loading }: { goal: Goal; rollup: Rollup; loading: boolean }) {
  const ws = useWorkspace();
  const actions = useGoalActions();
  const status = toGoalStatus(goal.status);
  const owner = goal.ownerId ? ws.memberById.get(goal.ownerId) : undefined;
  const late = dueLabel(goal.targetDate)?.tone === 'overdue' && status !== 'Completed';
  const hint = targetHint(goal);
  const valueCls = cn(inlineValue, '-ml-1.5');

  return (
    <Card className="px-4 py-3">
      <h2 className="sr-only">Details</h2>
      <FactRow label="Status">
        <OptionPicker
          value={status}
          onChange={v => v !== status && void actions.update(goal, { status: v }, { success: `Status set to ${v.toLowerCase()}`, undo: { status } })}
          options={goalStatusOptions}
          placeholder="Set status…"
          width={210}
          trigger={
            <button type="button" className={valueCls} aria-label={`Status: ${status}`}>
              <GoalStatusGlyph status={status} />
              {status}
            </button>
          }
        />
      </FactRow>
      <FactRow label="Owner">
        <OwnerPicker
          value={goal.ownerId}
          onChange={v =>
            v !== goal.ownerId &&
            void actions.update(goal, { ownerId: v }, {
              success: v ? `Owner set to ${ws.memberById.get(v)?.name ?? 'someone new'}` : 'Owner removed',
              undo: { ownerId: goal.ownerId },
            })
          }
          trigger={
            <button type="button" className={cn(valueCls, !owner && 'text-ink-3')} aria-label={owner ? `Owner: ${owner.name}` : 'Set owner'}>
              <Avatar person={owner} size={18} />
              <span className="truncate">{owner?.name ?? 'Choose an owner'}</span>
            </button>
          }
        />
      </FactRow>
      <FactRow label="Target">
        <DatePicker
          label="Target date"
          presets="target"
          value={goal.targetDate}
          onChange={v =>
            v !== goal.targetDate &&
            void actions.update(goal, { targetDate: v }, {
              success: v ? `Target set to ${shortDate(v)}` : 'Target date removed',
              undo: { targetDate: goal.targetDate },
            })
          }
          trigger={
            <button type="button" className={cn(valueCls, 'tabular', !goal.targetDate && 'text-ink-3', late && 'font-medium text-danger')} aria-label="Target date">
              {goal.targetDate ? shortDate(goal.targetDate) : 'Set target'}
              {goal.targetDate && hint && status !== 'Completed' && <span className={cn('font-normal', late ? 'text-danger' : 'text-ink-3')}>· {hint.toLowerCase()}</span>}
            </button>
          }
        />
      </FactRow>
      <FactRow label="Health">
        {loading ? (
          <Skeleton className="h-3.5 w-28" />
        ) : (
          <Tooltip content="Rolled up from the latest check-in on each active project">
            <span className="inline-flex h-7 min-w-0 cursor-default items-center">
              <HealthDots rollup={rollup} />
            </span>
          </Tooltip>
        )}
      </FactRow>
    </Card>
  );
}

function StatTile({ label, value, hint, children }: { label: string; value: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <Card className="flex min-w-0 flex-col px-4 pb-3.5 pt-3.5 sm:px-5">
      <div className="truncate text-micro font-semibold uppercase text-ink-3">{label}</div>
      <div className="tabular mt-1.5 truncate font-display text-display text-ink">{value}</div>
      {children}
      {hint != null && <div className="mt-1 truncate text-meta text-ink-2">{hint}</div>}
    </Card>
  );
}

export function GoalStatTiles({ rollup: r, count, loading }: { rollup: Rollup; count: number; loading: boolean }) {
  const pct = Math.round(r.progress * 100);
  const troubled = r.health['At Risk'] + r.health['Off Track'];
  const open = Math.max(0, r.total - r.completed - r.canceled);
  const skeleton = <Skeleton className="my-1 h-7 w-16" />;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatTile
        label="Projects"
        value={count}
        hint={loading ? <Skeleton className="h-3 w-28" /> : `${r.byStatus['In Progress'] ?? 0} in flight · ${r.byStatus.Completed ?? 0} completed`}
      />
      <StatTile label="Overall progress" value={loading ? skeleton : `${pct}%`}>
        {!loading && <ProgressBar value={pct} height={5} className="mb-0.5 mt-2" tone={pct >= 100 ? 'success' : 'ink'} />}
      </StatTile>
      <StatTile
        label="Issues done"
        value={
          loading ? skeleton : (
            <>
              {r.completed}
              <span className="text-[22px] text-ink-3"> / {r.total}</span>
            </>
          )
        }
        hint={loading ? <Skeleton className="h-3 w-24" /> : r.total === 0 ? 'No issues yet' : [open ? `${open} open` : 'None open', r.canceled ? `${r.canceled} canceled` : null].filter(Boolean).join(' · ')}
      />
      <StatTile
        label="At risk or off track"
        value={loading ? skeleton : <span className={cn(troubled > 0 && (r.health['Off Track'] ? 'text-danger' : 'text-warning'))}>{troubled}</span>}
        hint={
          loading ? (
            <Skeleton className="h-3 w-28" />
          ) : troubled === 0 ? (
            r.active ? (r.health['On Track'] ? 'Every checked-in project is on track' : 'No check-ins yet') : 'No active projects'
          ) : (
            <span className="flex items-center gap-2.5">
              {(['Off Track', 'At Risk'] as const).filter(k => r.health[k] > 0).map(k => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', HEALTH[k].dot)} />
                  {r.health[k]} {HEALTH[k].label.toLowerCase()}
                </span>
              ))}
              {r.active - troubled > 0 && <span className="text-ink-3">of {r.active} active</span>}
            </span>
          )
        }
      />
    </div>
  );
}
