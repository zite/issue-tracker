import { useCallback, useEffect, useMemo, useState } from 'react';
import { ISSUE_TYPES, PRIORITY_LABEL, STATUS_TYPES, type DisplayProperty, type Grouping, type Ordering } from './constants';
import type { Issue, IssueFilters, Status } from './types';
import type { Workspace } from './workspace';

export type Layout = 'list' | 'board';
export type CompletedWindow = 'all' | 'week' | 'month' | 'none';

export type ViewOptions = {
  layout: Layout;
  grouping: Grouping;
  ordering: Ordering;
  subIssues: boolean;
  completed: CompletedWindow;
  emptyGroups: boolean;
  /** Archiving is reversible only if archived work can be found again. */
  showArchived: boolean;
  properties: DisplayProperty[];
};

export const DEFAULT_PROPERTIES: DisplayProperty[] = ['identifier', 'status', 'priority', 'assignee', 'labels', 'project', 'sprint', 'estimate', 'dueDate', 'subIssues'];

export const DEFAULT_OPTIONS: ViewOptions = {
  layout: 'list',
  grouping: 'status',
  ordering: 'manual',
  subIssues: true,
  completed: 'all',
  emptyGroups: false,
  showArchived: false,
  properties: DEFAULT_PROPERTIES,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Per-surface display options and ad-hoc filters, remembered in localStorage.
 * A saved view seeds `defaults`; edits on top of it are local until saved.
 */
export function useViewState(storageKey: string, defaults: Partial<ViewOptions> = {}, defaultFilters: IssueFilters = {}) {
  const base = useMemo(() => ({ ...DEFAULT_OPTIONS, ...defaults }), [JSON.stringify(defaults)]);
  const [options, setOptionsState] = useState<ViewOptions>(() => read(`issue-tracker:view:${storageKey}`, base));
  const [filters, setFiltersState] = useState<IssueFilters>(() => read(`issue-tracker:filters:${storageKey}`, defaultFilters));

  // A different surface (or a different saved view) starts from its own state.
  useEffect(() => {
    setOptionsState(read(`issue-tracker:view:${storageKey}`, base));
    setFiltersState(read(`issue-tracker:filters:${storageKey}`, defaultFilters));
  }, [storageKey]);

  const setOptions = useCallback(
    (patch: Partial<ViewOptions>) => {
      setOptionsState(prev => {
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(`issue-tracker:view:${storageKey}`, JSON.stringify(next));
        } catch {
          /* storage may be unavailable */
        }
        return next;
      });
    },
    [storageKey],
  );

  const setFilters = useCallback(
    (next: IssueFilters | ((prev: IssueFilters) => IssueFilters)) => {
      setFiltersState(prev => {
        const value = typeof next === 'function' ? next(prev) : next;
        const clean = Object.fromEntries(
          Object.entries(value).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)),
        ) as IssueFilters;
        try {
          localStorage.setItem(`issue-tracker:filters:${storageKey}`, JSON.stringify(clean));
        } catch {
          /* storage may be unavailable */
        }
        return clean;
      });
    },
    [storageKey],
  );

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(`issue-tracker:view:${storageKey}`);
      localStorage.removeItem(`issue-tracker:filters:${storageKey}`);
    } catch {
      /* ignore */
    }
    setOptionsState(base);
    setFiltersState(defaultFilters);
  }, [storageKey, base]);

  const optionsDirty = useMemo(() => JSON.stringify(options) !== JSON.stringify(base), [options, base]);
  const isDirty = useMemo(() => optionsDirty || JSON.stringify(filters) !== JSON.stringify(defaultFilters), [optionsDirty, filters]);

  return { options, setOptions, filters, setFilters, reset, isDirty, optionsDirty };
}

/** Replace the `__me__` token saved views use, so "assigned to me" means whoever is looking. */
export function resolveMe(filters: IssueFilters, meId: string): IssueFilters {
  const swap = (ids?: string[]) => ids?.map(id => (id === '__me__' ? meId : id));
  return { ...filters, assigneeIds: swap(filters.assigneeIds), creatorIds: swap(filters.creatorIds), subscriberIds: swap(filters.subscriberIds) };
}

