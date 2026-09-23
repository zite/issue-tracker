import { ArrowSquareOut, DotsThree, LinkSimple, PencilSimple, PushPin, PushPinSlash, Trash } from '@phosphor-icons/react';
import { useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { copyText } from '../../lib/clipboard';
import { usePinToggle } from '../../lib/mutations';
import { useWorkspace } from '../../lib/workspace';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from '../../ui/Menu';
import { ProjectStatusGlyph } from './bits';
import { BOARD_ORDER, STATUS_LABEL, asStatus, projectUrl, type ProjectLike } from './model';
import { useProjectActions } from './useProjectActions';

/** The ⋯ menu a card, a table row and the project page share. */
export function ProjectMenu({ project, onEdit, onDeleted, showOpen, trigger, align = 'end', className }: {
  project: ProjectLike;
  onEdit: () => void;
  onDeleted?: () => void;
  showOpen?: boolean;
  trigger?: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}) {
  const ws = useWorkspace();
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The dialog opens a tick later with focus parked on the ⋯ button, so closing it hands focus back there.
  const openFromMenu = (open: () => void) =>
    window.setTimeout(() => {
      triggerRef.current?.focus({ preventScroll: true });
      open();
    }, 0);
  const navigate = useNavigate();
  const actions = useProjectActions();
  const togglePin = usePinToggle();
  const pinned = ws.isPinned('Project', project.id);

  return (
    <Menu>
      <MenuTrigger ref={triggerRef} asChild onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
        {trigger ?? (
          <Button variant="ghost" size="sm" icon aria-label={`${project.name} actions`} className={cn('data-[state=open]:bg-hover data-[state=open]:text-ink', className)}>
            <DotsThree size={16} weight="bold" />
          </Button>
        )}
      </MenuTrigger>
      {/* Portalled, but React events still bubble to the card — which would open the project. */}
      <MenuContent align={align} className="w-56" onClick={e => e.stopPropagation()}>
        {showOpen && (
          <MenuItem icon={<ArrowSquareOut size={15} />} onSelect={() => navigate(`/project/${project.id}`)}>
            Open
          </MenuItem>
        )}
        <MenuItem icon={<PencilSimple size={15} />} onSelect={() => openFromMenu(onEdit)}>
          Edit project…
        </MenuItem>
        <MenuSub>
          <MenuSubTrigger icon={<ProjectStatusGlyph status={project.status} />} hint={STATUS_LABEL[asStatus(project.status)]}>
            Status
          </MenuSubTrigger>
          <MenuSubContent className="w-48">
            <MenuRadioGroup value={asStatus(project.status)} onValueChange={v => v !== project.status && actions.update(project.id, { status: asStatus(v) })}>
              {BOARD_ORDER.map(s => (
                <MenuRadioItem key={s} value={s} icon={<ProjectStatusGlyph status={s} />}>
                  {STATUS_LABEL[s]}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubContent>
        </MenuSub>
        <MenuItem icon={pinned ? <PushPinSlash size={15} /> : <PushPin size={15} />} onSelect={() => togglePin('Project', project.id, !pinned)}>
          {pinned ? 'Unpin' : 'Pin'}
        </MenuItem>
        <MenuItem icon={<LinkSimple size={15} />} onSelect={() => copyText(projectUrl(project.id), 'Copied project link')}>
          Copy link
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          destructive
          icon={<Trash size={15} />}
          onSelect={async () => {
            if (await actions.remove(project)) onDeleted?.();
          }}
        >
          Delete…
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
