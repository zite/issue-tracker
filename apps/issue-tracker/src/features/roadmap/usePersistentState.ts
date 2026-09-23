import { useCallback, useState } from 'react';

/** State mirrored to localStorage. `sanitize` turns whatever was stored (stale, hand-edited, missing) into a valid value. */
export function usePersistentState<T>(key: string, sanitize: (raw: unknown) => T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return sanitize(raw == null ? undefined : JSON.parse(raw));
    } catch {
      return sanitize(undefined);
    }
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue(prev => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* storage full or blocked — the choice still applies for this visit */
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set] as const;
}
