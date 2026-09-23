import { addDays } from 'date-fns';
import { daysBetween, parseDay, plural, shortDate, toDayString, todayString } from '../../lib/format';
import type { Team } from '../../lib/types';

type Status = 'completed' | 'active' | 'upcoming';

export type SprintBasics = {
  id: string;
  teamId: string | null;
  number: number;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  completedAt: string | null;
  status: Status;
};

export type SprintTotals = SprintBasics & { issues: number; points: number; completedPoints: number; completed?: number; started?: number };

/**
 * The server calls a sprint "completed" once its end date passes, whether or
 * not anyone closed it. The UI tells those apart: an ended-but-open sprint still
 * holds unfinished work that has to be rolled forward.
 */
export type SprintPhase = 'current' | 'upcoming' | 'done' | 'ended';

export function sprintPhase(s: Pick<SprintBasics, 'status' | 'completedAt'>): SprintPhase {
  if (s.completedAt) return 'done';
  if (s.status === 'active') return 'current';
  if (s.status === 'upcoming') return 'upcoming';
  return 'ended';
}

export const PHASE_META: Record<SprintPhase, { label: string; tone: 'highlight' | 'neutral' | 'success' | 'warning' }> = {
  current: { label: 'Current', tone: 'highlight' },
  upcoming: { label: 'Upcoming', tone: 'neutral' },
  done: { label: 'Done', tone: 'success' },
  ended: { label: 'Not closed', tone: 'warning' },
};

export const glyphStatus = (s: Pick<SprintBasics, 'status' | 'completedAt'>): 'active' | 'upcoming' | 'completed' => {
  const phase = sprintPhase(s);
  return phase === 'current' ? 'active' : phase === 'upcoming' ? 'upcoming' : 'completed';
};

export const canComplete = (s: Pick<SprintBasics, 'status' | 'completedAt'>) => {
  const phase = sprintPhase(s);
  return phase === 'current' || phase === 'ended';
};

/** "Sep 1 → Sep 14". */
export function dateRange(start: string | null, end: string | null) {
  if (!start || !end) return 'No dates';
  return `${shortDate(start)} → ${shortDate(end)}`;
}

/** "4 days left", "Starts tomorrow", "Closed Sep 3" — the one timing fact that matters for each phase. */
export function timingLabel(s: Pick<SprintBasics, 'status' | 'completedAt' | 'startDate' | 'endDate'>) {
  const today = todayString();
  const phase = sprintPhase(s);
  if (phase === 'done') return `Closed ${shortDate(s.completedAt)}`;
  if (phase === 'upcoming') {
    const n = s.startDate ? daysBetween(today, s.startDate) : 0;
    return n <= 0 ? 'Starts today' : n === 1 ? 'Starts tomorrow' : `Starts in ${n} days`;
  }
  if (phase === 'ended') {
    const n = s.endDate ? daysBetween(s.endDate, today) : 0;
    return n <= 0 ? 'Ended today' : n === 1 ? 'Ended yesterday' : `Ended ${n} days ago`;
  }
  const left = daysLeft(s);
  return left <= 0 ? 'Ends today' : `${plural(left, 'day')} left`;
}

export function daysLeft(s: Pick<SprintBasics, 'endDate'>) {
  return s.endDate ? Math.max(0, daysBetween(todayString(), s.endDate)) : 0;
}

/** Where today falls in a running sprint: "Day 7 of 14". */
export function sprintDay(s: Pick<SprintBasics, 'startDate' | 'endDate'>) {
  if (!s.startDate || !s.endDate) return null;
  const length = Math.max(1, daysBetween(s.startDate, s.endDate));
  const day = Math.min(length, Math.max(1, daysBetween(s.startDate, todayString()) + 1));
  return { day, length, elapsed: Math.min(1, Math.max(0, (day - 1) / length)) };
}

/** Elapsed share of a sprint's calendar — what the sprint glyph fills to. */
export function elapsedShare(s: Pick<SprintBasics, 'status' | 'completedAt' | 'startDate' | 'endDate'>) {
  const phase = sprintPhase(s);
  if (phase === 'upcoming') return 0;
  if (phase !== 'current') return 1;
  const d = sprintDay(s);
  return d ? d.day / d.length : 0.5;
}

