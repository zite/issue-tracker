import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from '@phosphor-icons/react';
import { useRef, type ReactNode } from 'react';
import { Button } from './Button';
import { cn } from './cn';

/**
 * Radix returns focus to a DialogTrigger, but most Issue Tracker dialogs open from a menu
 * item, a shortcut or a URL flag. By the time they mount, focus sits on a menu item
 * that's about to vanish — so track the last element focused outside any menu or
 * popover, and hand focus back to that on close.
 */
const TRANSIENT = '[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]';
let lastSteadyFocus: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (el instanceof HTMLElement && !el.closest(`${TRANSIENT}, [role="dialog"], [role="alertdialog"]`)) lastSteadyFocus = el;
  });
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const WIDTHS = { sm: 'w-[420px]', md: 'w-[560px]', lg: 'w-[720px]', xl: 'w-[880px]' } as const;

/**
 * Dialogs sit high on the screen (not centred) so a growing body pushes down,
 * never up, and the title stays where the eye already is.
 */
export function DialogContent({
  children,
  size = 'md',
  className,
  onOpenAutoFocus,
  onEscapeKeyDown,
  label,
}: {
  children: ReactNode;
  size?: keyof typeof WIDTHS;
  className?: string;
  onOpenAutoFocus?: (e: Event) => void;
  onEscapeKeyDown?: (e: KeyboardEvent) => void;
  /** Accessible title when the visible header is custom. */
  label?: string;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-[rgb(var(--shadow)/0.28)] backdrop-blur-[1.5px] animate-fade-in dark:bg-black/55" />
      <DialogPrimitive.Content
        onOpenAutoFocus={e => {
          // Remember who had focus, so closing a dialog opened from code (a shortcut, a menu) hands it back.
          const active = document.activeElement;
          returnFocus.current = active instanceof HTMLElement && active !== document.body && !active.closest(TRANSIENT) ? active : lastSteadyFocus;
          if (onOpenAutoFocus) return onOpenAutoFocus(e);
          // Radix focuses the first tabbable element — usually the header's close button. A dialog
          // with a form should start in its first field; `data-autofocus` picks something else.
          const root = e.currentTarget as HTMLElement;
          const target = root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]), textarea:not([disabled]), [contenteditable="true"]');
          if (target) {
            e.preventDefault();
            target.focus();
          }
        }}
        onEscapeKeyDown={onEscapeKeyDown}
        onCloseAutoFocus={e => {
          const el = returnFocus.current;
          if (el && el.isConnected) {
            e.preventDefault();
            el.focus({ preventScroll: true });
          }
        }}
        aria-describedby={undefined}
        className={cn(
          'fixed left-1/2 top-[max(24px,11vh)] z-[65] flex max-h-[min(84vh,calc(100dvh-48px))] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-line bg-card text-ink shadow-pop outline-none animate-dialog-in',
          WIDTHS[size],
          className,
        )}
      >
        {label && <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ title, description, onClose, children }: { title: ReactNode; description?: ReactNode; onClose?: () => void; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-5 pb-2 pt-4">
      <div className="min-w-0 flex-1">
        <DialogPrimitive.Title className="font-display text-display-sm text-ink">{title}</DialogPrimitive.Title>
        {description && <DialogPrimitive.Description className="mt-0.5 text-ui text-ink-2">{description}</DialogPrimitive.Description>}
        {children}
      </div>
      <DialogPrimitive.Close asChild>
        <Button variant="ghost" size="sm" icon aria-label="Close" onClick={onClose} className="-mr-2 -mt-0.5">
          <X size={16} />
        </Button>
      </DialogPrimitive.Close>
    </div>
  );
}

export function DialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-3', className)}>{children}</div>;
}

export function DialogFooter({ children, className, start }: { children: ReactNode; className?: string; start?: ReactNode }) {
  return (
    <div className={cn('flex items-center gap-2 border-t border-line bg-paper/60 px-5 py-3', className)}>
      <div className="flex min-w-0 flex-1 items-center gap-2">{start}</div>
      {children}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={o => !o && onCancel()}>
      <DialogContent size="sm">
        <div className="px-5 pb-4 pt-5">
          <DialogPrimitive.Title className="font-display text-display-sm">{title}</DialogPrimitive.Title>
          {description && <DialogPrimitive.Description className="mt-1.5 text-body text-ink-2">{description}</DialogPrimitive.Description>}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
