import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { CaretRight, Check } from '@phosphor-icons/react';
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from './cn';
import { Kbd } from './Kbd';
import { floatingSurface } from './Popover';

/*
 * Dropdown and context menus share one look: 32px rows, an icon column, a
 * right-aligned shortcut, and a sunken highlight for the keyboard-active row.
 */

const content = cn('z-[75] min-w-[200px] p-1 animate-pop-in', floatingSurface);
const item = cn(
  'relative flex h-8 cursor-default select-none items-center gap-2.5 rounded-sm px-2 text-ui text-ink outline-none',
  'data-[highlighted]:bg-sunken data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:shrink-0',
);
const label = 'px-2 pb-1 pt-2 text-micro font-medium uppercase text-ink-3';
const separator = '-mx-1 my-1 h-px bg-line';

type ItemExtras = { icon?: ReactNode; shortcut?: string; hint?: ReactNode; destructive?: boolean };

function ItemBody({ icon, shortcut, hint, destructive, children }: ItemExtras & { children: ReactNode }) {
  return (
    <>
      {icon !== undefined && <span className={cn('flex w-4 items-center justify-center text-ink-2', destructive && 'text-danger')}>{icon}</span>}
      <span className={cn('min-w-0 flex-1 truncate', destructive && 'text-danger')}>{children}</span>
      {hint && <span className="shrink-0 text-meta text-ink-3">{hint}</span>}
      {shortcut && <Kbd keys={shortcut} tone="bare" className="min-w-0 px-0" />}
    </>
  );
}

// ---- Dropdown -------------------------------------------------------------

export const Menu = DropdownPrimitive.Root;
export const MenuTrigger = DropdownPrimitive.Trigger;
export const MenuGroup = DropdownPrimitive.Group;
export const MenuSub = DropdownPrimitive.Sub;
export const MenuRadioGroup = DropdownPrimitive.RadioGroup;

export const MenuContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>>(function MenuContent(
  { className, align = 'start', sideOffset = 6, ...props },
  ref,
) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content ref={ref} align={align} sideOffset={sideOffset} collisionPadding={10} className={cn(content, className)} {...props} />
    </DropdownPrimitive.Portal>
  );
});

export const MenuItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & ItemExtras>(function MenuItem(
  { className, icon, shortcut, hint, destructive, children, ...props },
  ref,
) {
  return (
    <DropdownPrimitive.Item ref={ref} className={cn(item, className)} {...props}>
      <ItemBody icon={icon} shortcut={shortcut} hint={hint} destructive={destructive}>
        {children}
      </ItemBody>
    </DropdownPrimitive.Item>
  );
});

export const MenuCheckboxItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DropdownPrimitive.CheckboxItem> & ItemExtras>(
  function MenuCheckboxItem({ className, icon, shortcut, hint, children, checked, ...props }, ref) {
    return (
      <DropdownPrimitive.CheckboxItem ref={ref} checked={checked} className={cn(item, className)} {...props}>
        <ItemBody icon={icon} shortcut={shortcut} hint={hint}>
          {children}
        </ItemBody>
        <span className="flex w-4 justify-end">{checked ? <Check size={14} weight="bold" /> : null}</span>
      </DropdownPrimitive.CheckboxItem>
    );
  },
);

export const MenuRadioItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DropdownPrimitive.RadioItem> & ItemExtras>(
  function MenuRadioItem({ className, icon, shortcut, hint, children, ...props }, ref) {
    return (
      <DropdownPrimitive.RadioItem ref={ref} className={cn(item, className)} {...props}>
        <ItemBody icon={icon} shortcut={shortcut} hint={hint}>
          {children}
        </ItemBody>
        <DropdownPrimitive.ItemIndicator className="flex w-4 justify-end">
          <Check size={14} weight="bold" />
        </DropdownPrimitive.ItemIndicator>
      </DropdownPrimitive.RadioItem>
    );
  },
);

export function MenuLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <DropdownPrimitive.Label className={cn(label, className)}>{children}</DropdownPrimitive.Label>;
}

export function MenuSeparator() {
  return <DropdownPrimitive.Separator className={separator} />;
}

export function MenuSubTrigger({ icon, children, hint, className }: { icon?: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <DropdownPrimitive.SubTrigger className={cn(item, 'data-[state=open]:bg-sunken', className)}>
      <ItemBody icon={icon} hint={hint}>
        {children}
      </ItemBody>
      <CaretRight size={12} className="text-ink-3" />
    </DropdownPrimitive.SubTrigger>
  );
}

export function MenuSubContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.SubContent sideOffset={4} collisionPadding={10} className={cn(content, 'max-h-[360px] overflow-y-auto', className)}>
        {children}
      </DropdownPrimitive.SubContent>
    </DropdownPrimitive.Portal>
  );
}

// ---- Context menu ---------------------------------------------------------

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuSub = ContextMenuPrimitive.Sub;

export function ContextMenuContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content collisionPadding={10} className={cn(content, 'min-w-[220px]', className)}>
        {children}
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  );
}

export const ContextMenuItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & ItemExtras>(
  function ContextMenuItem({ className, icon, shortcut, hint, destructive, children, ...props }, ref) {
    return (
      <ContextMenuPrimitive.Item ref={ref} className={cn(item, className)} {...props}>
        <ItemBody icon={icon} shortcut={shortcut} hint={hint} destructive={destructive}>
          {children}
        </ItemBody>
      </ContextMenuPrimitive.Item>
    );
  },
);

export function ContextMenuCheckboxItem({
  icon, children, checked, onCheckedChange, hint,
}: { icon?: ReactNode; children: ReactNode; checked: boolean; onCheckedChange: () => void; hint?: ReactNode }) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      checked={checked}
      onSelect={e => e.preventDefault()}
      onCheckedChange={onCheckedChange}
      className={item}
    >
      <ItemBody icon={icon} hint={hint}>
        {children}
      </ItemBody>
      <span className="flex w-4 justify-end">{checked ? <Check size={14} weight="bold" /> : null}</span>
    </ContextMenuPrimitive.CheckboxItem>
  );
}

export function ContextMenuLabel({ children }: { children: ReactNode }) {
  return <ContextMenuPrimitive.Label className={label}>{children}</ContextMenuPrimitive.Label>;
}

export function ContextMenuSeparator() {
  return <ContextMenuPrimitive.Separator className={separator} />;
}

export function ContextMenuSubTrigger({ icon, children, hint }: { icon?: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <ContextMenuPrimitive.SubTrigger className={cn(item, 'data-[state=open]:bg-sunken')}>
      <ItemBody icon={icon} hint={hint}>
        {children}
      </ItemBody>
      <CaretRight size={12} className="text-ink-3" />
    </ContextMenuPrimitive.SubTrigger>
  );
}

export function ContextMenuSubContent({ children }: { children: ReactNode }) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent sideOffset={4} collisionPadding={10} className={cn(content, 'max-h-[360px] overflow-y-auto')}>
        {children}
      </ContextMenuPrimitive.SubContent>
    </ContextMenuPrimitive.Portal>
  );
}
