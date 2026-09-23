import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { saveProject, type ListProjectsOutputType } from 'zitejs/api';
import { errorMessage } from '../../lib/errors';
import { refreshSoon } from '../../lib/mutations';
import { qk } from '../../lib/queries';
import type { Bootstrap } from '../../lib/types';
import { describeDates, type ProjectDates } from './projectMath';

type Target = { id: string; name: string } & ProjectDates;

/**
 * Moving a bar is optimistic: both caches that hold project dates (the rollup
 * list the timeline draws, and the bootstrap every picker reads) change before
 * the request leaves, and are restored if it fails.
 */
async function reschedule(qc: QueryClient, project: Target, next: ProjectDates, undoable: boolean): Promise<void> {
  const previous: ProjectDates = { startDate: project.startDate, targetDate: project.targetDate };
  await Promise.all([qc.cancelQueries({ queryKey: qk.projects }), qc.cancelQueries({ queryKey: qk.bootstrap })]);
  const snapProjects = qc.getQueryData(qk.projects);
  const snapBootstrap = qc.getQueryData(qk.bootstrap);
  const apply = <T extends { id: string } & ProjectDates>(p: T): T => (p.id === project.id ? { ...p, ...next } : p);
  qc.setQueryData<ListProjectsOutputType>(qk.projects, old => (old ? { ...old, projects: old.projects.map(apply) } : old));
  qc.setQueryData<Bootstrap>(qk.bootstrap, old => (old ? { ...old, projects: old.projects.map(apply) } : old));
  try {
    await saveProject({ id: project.id, startDate: next.startDate, targetDate: next.targetDate });
    const hadDates = Boolean(previous.startDate || previous.targetDate);
    const hasDates = Boolean(next.startDate || next.targetDate);
    const title = undoable ? (hadDates ? `Rescheduled ${project.name}` : `Scheduled ${project.name}`) : hasDates ? `Moved ${project.name} back` : `${project.name} is unscheduled again`;
    toast.success(title, {
      description: describeDates(next),
      action: undoable ? { label: 'Undo', onClick: () => void reschedule(qc, { ...project, ...next }, previous, false) } : undefined,
    });
  } catch (e) {
    qc.setQueryData(qk.projects, snapProjects);
    qc.setQueryData(qk.bootstrap, snapBootstrap);
    toast.error(errorMessage(e, `Couldn’t reschedule ${project.name}`));
  } finally {
    // Debounced, so a run of quick drags settles in one refetch.
    refreshSoon(qc, [qk.projects, qk.bootstrap], 1200);
  }
}

export function useRescheduleProject() {
  const qc = useQueryClient();
  return useCallback((project: Target, next: ProjectDates) => reschedule(qc, project, next, true), [qc]);
}
