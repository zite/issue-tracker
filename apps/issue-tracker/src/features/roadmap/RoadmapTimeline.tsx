import { ArrowUpRight, CalendarPlus, CaretRight, CircleDashed, Flag, MapTrifold } from '@phosphor-icons/react';
import { addDays } from 'date-fns';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoalMark, HEALTH, HealthPill, Mark } from '../../glyphs';
import { PROJECT_STATUSES } from '../../lib/constants';
import { parseDay, plural, shortDate, toDayString } from '../../lib/format';
import type { Member, Milestone, ProjectSummary } from '../../lib/types';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useWorkspace, type Workspace } from '../../lib/workspace';
import { Avatar } from '../../ui/Avatar';
import { cn } from '../../ui/cn';
import { EmptyState, Skeleton } from '../../ui/Layout';
import { Tooltip } from '../../ui/Tooltip';
import { statusLabel } from '../projects/model';
import { ProjectHoverCard, type HoverAnchor } from './ProjectHoverCard';
import { barRange, describeDates, projectProgress, type BarRange } from './projectMath';
import { ProjectStatusGlyph } from '../../glyphs';
import { buildScale, gridLines, headerBands, weekendBands, type Scale, type Zoom } from './scale';
import { TimelineBar, type BarPointerHandlers, type BarProject } from './TimelineBar';
import { useRescheduleProject } from './useRescheduleProject';

export type RoadmapGrouping = 'goal' | 'team' | 'status' | 'none';

export const ROADMAP_GROUPINGS: ReadonlyArray<{ value: RoadmapGrouping; label: string }> = [
  { value: 'goal', label: 'Goal' },
  { value: 'team', label: 'Team' },
  { value: 'status', label: 'Status' },
  { value: 'none', label: 'No grouping' },
];

export const isRoadmapGrouping = (v: unknown): v is RoadmapGrouping => ROADMAP_GROUPINGS.some(g => g.value === v);

export type RoadmapTimelineHandle = { scrollToToday: (behavior?: ScrollBehavior) => void };

/** A dated line across the whole timeline — a goal's target, say. */
export type TimelineMarker = { date: string; label: string };

type Group = { key: string; label: string; icon: ReactNode; color: string | null; projects: ProjectSummary[]; target?: string | null; href?: string };

type DragMode = 'move' | 'start' | 'end' | 'create';
type DragState = {
  project: BarProject;
  mode: DragMode;
  pointerId: number;
  originX: number;
  lastX: number;
  originScroll: number;
  base: { start: string; end: string };
  had: { start: boolean; end: boolean };
  moved: boolean;
};
type Draft = BarRange & { id: string; pointerX: number };

type Row =
  | { kind: 'group'; key: string; group: Group; collapsed: boolean; first: boolean }
  | { kind: 'project'; key: string; project: ProjectSummary; indent: boolean; first: boolean }
  | { kind: 'unscheduled-header'; key: string; count: number; collapsed: boolean; first: boolean }
  | { kind: 'unscheduled'; key: string; project: ProjectSummary; first: boolean };

const UNSCHEDULED = '__unscheduled';
const noneIcon = <CircleDashed size={16} className="text-ink-3" />;

function sortByDates(list: ProjectSummary[]) {
  return [...list].sort((a, b) => {
    const ra = barRange(a.startDate, a.targetDate);
    const rb = barRange(b.startDate, b.targetDate);
    return (ra?.start ?? '9999').localeCompare(rb?.start ?? '9999') || (ra?.end ?? '').localeCompare(rb?.end ?? '') || a.name.localeCompare(b.name);
  });
}