/** The filters actually sent: surface scope + user filters + display options that narrow. */
export function effectiveFilters(base: IssueFilters, user: IssueFilters, options: ViewOptions, meId: string): IssueFilters {
  const merged: IssueFilters = { ...resolveMe(user, meId), ...resolveMe(base, meId) };
  // Where the surface and the user both constrain a list, both apply.
  for (const key of ['teamIds', 'statusTypes', 'assigneeIds', 'projectIds', 'sprintIds', 'labelIds', 'priorities', 'issueTypes'] as const) {
    const b = (base as any)[key] as unknown[] | undefined;
    const u = (resolveMe(user, meId) as any)[key] as unknown[] | undefined;
    if (b?.length && u?.length) {
      const both = b.filter(v => u.includes(v));
      (merged as any)[key] = both.length ? both : ['__none__'];
    }
  }
  if (!options.subIssues && !merged.parentId) merged.topLevelOnly = true;
  if (options.showArchived) merged.includeArchived = true;
  if (options.completed === 'week') merged.completedWithinDays = 7;
  if (options.completed === 'month') merged.completedWithinDays = 30;
  if (options.completed === 'none' && !merged.statusTypes?.length) merged.statusTypes = ['intake', 'backlog', 'unstarted', 'started'];
  return merged;
}

export type IssueGroup = {
  key: string;
  label: string;
  issues: Issue[];
  /** What dropping into this column sets, when the grouping supports it. */
  drop?: { field: 'statusId' | 'assigneeId' | 'priority' | 'projectId' | 'sprintId' | 'issueType'; value: string | number | null; statusType?: string; statusName?: string };
  status?: Status;
  statusType?: string;
  memberId?: string | null;
  priority?: number;
  projectId?: string | null;
  sprintId?: string | null;
  labelId?: string | null;
  teamId?: string | null;
  issueType?: string;
};

/**
 * Split an ordered issue list into groups, keeping the server's order within
 * each. `teamId` is the surface's single team, when there is one: its workflow
 * then gives every column even when empty, which is what makes a board a board.
 */
