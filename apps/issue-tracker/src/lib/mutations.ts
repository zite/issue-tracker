import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  bulkUpdateIssues,
  createIssue,
  deleteIssues,
  moveIssue,
  setIssueLabels,
  togglePin,
  updateIssue,
  type CreateIssueInputType,
} from 'zitejs/api';
import { errorMessage } from './errors';
import { qk } from './queries';
import type { Issue, IssueDetail, IssueList, IssuePatch, StatusType } from './types';
import { useWorkspace, type Workspace } from './workspace';

/**
 * Issue writes, optimistic everywhere.
 *
 * An edit is written into EVERY cached list and detail that holds the issue
 * before the request leaves, so a status change is instant on the list, the
 * board and the open issue at once. On failure every snapshot is restored. On
 * success the server's row replaces the guess, and list membership (an issue
 * that no longer matches a filter) catches up on a short debounce — batching a
 * burst of keyboard edits into one refetch rather than one per keystroke.
 */

type Snapshot = Array<[readonly unknown[], unknown]>;

function snapshot(qc: QueryClient): Snapshot {
  return [...qc.getQueriesData({ queryKey: qk.issuesRoot }), ...qc.getQueriesData({ queryKey: qk.issueRoot })];
}

function restore(qc: QueryClient, snap: Snapshot) {
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

export function patchIssueCaches(qc: QueryClient, ids: Set<string>, fn: (issue: Issue) => Issue) {
  qc.setQueriesData<IssueList>({ queryKey: qk.issuesRoot }, old =>
    old ? { ...old, issues: old.issues.map(i => (ids.has(i.id) ? fn(i) : i)) } : old,
  );
  qc.setQueriesData<IssueDetail>({ queryKey: qk.issueRoot }, old => {
    if (!old?.issue) return old;
    const touchesIssue = ids.has(old.issue.id);
    const touchesSubs = old.subIssues.some(s => ids.has(s.id));
    if (!touchesIssue && !touchesSubs) return old;
    return {
      ...old,
      issue: touchesIssue ? fn(old.issue) : old.issue,
      subIssues: touchesSubs ? old.subIssues.map(s => (ids.has(s.id) ? fn(s) : s)) : old.subIssues,
    };
  });
}

function removeFromCaches(qc: QueryClient, ids: Set<string>) {
  qc.setQueriesData<IssueList>({ queryKey: qk.issuesRoot }, old =>
    old ? { ...old, issues: old.issues.filter(i => !ids.has(i.id)), total: Math.max(0, old.total - ids.size) } : old,
  );
}

const timers = new Map<string, number>();
/** Refetch after a quiet period — many quick edits become one round trip. */
export function refreshSoon(qc: QueryClient, keys: Array<readonly unknown[]>, delay = 1200) {
  for (const key of keys) {
    const id = JSON.stringify(key);
    window.clearTimeout(timers.get(id));
    timers.set(
      id,
      window.setTimeout(() => {
        timers.delete(id);
        qc.invalidateQueries({ queryKey: key });
      }, delay),
    );
  }
}

function applyPatch(ws: Workspace, issue: Issue, patch: IssuePatch): Issue {
  const next: Issue = { ...issue, ...patch, updatedAt: new Date().toISOString() } as Issue;
  if (patch.statusId !== undefined) {
    const type = ws.statusById.get(patch.statusId ?? '')?.type;
    const now = new Date().toISOString();
    if (type === 'completed') Object.assign(next, { completedAt: issue.completedAt ?? now, startedAt: issue.startedAt ?? now, canceledAt: null });
    else if (type === 'canceled') Object.assign(next, { canceledAt: now, completedAt: null });
    else if (type === 'started') Object.assign(next, { startedAt: issue.startedAt ?? now, completedAt: null, canceledAt: null });
    else Object.assign(next, { startedAt: null, completedAt: null, canceledAt: null });
  }
  if (patch.projectId !== undefined && patch.projectId !== issue.projectId && patch.milestoneId === undefined) next.milestoneId = null;
  if (patch.parentId !== undefined) {
    next.parentIdentifier = null;
    next.parentTitle = null;
  }
  return next;
}

export function useIssueActions() {
  const qc = useQueryClient();
  const ws = useWorkspace();

  const settle = useCallback(
    (identifiers: string[] = []) => {
      // The list and an open sprint's scoreboard follow quickly; workspace-wide counts can wait a beat longer.
      refreshSoon(qc, [qk.issuesRoot, ['sprint'], ...identifiers.map(id => qk.issue(id))], 900);
      refreshSoon(qc, [qk.bootstrap, qk.projects, ['sprints']], 2000);
    },
    [qc],
  );

  const update = useCallback(
    async (issue: Pick<Issue, 'id' | 'identifier'>, patch: IssuePatch, opts: { quiet?: boolean } = {}) => {
      await qc.cancelQueries({ queryKey: qk.issuesRoot });
      const snap = snapshot(qc);
      patchIssueCaches(qc, new Set([issue.id]), i => applyPatch(ws, i, patch));
      try {
        const res = await updateIssue({ id: issue.id, ...patch });
        patchIssueCaches(qc, new Set([issue.id]), i => ({ ...res.issue, parentIdentifier: res.issue.parentIdentifier ?? i.parentIdentifier }));
        settle([issue.identifier]);
        return res.issue;
      } catch (e) {
        restore(qc, snap);
        if (!opts.quiet) toast.error(errorMessage(e, `Couldn't update ${issue.identifier}`));
        throw e;
      }
    },
    [qc, ws, settle],
  );

  const bulkUpdate = useCallback(
    async (
      issues: Issue[],
      patch: IssuePatch & { statusType?: StatusType; addLabelIds?: string[]; removeLabelIds?: string[] },
      opts: { toastMessage?: string } = {},
    ) => {
      if (issues.length === 0) return;
      await qc.cancelQueries({ queryKey: qk.issuesRoot });
      const snap = snapshot(qc);
      const byId = new Map(issues.map(i => [i.id, i]));
      patchIssueCaches(qc, new Set(byId.keys()), i => {
        const { statusType, addLabelIds, removeLabelIds, ...rest } = patch;
        const p: IssuePatch = { ...rest };
        if (statusType) p.statusId = ws.statusFor(i.teamId, statusType)?.id ?? i.statusId ?? undefined;
        if (p.statusId && ws.statusById.get(p.statusId)?.teamId !== i.teamId) {
          const type = ws.statusById.get(p.statusId)?.type;
          p.statusId = (type && ws.statusFor(i.teamId, type)?.id) || i.statusId || undefined;
        }
        if (p.sprintId && ws.sprintById.get(p.sprintId)?.teamId !== i.teamId) delete p.sprintId;
        let next = applyPatch(ws, i, p);
        if (addLabelIds || removeLabelIds) {
          const set = new Set(next.labelIds);
          addLabelIds?.forEach(l => set.add(l));
          removeLabelIds?.forEach(l => set.delete(l));
          next = { ...next, labelIds: [...set] };
        }
        return next;
      });
      try {
        const { statusId, ...rest } = patch;
        // Status is per team; across teams the server maps a state TYPE to each team's own state.
        const teams = new Set(issues.map(i => i.teamId));
        const statePart = statusId
          ? teams.size > 1 ? { statusType: ws.statusById.get(statusId)?.type as StatusType } : { statusId }
          : {};
        await bulkUpdateIssues({ ids: [...byId.keys()], ...rest, ...statePart } as never);
        settle(issues.map(i => i.identifier));
        if (opts.toastMessage) toast.success(opts.toastMessage);
      } catch (e) {
        restore(qc, snap);
        toast.error(errorMessage(e, `Couldn't update ${issues.length} issues`));
      }
    },
    [qc, ws, settle],
  );

  const move = useCallback(
    async (
      issue: Issue,
      args: {
        prevId?: string | null; nextId?: string | null; columnIds?: string[];
        statusId?: string; assigneeId?: string | null; priority?: number; projectId?: string | null; sprintId?: string | null;
      },
      optimisticPosition: number,
    ) => {
      await qc.cancelQueries({ queryKey: qk.issuesRoot });
      const snap = snapshot(qc);
      const { prevId, nextId, columnIds, ...props } = args;
      patchIssueCaches(qc, new Set([issue.id]), i => ({ ...applyPatch(ws, i, props as IssuePatch), position: optimisticPosition }));
      try {
        const res = await moveIssue({ id: issue.id, prevId, nextId, columnIds, ...props });
        patchIssueCaches(qc, new Set([issue.id]), () => res.issue);
        if (res.renormalized) qc.invalidateQueries({ queryKey: qk.issuesRoot });
        else settle([issue.identifier]);
      } catch (e) {
        restore(qc, snap);
        toast.error(errorMessage(e, `Couldn't move ${issue.identifier}`));
      }
    },
    [qc, ws, settle],
  );

  const setLabels = useCallback(
    async (issue: Pick<Issue, 'id' | 'identifier'>, labelIds: string[]) => {
      const snap = snapshot(qc);
      patchIssueCaches(qc, new Set([issue.id]), i => ({ ...i, labelIds }));
      try {
        await setIssueLabels({ issueId: issue.id, labelIds });
        settle([issue.identifier]);
      } catch (e) {
        restore(qc, snap);
        toast.error(errorMessage(e, "Couldn't update labels"));
      }
    },
    [qc, settle],
  );

  const archive = useCallback(
    async (issues: Issue[], archived = true) => {
      if (!issues.length) return;
      const snap = snapshot(qc);
      const ids = new Set(issues.map(i => i.id));
      if (archived) removeFromCaches(qc, ids);
      else patchIssueCaches(qc, ids, i => ({ ...i, archived: false }));
      try {
        if (issues.length === 1) await updateIssue({ id: issues[0].id, archived });
        else await bulkUpdateIssues({ ids: [...ids], archived });
        settle(issues.map(i => i.identifier));
        const what = issues.length === 1 ? issues[0].identifier : `${issues.length} issues`;
        toast.success(archived ? `Archived ${what}` : `Restored ${what}`, {
          action: archived
            ? {
                label: 'Undo',
                onClick: async () => {
                  restore(qc, snap);
                  if (issues.length === 1) await updateIssue({ id: issues[0].id, archived: false });
                  else await bulkUpdateIssues({ ids: [...ids], archived: false });
                  qc.invalidateQueries({ queryKey: qk.issuesRoot });
                },
              }
            : undefined,
        });
      } catch (e) {
        restore(qc, snap);
        toast.error(errorMessage(e, "Couldn't archive"));
      }
    },
    [qc, settle],
  );

  const remove = useCallback(
    async (issues: Array<Pick<Issue, 'id' | 'identifier'>>) => {
      if (!issues.length) return false;
      const snap = snapshot(qc);
      const ids = new Set(issues.map(i => i.id));
      removeFromCaches(qc, ids);
      try {
        await deleteIssues({ ids: [...ids] });
        settle();
        toast.success(issues.length === 1 ? `Deleted ${issues[0].identifier}` : `Deleted ${issues.length} issues`);
        return true;
      } catch (e) {
        restore(qc, snap);
        toast.error(errorMessage(e, "Couldn't delete"));
        return false;
      }
    },
    [qc, settle],
  );

  const create = useCallback(
    async (input: CreateIssueInputType) => {
      const res = await createIssue(input);
      qc.invalidateQueries({ queryKey: qk.issuesRoot });
      if (input.parentId) qc.invalidateQueries({ queryKey: qk.issueRoot });
      refreshSoon(qc, [qk.bootstrap, qk.projects, ['sprints'], ['sprint']], 1500);
      return res.issue;
    },
    [qc],
  );

  return useMemo(() => ({ update, bulkUpdate, move, setLabels, archive, remove, create }), [update, bulkUpdate, move, setLabels, archive, remove, create]);
}

export function usePinToggle() {
  const qc = useQueryClient();
  return useCallback(
    async (entityType: 'Project' | 'View' | 'Sprint' | 'Issue' | 'Team' | 'Goal', entityId: string, pinned: boolean) => {
      qc.setQueryData(qk.bootstrap, (old: any) =>
        old
          ? {
              ...old,
              pins: pinned
                ? [...old.pins, { id: `tmp-${entityId}`, entityType, entityId, position: 9999, issueIdentifier: null, issueTitle: null }]
                : old.pins.filter((f: any) => !(f.entityType === entityType && f.entityId === entityId)),
            }
          : old,
      );
      try {
        // No success toast: the pin itself changes on screen.
        await togglePin({ entityType, entityId, pinned });
      } catch {
        toast.error('Couldn’t update your pins');
      } finally {
        qc.invalidateQueries({ queryKey: qk.bootstrap });
      }
    },
    [qc],
  );
}
