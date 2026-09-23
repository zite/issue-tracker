import { addDays, differenceInCalendarDays } from 'date-fns';
import { parseDay, plural, shortDate, toDayString, todayString } from '../../lib/format';
import type { ProjectSummary } from '../../lib/types';
import { DEFAULT_SPAN_DAYS } from './scale';

export const DONE_PROJECT_STATUSES = ['Completed', 'Canceled'];
export const isDoneProject = (p: Pick<ProjectSummary, 'status'>) => DONE_PROJECT_STATUSES.includes(p.status);

/** Completed over the scope still meant to ship: canceled issues leave the denominator. */
export function projectProgress(p: Pick<ProjectSummary, 'total' | 'completed' | 'canceled' | 'status'>) {
  const scope = p.total - p.canceled;
  if (scope <= 0) return p.status === 'Completed' ? 1 : 0;
  return Math.max(0, Math.min(1, p.completed / scope));
}

export function isOverdue(p: Pick<ProjectSummary, 'targetDate' | 'status'>) {
  return Boolean(p.targetDate) && p.targetDate! < todayString() && !isDoneProject(p);
}

export function overdueDays(targetDate: string) {
  return differenceInCalendarDays(new Date(), parseDay(targetDate));
}

export type BarRange = { start: string; end: string; fadeStart: boolean; fadeEnd: boolean };

/** Where a project's bar sits. A missing end is filled with a default span and drawn faded. */
export function barRange(startDate: string | null, targetDate: string | null): BarRange | null {
  if (startDate && targetDate) {
    // A target before the start is bad data; draw a one-day bar rather than a negative width.
    return targetDate >= startDate
      ? { start: startDate, end: targetDate, fadeStart: false, fadeEnd: false }
      : { start: startDate, end: startDate, fadeStart: false, fadeEnd: false };
  }
  if (startDate) return { start: startDate, end: toDayString(addDays(parseDay(startDate), DEFAULT_SPAN_DAYS - 1)), fadeStart: false, fadeEnd: true };
  if (targetDate) return { start: toDayString(addDays(parseDay(targetDate), -(DEFAULT_SPAN_DAYS - 1))), end: targetDate, fadeStart: true, fadeEnd: false };
  return null;
}

export type ProjectDates = { startDate: string | null; targetDate: string | null };

export function describeDates(d: ProjectDates) {
  if (d.startDate && d.targetDate) return `${shortDate(d.startDate)} → ${shortDate(d.targetDate)}`;
  if (d.startDate) return `Starts ${shortDate(d.startDate)}`;
  if (d.targetDate) return `Target ${shortDate(d.targetDate)}`;
  return 'No dates';
}

export function durationLabel(start: string, end: string) {
  const days = differenceInCalendarDays(parseDay(end), parseDay(start)) + 1;
  if (days < 14) return plural(days, 'day');
  if (days < 70) return plural(Math.round(days / 7), 'week');
  return plural(Math.round(days / 30.4), 'month');
}

export type HealthKey = 'On Track' | 'At Risk' | 'Off Track';
export const HEALTH_KEYS: HealthKey[] = ['On Track', 'At Risk', 'Off Track'];

export type Rollup = ReturnType<typeof rollup>;

/** Totals across a set of projects — a goal's progress, issues and health at a glance. */
export function rollup(projects: ProjectSummary[]) {
  let completed = 0;
  let scope = 0;
  let total = 0;
  let canceled = 0;
  let active = 0;
  const health: Record<HealthKey, number> = { 'On Track': 0, 'At Risk': 0, 'Off Track': 0 };
  const byStatus: Record<string, number> = {};
  for (const p of projects) {
    completed += p.completed;
    scope += Math.max(0, p.total - p.canceled);
    total += p.total;
    canceled += p.canceled;
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    // A finished project's last health reading says nothing about the goal now.
    if (!isDoneProject(p)) {
      active += 1;
      if (p.health in health) health[p.health as HealthKey] += 1;
    }
  }
  const reported = health['On Track'] + health['At Risk'] + health['Off Track'];
  return {
    completed, scope, total, canceled, active, health, byStatus,
    /** Active projects that have never had a check-in. */
    unknown: Math.max(0, active - reported),
    progress: scope > 0 ? Math.min(1, completed / scope) : 0,
  };
}
