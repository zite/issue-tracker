import { Plus, Target } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GoalCard } from '../features/goals/GoalCard';
import { GoalDialog } from '../features/goals/GoalDialog';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { GOAL_STATUSES } from '../lib/constants';
import { useProjects } from '../lib/queries';
import type { Goal, ProjectSummary } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import { Button } from '../ui/Button';
import { EmptyState, PageBody, PageHeader } from '../ui/Layout';
import { Tabs } from '../ui/Tabs';

type Filter = 'all' | (typeof GOAL_STATUSES)[number];
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'Active', label: 'Active' },
  { value: 'Planned', label: 'Planned' },
  { value: 'Completed', label: 'Completed' },
];
const toFilter = (v: string | null): Filter => (FILTERS.some(f => f.value === v) ? (v as Filter) : 'all');

const EMPTY: Record<Filter, { title: string; body: string }> = {
  all: { title: 'Set your first goal', body: 'A goal is something the company is working toward. Group the projects that get you there to follow their progress and health in one place.' },
  Active: { title: 'No active goals', body: 'Goals the company is working toward right now show up here.' },
  Planned: { title: 'Nothing planned', body: 'Goals you’ve agreed on but haven’t started show up here.' },
  Completed: { title: 'No completed goals yet', body: 'Goals you mark as completed show up here — a record of what got done.' },
};

export function GoalsPage() {
  useDocumentTitle('Goals');
  const ws = useWorkspace();
  const [params, setParams] = useSearchParams();
  const filter = toFilter(params.get('status'));
  const { data, isPending } = useProjects();
  const [dialog, setDialog] = useState<{ open: boolean; goal: Goal | null }>({ open: false, goal: null });

  // `/goals?new=1` opens the dialog — the command palette and other pages link here.
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setDialog({ open: true, goal: null });
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const byGoal = useMemo(() => {
    const m = new Map<string, ProjectSummary[]>();
    for (const p of data?.projects ?? []) {
      if (!p.goalId) continue;
      if (!m.has(p.goalId)) m.set(p.goalId, []);
      m.get(p.goalId)!.push(p);
    }
    return m;
  }, [data]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: ws.goals.length, Active: 0, Planned: 0, Completed: 0 };
    for (const g of ws.goals) if (g.status in c) c[g.status as Filter] += 1;
    return c;
  }, [ws.goals]);

  const list = filter === 'all' ? ws.goals : ws.goals.filter(g => g.status === filter);
  const setFilter = (f: string) => setParams(f === 'all' ? {} : { status: f }, { replace: true });
  const openNew = () => setDialog({ open: true, goal: null });

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <Target size={15} weight="bold" className="text-ink-3" />
            <span className="font-medium text-ink">Company-wide</span>
          </>
        }
        title="Goals"
        description="What the company is working toward, and the projects that get it there."
        actions={
          <Button variant="primary" leading={<Plus size={14} weight="bold" />} onClick={openNew}>
            New goal
          </Button>
        }
        tabs={<Tabs items={FILTERS.map(f => ({ value: f.value, label: f.label, count: counts[f.value] }))} value={filter} onChange={setFilter} />}
      />

      <PageBody className="pb-16">
        {list.length === 0 ? (
          <EmptyState
            icon={<Target size={22} weight="duotone" />}
            title={EMPTY[filter].title}
            actions={
              filter === 'all' ? (
                <Button variant="primary" leading={<Plus size={14} weight="bold" />} onClick={openNew}>
                  New goal
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setFilter('all')}>
                  Show all goals
                </Button>
              )
            }
          >
            {EMPTY[filter].body}
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {list.map(g => (
              <GoalCard key={g.id} goal={g} projects={byGoal.get(g.id) ?? []} loading={isPending} onEdit={() => setDialog({ open: true, goal: g })} />
            ))}
          </div>
        )}
      </PageBody>

      <GoalDialog open={dialog.open} goal={dialog.goal} onOpenChange={open => setDialog(d => ({ ...d, open }))} />
    </div>
  );
}