function buildGroups(projects: ProjectSummary[], grouping: RoadmapGrouping, ws: Workspace): Group[] {
  if (grouping === 'none') return [{ key: 'all', label: 'All projects', icon: null, color: null, projects: sortByDates(projects) }];
  const buckets = new Map<string, ProjectSummary[]>();
  const push = (key: string, p: ProjectSummary) => {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  };
  const groups: Group[] = [];

  if (grouping === 'goal') {
    for (const p of projects) push(p.goalId && ws.goalById.has(p.goalId) ? p.goalId : '__none', p);
    for (const g of ws.goals) {
      const list = buckets.get(g.id);
      if (list) {
        groups.push({
          key: g.id, label: g.name, icon: <GoalMark icon={g.icon} color={g.color} size={18} />, color: g.color,
          projects: sortByDates(list), target: g.targetDate, href: `/goal/${g.id}`,
        });
      }
    }
    if (buckets.has('__none')) groups.push({ key: '__none', label: 'No goal', icon: noneIcon, color: null, projects: sortByDates(buckets.get('__none')!) });
  } else if (grouping === 'team') {
    for (const p of projects) push(p.teamId && ws.teamById.has(p.teamId) ? p.teamId : '__none', p);
    for (const t of ws.teams) {
      const list = buckets.get(t.id);
      if (list) {
        groups.push({
          key: t.id, label: t.name, icon: <Mark icon={t.icon} color={t.color} name={t.name} size={18} />, color: t.color,
          projects: sortByDates(list), href: `/${t.key.toLowerCase()}/projects`,
        });
      }
    }
    if (buckets.has('__none')) groups.push({ key: '__none', label: 'No team', icon: noneIcon, color: null, projects: sortByDates(buckets.get('__none')!) });
  } else {
    for (const p of projects) push(p.status, p);
    const order = [...PROJECT_STATUSES, ...[...buckets.keys()].filter(s => !(PROJECT_STATUSES as readonly string[]).includes(s))];
    for (const status of order) {
      const list = buckets.get(status);
      if (list) groups.push({ key: status, label: statusLabel(status), icon: <ProjectStatusGlyph status={status} size={15} />, color: null, projects: sortByDates(list) });
    }
  }
  return groups;
}

const inTrack = (scale: Scale, x: number) => x >= 0 && x <= scale.width;

// ---------------------------------------------------------------------------

const TimelineHeader = memo(function TimelineHeader({ scale, leftW, count, marker, scrollX }: { scale: Scale; leftW: number; count: number; marker?: TimelineMarker | null; scrollX: number }) {
  const bands = useMemo(() => headerBands(scale), [scale]);
  const todayX = scale.x(scale.today) + scale.pxPerDay / 2;
  const markerX = marker ? scale.x(marker.date) + scale.pxPerDay / 2 : -1;
  return (
    <div className="sticky top-0 z-30 flex h-12 shrink-0 border-b border-line bg-sunken">
      {/* Above the track's pills, which would otherwise slide over it when today scrolls under the name column. */}
      <div className="sticky left-0 z-20 flex shrink-0 items-end justify-between gap-2 border-r border-line bg-sunken px-4 pb-2" style={{ width: leftW }}>
        <span className="text-micro font-semibold uppercase text-ink-3">Projects</span>
        <span className="tabular text-meta text-ink-3">{count}</span>
      </div>
      <div className="relative shrink-0 select-none" style={{ width: scale.width }} aria-hidden>
        {bands.top.map((b, i) => (
          <div key={b.key} className={cn('absolute top-0 flex h-6 items-end', i > 0 && 'border-l border-line-strong')} style={{ left: b.x, width: b.width }}>
            {/* Sticky inside its band: a month's name stays readable while any of that month is on screen,
                and steps aside once too little of the month is left to hold it. */}
            {b.x + b.width - scrollX > b.label.length * 7.2 + 20 && (
              <span className="sticky truncate px-2 pb-0.5 text-micro font-semibold uppercase text-ink-2" style={{ left: leftW }}>
                {b.label}
              </span>
            )}
          </div>
        ))}
        {bands.bottom.map(b => {
          // A tick label under the Today or target pill would peek out around it; drop it.
          const labelX = scale.zoom === 'weeks' ? b.x + b.width / 2 : b.x + 10;
          // Half the pill plus half a label, so no digit peeks out from behind it.
          const reach = scale.zoom === 'weeks' ? 34 : 38;
          // So is one sliding under the name column, which would leave a sliver of a number at its edge.
          const covered = Math.abs(labelX - todayX) < reach || (marker != null && Math.abs(labelX - markerX) < reach + 12) || b.x + 2 < scrollX;
          return (
            <div
              key={b.key}
              className={cn(
                'tabular absolute bottom-0 flex h-6 items-center text-meta',
                // At the Weeks zoom weekdays read a step darker than the weekend.
                scale.zoom === 'weeks' && !b.weekend ? 'text-ink-2' : 'text-ink-3',
                scale.zoom === 'weeks' ? 'justify-center' : 'pl-1.5',
              )}
              style={{ left: b.x, width: b.width }}
            >
              {!covered && b.label}
            </div>
          );
        })}
        {marker && inTrack(scale, markerX) && (
          <div className="pointer-events-none absolute bottom-0 z-10 flex h-6 -translate-x-1/2 items-center" style={{ left: markerX }}>
            <span className="flex h-[18px] items-center gap-1 whitespace-nowrap rounded-full bg-card px-1.5 text-micro font-semibold text-ink ring-1 ring-inset ring-line-strong">
              <Flag size={10} weight="fill" /> {marker.label}
            </span>
          </div>
        )}
        {inTrack(scale, todayX) && (
          <div className="pointer-events-none absolute bottom-0 z-10 flex h-6 -translate-x-1/2 items-center" style={{ left: todayX }}>
            <span className="flex h-[18px] items-center rounded-full bg-primary px-2 text-micro font-semibold text-on-primary shadow-hairline">Today</span>
          </div>
        )}
      </div>
    </div>
  );
});

