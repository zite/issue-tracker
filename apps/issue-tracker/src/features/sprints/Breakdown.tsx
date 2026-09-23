import { Prohibit, Tag, X } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { Mark } from '../../glyphs';
import { percent } from '../../lib/format';
import type { SprintDetail } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Avatar, Unassigned } from '../../ui/Avatar';
import { Swatch } from '../../ui/Chip';
import { cn } from '../../ui/cn';
import { Card } from '../../ui/Layout';
import { Tabs } from '../../ui/Tabs';
import { CardHeader } from './CardHeader';
import { fmtPts } from './sprint-utils';

type Row = SprintDetail['byAssignee'][number];
type Tab = 'people' | 'labels' | 'projects';

/** A slice of the sprint the issue list below is narrowed to. `value` 'none' matches unset. */
export type BreakdownFocus = { field: 'assigneeIds' | 'labelIds' | 'projectIds'; value: string; label: string };

const TABS: Array<{ key: Tab; label: string; field: BreakdownFocus['field'] }> = [
  { key: 'people', label: 'People', field: 'assigneeIds' },
  { key: 'labels', label: 'Labels', field: 'labelIds' },
  { key: 'projects', label: 'Projects', field: 'projectIds' },
];

const COLLAPSED_ROWS = 8;

function useDescribe() {
  const ws = useWorkspace();
  return (field: BreakdownFocus['field'], id: string | null, size = 20): { label: string; icon: ReactNode; muted: boolean } => {
    if (field === 'assigneeIds') {
      if (!id) return { label: 'Unassigned', icon: <Unassigned size={size} />, muted: true };
      const m = ws.memberById.get(id);
      return { label: m?.name ?? 'Former member', icon: <Avatar person={m} size={size} />, muted: false };
    }
    if (field === 'labelIds') {
      if (!id) return { label: 'No label', icon: <Tag size={size - 5} className="text-ink-3" />, muted: true };
      const l = ws.labelById.get(id);
      return { label: l?.name ?? 'Deleted label', icon: <Swatch color={l?.color ?? '#8A8275'} size={size - 10} />, muted: false };
    }
    if (!id) return { label: 'No project', icon: <Prohibit size={size - 5} className="text-ink-3" />, muted: true };
    const p = ws.projectById.get(id);
    return { label: p?.name ?? 'Deleted project', icon: <Mark icon={p?.icon} color={p?.color} name={p?.name} size={size} />, muted: false };
  };
}

export function Breakdown({ detail, focus, onFocus, className }: {
  detail: SprintDetail;
  focus: BreakdownFocus | null;
  onFocus: (focus: BreakdownFocus | null) => void;
  className?: string;
}) {
  const describe = useDescribe();
  const [tab, setTab] = useState<Tab>(() => (focus?.field === 'labelIds' ? 'labels' : focus?.field === 'projectIds' ? 'projects' : 'people'));
  const [expanded, setExpanded] = useState(false);
  const current = TABS.find(t => t.key === tab)!;
  const rows: Row[] = tab === 'people' ? detail.byAssignee : tab === 'labels' ? detail.byLabel : detail.byProject;
  const shown = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);
  const counts = { people: detail.byAssignee.length, labels: detail.byLabel.filter(r => r.id).length, projects: detail.byProject.filter(r => r.id).length };

  return (
    <Card as="section" className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader title="Breakdown" note="Click a row to narrow the issues below" className="pb-1" />
      <Tabs
        className="border-b border-line px-5"
        value={tab}
        onChange={v => {
          setTab(v as Tab);
          setExpanded(false);
        }}
        items={TABS.map(t => ({ value: t.key, label: t.label, count: counts[t.key] }))}
      />
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-ui text-ink-3">No issues in this sprint yet.</p>
      ) : (
        <div className="flex flex-col py-1.5">
          <div className="hidden h-7 grid-cols-[minmax(0,1fr)_132px_minmax(90px,200px)_40px] items-center gap-4 px-5 text-micro font-semibold uppercase text-ink-3 sm:grid">
            <span>{current.label === 'People' ? 'Person' : current.label === 'Labels' ? 'Label' : 'Project'}</span>
            <span className="text-right">Done / scope</span>
            <span>Progress</span>
            <span className="text-right">%</span>
          </div>
          {shown.map(row => {
            const { label, icon, muted } = describe(current.field, row.id);
            const value = row.id ?? 'none';
            const active = focus?.field === current.field && focus.value === value;
            const pct = percent(row.completedPoints, row.points);
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                title={active ? 'Show all issues below' : `Narrow the issues below to ${label}`}
                onClick={() => onFocus(active ? null : { field: current.field, value, label })}
                className={cn(
                  'group grid min-h-10 w-full grid-cols-[minmax(0,1fr)_auto_36px] items-center gap-4 px-5 py-1.5 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_132px_minmax(90px,200px)_40px]',
                  active ? 'bg-highlight/25 dark:bg-highlight/10' : 'hover:bg-hover/60',
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex w-5 shrink-0 justify-center">{icon}</span>
                  <span className={cn('truncate text-ui', muted ? 'text-ink-2' : 'text-ink', active && 'font-semibold')}>{label}</span>
                  {active && <X size={12} weight="bold" className="shrink-0 text-ink-2" aria-hidden />}
                </span>
                <span className="tabular text-right text-meta text-ink-3">
                  <span className="text-ui font-medium text-ink">{fmtPts(row.completedPoints)}</span> / {fmtPts(row.points)} pts
                  <span className="hidden sm:inline">
                    {' '}· {row.completed}/{row.total}
                  </span>
                </span>
                <span className="hidden h-1.5 overflow-hidden rounded-full bg-sunken sm:block">
                  <span className="block h-full rounded-full bg-success" style={{ width: `${row.points ? (row.completedPoints / row.points) * 100 : 0}%` }} />
                </span>
                <span className="tabular text-right text-meta text-ink-2">{pct}%</span>
              </button>
            );
          })}
          {rows.length > COLLAPSED_ROWS && (
            <button type="button" onClick={() => setExpanded(e => !e)} className="mx-5 mt-1 h-8 w-fit text-ui font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
              {expanded ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
          {tab === 'labels' && <p className="px-5 pb-1 pt-2 text-meta text-ink-3">An issue with several labels counts under each.</p>}
        </div>
      )}
    </Card>
  );
}

/** The breakdown slice currently narrowing the issue list, as a removable chip. */
export function FocusChip({ focus, onClear }: { focus: BreakdownFocus; onClear: () => void }) {
  const describe = useDescribe();
  const { icon } = describe(focus.field, focus.value === 'none' ? null : focus.value, 16);
  const kind = focus.field === 'assigneeIds' ? 'Person' : focus.field === 'labelIds' ? 'Label' : 'Project';
  return (
    <span className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full bg-highlight/35 pl-1.5 pr-1 text-ui text-ink ring-1 ring-inset ring-highlight animate-pop-in dark:bg-highlight/15">
      <span className="flex w-4 justify-center">{icon}</span>
      <span className="text-ink-2">{kind}:</span>
      <span className="max-w-[160px] truncate font-medium">{focus.label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Stop narrowing to ${focus.label}`}
        className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-ink-2 hover:bg-card hover:text-ink"
      >
        <X size={11} weight="bold" />
      </button>
    </span>
  );
}
