import { CaretDown, Check, Lock } from '@phosphor-icons/react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Mark } from '../../glyphs';
import { SWATCHES } from '../../lib/constants';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import type { Bootstrap } from '../../lib/types';
import { Badge } from '../../ui/Chip';
import { cn } from '../../ui/cn';
import { Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '../../ui/Menu';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/Popover';

/*
 * The pieces every settings section shares: the write helper, the role lock,
 * section chrome, inline inputs, colour pickers and a small menu-backed select.
 */

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

type RunOptions<T> = {
  /** Toast on success; a function can word it from the response (return null for none). */
  success?: string | ((res: T) => string | null);
  error: string;
  /** Written into the bootstrap cache before the request leaves, rolled back on failure. */
  optimistic?: (data: Bootstrap) => Bootstrap;
  /** Extra caches the write touches (issues whose status or labels moved). */
  alsoInvalidate?: Array<readonly unknown[]>;
  /** Puts Undo on the success toast; the promise reverses the write. */
  undo?: (res: T) => Promise<unknown>;
};

/**
 * Every settings write goes through here: an optional optimistic cache write,
 * the endpoint call, a toast either way, then a bootstrap refetch so every
 * picker and page re-renders from the server's truth. Resolves to the
 * response, or undefined when the write failed.
 */
export function useSettingsMutation() {
  const qc = useQueryClient();
  return useCallback(
    async <T,>(request: () => Promise<T>, opts: RunOptions<T>): Promise<T | undefined> => {
      let previous: Bootstrap | undefined;
      if (opts.optimistic) {
        await qc.cancelQueries({ queryKey: qk.bootstrap });
        previous = qc.getQueryData<Bootstrap>(qk.bootstrap);
        if (previous) qc.setQueryData<Bootstrap>(qk.bootstrap, opts.optimistic(previous));
      }
      try {
        const res = await request();
        const message = typeof opts.success === 'function' ? opts.success(res) : opts.success;
        const undo = opts.undo;
        if (message) {
          toast.success(message, undo && {
            action: {
              label: 'Undo',
              onClick: async () => {
                try {
                  await undo(res);
                } catch (e) {
                  toast.error(errorMessage(e, 'Couldn’t undo that'));
                } finally {
                  qc.invalidateQueries({ queryKey: qk.bootstrap });
                }
              },
            },
          });
        }
        return res;
      } catch (e) {
        if (previous) qc.setQueryData(qk.bootstrap, previous);
        toast.error(errorMessage(e, opts.error));
        return undefined;
      } finally {
        for (const key of opts.alsoInvalidate ?? []) qc.invalidateQueries({ queryKey: key });
        await qc.invalidateQueries({ queryKey: qk.bootstrap });
      }
    },
    [qc],
  );
}

/**
 * Writes that replace a whole set (team membership) must not overlap: two
 * in-flight "here is the full list" requests can land out of order and undo
 * each other. They run one at a time, and bootstrap refetches only once the
 * queue drains, so a refetch never overwrites a change still waiting to send.
 */
export function useSerialWrites() {
  const qc = useQueryClient();
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  return useCallback(
    (task: () => Promise<unknown>) => {
      pending.current += 1;
      chain.current = chain.current
        .then(task)
        .catch(() => undefined)
        .finally(() => {
          pending.current -= 1;
          if (pending.current === 0) qc.invalidateQueries({ queryKey: qk.bootstrap });
        });
      return chain.current;
    },
    [qc],
  );
}

/** Patch the bootstrap cache in place; returns an undo. */
export function patchBootstrap(qc: QueryClient, fn: (data: Bootstrap) => Bootstrap) {
  const previous = qc.getQueryData<Bootstrap>(qk.bootstrap);
  if (previous) qc.setQueryData<Bootstrap>(qk.bootstrap, fn(previous));
  return () => qc.setQueryData(qk.bootstrap, previous);
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/** Why this section is read-only for the viewer, or null when they can change it. */
export const SettingsLockContext = createContext<string | null>(null);
export const useSettingsLock = () => useContext(SettingsLockContext);

/**
 * Disables every control inside when the section is locked — inputs, menus and
 * buttons alike — while links, search and filters outside it keep working.
 * The server refuses these writes regardless; this says so first.
 */
export function Locked({ children, className }: { children: ReactNode; className?: string }) {
  const lock = useSettingsLock();
  if (!lock) return <>{children}</>;
  return (
    <fieldset disabled className={cn('m-0 min-w-0 border-0 p-0', className)}>
      {children}
    </fieldset>
  );
}

/** The banner explaining a lock; renders nothing when the section is editable. */
export function LockNotice({ className }: { className?: string }) {
  const lock = useSettingsLock();
  if (!lock) return null;
  return <LockBanner className={className}>{lock}</LockBanner>;
}

export function LockBanner({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="note" className={cn('mb-6 flex items-start gap-3 rounded-lg border border-line bg-sunken px-4 py-3 text-ui text-ink-2', className)}>
      <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-card text-ink shadow-hairline ring-1 ring-line">
        <Lock size={13} weight="bold" />
      </span>
      <p className="min-w-0 pt-[3px] text-pretty">{children}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

/** A settings section opens with a serif title and one line about what it's for. */
export function SectionHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <>
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        {eyebrow}
        <h2 className="font-display text-display-sm text-ink">{title}</h2>
        {description && <p className="mt-1 max-w-[620px] text-body text-ink-2 text-pretty">{description}</p>}
      </div>
      {actions && (
        <Locked className="shrink-0">
          <div className="flex items-center gap-2">{actions}</div>
        </Locked>
      )}
    </div>
    <LockNotice />
    </>
  );
}

/** A titled group inside a section: a card-sized heading, a sentence, then its cards. */
export function Subsection({ title, description, action, children, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mb-10 last:mb-0', className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-title font-semibold text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-ui text-ink-3 text-pretty">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Discard / Save row at the foot of a form card. */
export function CardFooter({ children, start, className }: { children: ReactNode; start?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-[52px] items-center gap-2 rounded-b-lg border-t border-line bg-paper/60 px-4 py-2.5 sm:px-5', className)}>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-meta text-ink-3">{start}</div>
      {children}
    </div>
  );
}

/** "Unsaved changes" with a marigold dot — the one thing on a form footer worth noticing. */
export function UnsavedNote() {
  return (
    <span className="inline-flex items-center gap-1.5 text-meta font-medium text-ink-2">
      <span className="h-1.5 w-1.5 rounded-full bg-highlight ring-2 ring-highlight/30" />
      Unsaved changes
    </span>
  );
}

/** Label and a sentence on the left, the control on the right; stacks on a phone. */
export function SettingRow({ label, description, control, children, htmlFor, className, inline }: {
  label: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  htmlFor?: string;
  className?: string;
  /** Keep a small control (a switch) beside the label on a phone instead of stacking it. */
  inline?: boolean;
}) {
  return (
    <div className={cn('px-4 py-4 sm:px-5', className)}>
      <div className={cn('flex gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8', inline ? 'flex-row items-start justify-between' : 'flex-col')}>
        <label htmlFor={htmlFor} className={cn('min-w-0', htmlFor && 'cursor-pointer')}>
          <div className="text-ui font-semibold text-ink">{label}</div>
          {description && <div className="mt-0.5 max-w-[520px] text-ui text-ink-3 text-pretty">{description}</div>}
        </label>
        {control && <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">{control}</div>}
      </div>
      {children}
    </div>
  );
}

/** A ledger table's sunken header row. Pass the same grid classes the rows use. */
export function LedgerHead({ className, children }: { className: string; children: ReactNode }) {
  return <div className={cn('h-9 rounded-t-lg border-b border-line bg-sunken px-4 text-micro font-semibold uppercase text-ink-3', className)}>{children}</div>;
}

export function KeyChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center rounded-xs bg-sunken px-1.5 font-mono text-[11px] font-medium text-ink-2 ring-1 ring-inset ring-line', className)}>
      {children}
    </span>
  );
}

export function YouChip() {
  return <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-highlight/60 px-1.5 text-micro font-semibold text-highlight-ink dark:bg-highlight/85">you</span>;
}

export type MemberStatus = 'Active' | 'Invited' | 'Deactivated';
export const memberStatusOf = (m: { status?: string | null }): MemberStatus => (m.status === 'Invited' || m.status === 'Deactivated' ? m.status : 'Active');

export function MemberStatusBadge({ status }: { status: string | null | undefined }) {
  const s = memberStatusOf({ status });
  if (s === 'Invited') return <Badge tone="warning">Invited</Badge>;
  if (s === 'Deactivated') return <Badge tone="neutral">Deactivated</Badge>;
  return <Badge tone="success" dot>Active</Badge>;
}

// ---------------------------------------------------------------------------
// Inline editing
// ---------------------------------------------------------------------------

/**
 * Text that becomes an input the moment you point at it. Enter or blur
 * commits, Escape reverts, and an unchanged value never sends a request.
 */
export function InlineInput({ value, onCommit, placeholder, required, maxLength, className, 'aria-label': ariaLabel }: {
  value: string | null | undefined;
  onCommit: (next: string) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  className?: string;
  'aria-label'?: string;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!focused) setDraft(value ?? '');
  }, [value, focused]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(value ?? '');
      return;
    }
    const next = draft.trim();
    if (required && !next) {
      setDraft(value ?? '');
      return;
    }
    if (next !== (value ?? '').trim()) onCommit(next);
  };

  return (
    <input
      value={draft}
      // Long names and descriptions clip inside the input; the full text is a hover away.
      title={!focused && draft ? draft : undefined}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={e => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.stopPropagation();
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className={cn(
        'h-8 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-2 text-ui text-ink outline-none transition-[border-color,background-color,box-shadow] placeholder:text-ink-3',
        'hover:bg-hover/70 focus:border-ink/50 focus:bg-card focus:ring-[3px] focus:ring-highlight/40',
        'disabled:cursor-default disabled:hover:bg-transparent',
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Colour and icon
// ---------------------------------------------------------------------------

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase();

export function SwatchGrid({ value, onPick }: { value: string | null | undefined; onPick: (c: string) => void }) {
  const custom = value && !SWATCHES.some(c => same(c, value)) ? value : null;
  return (
    <div>
      <div className="grid grid-cols-8 gap-1">
        {SWATCHES.map(c => {
          const on = same(c, value);
          return (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={on}
              onClick={() => onPick(c)}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-[7px] transition-transform hover:scale-110',
                on && 'ring-2 ring-ink ring-offset-2 ring-offset-card',
              )}
              style={{ background: c }}
            >
              {on && <Check size={11} weight="bold" className="text-white" />}
            </button>
          );
        })}
      </div>
      {custom && (
        <div className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-meta text-ink-3">
          <span className="h-3.5 w-3.5 rounded-[4px]" style={{ background: custom }} /> Current colour isn’t in the palette
        </div>
      )}
    </div>
  );
}

export function ColorPopover({ value, onChange, children, align = 'start', title = 'Colour' }: {
  value: string | null | undefined;
  onChange: (color: string) => void;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-2.5" onClick={e => e.stopPropagation()}>
        <div className="mb-2 text-micro font-semibold uppercase text-ink-3">{title}</div>
        <SwatchGrid
          value={value}
          onPick={c => {
            if (!same(c, value)) onChange(c);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** A square swatch button that opens the colour popover. */
export function SwatchButton({ color, onChange, label = 'Change colour', align }: { color: string | null | undefined; onChange: (c: string) => void; label?: string; align?: 'start' | 'center' | 'end' }) {
  return (
    <ColorPopover value={color} onChange={onChange} align={align}>
      <button
        type="button"
        aria-label={label}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-hover disabled:hover:bg-transparent data-[state=open]:bg-pressed"
      >
        <span className="h-3.5 w-3.5 rounded-[4px] ring-1 ring-inset ring-black/10" style={{ background: color || '#8A8275' }} />
      </button>
    </ColorPopover>
  );
}

export function IconColorPopover({ icon, color, name, icons, onChange, children, untitled = 'Untitled team' }: {
  icon: string | null | undefined;
  color: string | null | undefined;
  name?: string;
  icons: string[];
  onChange: (next: { icon?: string; color?: string }) => void;
  children: ReactNode;
  /** What the preview calls a thing that has no name yet. */
  untitled?: string;
}) {
  const choices = icon && !icons.includes(icon) ? [icon, ...icons] : icons;
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-[236px] p-3">
        <div className="mb-3 flex items-center gap-2.5">
          <Mark icon={icon} color={color} name={name} size={32} />
          <div className="min-w-0 text-ui text-ink-2">
            <div className="truncate font-medium text-ink">{name?.trim() || untitled}</div>
            <div className="text-meta text-ink-3">Icon and colour</div>
          </div>
        </div>
        <div className="mb-1.5 text-micro font-semibold uppercase text-ink-3">Icon</div>
        <div className="mb-3 grid grid-cols-7 gap-0.5">
          {choices.map(i => (
            <button
              key={i}
              type="button"
              onClick={() => onChange({ icon: i })}
              aria-label={`Icon ${i}`}
              aria-pressed={i === icon}
              className={cn('flex h-7 w-7 items-center justify-center rounded-sm text-[15px] transition-colors', i === icon ? 'bg-highlight/50 ring-1 ring-highlight dark:bg-highlight/20' : 'hover:bg-hover')}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="mb-1.5 text-micro font-semibold uppercase text-ink-3">Colour</div>
        <SwatchGrid value={color} onPick={c => onChange({ color: c })} />
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

export type SelectOption = { value: string; label: string; icon?: ReactNode; group?: string; hint?: ReactNode };

const selectTrigger = {
  field: 'h-8 w-full justify-between rounded-md border border-control/60 bg-card px-2.5 text-ui text-ink shadow-hairline hover:border-control data-[state=open]:border-ink/60 data-[state=open]:ring-[3px] data-[state=open]:ring-highlight/45',
  quiet: 'h-7 rounded-sm px-2 text-ui text-ink hover:bg-hover data-[state=open]:bg-pressed',
} as const;

/**
 * A short, fixed list (sprint length, estimate scale, a label's scope) as a
 * dropdown of radio items — a searchable picker is overkill for five choices.
 */
export function SelectMenu({ value, onChange, options, variant = 'field', align = 'start', className, ariaLabel, id, placeholder = 'Choose…', contentClassName, renderValue, autoFocus }: {
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: SelectOption[];
  variant?: keyof typeof selectTrigger;
  align?: 'start' | 'center' | 'end';
  className?: string;
  ariaLabel?: string;
  id?: string;
  placeholder?: string;
  contentClassName?: string;
  renderValue?: (option: SelectOption | undefined) => ReactNode;
  /** Takes focus when its dialog opens. */
  autoFocus?: boolean;
}) {
  const current = options.find(o => o.value === value);
  const groups: Array<[string, SelectOption[]]> = [];
  for (const o of options) {
    const g = o.group ?? '';
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1].push(o);
    else groups.push([g, [o]]);
  }
  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <button
          id={id}
          type="button"
          aria-label={ariaLabel}
          data-autofocus={autoFocus || undefined}
          className={cn(
            'group/select inline-flex min-w-0 items-center gap-2 font-medium outline-none transition-[background-color,border-color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-highlight/45 disabled:cursor-not-allowed disabled:opacity-55',
            variant === 'quiet' && 'disabled:opacity-100 disabled:hover:bg-transparent',
            selectTrigger[variant],
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate font-normal">
            {renderValue ? renderValue(current) : current ? (
              <>
                {current.icon}
                <span className="truncate">{current.label}</span>
              </>
            ) : (
              <span className="text-ink-3">{placeholder}</span>
            )}
          </span>
          <CaretDown size={12} weight="bold" className="shrink-0 text-ink-3 group-disabled/select:hidden" />
        </button>
      </MenuTrigger>
      <MenuContent align={align} className={cn('max-h-[360px] overflow-y-auto', contentClassName)}>
        <MenuRadioGroup value={value ?? ''} onValueChange={onChange}>
          {groups.map(([group, items], gi) => (
            <Fragment key={group || gi}>
              {gi > 0 && <MenuSeparator />}
              {group && <MenuLabel>{group}</MenuLabel>}
              {items.map(o => (
                <MenuRadioItem key={o.value} value={o.value} icon={o.icon} hint={o.hint}>
                  {o.label}
                </MenuRadioItem>
              ))}
            </Fragment>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
