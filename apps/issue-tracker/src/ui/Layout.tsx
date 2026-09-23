import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Page chrome. Every page is: an optional eyebrow (the team or parent it
 * belongs to), a serif title, a line of description, actions on the right,
 * then a tab row. Content sits below on the paper ground, usually in cards.
 */
export function PageHeader({
  eyebrow, title, description, actions, tabs, className, titleAdornment, narrow,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  className?: string;
  titleAdornment?: ReactNode;
  /** Centre with a reading-width body (`PageBody narrow`). */
  narrow?: boolean;
}) {
  return (
    <header className={cn('px-4 pt-5 sm:px-7 sm:pt-7', narrow && 'mx-auto w-full max-w-[1120px]', className)}>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-[min(100%,280px)] flex-1">
          {eyebrow && <div className="mb-1.5 flex min-h-5 items-center gap-1.5 text-meta text-ink-2">{eyebrow}</div>}
          <div className="flex min-w-0 items-center gap-3">
            {titleAdornment}
            <h1 className="min-w-0 truncate font-display text-[28px] leading-9 text-ink sm:text-display">{title}</h1>
          </div>
          {description && <p className="mt-1 max-w-3xl text-body text-ink-2 text-pretty">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 pb-1">{actions}</div>}
      </div>
      {tabs && <div className="mt-4 border-b border-line">{tabs}</div>}
    </header>
  );
}

export function PageBody({ children, className, narrow }: { children: ReactNode; className?: string; narrow?: boolean }) {
  return <div className={cn('px-4 py-5 sm:px-7', narrow && 'mx-auto w-full max-w-[1120px]', className)}>{children}</div>;
}

export function Card({ children, className, as: As = 'div', padded }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article'; padded?: boolean }) {
  return <As className={cn('rounded-lg border border-line bg-card shadow-hairline', padded && 'p-4 sm:p-5', className)}>{children}</As>;
}

/** A titled section inside a page or card. */
export function Section({ title, count, action, children, className, description, id }: { title: ReactNode; count?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; description?: ReactNode; id?: string }) {
  return (
    <section id={id} className={cn('flex flex-col gap-3', className)}>
      <div className="flex min-h-7 items-center gap-2">
        <h2 className="text-title font-semibold text-ink">{title}</h2>
        {count != null && <span className="tabular text-ui text-ink-3">{count}</span>}
        {description && <span className="hidden truncate text-ui text-ink-3 sm:inline">· {description}</span>}
        {action && <div className="ml-auto flex items-center gap-1">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('text-micro font-semibold uppercase text-ink-3', className)}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-3.5 w-3.5" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3" />
          <div style={{ width: `${30 + ((i * 37) % 40)}%` }} />
        </div>
      ))}
    </div>
  );
}

/**
 * Empty states say what the surface is for and offer the one next step.
 * The glyph sits on a highlighter disc, the headline is set in the serif.
 */
export function EmptyState({ icon, title, children, actions, className, compact }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center animate-rise-in', compact ? 'px-4 py-8' : 'px-6 py-16', className)}>
      {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-highlight/35 text-ink dark:bg-highlight/15 dark:text-highlight">{icon}</div>}
      <h3 className={cn('font-display text-ink', compact ? 'text-[22px] leading-7' : 'text-display-sm')}>{title}</h3>
      {children && <div className="mt-1.5 max-w-md text-body text-ink-2 text-pretty">{children}</div>}
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}

/** Label/value rows for property panels. */
export function FactRow({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid min-h-8 grid-cols-[96px_minmax(0,1fr)] items-center gap-2', className)}>
      <div className="truncate text-ui text-ink-3">{label}</div>
      <div className="flex min-w-0 items-center">{children}</div>
    </div>
  );
}
