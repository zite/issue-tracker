import { Archive, CalendarBlank, Copy, Cube, DotsThree, Hash, Shapes, Tag, Trash, User, X } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { PriorityGlyph, SprintGlyph, StatusGlyph } from '../glyphs';
import { useAppActions } from '../lib/app-actions';
import { copyText } from '../lib/clipboard';
import { useIssueActions } from '../lib/mutations';
import type { Issue } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import { cn } from '../ui/cn';
import { Kbd } from '../ui/Kbd';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui/Menu';
import { IssuePropertyPicker, type PickerKind } from './PropertyPicker';

const btn = 'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-ui font-medium text-on-primary/85 transition-colors hover:bg-on-primary/10 hover:text-on-primary data-[state=open]:bg-on-primary/15';

/**
 * The selection bar: an ink strip that rises from the bottom when anything is
 * selected. Every control applies to all selected issues.
 */
export function BulkBar({ issues, onClear, openKind, onOpenKind }: { issues: Issue[]; onClear: () => void; openKind: PickerKind | null; onOpenKind: (k: PickerKind | null) => void }) {
  const ws = useWorkspace();
  const actions = useIssueActions();
  const app = useAppActions();
  const [menuOpen, setMenuOpen] = useState(false);
  if (issues.length === 0) return null;

  const teamIds = [...new Set(issues.map(i => i.teamId))];
  const oneTeam = teamIds.length === 1 ? ws.teamById.get(teamIds[0] ?? '') : undefined;
  const statuses = oneTeam ? ws.statusesByTeam.get(oneTeam.id) : undefined;

  const picker = (kind: PickerKind, label: string, icon: ReactNode) => (
    <IssuePropertyPicker
      key={kind}
      issues={issues}
      kind={kind}
      align="center"
      open={openKind === kind}
      onOpenChange={o => onOpenKind(o ? kind : null)}
      trigger={
        <button type="button" className={btn}>
          {icon}
          <span className="hidden md:inline">{label}</span>
        </button>
      }
    />
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-3">
      <div role="toolbar" aria-label="Selected issues" className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-primary p-1 text-on-primary shadow-pop animate-rise-in no-scrollbar">
        <div className="flex items-center gap-2 pl-2 pr-2">
          <span className="tabular flex h-6 min-w-6 items-center justify-center rounded-full bg-highlight px-1.5 text-meta font-bold text-highlight-ink">{issues.length}</span>
          <span className="hidden whitespace-nowrap text-ui font-medium sm:inline">selected</span>
        </div>
        <span className="mx-1 h-5 w-px bg-on-primary/20" />
        {picker('status', 'Status', <StatusGlyph status={statuses?.find(s => s.type === 'started') ?? { type: 'started', color: '#FFD447' }} siblings={statuses} className="brightness-125" />)}
        {picker('priority', 'Priority', <PriorityGlyph priority={2} />)}
        {picker('assignee', 'Assignee', <User size={15} />)}
        {picker('labels', 'Labels', <Tag size={15} />)}
        {picker('project', 'Project', <Shapes size={15} />)}
        {oneTeam?.sprintsEnabled && picker('sprint', 'Sprint', <SprintGlyph status="active" progress={0.5} className="[&>rect:last-child]:stroke-on-primary" />)}
        {picker('due', 'Due', <CalendarBlank size={15} />)}
        {picker('type', 'Type', <Cube size={15} />)}
        {oneTeam && oneTeam.estimateScale !== 'none' && picker('estimate', 'Estimate', <Hash size={15} />)}
        <Menu open={menuOpen} onOpenChange={setMenuOpen}>
          <MenuTrigger asChild>
            <button type="button" className={cn(btn, 'px-2')} aria-label="More actions">
              <DotsThree size={16} weight="bold" />
            </button>
          </MenuTrigger>
          <MenuContent align="end" side="top" className="w-56">
            <MenuItem icon={<Copy size={15} />} onSelect={() => copyText(issues.map(i => i.identifier).join(', '), `Copied ${issues.length} IDs`)}>Copy IDs</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Archive size={15} />} shortcut="mod+backspace" onSelect={() => actions.archive(issues)}>Archive</MenuItem>
            <MenuItem
              icon={<Trash size={15} />}
              destructive
              onSelect={async () => {
                const ok = await app.confirm({
                  title: `Delete ${issues.length} issue${issues.length === 1 ? '' : 's'}?`,
                  description: 'This permanently removes them with their comments and history. Archive instead if you might want them back.',
                  confirmLabel: 'Delete permanently',
                  destructive: true,
                });
                // Keep the selection if the delete fails, so it can be retried.
                if (ok && (await actions.remove(issues))) onClear();
              }}
            >
              Delete…
            </MenuItem>
          </MenuContent>
        </Menu>
        <span className="mx-1 h-5 w-px bg-on-primary/20" />
        <button type="button" onClick={onClear} className={cn(btn, 'gap-2 pr-2')} aria-label="Clear selection">
          <Kbd tone="inverse">Esc</Kbd>
          <X size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}
