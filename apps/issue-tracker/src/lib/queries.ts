import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  bootstrap,
  getAnalytics,
  getSprint,
  getIssue,
  getProject,
  listSprints,
  listIssues,
  listNotifications,
  listProjects,
  search,
} from 'zitejs/api';
import type { IssueFilters } from './types';

/** Query keys in one place, so invalidation and optimistic writes can't drift from reads. */
export const qk = {
  bootstrap: ['bootstrap'] as const,
  issuesRoot: ['issues'] as const,
  // `limit` is part of the key: a one-row count query must never stand in for the full list.
  issues: (filters: IssueFilters, ordering: string, limit?: number) => ['issues', { filters, ordering, limit }] as const,
  issueRoot: ['issue'] as const,
  issue: (key: string) => ['issue', key.toUpperCase()] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  sprints: (teamId?: string) => ['sprints', teamId ?? 'all'] as const,
  sprint: (id: string) => ['sprint', id] as const,
  notifications: (filter: string) => ['notifications', filter] as const,
  analytics: (teamId: string | undefined, weeks: number) => ['analytics', teamId ?? 'all', weeks] as const,
  search: (q: string) => ['search', q] as const,
};

export function useBootstrap() {
  return useQuery({
    queryKey: qk.bootstrap, queryFn: () => bootstrap({}), staleTime: 60_000, refetchOnWindowFocus: true,
    // A refusal won't change on retry, and retrying holds the loading screen for seconds.
    retry: (count, error) => count < 2 && !/\(4\d\d\)|FORBIDDEN|DEMO_READ_ONLY/.test(String((error as Error)?.message ?? error)),
  });
}

export function useIssues(filters: IssueFilters, ordering = 'manual', opts: { enabled?: boolean; limit?: number } = {}) {
  return useQuery({
    queryKey: qk.issues(filters, ordering, opts.limit ?? 800),
    queryFn: () => listIssues({ filters, ordering, limit: opts.limit ?? 800 }),
    enabled: opts.enabled ?? true,
    placeholderData: keepPreviousData,
    staleTime: 20_000,
  });
}

/** A missing record won't appear on retry; everything else (network, 5xx) gets a couple more tries. */
const retryUnlessNotFound = (count: number, error: unknown) =>
  !/not found|\(404\)/i.test(String((error as Error)?.message ?? '')) && count < 2;

export function useIssue(idOrIdentifier: string | null | undefined) {
  const key = idOrIdentifier ?? '';
  // Identifiers look like ENG-42; anything else is a record id.
  const isIdentifier = /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(key);
  return useQuery({
    queryKey: qk.issue(key),
    queryFn: () => getIssue(isIdentifier ? { identifier: key } : { id: key }),
    enabled: Boolean(key),
    staleTime: 10_000,
    retry: retryUnlessNotFound,
  });
}

export function useProjects() {
  return useQuery({ queryKey: qk.projects, queryFn: () => listProjects({}), staleTime: 30_000 });
}

export function useProject(id: string | undefined) {
  return useQuery({ queryKey: qk.project(id ?? ''), queryFn: () => getProject({ id: id! }), enabled: Boolean(id), retry: retryUnlessNotFound });
}

export function useSprints(teamId?: string) {
  return useQuery({ queryKey: qk.sprints(teamId), queryFn: () => listSprints(teamId ? { teamId } : {}), staleTime: 30_000 });
}

export function useSprint(id: string | undefined) {
  return useQuery({ queryKey: qk.sprint(id ?? ''), queryFn: () => getSprint({ id: id! }), enabled: Boolean(id), retry: retryUnlessNotFound });
}

export function useNotifications(filter: 'inbox' | 'unread' | 'snoozed' | 'archived') {
  return useQuery({
    queryKey: qk.notifications(filter),
    queryFn: () => listNotifications({ filter }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useAnalytics(teamId: string | undefined, weeks: number) {
  return useQuery({
    queryKey: qk.analytics(teamId, weeks),
    queryFn: () => getAnalytics({ teamId, weeks }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useIssueSearch(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: qk.search(query),
    queryFn: () => search({ query, limit: 12 }),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}
