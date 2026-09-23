import { differenceInCalendarDays } from 'date-fns';
import { useCallback, useState } from 'react';
import { PROJECT_HEALTH, PROJECT_STATUSES, priorityRank } from '../../lib/constants';
import { parseDay, plural, shortDate, todayString } from '../../lib/format';
import type { ProjectDetail, ProjectSummary } from '../../lib/types';

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type Health = (typeof PROJECT_HEALTH)[number];

/** The fields every project shape (bootstrap ref, list summary, detail) shares. */
export type ProjectLike = {
  id: string;
  name: string;
  summary: string | null;
  status: string;
  health: string;
  icon: string | null;
  color: string | null;
  teamId: string | null;
  leadId: string | null;
  goalId: string | null;
  priority: number;
  startDate: string | null;
  targetDate: string | null;
  description?: string;
};

export type ProjectPatch = Partial<{
  name: string;
  summary: string | null;
  description: string | null;
  status: ProjectStatus;
  leadId: string | null;
  teamId: string | null;
  goalId: string | null;
  priority: number;
  icon: string | null;
  color: string | null;
  startDate: string | null;
  targetDate: string | null;
}>;

/** Stored values stay as the backend spells them; people read sentence case. */
export const STATUS_LABEL: Record<ProjectStatus, string> = {
  Backlog: 'Backlog',
  Planned: 'Planned',
  'In Progress': 'In progress',
  Paused: 'Paused',
  Completed: 'Completed',
  Canceled: 'Canceled',
};

export const statusLabel = (s: string) => STATUS_LABEL[s as ProjectStatus] ?? s;

/** A list reads top-down by what needs attention; a board reads left-to-right by lifecycle. */
export const LIST_ORDER: ProjectStatus[] = ['In Progress', 'Planned', 'Paused', 'Backlog', 'Completed', 'Canceled'];
export const BOARD_ORDER: ProjectStatus[] = ['Backlog', 'Planned', 'In Progress', 'Paused', 'Completed', 'Canceled'];

export type TabKey = 'all' | 'active' | 'planned' | 'backlog' | 'completed';
export const TABS: Array<{ key: TabKey; label: string; statuses: readonly ProjectStatus[] }> = [
  { key: 'all', label: 'All', statuses: BOARD_ORDER },
  { key: 'active', label: 'Active', statuses: ['In Progress'] },
  { key: 'planned', label: 'Planned', statuses: ['Planned'] },
  { key: 'backlog', label: 'Backlog', statuses: ['Backlog'] },
  { key: 'completed', label: 'Completed', statuses: ['Completed'] },
];

export type SortKey = 'manual' | 'target' | 'priority' | 'health' | 'progress' | 'updated' | 'name';
export const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'manual', label: 'Manual' },
  { key: 'target', label: 'Target date' },
  { key: 'priority', label: 'Priority' },
  { key: 'health', label: 'Health' },
  { key: 'progress', label: 'Progress' },
  { key: 'updated', label: 'Last check-in' },
  { key: 'name', label: 'Name' },
];

export type LayoutKey = 'gallery' | 'table' | 'board';
export const LAYOUTS: LayoutKey[] = ['gallery', 'table', 'board'];

export const asStatus = (s: string | null | undefined): ProjectStatus =>
  (PROJECT_STATUSES as readonly string[]).includes(s ?? '') ? (s as ProjectStatus) : 'Planned';

export const asHealth = (h: string | null | undefined, fallback: Health = 'On Track'): Health =>
  (PROJECT_HEALTH as readonly string[]).includes(h ?? '') ? (h as Health) : fallback;

export const isClosedStatus = (status: string) => status === 'Completed' || status === 'Canceled';

export function isPastTarget(p: { targetDate: string | null; status: string }) {
  return Boolean(p.targetDate && p.targetDate < todayString() && !isClosedStatus(p.status));
}

/** Completed over the scope still meant to ship: canceled issues leave the denominator. */
export function progressOf(p: Pick<ProjectSummary, 'total' | 'completed' | 'canceled' | 'status'>) {
  const scope = p.total - p.canceled;
  if (scope <= 0) return p.status === 'Completed' ? 1 : 0;
  return Math.max(0, Math.min(1, p.completed / scope));
}