const TimelineGuides = memo(function TimelineGuides({ scale, leftW, marker }: { scale: Scale; leftW: number; marker?: TimelineMarker | null }) {
  const lines = useMemo(() => gridLines(scale), [scale]);
  const weekends = useMemo(() => weekendBands(scale), [scale]);
  const todayX = scale.x(scale.today) + scale.pxPerDay / 2;
  const markerX = marker ? scale.x(marker.date) + scale.pxPerDay / 2 : -1;
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: leftW, width: scale.width }}>
        {weekends.map(w => (
          <div key={w.key} className="absolute inset-y-0 bg-sunken/60" style={{ left: w.x, width: w.width }} />
        ))}
        {lines.map(l => (
          <div key={l.key} className={cn('absolute inset-y-0 w-px', l.strong ? 'bg-line-strong' : 'bg-line')} style={{ left: l.x }} />
        ))}
      </div>
      {marker && inTrack(scale, markerX) && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 z-[1] border-l-[1.5px] border-dashed border-ink-2" style={{ left: leftW + markerX }} />
      )}
      {inTrack(scale, todayX) && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 z-[1] w-0.5 -translate-x-1/2 bg-highlight" style={{ left: leftW + todayX }} />
      )}
    </>
  );
});

type RowShared = {
  scale: Scale;
  leftW: number;
  rowH: number;
  barH: number;
  narrow: boolean;
  coarse: boolean;
  compact: boolean;
  handlers: BarPointerHandlers & {
    onTrackPointerDown: (e: ReactPointerEvent<HTMLElement>, project: BarProject) => void;
  };
};

/** The live date chip that follows the pointer while a bar is dragged. */
function DragPill({ draft, scale, top }: { draft: Draft; scale: Scale; top: number }) {
  const label = describeDates({ startDate: draft.fadeStart ? null : draft.start, targetDate: draft.fadeEnd ? null : draft.end });
  return (
    <span
      className="tabular pointer-events-none absolute z-[7] flex h-6 -translate-x-1/2 items-center whitespace-nowrap rounded-sm bg-primary px-2 text-meta font-medium text-on-primary shadow-pop"
      style={{ left: Math.max(0, Math.min(scale.width, draft.pointerX)), top }}
    >
      {label}
    </span>
  );
}

