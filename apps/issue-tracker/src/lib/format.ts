import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isThisYear,
  parseISO,
} from 'date-fns';

export function parseDay(day: string) {
  // Date-only strings must be read as LOCAL midnight; `new Date('2026-09-12')` is UTC and shifts a day west of Greenwich.
  return parseISO(day.length === 10 ? `${day}T00:00:00` : day);
}

export function toDayString(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

export function todayString() {
  return toDayString(new Date());
}

/** "3m", "2h", "5d", then "Sep 4". */
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return '';
  const d = parseISO(iso);
  const days = Math.abs(differenceInCalendarDays(new Date(), d));
  if (days > 30) return shortDate(iso);
  const s = formatDistanceToNowStrict(d, { roundingMethod: 'floor' });
  if (s.startsWith('0 ') || s.includes('second')) return 'just now';
  return `${s.replace(/ minutes?/, 'm').replace(/ hours?/, 'h').replace(/ days?/, 'd').replace(/ months?/, 'mo')} ago`;
}

export function shortDate(value: string | null | undefined) {
  if (!value) return '';
  const d = parseDay(value);
  return isThisYear(d) ? format(d, 'MMM d') : format(d, 'MMM d, yyyy');
}

export function longDate(value: string | null | undefined) {
  if (!value) return '';
  return format(parseDay(value), 'MMMM d, yyyy');
}

export function dateTime(iso: string | null | undefined) {
  if (!iso) return '';
  return format(parseISO(iso), "MMM d, yyyy 'at' h:mm a");
}

export type DueTone = 'overdue' | 'soon' | 'normal';

/** A due date the way people say it: "Today", "Tomorrow", "Fri", "Sep 30". */
export function dueLabel(day: string | null | undefined): { label: string; tone: DueTone; days: number } | null {
  if (!day) return null;
  const days = differenceInCalendarDays(parseDay(day), new Date());
  if (days < 0) return { label: days === -1 ? 'Yesterday' : shortDate(day), tone: 'overdue', days };
  if (days === 0) return { label: 'Today', tone: 'soon', days };
  if (days === 1) return { label: 'Tomorrow', tone: 'soon', days };
  if (days < 7) return { label: format(parseDay(day), 'EEEE'), tone: days <= 2 ? 'soon' : 'normal', days };
  return { label: shortDate(day), tone: 'normal', days };
}

export function initials(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Git branch names, like Linear's "Copy git branch name". */
export function branchName(identifier: string, title: string, userName?: string | null) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48)
    .replace(/-+$/, '');
  const handle = userName ? userName.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '') : null;
  return `${handle ? `${handle}/` : ''}${identifier.toLowerCase()}-${slug}`;
}

export function issueUrl(identifier: string) {
  return `${window.location.origin}${window.location.pathname}#/issue/${identifier}`;
}

export function daysBetween(a: string, b: string) {
  return differenceInCalendarDays(parseDay(b), parseDay(a));
}

/** A link to an ad-hoc issue list (`/list`), used by report and profile drill-downs. */
export function listLink(filters: object, title: string) {
  return `/list?${new URLSearchParams({ f: JSON.stringify(filters), title }).toString()}`;
}
