import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { saveProject, type ListProjectsOutputType, type SaveProjectInputType } from 'zitejs/api';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { refreshSoon } from '../../lib/mutations';
import { qk } from '../../lib/queries';
import type { Bootstrap, ProjectDetail } from '../../lib/types';
import type { ProjectPatch } from './model';

/**
 * Project writes. Property edits are optimistic across the three caches that
 * show a project — the list rollups, the open project and the bootstrap refs
 * the pickers and pins read — and roll back together if the save fails.
 */
export function useProjectActions() {
  const qc = useQueryClient();
  const app = useAppActions();

  const patchCaches = useCallback(
    (id: string, patch: ProjectPatch) => {
      const now = new Date().toISOString();
      const { description, ...shared } = patch;
      // Completion is a fact about time: stamped once, cleared if the project reopens.
      const completion = (prev: string | null) => (patch.status === undefined ? prev : patch.status === 'Completed' ? prev ?? now : null);

      qc.setQueryData<ListProjectsOutputType>(qk.projects, old =>
        old ? { ...old, projects: old.projects.map(p => (p.id === id ? { ...p, ...shared, completedAt: completion(p.completedAt) } : p)) } : old,
      );
      qc.setQueryData<ProjectDetail>(qk.project(id), old =>
        old
          ? {
              ...old,
              project: {
                ...old.project,
                ...shared,
                ...(description !== undefined ? { description: description ?? '' } : {}),
                completedAt: completion(old.project.completedAt),
              },
            }
          : old,
      );
      qc.setQueryData<Bootstrap>(qk.bootstrap, old => (old ? { ...old, projects: old.projects.map(p => (p.id === id ? { ...p, ...shared } : p)) } : old));
    },
    [qc],
  );

  const update = useCallback(
    async (id: string, patch: ProjectPatch, opts: { quiet?: boolean } = {}) => {
      await Promise.all([qc.cancelQueries({ queryKey: qk.projects }), qc.cancelQueries({ queryKey: qk.project(id) })]);
      const snap = { projects: qc.getQueryData(qk.projects), project: qc.getQueryData(qk.project(id)), bootstrap: qc.getQueryData(qk.bootstrap) };
      patchCaches(id, patch);
      try {
        await saveProject({ id, ...patch });
        // A burst of edits (retyping a name, walking dates) becomes one refetch.
        refreshSoon(qc, [qk.projects, qk.project(id), qk.bootstrap], 900);
        return true;
      } catch (e) {
        if (snap.projects !== undefined) qc.setQueryData(qk.projects, snap.projects);
        if (snap.project !== undefined) qc.setQueryData(qk.project(id), snap.project);
        if (snap.bootstrap !== undefined) qc.setQueryData(qk.bootstrap, snap.bootstrap);
        if (!opts.quiet) toast.error(errorMessage(e, 'Couldn’t update the project'));
        return false;
      }
    },
    [qc, patchCaches],
  );

  const save = useCallback(
    async (input: Omit<SaveProjectInputType, 'remove'>) => {
      const res = await saveProject(input);
      // Awaited so the page navigated to next already finds the project in bootstrap.
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.bootstrap }),
        qc.invalidateQueries({ queryKey: qk.projects }),
        input.id ? qc.invalidateQueries({ queryKey: qk.project(input.id) }) : Promise.resolve(),
      ]);
      return res.id;
    },
    [qc],
  );

  const remove = useCallback(
    async (project: { id: string; name: string }) => {
      const ok = await app.confirm({
        title: `Delete “${project.name}”?`,
        description: 'Its milestones and check-ins are deleted. The issues stay — they simply leave the project.',
        confirmLabel: 'Delete project',
        destructive: true,
      });
      if (!ok) return false;
      try {
        await saveProject({ id: project.id, remove: true });
        qc.setQueryData<ListProjectsOutputType>(qk.projects, old => (old ? { ...old, projects: old.projects.filter(p => p.id !== project.id) } : old));
        qc.invalidateQueries({ queryKey: qk.bootstrap });
        qc.invalidateQueries({ queryKey: qk.projects });
        qc.invalidateQueries({ queryKey: qk.issuesRoot });
        toast.success(`Deleted ${project.name}`);
        return true;
      } catch (e) {
        toast.error(errorMessage(e, 'Couldn’t delete the project'));
        return false;
      }
    },
    [qc, app],
  );

  return useMemo(() => ({ update, save, remove }), [update, save, remove]);
}
