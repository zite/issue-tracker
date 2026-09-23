import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/**
 * A textarea as tall as its text. Returns a callback ref. Re-measures when the
 * text changes, when the element mounts (a dialog's portal mounts its content a
 * render late), when its width changes (a sheet sliding open, a phone rotating)
 * and once the display fonts have loaded — so a long title is never clipped.
 */
export function useAutoHeight(value: string) {
  const node = useRef<HTMLTextAreaElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);

  const fit = useCallback(() => {
    const el = node.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(fit, [value, fit]);
  useEffect(() => {
    document.fonts?.ready.then(fit).catch(() => undefined);
    return () => observer.current?.disconnect();
  }, [fit]);

  return useCallback(
    (el: HTMLTextAreaElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      node.current = el;
      if (!el) return;
      fit();
      if (typeof ResizeObserver === 'undefined') return;
      let width = el.clientWidth;
      observer.current = new ResizeObserver(() => {
        if (el.clientWidth === width) return;
        width = el.clientWidth;
        fit();
      });
      observer.current.observe(el);
    },
    [fit],
  );
}
