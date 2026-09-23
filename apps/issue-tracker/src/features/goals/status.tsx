import { StatusGlyph } from '../../glyphs';
import { GOAL_STATUSES } from '../../lib/constants';
import type { Option } from '../../pickers/OptionPicker';
import { Badge, type Tone } from '../../ui/Chip';

export type GoalStatus = (typeof GOAL_STATUSES)[number];
export const isGoalStatus = (v: unknown): v is GoalStatus => (GOAL_STATUSES as readonly unknown[]).includes(v);
export const toGoalStatus = (v: unknown): GoalStatus => (isGoalStatus(v) ? v : 'Planned');

const TONE: Record<GoalStatus, Tone> = { Planned: 'neutral', Active: 'highlight', Completed: 'success' };

/** Goals speak the same ledger-box language as issues: empty (planned), filling (active), ticked (completed). */
const AS_STATUS: Record<GoalStatus, { type: string; name: string }> = {
  Planned: { type: 'unstarted', name: 'Planned' },
  Active: { type: 'started', name: 'Active' },
  Completed: { type: 'completed', name: 'Completed' },
};

export function GoalStatusGlyph({ status, size = 14, className }: { status: string; size?: number; className?: string }) {
  return <StatusGlyph status={AS_STATUS[toGoalStatus(status)]} size={size} className={className} />;
}

export function GoalStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = toGoalStatus(status);
  return (
    <Badge tone={TONE[s]} className={className}>
      {s}
    </Badge>
  );
}

export const goalStatusOptions: Option<GoalStatus>[] = GOAL_STATUSES.map((s, i) => ({
  value: s,
  label: s,
  icon: <GoalStatusGlyph status={s} />,
  shortcut: String(i + 1),
}));
