import { X } from '@phosphor-icons/react';
import { useEffect } from 'react';
import { useIssue } from '../lib/queries';
import { hasOpenOverlay } from '../lib/hotkeys';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Layout';
import { IssueDetailView } from './IssueDetail';

/**
 * The issue sheet: a panel docked to the right of the page, below the top
 * bar. It is deliberately NOT modal — the list behind it stays interactive,
 * so J/K keep walking through issues and a click on another row swaps it.
 */
export function IssueSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isPending, isError, error, refetch } = useIssue(id);
  const missing = isError && /not found|\(404\)/i.test(String((error as Error | null)?.message ?? ''));

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (hasOpenOverlay()) return;
      e.preventDefault();
      onClose();
    };
    // Capture, so the list's own Esc (clear focus) doesn't run first while the sheet is up.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [id, onClose]);

  if (!id) return null;

  return (
    <aside
      aria-label="Issue"
      className="fixed bottom-0 right-0 top-14 z-30 flex w-full max-w-[100vw] flex-col border-l border-line bg-card shadow-sheet animate-sheet-in sm:w-[min(780px,calc(100vw-120px))]"
    >
      {isPending ? (
        <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading issue">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
            <Skeleton className="h-[18px] w-[18px] rounded-xs" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-14 rounded-xs" />
          </div>
          <div className="space-y-4 px-5 pt-5 sm:px-8">
            <Skeleton className="h-8 w-4/5" />
            <Skeleton className="h-[168px] w-full rounded-lg" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </div>
      ) : isError ? (
        <div className="flex h-full flex-col">
          <div className="flex h-12 shrink-0 items-center justify-end border-b border-line px-3">
            <Button variant="ghost" size="sm" icon onClick={onClose} aria-label="Close">
              <X size={16} />
            </Button>
          </div>
          <div className="flex flex-col items-start gap-3 p-8">
            <p className="font-display text-display-sm">{missing ? 'That issue doesn’t exist anymore' : 'That issue couldn’t be opened'}</p>
            <p className="text-body text-ink-2">{missing ? 'It was deleted, or the link points somewhere that never existed.' : 'The connection dropped while loading it. Try again in a moment.'}</p>
            <div className="flex gap-2">
              {!missing && <Button onClick={() => refetch()}>Try again</Button>}
              <Button variant={missing ? 'secondary' : 'ghost'} onClick={onClose}>Close</Button>
            </div>
          </div>
        </div>
      ) : data ? (
        <IssueDetailView key={data.issue.id} detail={data} mode="sheet" onClose={onClose} />
      ) : null}
    </aside>
  );
}
