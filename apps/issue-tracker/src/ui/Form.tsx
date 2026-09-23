import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check, MagnifyingGlass, Minus, X } from '@phosphor-icons/react';
import { forwardRef, useEffect, useImperativeHandle, useRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

const control =
  'w-full rounded-md border border-control/60 bg-card px-2.5 text-ui text-ink shadow-hairline transition-[border-color,box-shadow] placeholder:text-ink-3 hover:border-control focus:border-ink/60 focus:outline-none focus:ring-[3px] focus:ring-highlight/45 disabled:cursor-not-allowed disabled:opacity-55';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, 'h-8', invalid && 'border-danger focus:border-danger focus:ring-danger/20', className)} {...props} />;
});

/** A textarea that grows with its content. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; maxHeight?: number; bare?: boolean }>(
  function Textarea({ className, minRows = 2, maxHeight = 360, bare, value, ...props }, ref) {
    const inner = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => inner.current!);
    useEffect(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = '0px';
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
      const padding = bare ? 0 : 16;
      el.style.height = `${Math.min(maxHeight, Math.max(el.scrollHeight, minRows * lineHeight + padding))}px`;
    }, [value, maxHeight, minRows, bare]);
    return (
      <textarea
        ref={inner}
        rows={minRows}
        value={value}
        className={cn(bare ? 'w-full resize-none bg-transparent outline-none placeholder:text-ink-3' : cn(control, 'resize-none py-2 leading-5'), className)}
        {...props}
      />
    );
  },
);

export function Field({ label, hint, error, children, className, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-meta font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? <p className="text-meta text-danger">{error}</p> : hint ? <p className="text-meta text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function SearchField({
  value, onChange, placeholder = 'Search', className, autoFocus, onKeyDown, inputRef,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void; inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div className={cn('relative', className)}>
      <MagnifyingGlass size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
      <input
        ref={inputRef}
        value={value}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={cn(control, 'h-8 pl-8 pr-7')}
      />
      {value && (
        <button type="button" aria-label="Clear" onClick={() => onChange('')} className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-xs text-ink-3 hover:bg-hover hover:text-ink">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export function Switch({ checked, onCheckedChange, disabled, label, size = 'md', id }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; label?: string; size?: 'sm' | 'md'; id?: string }) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-colors disabled:opacity-50',
        'bg-line-strong data-[state=checked]:bg-primary',
        size === 'md' ? 'h-5 w-9' : 'h-4 w-7',
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block rounded-full bg-card shadow-[0_1px_2px_rgb(var(--shadow)/0.3)] transition-transform data-[state=checked]:bg-on-primary',
          size === 'md' ? 'h-4 w-4 translate-x-0.5 data-[state=checked]:translate-x-[18px]' : 'h-3 w-3 translate-x-0.5 data-[state=checked]:translate-x-[14px]',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

/** A square checkbox — Issue Tracker's rows are ledger lines you tick. */
export function Checkbox({
  checked, onChange, indeterminate, className, label, size = 14,
}: { checked: boolean; onChange?: (next: boolean, e: React.MouseEvent) => void; indeterminate?: boolean; className?: string; label?: string; size?: number }) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={e => {
        e.stopPropagation();
        onChange?.(!checked, e);
      }}
      style={{ width: size, height: size }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[4px] border transition-colors',
        on ? 'border-primary bg-primary text-on-primary' : 'border-control bg-card hover:border-ink-2',
        className,
      )}
    >
      {indeterminate ? <Minus size={size - 4} weight="bold" /> : checked ? <Check size={size - 4} weight="bold" /> : null}
    </button>
  );
}

export type SegmentOption<V extends string> = { value: V; label?: ReactNode; icon?: ReactNode; title?: string };

/** A small segmented control for mutually exclusive modes (layout, zoom, health). */
export function Segmented<V extends string>({
  value, onChange, options, size = 'sm', className,
}: { value: V; onChange: (v: V) => void; options: SegmentOption<V>[]; size?: 'xs' | 'sm'; className?: string }) {
  return (
    <div role="radiogroup" className={cn('inline-flex items-center gap-0.5 rounded-md bg-sunken p-0.5 ring-1 ring-inset ring-line', className)}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            aria-label={o.label ? undefined : o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-sm font-medium transition-colors',
              size === 'sm' ? 'h-6 px-2 text-meta' : 'h-5 px-1.5 text-micro',
              active ? 'bg-card text-ink shadow-raised' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