const ProjectRow = memo(function ProjectRow({
  project, draft, lead, milestones, indent, unscheduled, first, shared,
}: {
  project: ProjectSummary;
  draft: Draft | null;
  lead: Member | undefined;
  milestones: Milestone[] | undefined;
  indent: boolean;
  unscheduled: boolean;
  first: boolean;
  shared: RowShared;
}) {
  const { scale, leftW, rowH, barH, narrow, coarse, compact, handlers } = shared;
  const range = draft ?? barRange(project.startDate, project.targetDate);
  const barTop = Math.round((rowH - barH) / 2);
  const creatable = unscheduled && !coarse;
  const health = HEALTH[project.health] ?? HEALTH.Unknown;

  return (
    <div className="group/row flex shrink-0" style={{ height: rowH }}>
      <div
        className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-line bg-card pr-3 transition-colors group-hover/row:bg-hover"
        style={{ width: leftW, paddingLeft: indent && !narrow ? 38 : narrow ? 12 : 16 }}
      >
        <Link to={`/project/${project.id}`} className="flex min-w-0 flex-1 items-center gap-2 rounded-xs text-ui text-ink">
          <Mark icon={project.icon} color={project.color} name={project.name} size={compact ? 16 : 18} />
          <span title={project.name} className="truncate hover:underline hover:decoration-line-strong hover:underline-offset-[3px]">{project.name}</span>
        </Link>
        <Tooltip content={project.health === 'Unknown' ? 'No check-in yet' : health.label}>
          <span className="flex shrink-0" aria-label={`Health: ${health.label}`}>
            <HealthPill health={project.health} compact />
          </span>
        </Tooltip>
        {!narrow && (
          <Tooltip content={lead ? `Lead: ${lead.name}` : 'No lead'}>
            <span className="flex shrink-0">
              <Avatar person={lead} size={20} />
            </span>
          </Tooltip>
        )}
      </div>
      <div
        className={cn('relative shrink-0 transition-colors group-hover/row:bg-hover/40', creatable && 'cursor-crosshair')}
        style={{ width: scale.width }}
        {...(unscheduled
          ? {
              onPointerDown: (e: ReactPointerEvent<HTMLElement>) => handlers.onTrackPointerDown(e, project),
              onPointerMove: handlers.onPointerMove,
              onPointerUp: handlers.onPointerUp,
              onPointerCancel: handlers.onPointerCancel,
              onLostPointerCapture: handlers.onPointerCancel,
              onClick: (e: React.MouseEvent) => e.target === e.currentTarget && !draft && handlers.onOpen(project.id),
            }
          : {})}
      >
        {range && (
          <TimelineBar
            project={project}
            range={range}
            scale={scale}
            rowHeight={rowH}
            height={barH}
            dragging={Boolean(draft)}
            stickyLeft={leftW}
            handlers={handlers}
          />
        )}
        {!draft &&
          milestones?.map(m => {
            if (!m.targetDate) return null;
            const x = scale.x(m.targetDate) + scale.pxPerDay / 2;
            if (!inTrack(scale, x)) return null;
            return (
              <Tooltip
                key={m.id}
                side="top"
                content={
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rotate-45 rounded-[1.5px] bg-on-primary" />
                    <span className="font-medium">{m.name}</span>
                    <span className="opacity-70">{shortDate(m.targetDate)}</span>
                  </span>
                }
              >
                <span className="absolute z-[3] flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={{ left: x, top: range ? barTop + barH + 2 : rowH / 2 }}>
                  <span className="h-[9px] w-[9px] rotate-45 rounded-[2px] bg-ink ring-2 ring-card" />
                </span>
              </Tooltip>
            );
          })}
        {draft && <DragPill draft={draft} scale={scale} top={first ? barTop + barH + 6 : barTop - 30} />}
      </div>
    </div>
  );
});

