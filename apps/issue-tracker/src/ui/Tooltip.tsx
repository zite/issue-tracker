import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { Kbd } from './Kbd';

export const TooltipProvider = TooltipPrimitive.Provider;

/**
 * Ink tooltips with an optional shortcut. Wrap a single focusable child.
 * `content={null}` renders the child bare, which keeps call sites simple.
 */
export function Tooltip({
  content,
  shortcut,
  children,
  side = 'top',
  align = 'center',
  className,
  delay,
}: {
  content: ReactNode;
  shortcut?: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  className?: string;
  delay?: number;
}) {
  if (content == null || content === '') return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={delay}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'z-[80] flex max-w-[280px] items-center gap-2 rounded-sm bg-primary px-2 py-1 text-meta text-on-primary shadow-pop animate-fade-in',
            className,
          )}
        >
          <span className="min-w-0">{content}</span>
          {shortcut && <Kbd keys={shortcut} tone="inverse" />}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