const HEALTH_ORDER = ['Off Track', 'At Risk', 'On Track'];
const HEALTH_RANK = (h: string) => {
  const i = HEALTH_ORDER.indexOf(h);
  return i === -1 ? HEALTH_ORDER.length : i;
};

export function sortProjects(projects: ProjectSummary[], sort: SortKey) {
  if (sort === 'manual') return projects;
  const list = [...projects];
  const byName = (a: ProjectSummary, b: ProjectSummary) => a.name.localeCompare(b.name);
  switch (sort) {
    case 'target':
      return list.sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999') || byName(a, b));
    case 'priority':
      return list.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || byName(a, b));
    case 'health':
      // What needs a look first: off track, at risk, on track, then nobody has checked in.
      return list.sort((a, b) => HEALTH_RANK(a.health) - HEALTH_RANK(b.health) || byName(a, b));
    case 'progress':
      return list.sort((a, b) => progressOf(b) - progressOf(a) || byName(a, b));
    case 'updated':
      return list.sort((a, b) => (b.lastUpdateAt ?? '').localeCompare(a.lastUpdateAt ?? '') || byName(a, b));
    default:
      return list.sort(byName);
  }
}

export type Rollup = {
  total: number;
  completed: number;
  started: number;
  unstarted: number;
  canceled: number;
  points: number;
  completedPoints: number;
  progress: number;
};

/** Counts from the per-status-type breakdown — the same arithmetic as the list rollups, as fresh as the page. */
export function rollupOf(breakdown: ProjectDetail['breakdown'], status: string): Rollup {
  let total = 0, completed = 0, started = 0, canceled = 0, points = 0, completedPoints = 0;
  for (const b of breakdown) {
    total += b.count;
    if (b.statusType === 'completed') {
      completed += b.count;
      completedPoints += b.points;
    }
    if (b.statusType === 'started') started += b.count;
    if (b.statusType === 'canceled') canceled += b.count;
    else points += b.points;
  }
  const unstarted = total - completed - started - canceled;
  return { total, completed, started, unstarted, canceled, points, completedPoints, progress: progressOf({ total, completed, canceled, status }) };
}

export type TargetNote = { text: string; tone: 'success' | 'danger' | 'warning' | 'muted' };

/** "12 days to target", "3 days past target", "Completed Sep 2" — the one date fact that matters now. */
export function targetNote(p: { status: string; targetDate: string | null; completedAt?: string | null }, progress: number): TargetNote {
  if (p.status === 'Completed') return { text: `Completed${p.completedAt ? ` ${shortDate(p.completedAt.slice(0, 10))}` : ''}`, tone: 'success' };
  if (!p.targetDate) return { text: 'No target date', tone: 'muted' };
  if (isClosedStatus(p.status)) return { text: `Target was ${shortDate(p.targetDate)}`, tone: 'muted' };
  const days = differenceInCalendarDays(parseDay(p.targetDate), new Date());
  if (days < 0) return { text: `${plural(-days, 'day')} past target`, tone: 'danger' };
  if (days === 0) return { text: 'Due today', tone: 'warning' };
  return { text: `${plural(days, 'day')} to target`, tone: days <= 14 && progress < 0.6 ? 'warning' : 'muted' };
}

export const TONE_TEXT: Record<TargetNote['tone'], string> = {
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  muted: 'text-ink-2',
};

export function projectUrl(id: string) {
  return `${window.location.origin}${window.location.pathname}#/project/${id}`;
}

/** A remembered choice (layout, ordering) that ignores values it no longer knows. */
export function useStoredChoice<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(key) as T | null;
      return v && allowed.includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, v);
      } catch {
        /* storage may be unavailable */
      }
    },
    [key],
  );
  return [value, set] as const;
}

/** Collapsed sections, remembered across visits. */
export function useCollapsedSections(key: string) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(key) ?? '[]'));
    } catch {
      return new Set();
    }
  });
  const toggle = useCallback(
    (id: string) => {
      setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          /* storage may be unavailable */
        }
        return next;
      });
    },
    [key],
  );
  return [collapsed, toggle] as const;
}
