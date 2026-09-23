import { Check } from '@phosphor-icons/react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { PROJECT_ICONS, SWATCHES } from '../../lib/constants';
import { cn } from '../../ui/cn';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/Popover';

/** An emoji grid and a swatch row. Picks apply immediately; the popover stays open to try a few. */
export function IconColorPicker({
  icon, color, onChange, children, align = 'start',
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  onChange: (patch: { icon?: string; color?: string }) => void;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-[280px] p-3" onClick={e => e.stopPropagation()}>
        <div className="mb-1.5 text-micro font-semibold uppercase text-ink-3">Icon</div>
        <div className="grid grid-cols-8 gap-0.5">
          {PROJECT_ICONS.map(i => (
            <button
              key={i}
              type="button"
              aria-label={`Use icon ${i}`}
              aria-pressed={i === icon}
              onClick={() => onChange({ icon: i })}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-sm text-[16px] leading-none transition-colors hover:bg-hover',
                i === icon && 'bg-highlight/35 ring-1 ring-inset ring-highlight dark:bg-highlight/15',
              )}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="mb-1.5 mt-3 text-micro font-semibold uppercase text-ink-3">Colour</div>
        <div className="grid grid-cols-8 gap-0.5">
          {SWATCHES.map(c => (
            <button
              key={c}
              type="button"
              aria-label={`Use colour ${c}`}
              aria-pressed={c === color}
              onClick={() => onChange({ color: c })}
              className="flex h-8 w-8 items-center justify-center rounded-sm transition-colors hover:bg-hover"
            >
              <span
                style={{ ['--c' as string]: c } as CSSProperties}
                className={cn('flex h-5 w-5 items-center justify-center rounded-[30%] bg-[var(--c)] text-white', c === color && 'ring-2 ring-ink ring-offset-2 ring-offset-card')}
              >
                {c === color && <Check size={11} weight="bold" />}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
