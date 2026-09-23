import { Check, MagnifyingGlass, Plus } from '@phosphor-icons/react';
import { Command } from 'cmdk';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '../ui/cn';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';

export type Option<V> = {
  value: V;
  label: string;
  icon?: ReactNode;
  keywords?: string[];
  group?: string;
  hint?: ReactNode;
  /** A single key that picks this option while the search box is empty. */
  shortcut?: string;
  disabled?: boolean;
};

type Common<V> = {
  options: Option<V>[];
  placeholder?: string;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  width?: number;
  emptyText?: string;
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
  footer?: ReactNode;
  disabled?: boolean;
  title?: string;
};

type Single<V> = Common<V> & { multiple?: false; value: V | null | undefined; onChange: (value: V) => void };
type Multi<V> = Common<V> & { multiple: true; value: V[]; onChange: (value: V[]) => void };

export const pickerItem =
  'flex h-8 cursor-default select-none items-center gap-2.5 rounded-sm px-2 text-ui text-ink outline-none data-[selected=true]:bg-sunken data-[disabled=true]:opacity-45';

/**
 * The one picker every property uses: a searchable, keyboard-first popover.
 * Arrow keys move, Enter picks, typing filters, and a digit picks directly
 * while the search box is empty.
 */
export function OptionPicker<V extends string | number | null>(props: Single<V> | Multi<V>) {
  const { options, placeholder = 'Search…', trigger, align = 'start', side = 'bottom', width = 256, emptyText = 'Nothing matches', onCreate, createLabel, footer, disabled, title } = props;
  const [innerOpen, setInnerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const open = props.open ?? innerOpen;
  const setOpen = (v: boolean) => {
    if (props.onOpenChange) props.onOpenChange(v);
    else setInnerOpen(v);
    if (!v) setQuery('');
  };

  const selected = useMemo(() => new Set<V>(props.multiple ? props.value : props.value === undefined ? [] : [props.value as V]), [props.value, props.multiple]);

  const groups = useMemo(() => {
    const m = new Map<string, Option<V>[]>();
    for (const o of options) {
      const g = o.group ?? '';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(o);
    }
    return [...m.entries()];
  }, [options]);

  const pick = (o: Option<V>) => {
    if (o.disabled) return;
    if (props.multiple) {
      const next = selected.has(o.value) ? props.value.filter(v => v !== o.value) : [...props.value, o.value];
      props.onChange(next);
    } else {
      props.onChange(o.value);
      setOpen(false);
    }
  };

  const exact = options.some(o => o.label.toLowerCase() === query.trim().toLowerCase());
  const current = !props.multiple ? options.find(o => o.value === props.value) : undefined;

  return (
    <Popover open={open} onOpenChange={v => !disabled && setOpen(v)}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent align={align} side={side} className="overflow-hidden p-0" style={{ width }} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
        <Command
          loop
          // Open with the current value highlighted, so Enter on an untouched picker changes nothing.
          defaultValue={current ? `${current.label} ${String(current.value)}` : undefined}
          onKeyDown={e => {
            if (query || e.metaKey || e.ctrlKey || e.altKey) return;
            const hit = options.find(o => o.shortcut && o.shortcut === e.key);
            if (hit) {
              e.preventDefault();
              pick(hit);
            }
          }}
        >
          {title && <div className="px-3 pt-2.5 text-micro font-semibold uppercase text-ink-3">{title}</div>}
          <div className="flex items-center gap-2 border-b border-line px-3">
            <MagnifyingGlass size={14} className="shrink-0 text-ink-3" />
            <Command.Input value={query} onValueChange={setQuery} placeholder={placeholder} className="h-10 w-full bg-transparent text-ui text-ink outline-none placeholder:text-ink-3" />
          </div>
          <Command.List className="max-h-[320px] overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-ui text-ink-3">{emptyText}</Command.Empty>
            {groups.map(([group, items], gi) => (
              <Command.Group key={group || gi} heading={group || undefined} className={cn(gi > 0 && 'mt-1 border-t border-line pt-1', '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:text-micro [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-ink-3')}>
                {items.map(o => {
                  const isOn = selected.has(o.value);
                  return (
                    <Command.Item key={String(o.value)} value={`${o.label} ${String(o.value)}`} keywords={o.keywords} disabled={o.disabled} onSelect={() => pick(o)} className={pickerItem}>
                      {props.multiple && (
                        <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border', isOn ? 'border-primary bg-primary text-on-primary' : 'border-control')}>
                          {isOn && <Check size={10} weight="bold" />}
                        </span>
                      )}
                      {o.icon && <span className="flex w-4 shrink-0 items-center justify-center">{o.icon}</span>}
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.hint && <span className="shrink-0 text-meta text-ink-3">{o.hint}</span>}
                      {!props.multiple && isOn && <Check size={13} weight="bold" className="shrink-0 text-ink" />}
                      {o.shortcut && !query && <span className="w-3 shrink-0 text-right font-mono text-[10.5px] text-ink-3">{o.shortcut}</span>}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
            {onCreate && query.trim() && !exact && (
              <Command.Item value={`__create__ ${query}`} onSelect={() => { onCreate(query.trim()); setQuery(''); }} className={pickerItem}>
                <Plus size={14} className="text-ink-3" />
                <span className="truncate">{createLabel ? createLabel(query.trim()) : `Create “${query.trim()}”`}</span>
              </Command.Item>
            )}
          </Command.List>
          {footer && <div className="border-t border-line p-1">{footer}</div>}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