function GroupRow({
  icon, label, count, collapsed, first, onToggle, href, hrefLabel, track, height, leftW, width, narrow,
}: {
  icon: ReactNode; label: string; count: number; collapsed: boolean; first: boolean; onToggle: () => void;
  href?: string; hrefLabel?: string; track?: ReactNode; height: number; leftW: number; width: number; narrow: boolean;
}) {
  return (
    <div className={cn('group/group flex shrink-0 border-b border-line', !first && '-mt-px border-t')} style={{ height }}>
      <div className="sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r border-line bg-paper pl-2 pr-2" style={{ width: leftW }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-sm pl-1 pr-1 text-left text-ui font-semibold text-ink hover:bg-hover"
        >
          <CaretRight size={12} weight="bold" className={cn('shrink-0 text-ink-3 transition-transform duration-150', !collapsed && 'rotate-90')} />
          {icon}
          <span className="truncate" title={label}>{label}</span>
          {!narrow && <span className="tabular shrink-0 text-meta font-normal text-ink-3">{count}</span>}
        </button>
        {href && (
          <Tooltip content={hrefLabel ?? `Open ${label}`}>
            <Link
              to={href}
              aria-label={hrefLabel ?? `Open ${label}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-ink-3 opacity-0 transition-opacity hover:bg-hover hover:text-ink focus-visible:opacity-100 group-hover/group:opacity-100 max-sm:opacity-100"
            >
              <ArrowUpRight size={14} weight="bold" />
            </Link>
          </Tooltip>
        )}
      </div>
      <div className="relative shrink-0 bg-paper" style={{ width }}>
        {track}
      </div>
    </div>
  );
}

/**
 * A plain-DOM timeline: one scroll container holds a sticky name column and
 * the dated track side by side, so rows can never drift out of alignment and
 * the date header sticks while both axes scroll.
 *
 * Bars drag with pointer capture — the body moves both dates, an edge moves
 * one — and snap to whole days. Nothing is saved until release, and the save
 * is optimistic with an Undo.
 */
export const RoadmapTimeline = forwardRef<RoadmapTimelineHandle, {
  projects: ProjectSummary[];
  grouping: RoadmapGrouping;
  zoom: Zoom;
  compact?: boolean;
  marker?: TimelineMarker | null;
  className?: string;
}>(function RoadmapTimeline({ projects, grouping, zoom, compact = false, marker, className }, ref) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const reschedule = useRescheduleProject();
  const narrow = useMediaQuery('(max-width: 640px)');
  const coarse = useMediaQuery('(pointer: coarse)');
  const leftW = narrow ? (compact ? 148 : 172) : compact ? 248 : 280;
  const rowH = compact ? 38 : 40;
  const groupH = 38;
  const barH = compact ? 20 : 22;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [viewportW, setViewportW] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState<{ project: BarProject; anchor: HoverAnchor } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [scrollX, setScrollX] = useState(0);
  const isEmpty = projects.length === 0;

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setViewportW(el.clientWidth);
    const ro = new ResizeObserver(() => setViewportW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isEmpty]);

  const { scheduled, unscheduled } = useMemo(() => {
    const s: ProjectSummary[] = [];
    const u: ProjectSummary[] = [];
    for (const p of projects) (p.startDate || p.targetDate ? s : u).push(p);
    return { scheduled: s, unscheduled: [...u].sort((a, b) => a.name.localeCompare(b.name)) };
  }, [projects]);

  const groups = useMemo(() => buildGroups(scheduled, grouping, ws), [scheduled, grouping, ws]);

  const scaleDates = useMemo(() => {
    const out: string[] = [];
    for (const p of scheduled) {
      const r = barRange(p.startDate, p.targetDate);
      if (r) out.push(r.start, r.end);
    }
    for (const p of projects) for (const m of ws.milestonesByProject.get(p.id) ?? []) if (m.targetDate) out.push(m.targetDate);
    for (const g of groups) if (g.target) out.push(g.target);
    if (marker) out.push(marker.date);
    return out;
  }, [scheduled, projects, groups, ws.milestonesByProject, marker?.date]);

  const scale = useMemo(() => buildScale(zoom, scaleDates, viewportW - leftW), [zoom, scaleDates, viewportW, leftW]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const grouped = grouping !== 'none';
    for (const g of groups) {
      const isCollapsed = collapsed.has(g.key);
      if (grouped) out.push({ kind: 'group', key: `g:${g.key}`, group: g, collapsed: isCollapsed, first: out.length === 0 });
      if (!isCollapsed || !grouped) {
        for (const p of g.projects) out.push({ kind: 'project', key: p.id, project: p, indent: grouped, first: out.length === 0 });
      }
    }
    if (unscheduled.length) {
      const isCollapsed = collapsed.has(UNSCHEDULED);
      out.push({ kind: 'unscheduled-header', key: 'u:header', count: unscheduled.length, collapsed: isCollapsed, first: out.length === 0 });
      if (!isCollapsed) for (const p of unscheduled) out.push({ kind: 'unscheduled', key: p.id, project: p, first: false });
    }
    return out;
  }, [groups, unscheduled, collapsed, grouping]);

  const toggle = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ---- Scroll position -------------------------------------------------------
  // Handlers read refs so they stay referentially stable (rows are memoised).
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const leftWRef = useRef(leftW);
  leftWRef.current = leftW;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const rescheduleRef = useRef(reschedule);
  rescheduleRef.current = reschedule;
  /** The day in the middle of the visible track — a zoom change stays centred on what you were looking at. */
  const centerDay = useRef<Date | null>(null);

  const trackViewport = () => Math.max(0, (scrollerRef.current?.clientWidth ?? 0) - leftWRef.current);

  const scrollToDay = useCallback((day: Date, bias: number, behavior: ScrollBehavior = 'auto') => {
    const el = scrollerRef.current;
    if (!el) return;
    const s = scaleRef.current;
    el.scrollTo({ left: Math.max(0, s.x(day) + s.pxPerDay / 2 - trackViewport() * bias), behavior });
  }, []);

  useLayoutEffect(() => {
    if (!viewportW) return;
    const anchor = centerDay.current;
    // The first paint puts today a third of the way in, leaving more room for what's ahead.
    scrollToDay(anchor ?? scale.today, anchor ? 0.5 : 0.3);
  }, [scale.start.getTime(), scale.pxPerDay, leftW, viewportW > 0, scrollToDay]);

  useImperativeHandle(ref, () => ({ scrollToToday: (behavior = 'smooth') => scrollToDay(scaleRef.current.today, 0.3, behavior) }), [scrollToDay]);

  // ---- Hover card ------------------------------------------------------------
  const hoverTimer = useRef<number>();
  const drag = useRef<DragState | null>(null);

  const hideHover = useCallback(() => {
    window.clearTimeout(hoverTimer.current);
    setHover(h => (h ? null : h));
  }, []);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    centerDay.current = scaleRef.current.dayAt(el.scrollLeft + trackViewport() / 2);
    setScrollX(el.scrollLeft);
    hideHover();
  };

  // ---- Drag to reschedule ----------------------------------------------------
  const suppressClick = useRef(false);
  const autoScroll = useRef<number>();

  const computeDraft = useCallback((d: DragState): Draft => {
    const s = scaleRef.current;
    const el = scrollerRef.current;
    const scrollLeft = el?.scrollLeft ?? 0;
    const dx = d.lastX - d.originX + (scrollLeft - d.originScroll);
    const delta = Math.round(dx / s.pxPerDay);
    const start = parseDay(d.base.start);
    const end = parseDay(d.base.end);
    let ns = start;
    let ne = end;
    if (d.mode === 'move') {
      ns = addDays(start, delta);
      ne = addDays(end, delta);
    } else if (d.mode === 'start') {
      ns = addDays(start, delta);
      if (ns > end) ns = end;
    } else if (d.mode === 'end') {
      ne = addDays(end, delta);
      if (ne < start) ne = start;
    } else {
      const at = addDays(start, delta);
      if (at < start) ns = at;
      else ne = at;
    }
    const willHaveStart = d.mode === 'create' || d.mode === 'start' || d.had.start;
    const willHaveEnd = d.mode === 'create' || d.mode === 'end' || d.had.end;
    // The chip follows the pointer, kept clear of the name column and the far edge.
    const trackOrigin = (el?.getBoundingClientRect().left ?? 0) + leftWRef.current - scrollLeft;
    const visibleFrom = scrollLeft + 84;
    const visibleTo = scrollLeft + trackViewport() - 84;
    const pointerX = Math.max(visibleFrom, Math.min(visibleTo, d.lastX - trackOrigin));
    return { id: d.project.id, start: toDayString(ns), end: toDayString(ne), fadeStart: !willHaveStart, fadeEnd: !willHaveEnd, pointerX };
  }, []);

  const stopDrag = useCallback(() => {
    drag.current = null;
    window.clearInterval(autoScroll.current);
    setDraft(null);
  }, []);

  const handlers = useMemo<RowShared['handlers']>(() => {
    const begin = (e: ReactPointerEvent<HTMLElement>, partial: Pick<DragState, 'project' | 'mode' | 'base' | 'had'>) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer may already be gone */
      }
      drag.current = { ...partial, pointerId: e.pointerId, originX: e.clientX, lastX: e.clientX, originScroll: scrollerRef.current?.scrollLeft ?? 0, moved: false };
    };

    // Edge scrolling keyed off the POINTER's distance from the track edge: scrolling doesn't move the pointer, so it can't run away.
    // An interval rather than requestAnimationFrame, which some embedded and background contexts never fire.
    const startAutoScroll = () => {
      window.clearInterval(autoScroll.current);
      autoScroll.current = window.setInterval(() => {
        const d = drag.current;
        const el = scrollerRef.current;
        if (!d || !el) return;
        const rect = el.getBoundingClientRect();
        const from = rect.left + leftWRef.current;
        const zone = 56;
        let v = 0;
        if (d.lastX < from + zone) v = -Math.min(24, Math.ceil((from + zone - d.lastX) / 3));
        else if (d.lastX > rect.right - zone) v = Math.min(24, Math.ceil((d.lastX - (rect.right - zone)) / 3));
        if (!v) return;
        const before = el.scrollLeft;
        el.scrollLeft += v;
        if (el.scrollLeft !== before) setDraft(computeDraft(d));
      }, 16);
    };

    return {
      onPointerDown: (e, project, range) => {
        if (e.button !== 0 || !e.isPrimary) return;
        const edge = (e.target as HTMLElement).closest<HTMLElement>('[data-edge]')?.dataset.edge;
        // On touch only the edge handles drag; a finger on the body should still scroll the timeline.
        if (e.pointerType === 'touch' && !edge) return;
        const had = { start: Boolean(project.startDate), end: Boolean(project.targetDate) };
        let mode: DragMode = edge === 'start' ? 'start' : edge === 'end' ? 'end' : 'move';
        // The real edge of a one-date bar is its only date: dragging it moves the bar.
        if (mode === 'start' && !had.end) mode = 'move';
        if (mode === 'end' && !had.start) mode = 'move';
        begin(e, { project, mode, base: { start: range.start, end: range.end }, had });
      },
      onTrackPointerDown: (e, project) => {
        if (e.button !== 0 || !e.isPrimary || e.pointerType === 'touch' || e.target !== e.currentTarget) return;
        const at = toDayString(scaleRef.current.dayAt(e.clientX - e.currentTarget.getBoundingClientRect().left));
        begin(e, { project, mode: 'create', base: { start: at, end: at }, had: { start: false, end: false } });
      },
      onPointerMove: e => {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;
        d.lastX = e.clientX;
        if (!d.moved) {
          if (Math.abs(e.clientX - d.originX) < 4) return;
          d.moved = true;
          window.clearTimeout(hoverTimer.current);
          setHover(null);
          startAutoScroll();
        }
        setDraft(computeDraft(d));
      },
      onPointerUp: e => {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;
        const next = computeDraft(d);
        stopDrag();
        if (!d.moved) return;
        // The click that follows a drag's pointerup must not open the project.
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), 0);

        const p = d.project;
        let startDate = p.startDate;
        let targetDate = p.targetDate;
        if (d.mode === 'create') {
          startDate = next.start;
          targetDate = next.end;
        } else if (d.mode === 'start') startDate = next.start;
        else if (d.mode === 'end') targetDate = next.end;
        else {
          if (d.had.start) startDate = next.start;
          if (d.had.end) targetDate = next.end;
        }
        if (startDate === p.startDate && targetDate === p.targetDate) return;
        void rescheduleRef.current(p, { startDate, targetDate });
      },
      onPointerCancel: e => {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;
        stopDrag();
      },
      onOpen: id => {
        if (suppressClick.current || drag.current?.moved) return;
        navigateRef.current(`/project/${id}`);
      },
      onHoverStart: (project, el, clientX) => {
        window.clearTimeout(hoverTimer.current);
        hoverTimer.current = window.setTimeout(() => {
          if (drag.current || !el.isConnected) return;
          const r = el.getBoundingClientRect();
          setHover({ project, anchor: { x: Math.max(r.left, Math.min(r.right, clientX)), top: r.top, bottom: r.bottom } });
        }, 320);
      },
      onHoverEnd: () => {
        window.clearTimeout(hoverTimer.current);
        setHover(null);
      },
    };
  }, [computeDraft, stopDrag]);

  // Escape abandons a drag without saving.
  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        // The button is still held; the click its release produces must not open the project either.
        if (drag.current?.moved) {
          suppressClick.current = true;
          window.addEventListener('pointerup', () => window.setTimeout(() => (suppressClick.current = false), 0), { once: true, capture: true });
        }
        stopDrag();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [Boolean(draft), stopDrag]);

  useEffect(
    () => () => {
      window.clearInterval(autoScroll.current);
      window.clearTimeout(hoverTimer.current);
    },
    [],
  );

  const shared = useMemo<RowShared>(() => ({ scale, leftW, rowH, barH, narrow, coarse, compact, handlers }), [scale, leftW, rowH, barH, narrow, coarse, compact, handlers]);

  // Keep the hovered card's data fresh after an optimistic move.
  const hovered = hover ? projects.find(p => p.id === hover.project.id) : null;

  if (isEmpty) {
    return (
      <div className={className}>
        <EmptyState icon={<MapTrifold size={22} weight="duotone" />} title="No projects to show" compact>
          Projects with a start or target date appear here as bars you can drag.
        </EmptyState>
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      onScroll={onScroll}
      className={cn('relative overscroll-x-contain', compact ? 'overflow-x-auto overflow-y-hidden' : 'overflow-auto', draft && 'select-none', className)}
    >
      <div className="relative flex min-h-full flex-col overflow-x-clip" style={{ width: leftW + scale.width }}>
        <TimelineHeader scale={scale} leftW={leftW} count={projects.length} marker={marker} scrollX={scrollX} />
        <div className="relative flex flex-1 flex-col">
          <TimelineGuides scale={scale} leftW={leftW} marker={marker} />
          {rows.map(row => {
            if (row.kind === 'group') {
              const g = row.group;
              let span: { x: number; w: number } | null = null;
              for (const p of g.projects) {
                const r = barRange(p.startDate, p.targetDate);
                if (!r) continue;
                const x0 = scale.x(r.start);
                const x1 = scale.x(r.end) + scale.pxPerDay;
                span = span ? { x: Math.min(span.x, x0), w: Math.max(span.x + span.w, x1) - Math.min(span.x, x0) } : { x: x0, w: x1 - x0 };
              }
              const done = g.projects.reduce((n, p) => n + projectProgress(p), 0) / Math.max(1, g.projects.length);
              const targetX = g.target ? scale.x(g.target) + scale.pxPerDay / 2 : -1;
              return (
                <GroupRow
                  key={row.key}
                  icon={g.icon}
                  label={g.label}
                  count={g.projects.length}
                  collapsed={row.collapsed}
                  first={row.first}
                  onToggle={() => toggle(g.key)}
                  href={g.href}
                  hrefLabel={grouping === 'goal' ? `Open ${g.label}` : grouping === 'team' ? `${g.label} projects` : undefined}
                  height={groupH}
                  leftW={leftW}
                  width={scale.width}
                  narrow={narrow}
                  track={
                    <>
                      {span && (
                        <Tooltip content={`${g.label} · ${plural(g.projects.length, 'project')} · ${Math.round(done * 100)}% average progress`} side="top">
                          <div
                            className={cn(
                              'absolute top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full',
                              g.color ? 'bg-[color:color-mix(in_oklab,var(--c)_22%,rgb(var(--paper)))]' : 'bg-line-strong/60',
                            )}
                            style={{ left: span.x, width: span.w, ['--c' as string]: g.color ?? undefined } as CSSProperties}
                          >
                            <div className={cn('h-full rounded-full', g.color ? 'bg-[color:color-mix(in_oklab,var(--c)_70%,rgb(var(--paper)))]' : 'bg-ink-3')} style={{ width: `${done * 100}%` }} />
                          </div>
                        </Tooltip>
                      )}
                      {g.target && inTrack(scale, targetX) && (
                        <Tooltip content={`Goal target · ${shortDate(g.target)}`} side="top">
                          <span
                            className="absolute top-1/2 z-[3] flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-card text-ink shadow-hairline ring-1 ring-line-strong"
                            style={{ left: targetX }}
                          >
                            <Flag size={11} weight="fill" />
                          </span>
                        </Tooltip>
                      )}
                    </>
                  }
                />
              );
            }
            if (row.kind === 'unscheduled-header') {
              return (
                <GroupRow
                  key={row.key}
                  icon={<CalendarPlus size={16} className="text-ink-3" />}
                  label="Unscheduled"
                  count={row.count}
                  collapsed={row.collapsed}
                  first={row.first}
                  onToggle={() => toggle(UNSCHEDULED)}
                  height={groupH}
                  leftW={leftW}
                  width={scale.width}
                  narrow={narrow}
                  track={
                    <div className="flex h-full items-center">
                      <span className="sticky z-[2] truncate rounded-xs bg-paper px-4 text-meta text-ink-3" style={{ left: leftW }}>
                        {coarse ? 'No dates yet — open a project to set its start and target' : 'No dates yet — drag across a row to schedule it, or open the project'}
                      </span>
                    </div>
                  }
                />
              );
            }
            const p = row.project;
            return (
              <ProjectRow
                key={row.key}
                project={p}
                draft={draft?.id === p.id ? draft : null}
                lead={p.leadId ? ws.memberById.get(p.leadId) : undefined}
                milestones={ws.milestonesByProject.get(p.id)}
                indent={row.kind === 'project' && row.indent}
                unscheduled={row.kind === 'unscheduled'}
                first={row.first}
                shared={shared}
              />
            );
          })}
          {/* Carries the name column's edge down to the bottom when there are few rows. */}
          <div className="flex flex-1">
            <div className="sticky left-0 z-20 shrink-0 border-r border-line bg-card" style={{ width: leftW }} />
          </div>
        </div>
      </div>
      {hovered && hover && !draft && <ProjectHoverCard project={hovered} anchor={hover.anchor} />}
    </div>
  );
});

/** Loading placeholder with the timeline's own geometry, so nothing jumps when data lands. */
export function RoadmapSkeleton({ rows = 9, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col overflow-hidden', className)} aria-busy>
      <div className="flex h-12 shrink-0 border-b border-line bg-sunken">
        <div className="w-[164px] shrink-0 border-r border-line sm:w-[280px]" />
        <div className="flex flex-1 items-end gap-24 px-4 pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-2.5 w-14" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-10 shrink-0">
          <div className="flex w-[164px] shrink-0 items-center gap-2 border-r border-line px-4 sm:w-[280px]">
            <Skeleton className="h-[18px] w-[18px] shrink-0 rounded-[5px]" />
            <div className="skeleton h-3" style={{ width: `${35 + ((i * 29) % 40)}%` }} />
          </div>
          <div className="relative flex-1">
            <div className="skeleton absolute top-1/2 h-[22px] -translate-y-1/2 !rounded-full" style={{ left: `${(i * 17) % 55}%`, width: `${14 + ((i * 23) % 30)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
