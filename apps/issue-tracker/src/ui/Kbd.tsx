import type { ReactNode } from 'react';
import { isMac } from '../lib/hotkeys';
import { cn } from './cn';

const GLYPHS: Record<string, string> = {
  mod: isMac ? '⌘' : 'Ctrl',
  shift: '⇧',
  alt: isMac ? '⌥' : 'Alt',
  enter: '↵',
  esc: 'Esc',
  backspace: '⌫',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  space: 'Space',
  tab: 'Tab',
};

/** Keycaps. `keys="mod+enter"` renders ⌘ ↵; plain children render as-is. */
export function Kbd({ children, keys, tone = 'default', className }: { children?: ReactNode; keys?: string; tone?: 'default' | 'inverse' | 'bare'; className?: string }) {
  // "mod+k" is a chord; "G I" (space-separated) is a sequence — both render as separate caps.
  const parts = keys ? keys.split(/\+| /).filter(Boolean).map(k => GLYPHS[k.toLowerCase()] ?? k.toUpperCase()) : null;
  const cap = (content: ReactNode, key?: string | number) => (
    <kbd
      key={key}
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs px-1 font-mono text-[10.5px] font-medium leading-none',
        tone === 'default' && 'bg-card text-ink-2 shadow-key ring-1 ring-line-strong',
        tone === 'inverse' && 'bg-on-primary/15 text-on-primary/80',
        tone === 'bare' && 'text-ink-3',
        className,
      )}
    >
      {content}
    </kbd>
  );
  if (!parts) return cap(children);
  return <span className="inline-flex items-center gap-0.5">{parts.map((p, i) => cap(p, i))}</span>;
}