/** Match the server's clock: sprint status and roll-over are decided on the UTC date. */
export const serverToday = () => new Date().toISOString().slice(0, 10);

/** The sprint completeSprint({ moveTo: 'next' }) will pick — same rule as the endpoint. */
export function nextSprintFor<T extends SprintBasics>(sprint: Pick<SprintBasics, 'id'>, teamSprints: T[]) {
  const today = serverToday();
  return teamSprints
    .filter(c => c.id !== sprint.id && !c.completedAt && (c.endDate ?? '') >= today)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))[0];
}

export const nextSprintNumber = (teamSprints: Array<Pick<SprintBasics, 'number'>>) => Math.max(0, ...teamSprints.map(c => c.number)) + 1;

/** Where a new sprint should start: the day after the team's last one ends, never in the past. */
export function defaultSprintDates(teamSprints: Array<Pick<SprintBasics, 'endDate'>>, weeks: number) {
  const today = todayString();
  const lastEnd = teamSprints.map(c => c.endDate ?? '').filter(Boolean).sort().pop();
  const afterLast = lastEnd ? toDayString(addDays(parseDay(lastEnd), 1)) : today;
  const start = afterLast > today ? afterLast : today;
  return { start, end: toDayString(addDays(parseDay(start), Math.max(1, weeks) * 7)) };
}

/** The same overlap rule saveSprint enforces, so the dialog can warn before the round trip. */
export function overlappingSprint<T extends SprintBasics>(teamSprints: T[], start: string, end: string, exceptId?: string) {
  return teamSprints.find(c => c.id !== exceptId && c.startDate && c.endDate && c.startDate < end && c.endDate > start);
}

/** An empty sprint must read 0 pts however the aggregate rounds its null row. */
export const scopePoints = (s: { issues: number; points: number }) => (s.issues > 0 ? s.points : 0);

/** Points completed per sprint, averaged over the most recent finished sprints. */
export function averageVelocity(sprints: SprintTotals[], count = 3) {
  const finished = sprints
    .filter(c => c.status === 'completed')
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))
    .slice(0, count);
  if (finished.length === 0) return null;
  const avg = finished.reduce((a, c) => a + c.completedPoints, 0) / finished.length;
  return { avg: Math.round(avg * 10) / 10, count: finished.length };
}

/** Completed points per week — comparable across sprints of different lengths. */
export function pointsPerWeek(s: SprintTotals) {
  if (!s.startDate || !s.endDate) return null;
  const days = Math.max(1, daysBetween(s.startDate, s.endDate));
  return Math.round((s.completedPoints / (days / 7)) * 10) / 10;
}

/**
 * completeSprint pulls the end date in to the day it was closed, so "early"
 * can't be read off the dates directly. A closed sprint ended early when it
 * closed on its end date AND that left a gap before the next sprint (or, for the
 * latest sprint, it ran shorter than the team's cadence).
 */
export function completedEarly(s: SprintBasics, teamSprints: SprintBasics[], cadenceWeeks: number) {
  if (!s.completedAt || !s.startDate || !s.endDate) return false;
  if (s.completedAt.slice(0, 10) !== s.endDate) return false;
  const next = teamSprints
    .filter(o => o.id !== s.id && (o.startDate ?? '') > s.startDate!)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))[0];
  if (next?.startDate) return daysBetween(s.endDate, next.startDate) > 1;
  return daysBetween(s.startDate, s.endDate) < cadenceWeeks * 7;
}

export function durationLabel(start: string, end: string) {
  const days = daysBetween(start, end);
  if (days <= 0) return null;
  return days % 7 === 0 ? plural(days / 7, 'week') : plural(days, 'day');
}

const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
/** "Two-week sprints". */
export function cadenceLabel(team: Pick<Team, 'sprintDurationWeeks'>) {
  const w = team.sprintDurationWeeks || 2;
  return `${WORDS[w] ?? w}-week sprints`;
}

export const fmtPts = (n: number) => String(Math.round(n * 10) / 10);

/** "1 pt", "2.5 pts". */
export const pts = (n: number) => `${fmtPts(n)} ${Math.abs(n) === 1 ? 'pt' : 'pts'}`;

export const teamSprintsPath = (team: Pick<Team, 'key'> | null | undefined) => (team ? `/${team.key.toLowerCase()}/sprints` : '/all/sprints');
