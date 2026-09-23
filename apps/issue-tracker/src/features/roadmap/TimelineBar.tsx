import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '../../ui/cn';
import { describeDates, isOverdue, projectProgress, type BarRange } from './projectMath';
import type { Scale } from './scale';

let measureCtx: CanvasRenderingContext2D | null | undefined;
const widthCache = new Map<string, number>();

/** Label width at the bar's font, measured once per name — character counts misjudge emoji and wide letters. */
function labelWidth(text: string) {
  const hit = widthCache.get(text);
  if (hit != null) return hit;
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d');
      if (measureCtx) measureCtx.font = '500 12px "Instrument Sans", ui-sans-serif, system-ui, sans-serif';
    } catch {
      measureCtx = null;
    }
  }
  const w = measureCtx ? measureCtx.measureText(text).width : text.length * 6.6;
  widthCache.set(text, w);
  return w;
}

export type BarPointerHandlers = {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>, project: BarProject, range: BarRange) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  onOpen: (projectId: string) => void;
  onHoverStart: (project: BarProject, el: HTMLElement, clientX: number) => void;
  onHoverEnd: () => void;
};

export type BarProject = {
  id: string; name: string; color: string | null; status: string;
  startDate: string | null; targetDate: string | null;
  total: number; completed: number; canceled: number;
};

/**
 * A project as a capsule: a soft wash of its colour, filled from the left to
 * its progress, a hairline ring of the same colour, and a vermilion cap on the
 * right end when it's past its target.
 */
export function TimelineBar({
  project, range, scale, rowHeight, height, dragging, stickyLeft, handlers,
}: {
  project: BarProject;
  range: BarRange;
  scale: Scale;
  rowHeight: number;
  height: number;
  /** Where the name column ends, so a label stays in view when its bar starts off-screen. */
  stickyLeft: number;
  /** Set while this bar is being dragged: it lifts. */
  dragging: boolean;
  handlers: BarPointerHandlers;
}) {
  const left = scale.x(range.start);
  const width = Math.max(scale.pxPerDay, scale.x(range.end) - left + scale.pxPerDay);
  const top = Math.round((rowHeight - height) / 2);
  const progress = projectProgress(project);
  const overdue = !dragging && isOverdue(project);
  const needed = labelWidth(project.name) + 24;
  const inside = width >= needed;
  const besideRight = scale.width - (left + width) >= needed + 8 || left < needed + 8;
  const edge = width < 30 ? 'w-1.5' : 'w-2.5';
  // The missing end of a one-date project fades out rather than pretending to a date nobody set.
  const fade = range.fadeEnd
    ? 'linear-gradient(to right, black 50%, transparent)'
    : range.fadeStart
      ? 'linear-gradient(to left, black 50%, transparent)'
      : undefined;
  const dates = describeDates({ startDate: range.fadeStart ? null : range.start, targetDate: range.fadeEnd ? null : range.end });

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${project.name}. ${dates}. Drag to reschedule, or press Enter to open.`}
        data-roadmap-bar={project.id}
        // overflow-clip, not hidden: hidden would make the bar a scroll container and break the sticky label.
        className={cn(
          'absolute flex select-none items-center overflow-clip rounded-full outline-offset-2 transition-shadow duration-150',
          'bg-[color:color-mix(in_oklab,var(--c)_18%,rgb(var(--card)))]',
          dragging ? 'z-[6] cursor-grabbing shadow-raised' : 'z-[2] cursor-grab hover:shadow-raised',
        )}
        style={{ left, width, top, height, ['--c' as string]: project.color || '#8A8275', WebkitMaskImage: fade, maskImage: fade } as CSSProperties}
        onPointerDown={e => handlers.onPointerDown(e, project, range)}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUp}
        onPointerCancel={handlers.onPointerCancel}
        onLostPointerCapture={handlers.onPointerCancel}
        onPointerEnter={e => e.pointerType === 'mouse' && handlers.onHoverStart(project, e.currentTarget, e.clientX)}
        onPointerLeave={handlers.onHoverEnd}
        onClick={() => handlers.onOpen(project.id)}
        onKeyDown={e => {
          if (e.key === 'Enter') handlers.onOpen(project.id);
        }}
      >
        {/* Progress fills from the start; a bar with no real start has nowhere honest to fill from. */}
        {!range.fadeStart && (
          <span aria-hidden className="absolute inset-y-0 left-0 bg-[color:color-mix(in_oklab,var(--c)_55%,rgb(var(--card)))]" style={{ width: `${progress * 100}%` }} />
        )}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--c)_35%,transparent)]',
            overdue && 'border-r-[3px] border-danger',
          )}
        />
        {inside && (
          <span
            className={cn('min-w-0 truncate px-2.5 text-meta font-medium leading-none text-ink', range.fadeStart ? 'relative ml-auto' : 'sticky')}
            style={range.fadeStart ? undefined : { left: stickyLeft }}
          >
            {project.name}
          </span>
        )}
        <span data-edge="start" aria-hidden className={cn('absolute inset-y-0 left-0 z-[1] cursor-ew-resize touch-none', edge)} />
        <span data-edge="end" aria-hidden className={cn('absolute inset-y-0 right-0 z-[1] cursor-ew-resize touch-none', edge)} />
      </div>

      {!inside && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => handlers.onOpen(project.id)}
          className="absolute z-[2] max-w-[240px] truncate whitespace-nowrap text-left text-meta text-ink-2 hover:text-ink"
          style={{ top, height, lineHeight: `${height}px`, ...(besideRight ? { left: left + width + 8 } : { right: scale.width - left + 8 }) }}
        >
          {project.name}
        </button>
      )}
    </>
  );
}
