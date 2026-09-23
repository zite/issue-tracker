import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { saveGoal, type ListProjectsOutputType, type SaveGoalInputType } from 'zitejs/api';
import { useAppActions, type AppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { refreshSoon } from '../../lib/mutations';
import { qk } from '../../lib/queries';
import type { Bootstrap, Goal } from '../../lib/types';

export type GoalPatch = Omit<SaveGoalInputType, 'id' | 'remove'>;
type Ref = Pick<Goal, 'id' | 'name'>;
type UpdateOptions = { success?: string; quiet?: boolean; undo?: GoalPatch };

// A membership write replaces the whole set of projects on the server, so two must never interleave.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

function patchCaches(qc: QueryClient, id: string, patch: GoalPatch) {
  const { projectIds, ...fields } = patch;
  qc.setQueryData<Bootstrap>(qk.bootstrap, old => (old ? { ...old, goals: old.goals.map(g => (g.id === id ? { ...g, ...fields } : g)) } : old));
  if (!projectIds) return;
  const want = new Set(projectIds);
  const apply = <T extends { id: string; goalId: string | null }>(p: T): T =>
    want.has(p.id) ? (p.goalId === id ? p : { ...p, goalId: id }) : p.goalId === id ? { ...p, goalId: null } : p;
  qc.setQueryData<Bootstrap>(qk.bootstrap, old => (old ? { ...old, projects: old.projects.map(apply) } : old));
  qc.setQueryData<ListProjectsOutputType>(qk.projects, old => (old ? { ...old, projects: old.projects.map(apply) } : old));
}

/** Optimistic. Resolves true on success; a failure restores both caches and toasts unless `quiet`. */
async function update(qc: QueryClient, goal: Ref, patch: GoalPatch, opts: UpdateOptions = {}): Promise<boolean> {
  const snapBootstrap = qc.getQueryData(qk.bootstrap);
  const snapProjects = qc.getQueryData(qk.projects);
  patchCaches(qc, goal.id, patch);
  try {
    await serial(() => saveGoal({ id: goal.id, ...patch }));
    if (opts.success) {
      const undo = opts.undo;
      toast.success(opts.success, undo ? { action: { label: 'Undo', onClick: () => void update(qc, goal, undo) } } : undefined);
    }
    return true;
  } catch (e) {
    qc.setQueryData(qk.bootstrap, snapBootstrap);
    qc.setQueryData(qk.projects, snapProjects);
    if (!opts.quiet) toast.error(errorMessage(e, `Couldn’t update ${goal.name}`));
    return false;
  } finally {
    refreshSoon(qc, [qk.bootstrap, qk.projects], 900);
  }
}

async function create(qc: QueryClient, input: GoalPatch & { name: string }): Promise<string | null> {
  try {
    const res = await serial(() => saveGoal(input));
    // Wait for the workspace to include it, so the page we open can find it.
    await qc.invalidateQueries({ queryKey: qk.bootstrap });
    void qc.invalidateQueries({ queryKey: qk.projects });
    toast.success(`Created ${input.name}`);
    return res.id;
  } catch (e) {
    toast.error(errorMessage(e, 'Couldn’t create the goal'));
    return null;
  }
}

async function remove(qc: QueryClient, app: AppActions, goal: Ref, onDeleted?: () => void): Promise<boolean> {
  const ok = await app.confirm({
    title: `Delete “${goal.name}”?`,
    description: 'Its projects stay — they just leave the goal. The goal and its description are gone for good.',
    confirmLabel: 'Delete goal',
    destructive: true,
  });
  if (!ok) return false;
  try {
    // Confirmed by the server first: a failed delete leaves you where you were, with the goal intact.
    await serial(() => saveGoal({ id: goal.id, remove: true }));
  } catch (e) {
    toast.error(errorMessage(e, `Couldn’t delete ${goal.name}`));
    return false;
  }
  // Leave the goal's page before it disappears from under it.
  onDeleted?.();
  const detach = <T extends { goalId: string | null }>(p: T): T => (p.goalId === goal.id ? { ...p, goalId: null } : p);
  qc.setQueryData<Bootstrap>(qk.bootstrap, old =>
    old
      ? {
          ...old,
          goals: old.goals.filter(g => g.id !== goal.id),
          projects: old.projects.map(detach),
          pins: old.pins.filter(p => !(p.entityType === 'Goal' && p.entityId === goal.id)),
        }
      : old,
  );
  qc.setQueryData<ListProjectsOutputType>(qk.projects, old => (old ? { ...old, projects: old.projects.map(detach) } : old));
  toast.success(`Deleted ${goal.name}`);
  void qc.invalidateQueries({ queryKey: qk.bootstrap });
  void qc.invalidateQueries({ queryKey: qk.projects });
  return true;
}

export function useGoalActions() {
  const qc = useQueryClient();
  const app = useAppActions();
  return useMemo(
    () => ({
      update: (goal: Ref, patch: GoalPatch, opts?: UpdateOptions) => update(qc, goal, patch, opts),
      setProjects: (goal: Ref, projectIds: string[], opts?: { success?: string; undoTo?: string[] }) =>
        update(qc, goal, { projectIds }, { success: opts?.success, undo: opts?.undoTo ? { projectIds: opts.undoTo } : undefined }),
      create: (input: GoalPatch & { name: string }) => create(qc, input),
      remove: (goal: Ref, onDeleted?: () => void) => remove(qc, app, goal, onDeleted),
    }),
    [qc, app],
  );
}

export function goalUrl(id: string) {
  return `${window.location.origin}${window.location.pathname}#/goal/${id}`;
}
