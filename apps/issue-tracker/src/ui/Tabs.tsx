import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from './cn';

export type TabItem = { value: string; label: ReactNode; count?: number | null; icon?: ReactNode; to?: string; title?: string };

const tabClass = (active: boolean) =>
  cn(
    'relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap px-0.5 text-ui font-medium transition-colors',
    'after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:transition-colors',
    active ? 'text-ink after:bg-ink' : 'text-ink-2 hover:text-ink after:bg-transparent',
  );

function Count({ n, active }: { n: number; active: boolean }) {
  return <span className={cn('tabular rounded-full px-1.5 text-micro font-semibold', active ? 'bg-highlight text-highlight-ink' : 'bg-sunken text-ink-2')}>{n}</span>;
}

/**
 * Underline tabs. Pass `to` on items to render router links (the URL owns the
 * state); otherwise `value` + `onChange` drive it.
 */
export function Tabs({ items, value, onChange, className, end }: { items: TabItem[]; value?: string; onChange?: (v: string) => void; className?: string; end?: ReactNode }) {
  return (
    <div className={cn('flex items-center gap-5 overflow-x-auto no-scrollbar', className)} role="tablist">
      {items.map(item =>
        item.to ? (
          <NavLink key={item.value} to={item.to} end role="tab" title={item.title} className={({ isActive }) => tabClass(value ? value === item.value : isActive)}>
            {({ isActive }) => {
              const active = value ? value === item.value : isActive;
              return (
                <>
                  {item.icon}
                  {item.label}
                  {item.count != null && item.count > 0 && <Count n={item.count} active={active} />}
                </>
              );
            }}
          </NavLink>
        ) : (
          <button key={item.value} type="button" role="tab" aria-selected={value === item.value} title={item.title} onClick={() => onChange?.(item.value)} className={tabClass(value === item.value)}>
            {item.icon}
            {item.label}
            {item.count != null && item.count > 0 && <Count n={item.count} active={value === item.value} />}
          </button>
        ),
      )}
      {end && <div className="ml-auto hidden items-center gap-1.5 pl-4 sm:flex">{end}</div>}
    </div>
  );
}