export function groupIssues(issues: Issue[], grouping: Grouping, ws: Workspace, opts: { teamId?: string | null; emptyGroups?: boolean; meId?: string; allowedStatusTypes?: string[] }): IssueGroup[] {
  const { teamId, emptyGroups } = opts;
  const buckets = new Map<string, IssueGroup>();
  const ensure = (key: string, make: () => Omit<IssueGroup, 'issues' | 'key'>) => {
    if (!buckets.has(key)) buckets.set(key, { key, issues: [], ...make() });
    return buckets.get(key)!;
  };

  switch (grouping) {
    case 'status': {
      if (teamId) {
        for (const s of ws.statusesByTeam.get(teamId) ?? []) {
          // A board scoped to active work shouldn't show empty Intake and Backlog columns it can never contain.
          if (opts.allowedStatusTypes?.length && !opts.allowedStatusTypes.includes(s.type)) continue;
          ensure(s.id, () => ({ label: s.name, status: s, statusType: s.type, drop: { field: 'statusId', value: s.id } }));
        }
        for (const i of issues) {
          const s = ws.statusOf(i);
          ensure(s?.id ?? 'none', () => ({ label: s?.name ?? 'No status', status: s, statusType: s?.type })).issues.push(i);
        }
        // Intake has its own queue; an empty Intake column on every board is just noise.
        for (const [key, g] of buckets) if (g.statusType === 'intake' && g.issues.length === 0) buckets.delete(key);
      } else {
        // Across teams, statuses with the same name and type are one column.
        const keyOf = (s: Status) => `${s.type}:${s.name.toLowerCase()}`;
        const ordered = [...ws.statuses].sort((a, b) => STATUS_TYPES.indexOf(a.type as never) - STATUS_TYPES.indexOf(b.type as never) || a.position - b.position);
        const present = new Set(issues.map(i => ws.statusOf(i)).filter(Boolean).map(s => keyOf(s!)));
        for (const s of ordered) {
          if (!emptyGroups && !present.has(keyOf(s))) continue;
          if (s.type === 'intake' && !present.has(keyOf(s))) continue;
          ensure(keyOf(s), () => ({ label: s.name, status: s, statusType: s.type, drop: { field: 'statusId', value: s.id, statusType: s.type, statusName: s.name } }));
        }
        for (const i of issues) {
          const s = ws.statusOf(i);
          if (!s) continue;
          ensure(keyOf(s), () => ({ label: s.name, status: s, statusType: s.type, drop: { field: 'statusId', value: s.id, statusType: s.type, statusName: s.name } })).issues.push(i);
        }
      }
      break;
    }
    case 'assignee': {
      const members = [...new Set(issues.map(i => i.assigneeId).filter(Boolean) as string[])]
        .map(id => ws.memberById.get(id))
        .filter(Boolean)
        .sort((a, b) => (a!.id === opts.meId ? -1 : b!.id === opts.meId ? 1 : a!.name.localeCompare(b!.name)));
      if (emptyGroups) {
        for (const m of ws.membersFor(teamId)) if (!members.includes(m)) members.push(m);
      }
      for (const m of members) ensure(m!.id, () => ({ label: m!.name, memberId: m!.id, drop: { field: 'assigneeId', value: m!.id } }));
      ensure('none', () => ({ label: 'No assignee', memberId: null, drop: { field: 'assigneeId', value: null } }));
      for (const i of issues) {
        const m = i.assigneeId ? ws.memberById.get(i.assigneeId) : undefined;
        (m ? buckets.get(m.id)! : buckets.get('none')!).issues.push(i);
      }
      break;
    }
    case 'priority': {
      for (const p of [1, 2, 3, 4, 0]) ensure(String(p), () => ({ label: PRIORITY_LABEL[p], priority: p, drop: { field: 'priority', value: p } }));
      for (const i of issues) buckets.get(String(i.priority ?? 0))?.issues.push(i);
      break;
    }
    case 'project': {
      const ids = new Set(issues.map(i => i.projectId).filter(Boolean) as string[]);
      const projects = ws.projects.filter(p => ids.has(p.id) || (emptyGroups && !['Completed', 'Canceled'].includes(p.status) && (!teamId || p.teamId === teamId)));
      for (const p of projects) ensure(p.id, () => ({ label: p.name, projectId: p.id, drop: { field: 'projectId', value: p.id } }));
      ensure('none', () => ({ label: 'No project', projectId: null, drop: { field: 'projectId', value: null } }));
      for (const i of issues) (i.projectId && buckets.has(i.projectId) ? buckets.get(i.projectId)! : buckets.get('none')!).issues.push(i);
      break;
    }
    case 'sprint': {
      const ids = new Set(issues.map(i => i.sprintId).filter(Boolean) as string[]);
      const rank = { active: 0, upcoming: 1, completed: 2 } as const;
      const sprints = ws.sprints
        .filter(c => ids.has(c.id) || (emptyGroups && teamId && c.teamId === teamId && c.status !== 'completed'))
        .sort((a, b) => rank[a.status] - rank[b.status] || (b.status === 'completed' ? (b.startDate ?? '').localeCompare(a.startDate ?? '') : (a.startDate ?? '').localeCompare(b.startDate ?? '')));
      const multiTeam = new Set(sprints.map(c => c.teamId)).size > 1;
      for (const c of sprints) {
        const team = c.teamId ? ws.teamById.get(c.teamId) : undefined;
        ensure(c.id, () => ({ label: `${multiTeam && team ? `${team.key} · ` : ''}${c.name}`, sprintId: c.id, drop: { field: 'sprintId', value: c.id } }));
      }
      ensure('none', () => ({ label: 'No sprint', sprintId: null, drop: { field: 'sprintId', value: null } }));
      for (const i of issues) (i.sprintId && buckets.has(i.sprintId) ? buckets.get(i.sprintId)! : buckets.get('none')!).issues.push(i);
      break;
    }
    case 'label': {
      const ids = new Set(issues.flatMap(i => i.labelIds));
      for (const l of ws.labels.filter(l => ids.has(l.id))) ensure(l.id, () => ({ label: l.name, labelId: l.id }));
      ensure('none', () => ({ label: 'No labels', labelId: null }));
      for (const i of issues) {
        if (i.labelIds.length === 0) buckets.get('none')!.issues.push(i);
        // An issue with two labels appears under both — the same as every tracker that groups by a many-valued field.
        for (const l of i.labelIds) buckets.get(l)?.issues.push(i);
      }
      break;
    }
    case 'team': {
      for (const t of ws.teams) ensure(t.id, () => ({ label: t.name, teamId: t.id }));
      for (const i of issues) if (i.teamId) buckets.get(i.teamId)?.issues.push(i);
      break;
    }
    case 'type': {
      for (const t of ISSUE_TYPES) ensure(t, () => ({ label: t, issueType: t, drop: { field: 'issueType', value: t } }));
      for (const i of issues) buckets.get(i.issueType ?? 'Task')?.issues.push(i);
      break;
    }
    default:
      ensure('all', () => ({ label: 'All issues' })).issues.push(...issues);
  }

  const groups = [...buckets.values()];
  if (grouping === 'none') return groups;
  return emptyGroups ? groups : groups.filter(g => g.issues.length > 0);
}

export function countFilters(filters: IssueFilters) {
  return Object.entries(filters).filter(([k, v]) => k !== 'search' && v !== undefined && !(Array.isArray(v) && v.length === 0)).length;
}
