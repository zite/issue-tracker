import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { saveSprint } from 'zitejs/api';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { plural } from '../../lib/format';
import { qk } from '../../lib/queries';
import type { Bootstrap, SprintSummary } from '../../lib/types';

/** Sprint writes share one refresh: the reference data, every sprint list, the open sprint and any issue rows naming a sprint. */
export function useSprintActions() {
  const qc = useQueryClient();
  const app = useAppActions();

  const refresh = useCallback(
    async (sprintIds: Array<string | null | undefined> = [], opts: { issues?: boolean } = {}) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.bootstrap }),
        qc.invalidateQueries({ queryKey: ['sprints'] }),
        ...sprintIds.filter((id): id is string => Boolean(id)).map(id => qc.invalidateQueries({ queryKey: qk.sprint(id) })),
        opts.issues ? qc.invalidateQueries({ queryKey: qk.issuesRoot }) : Promise.resolve(),
      ]);
    },
    [qc],
  );

  /** Resolves true once deleted; callers on the sprint's own page navigate away. */
  const remove = useCallback(
    async (sprint: { id: string; teamId: string | null; name: string }, issueCount?: number) => {
      if (!sprint.teamId) return false;
      const ok = await app.confirm({
        title: `Delete ${sprint.name}?`,
        description:
          issueCount === 0
            ? 'It has no issues. This can’t be undone.'
            : `${issueCount == null ? 'Its issues' : plural(issueCount, 'issue')} will become unscheduled — they keep their status and stay with the team. This can’t be undone.`,
        confirmLabel: 'Delete sprint',
        destructive: true,
      });
      if (!ok) return false;

      // Optimistic: the row leaves every list at once; restored if the server refuses.
      const lists = qc.getQueriesData<{ sprints: SprintSummary[] }>({ queryKey: ['sprints'] });
      const boot = qc.getQueryData<Bootstrap>(qk.bootstrap);
      qc.setQueriesData<{ sprints: SprintSummary[] }>({ queryKey: ['sprints'] }, old => (old ? { ...old, sprints: old.sprints.filter(s => s.id !== sprint.id) } : old));
      try {
        await saveSprint({ id: sprint.id, teamId: sprint.teamId, remove: true });
        if (boot) qc.setQueryData<Bootstrap>(qk.bootstrap, { ...boot, sprints: boot.sprints.filter(s => s.id !== sprint.id) });
        // After the caller has had a tick to navigate off the page that observes it.
        window.setTimeout(() => qc.removeQueries({ queryKey: qk.sprint(sprint.id) }), 0);
        toast.success(`Deleted ${sprint.name}`);
        refresh([], { issues: true });
        return true;
      } catch (e) {
        for (const [key, data] of lists) qc.setQueryData(key, data);
        toast.error(errorMessage(e, `Couldn’t delete ${sprint.name}`));
        return false;
      }
    },
    [app, qc, refresh],
  );

  return useMemo(() => ({ refresh, remove }), [refresh, remove]);
}
