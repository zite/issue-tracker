import { ArrowSquareOut, CheckCircle, DotsThree, PencilSimple, PushPin, PushPinSlash, Trash } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { usePinToggle } from '../../lib/mutations';
import { useWorkspace } from '../../lib/workspace';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui/Menu';
import { canComplete, type SprintBasics } from './sprint-utils';
import { useSprintDialogs } from './SprintDialogs';
import { useSprintActions } from './useSprintActions';

/** The ⋯ on a sprint row or card: open, edit, pin, complete, delete. */
export function SprintMenu({ sprint, issueCount, className }: { sprint: SprintBasics; issueCount?: number; className?: string }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const togglePin = usePinToggle();
  const dialogs = useSprintDialogs();
  const { remove } = useSprintActions();
  const pinned = ws.isPinned('Sprint', sprint.id);

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          icon
          aria-label={`${sprint.name} actions`}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
          className={cn('data-[state=open]:bg-pressed data-[state=open]:text-ink', className)}
        >
          <DotsThree size={16} weight="bold" />
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="w-52" onClick={e => e.stopPropagation()}>
        <MenuItem icon={<ArrowSquareOut size={15} />} onSelect={() => navigate(`/sprint/${sprint.id}`)}>
          Open
        </MenuItem>
        {sprint.teamId && (
          <MenuItem icon={<PencilSimple size={15} />} onSelect={() => dialogs.openEditor(sprint.teamId!, sprint)}>
            Edit…
          </MenuItem>
        )}
        <MenuItem icon={pinned ? <PushPinSlash size={15} /> : <PushPin size={15} />} onSelect={() => togglePin('Sprint', sprint.id, !pinned)}>
          {pinned ? 'Unpin' : 'Pin'}
        </MenuItem>
        {canComplete(sprint) && (
          <MenuItem icon={<CheckCircle size={15} />} onSelect={() => dialogs.openComplete(sprint)}>
            Complete sprint…
          </MenuItem>
        )}
        {sprint.teamId && (
          <>
            <MenuSeparator />
            <MenuItem destructive icon={<Trash size={15} />} onSelect={() => remove(sprint, issueCount)}>
              Delete…
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
