import { useEffect } from 'react';

/**
 * The browser tab names the page: `useDocumentTitle('Sprints', 'Engineering')`
 * → "Sprints · Engineering · Issue Tracker". Empty parts are skipped, so callers can
 * pass values that are still loading.
 */
export function useDocumentTitle(...parts: Array<string | null | undefined | false>) {
  const title = parts.filter(Boolean).join(' · ');
  useEffect(() => {
    document.title = title ? `${title} · Issue Tracker` : 'Issue Tracker';
    return () => {
      document.title = 'Issue Tracker';
    };
  }, [title]);
}
