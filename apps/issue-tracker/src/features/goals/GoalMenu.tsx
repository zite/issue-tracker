import { DotsThree, LinkSimple, PencilSimple, PushPin, PushPinSlash, Trash } from '@phosphor-icons/react';
import { useRef, type ReactNode } from 'react';
import { copyText } from '../../lib/clipboard';
import { usePinToggle } from '../../lib/mutations';
import type { Goal } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui/Menu';
import { goalUrl, useGoalActions } from './useGoalActions';

export function GoalMenu({ goal, onEdit, onDeleted, align = 'end', className, size = 'sm', trigger }: {
  goal: Goal;
  /** Replaces the default ⋯ button (e.g. a page header's larger one). */
  trigger?: ReactNode;
  onEdit?: () => void;
  onDeleted?: () => void;
  align?: 'start' | 'end';
  className?: string;
  size?: 'sm' | 'md';
}) {
  const ws = useWorkspace();
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The dialog opens a tick later with focus parked on the ⋯ button, so closing it hands focus back there.
  const openFromMenu = (open: () => void) =>
    window.setTimeout(() => {
      triggerRef.current?.focus({ preventScroll: true });
      open();
    }, 0);
  const togglePin = usePinToggle();
  const actions = useGoalActions();
  const pinned = ws.isPinned('Goal', goal.id);

  return (
    <Menu>
      <MenuTrigger ref={triggerRef} asChild onClick={e => e.stopPropagation()}>
        {trigger ?? (
          <Button variant="ghost" size={size} icon aria-label={`Actions for ${goal.name}`} className={cn('data-[state=open]:bg-hover data-[state=open]:text-ink', className)}>
            <DotsThree size={16} weight="bold" />
          </Button>
        )}
      </MenuTrigger>
      {/* Menu clicks bubble through the portal to a clickable card in React's tree; stop them here. */}
      <MenuContent align={align} className="w-52" onClick={e => e.stopPropagation()}>
        {onEdit && (
          <MenuItem icon={<PencilSimple size={15} />} onSelect={() => openFromMenu(onEdit)}>
            Edit goal…
          </MenuItem>
        )}
        <MenuItem icon={pinned ? <PushPinSlash size={15} /> : <PushPin size={15} />} onSelect={() => togglePin('Goal', goal.id, !pinned)}>
          {pinned ? 'Unpin' : 'Pin'}
        </MenuItem>
        <MenuItem icon={<LinkSimple size={15} />} onSelect={() => copyText(goalUrl(goal.id), 'Copied goal link')}>
          Copy link
        </MenuItem>
        <MenuSeparator />
        <MenuItem destructive icon={<Trash size={15} />} onSelect={() => void actions.remove(goal, onDeleted)}>
          Delete…
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
