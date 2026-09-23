import { ArrowCounterClockwise, CaretDown, Check, SlidersHorizontal } from '@phosphor-icons/react';
import { DISPLAY_PROPERTIES, GROUPINGS, ORDERINGS, type DisplayProperty, type Grouping, type Ordering } from '../lib/constants';
import type { ViewOptions } from '../lib/view';
import { cn } from '../ui/cn';
import { Segmented, Switch } from '../ui/Form';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '../ui/Menu';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';

function SelectRow<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: ReadonlyArray<{ value: V; label: string }>; onChange: (v: V) => void }) {
  const current = options.find(o => o.value === value);
  return (
    <div className="flex h-9 items-center justify-between gap-3">
      <span className="text-ui text-ink-2">{label}</span>
      <Menu>
        <MenuTrigger asChild>
          <button type="button" className="inline-flex h-7 min-w-[132px] items-center justify-between gap-2 rounded-sm bg-card px-2.5 text-ui font-medium text-ink shadow-hairline ring-1 ring-line-strong hover:bg-hover data-[state=open]:bg-hover">
            {current?.label ?? value}
            <CaretDown size={11} className="text-ink-3" />
          </button>
        </MenuTrigger>
        <MenuContent align="end" className="min-w-[180px]">
          <MenuRadioGroup value={value} onValueChange={v => onChange(v as V)}>
            {options.map(o => (
              <MenuRadioItem key={o.value} value={o.value}>
                {o.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
    </div>
  );
}

/**
 * Everything about how a list is shown — grouping, order, which work is
 * included, and which columns appear. Changes apply immediately and are
 * remembered per surface.
 */
export function DisplayMenu({ options, onChange, onReset, isDirty }: { options: ViewOptions; onChange: (patch: Partial<ViewOptions>) => void; onReset: () => void; isDirty: boolean }) {
  const toggleProperty = (key: DisplayProperty) => {
    const set = new Set(options.properties);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    onChange({ properties: DISPLAY_PROPERTIES.map(p => p.key).filter(k => set.has(k)) });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="relative inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-ui font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink data-[state=open]:bg-hover data-[state=open]:text-ink">
          <SlidersHorizontal size={14} />
          <span className="hidden sm:inline">Display</span>
          {isDirty && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-signal" aria-label="Customised" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0">
        <div className="px-4 pb-2 pt-3">
          <SelectRow label={options.layout === 'board' ? 'Columns by' : 'Group by'} value={options.grouping as Grouping} options={options.layout === 'board' ? GROUPINGS.filter(g => g.value !== 'none') : GROUPINGS} onChange={v => onChange({ grouping: v })} />
          <SelectRow label="Order by" value={options.ordering as Ordering} options={ORDERINGS} onChange={v => onChange({ ordering: v })} />
          <div className="flex h-10 items-center justify-between gap-3">
            <span className="text-ui text-ink-2">Done work</span>
            <Segmented
              size="xs"
              value={options.completed}
              onChange={v => onChange({ completed: v })}
              options={[
                { value: 'all', label: 'All' },
                { value: 'month', label: '30d' },
                { value: 'week', label: '7d' },
                { value: 'none', label: 'Hide' },
              ]}
            />
          </div>
        </div>
        <div className="border-t border-line px-4 py-2">
          {([
            ['subIssues', 'Show sub-issues'],
            ['emptyGroups', 'Show empty groups'],
            ['showArchived', 'Show archived issues'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex h-8 cursor-pointer items-center justify-between text-ui text-ink">
              {label}
              <Switch size="sm" checked={Boolean(options[key])} onCheckedChange={v => onChange({ [key]: v } as Partial<ViewOptions>)} />
            </label>
          ))}
        </div>
        <div className="border-t border-line px-4 pb-3 pt-2.5">
          <div className="mb-2 text-micro font-semibold uppercase text-ink-3">{options.layout === 'board' ? 'On cards' : 'Columns'}</div>
          <div className="flex flex-wrap gap-1.5">
            {DISPLAY_PROPERTIES.map(p => {
              const on = options.properties.includes(p.key);
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleProperty(p.key)}
                  className={cn(
                    'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-meta font-medium ring-1 ring-inset transition-colors',
                    on ? 'bg-primary text-on-primary ring-primary' : 'bg-card text-ink-2 ring-line-strong hover:text-ink',
                  )}
                >
                  {on && <Check size={10} weight="bold" />}
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
        {isDirty && (
          <div className="border-t border-line bg-paper/70 px-2 py-1.5">
            <button type="button" onClick={onReset} className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-ui text-ink-2 hover:bg-hover hover:text-ink">
              <ArrowCounterClockwise size={14} /> Reset to default
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
