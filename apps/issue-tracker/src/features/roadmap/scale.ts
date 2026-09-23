import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  format,
  getQuarter,
  max as maxDate,
  min as minDate,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  subMonths,
  subQuarters,
  subWeeks,
} from 'date-fns';
import { parseDay, toDayString } from '../../lib/format';

export type Zoom = 'weeks' | 'months' | 'quarters';

export const ZOOMS: ReadonlyArray<{ value: Zoom; label: string }> = [
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
  { value: 'quarters', label: 'Quarters' },
];

export const isZoom = (v: unknown): v is Zoom => v === 'weeks' || v === 'months' || v === 'quarters';

/** Roughly the same density of labels at every zoom: a day, a week or a month is always ~190px of header. */
export const PX_PER_DAY: Record<Zoom, number> = { weeks: 27, months: 6.2, quarters: 2.1 };

/** A project with only one date is drawn four weeks long from the date it has. */
export const DEFAULT_SPAN_DAYS = 28;

const MONDAY = { weekStartsOn: 1 as const };

export type Scale = {
  zoom: Zoom;
  pxPerDay: number;
  start: Date;
  days: number;
  width: number;
  today: Date;
  /** Left edge of a day's column. */
  x: (day: Date | string) => number;
  /** The day whose column contains a track x. */
  dayAt: (x: number) => Date;
};

/**
 * The visible range covers today and every date on the timeline, padded and
 * snapped to whole units so the header never starts or ends mid-label. Dates
 * are clamped to two years either side of today, so one typo'd "2062" can't
 * make the Weeks zoom render thousands of day columns.
 */
export function buildScale(zoom: Zoom, dayStrings: string[], minTrackWidth: number): Scale {
  const pxPerDay = PX_PER_DAY[zoom];
  const today = startOfDay(new Date());
  const floor = subMonths(today, 24);
  const ceiling = addMonths(today, 24);
  const dates = dayStrings
    .map(parseDay)
    .filter(d => !Number.isNaN(d.getTime()))
    .map(d => (d < floor ? floor : d > ceiling ? ceiling : d));

  let lo = minDate([today, ...dates]);
  let hi = maxDate([today, ...dates]);
  if (zoom === 'weeks') {
    lo = startOfWeek(subWeeks(lo, 2), MONDAY);
    hi = endOfWeek(addWeeks(hi, 4), MONDAY);
  } else if (zoom === 'months') {
    lo = startOfMonth(subMonths(lo, 1));
    hi = endOfMonth(addMonths(hi, 2));
  } else {
    lo = startOfQuarter(subQuarters(lo, 1));
    hi = endOfQuarter(addQuarters(hi, 1));
  }
  lo = startOfDay(lo);

  // A short range still fills the viewport, so the grid never stops halfway across.
  const needed = Math.ceil(Math.max(0, minTrackWidth) / pxPerDay);
  if (differenceInCalendarDays(hi, lo) + 1 < needed) {
    const raw = addDays(lo, needed);
    hi = zoom === 'weeks' ? endOfWeek(raw, MONDAY) : zoom === 'months' ? endOfMonth(raw) : endOfQuarter(raw);
  }

  const days = differenceInCalendarDays(hi, lo) + 1;
  const start = lo;
  return {
    zoom,
    pxPerDay,
    start,
    days,
    width: days * pxPerDay,
    today,
    x: day => differenceInCalendarDays(typeof day === 'string' ? parseDay(day) : day, start) * pxPerDay,
    dayAt: x => addDays(start, Math.floor(x / pxPerDay)),
  };
}

export type Band = { key: string; x: number; width: number; label: string; weekend?: boolean };

/** Two header tiers: months (or quarters) on top; days, weeks or months beneath. */
export function headerBands(scale: Scale): { top: Band[]; bottom: Band[] } {
  const end = addDays(scale.start, scale.days);
  const span = (a: Date, b: Date) => {
    const from = a < scale.start ? scale.start : a;
    const to = b > end ? end : b;
    return { x: scale.x(from), width: scale.x(to) - scale.x(from) };
  };

  const top: Band[] = [];
  if (scale.zoom === 'quarters') {
    for (let d = startOfQuarter(scale.start); d < end; d = addQuarters(d, 1)) {
      top.push({ key: `q${toDayString(d)}`, ...span(d, addQuarters(d, 1)), label: `Q${getQuarter(d)} ${format(d, 'yyyy')}` });
    }
  } else {
    for (let d = startOfMonth(scale.start); d < end; d = addMonths(d, 1)) {
      top.push({ key: `m${toDayString(d)}`, ...span(d, addMonths(d, 1)), label: format(d, scale.zoom === 'weeks' ? 'MMMM yyyy' : 'MMM yyyy') });
    }
  }

  const bottom: Band[] = [];
  if (scale.zoom === 'weeks') {
    for (let d = scale.start; d < end; d = addDays(d, 1)) {
      bottom.push({ key: `d${toDayString(d)}`, ...span(d, addDays(d, 1)), label: format(d, 'd'), weekend: d.getDay() === 0 || d.getDay() === 6 });
    }
  } else if (scale.zoom === 'months') {
    for (let d = startOfWeek(scale.start, MONDAY); d < end; d = addWeeks(d, 1)) {
      const s = span(d, addWeeks(d, 1));
      // A sliver of a week at the start of the range has no room for a label.
      if (s.width >= scale.pxPerDay * 4) bottom.push({ key: `w${toDayString(d)}`, ...s, label: format(d, 'd') });
    }
  } else {
    for (let d = startOfMonth(scale.start); d < end; d = addMonths(d, 1)) {
      bottom.push({ key: `m${toDayString(d)}`, ...span(d, addMonths(d, 1)), label: format(d, 'MMM') });
    }
  }
  return { top, bottom };
}

/** Vertical guides: hairlines at each sub-unit, stronger wherever the top tier changes. */
export function gridLines(scale: Scale): Array<{ key: string; x: number; strong: boolean }> {
  const end = addDays(scale.start, scale.days);
  const lines = new Map<number, { key: string; x: number; strong: boolean }>();
  const add = (d: Date, strong: boolean) => {
    if (d <= scale.start || d >= end) return;
    const x = scale.x(d);
    const existing = lines.get(x);
    lines.set(x, { key: `g${toDayString(d)}`, x, strong: strong || Boolean(existing?.strong) });
  };
  if (scale.zoom === 'quarters') {
    for (let d = startOfMonth(scale.start); d < end; d = addMonths(d, 1)) add(d, false);
    for (let d = startOfQuarter(scale.start); d < end; d = addQuarters(d, 1)) add(d, true);
  } else {
    for (let d = startOfWeek(scale.start, MONDAY); d < end; d = addWeeks(d, 1)) add(d, false);
    for (let d = startOfMonth(scale.start); d < end; d = addMonths(d, 1)) add(d, true);
  }
  return [...lines.values()];
}

/** Saturday + Sunday bands — only at the Weeks zoom, where a day is wide enough to matter. */
export function weekendBands(scale: Scale): Array<{ key: string; x: number; width: number }> {
  if (scale.zoom !== 'weeks') return [];
  const end = addDays(scale.start, scale.days);
  const out: Array<{ key: string; x: number; width: number }> = [];
  for (let d = startOfWeek(scale.start, MONDAY); d < end; d = addWeeks(d, 1)) {
    const sat = addDays(d, 5);
    if (sat >= end) break;
    if (sat < scale.start) continue;
    out.push({ key: `we${toDayString(sat)}`, x: scale.x(sat), width: scale.pxPerDay * 2 });
  }
  return out;
}
