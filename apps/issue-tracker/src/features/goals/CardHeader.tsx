import type { ReactNode } from 'react';

/** A card's title bar — the same rhythm as Home's panels: title, a count in ink-3, a hint, actions on the right. */
export function CardHeader({ title, count, hint, action }: { title: ReactNode; count?: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-2 border-b border-line py-1.5 pl-4 pr-2.5">
      <h2 className="text-title font-semibold text-ink">{title}</h2>
      {count != null && <span className="tabular text-ui text-ink-3">{count}</span>}
      {hint && <span className="hidden min-w-0 truncate text-ui text-ink-3 sm:inline">· {hint}</span>}
      {action && <div className="ml-auto flex shrink-0 items-center gap-1">{action}</div>}
    </div>
  );
}
