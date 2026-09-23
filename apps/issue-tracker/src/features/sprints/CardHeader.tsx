import type { ReactNode } from 'react';
import { cn } from '../../ui/cn';

/** A card's title row: a section title, an optional quiet note, actions on the right. */
export function CardHeader({ title, note, action, className, children }: { title: ReactNode; note?: ReactNode; action?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <header className={cn('flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-3', className)}>
      <h2 className="text-title font-semibold text-ink">{title}</h2>
      {note && <span className="tabular truncate text-ui text-ink-3">{note}</span>}
      {action && <div className="ml-auto flex items-center gap-1.5">{action}</div>}
      {children}
    </header>
  );
}
