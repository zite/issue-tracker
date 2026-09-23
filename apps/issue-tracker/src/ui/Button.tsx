import { Slot } from '@radix-ui/react-slot';
import { CircleNotch } from '@phosphor-icons/react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';
import { Kbd } from './Kbd';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger' | 'highlight' | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary/90 active:bg-primary/80 shadow-hairline',
  secondary: 'bg-card text-ink border border-line-strong hover:bg-hover active:bg-pressed shadow-hairline',
  ghost: 'text-ink-2 hover:text-ink hover:bg-hover active:bg-pressed',
  quiet: 'text-ink hover:bg-hover active:bg-pressed',
  danger: 'bg-danger text-white hover:bg-danger/90 active:bg-danger/80 dark:text-paper',
  highlight: 'bg-highlight text-highlight-ink hover:brightness-[0.97] active:brightness-95 shadow-hairline',
  link: 'text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink px-0 h-auto',
};

const SIZES: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-meta gap-1 rounded-sm',
  sm: 'h-7 px-2.5 text-ui gap-1.5 rounded-sm',
  md: 'h-8 px-3 text-ui gap-1.5 rounded-md',
  lg: 'h-10 px-4 text-body gap-2 rounded-md',
};

const ICON_SIZES: Record<ButtonSize, string> = {
  xs: 'h-6 w-6 rounded-sm',
  sm: 'h-7 w-7 rounded-sm',
  md: 'h-8 w-8 rounded-md',
  lg: 'h-10 w-10 rounded-md',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square, icon-only. Always pass an aria-label. */
  icon?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** A keyboard hint rendered inside the button, e.g. "C". */
  shortcut?: string;
  loading?: boolean;
  asChild?: boolean;
};

/**
 * Issue Tracker's one button. Ink for the primary action on a screen, a bordered card
 * for secondary ones, ghost for toolbars, highlight for the single "decide"
 * action in a flow (accept an intake item, post a check-in).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, leading, trailing, shortcut, loading, asChild, className, children, disabled, type, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : type ?? 'button'}
      disabled={disabled || loading}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,color,box-shadow,filter] duration-100',
        'disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0',
        VARIANTS[variant],
        icon ? ICON_SIZES[size] : SIZES[size],
        className,
      )}
      {...rest}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <CircleNotch className="animate-spin" size={size === 'lg' ? 16 : 14} weight="bold" /> : leading}
          {children}
          {trailing}
          {shortcut && (
            <Kbd tone={variant === 'primary' ? 'inverse' : 'default'} className="-mr-1 ml-0.5">
              {shortcut}
            </Kbd>
          )}
        </>
      )}
    </Comp>
  );
});
