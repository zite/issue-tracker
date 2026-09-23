import { ArrowSquareOut, CopySimple, DotsThree, Kanban, LinkSimple, PencilSimple, PushPin, Rows, Trash } from '@phosphor-icons/react';
import { Link, useNavigate } from 'react-router-dom';
import { Mark } from '../../glyphs';
import { copyText } from '../../lib/clipboard';
import type { SavedView } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui/Menu';
import { Tooltip } from '../../ui/Tooltip';
import { canEditView, describeFilters, filterSentence, layoutSentence, parseView, viewLink } from './filter-summary';
import { FilterChips, PinButton, ViewMark } from './ViewBits';

/**
 * A saved view as a card: what it's called, what it's for, what it filters on
 * and how it lays the issues out. The whole card opens the view (a stretched
 * link on the name); pin and ⋯ sit above that link so they stay their own
 * buttons.
 */
export function ViewCard({
  view, pinned, onTogglePin, onDelete, onEdit, onDuplicate,
}: { view: SavedView; pinned: boolean; onTogglePin: () => void; onDelete: () => void; onEdit: () => void; onDuplicate: () => void }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const parsed = parseView(view);
  const teamId = view.teamId ?? parsed.singleTeamId;
  const team = teamId ? ws.teamById.get(teamId) : undefined;
  // The footer already names the team, so a filter on exactly that team would only repeat it.
  const clauses = describeFilters(parsed.filters, ws, { omit: team && parsed.singleTeamId === team.id ? ['teamIds'] : [] });
  const owner = view.ownerId ? ws.memberById.get(view.ownerId) : undefined;
  const canDelete = canEditView(view, ws.me.id);
  const board = parsed.layout === 'board';
  const LayoutIcon = board ? Kanban : Rows;

  return (
    <article
      className={cn(
        'group relative flex min-w-0 flex-col rounded-lg border border-line bg-card shadow-hairline transition-[box-shadow,border-color] duration-150',
        'hover:border-line-strong hover:shadow-raised has-[a[data-card-link]:focus-visible]:shadow-raised has-[a[data-card-link]:focus-visible]:ring-2 has-[a[data-card-link]:focus-visible]:ring-ink/80',
      )}
    >
      <div className="flex items-start gap-3 px-4 pt-4">
        <ViewMark view={view} size={36} />
        <div className="min-w-0 flex-1 pt-[7px]">
          <h3 className="line-clamp-2 break-words text-title font-semibold text-ink" title={view.name}>
            <Link
              to={`/view/${view.id}`}
              data-card-link
              className="outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none"
            >
              {view.name}
            </Link>
          </h3>
        </div>
        <div className="relative z-10 -mr-1.5 -mt-0.5 flex shrink-0 items-center">
          <PinButton
            pinned={pinned}
            onToggle={onTogglePin}
            className={cn(
              !pinned && 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
            )}
          />
          <Menu modal={false}>
            <Tooltip content="More">
              <MenuTrigger asChild>
                <Button variant="ghost" size="sm" icon aria-label={`More actions for ${view.name}`} className="data-[state=open]:bg-pressed data-[state=open]:text-ink">
                  <DotsThree size={16} weight="bold" />
                </Button>
              </MenuTrigger>
            </Tooltip>
            <MenuContent align="end" className="min-w-[210px]">
              <MenuItem icon={<ArrowSquareOut size={15} />} onSelect={() => navigate(`/view/${view.id}`)}>
                Open view
              </MenuItem>
              <MenuItem icon={<PencilSimple size={15} />} disabled={!canDelete} hint={canDelete ? undefined : 'Owner only'} onSelect={onEdit}>
                Edit details…
              </MenuItem>
              <MenuItem icon={<CopySimple size={15} />} onSelect={onDuplicate}>
                Duplicate
              </MenuItem>
              <MenuItem icon={<PushPin size={15} weight={pinned ? 'fill' : 'regular'} />} onSelect={onTogglePin}>
                {pinned ? 'Unpin' : 'Pin'}
              </MenuItem>
              <MenuItem icon={<LinkSimple size={15} />} onSelect={() => copyText(viewLink(view.id), 'Link copied')}>
                Copy link
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<Trash size={15} />}
                destructive={canDelete}
                disabled={!canDelete}
                hint={canDelete ? undefined : 'Owner only'}
                onSelect={onDelete}
              >
                Delete view
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>

      <p className={cn('mt-2 line-clamp-2 px-4 text-ui text-pretty', view.description ? 'text-ink-2' : 'text-ink-3')}>
        {view.description || 'No description'}
      </p>

      {/* Chips sit on the footer, so cards side by side line their summaries up whatever the description length. */}
      <div className="mb-4 mt-auto px-4 pt-3" title={filterSentence(clauses)}>
        <FilterChips clauses={clauses} />
      </div>

      <footer className="flex h-10 items-center gap-2 border-t border-line px-4 text-meta text-ink-3">
        <LayoutIcon size={14} weight="bold" className="shrink-0" aria-label={board ? 'Board' : 'List'} />
        <span className="min-w-0 truncate" title={layoutSentence(view)}>{layoutSentence(view)}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {team && (
            <span className="inline-flex items-center gap-1" title={team.name}>
              <Mark icon={team.icon} color={team.color} name={team.name} size={16} />
              <span className="font-mono text-[11px] font-medium text-ink-2">{team.key}</span>
            </span>
          )}
          {owner && (
            <span title={`Saved by ${owner.name}`} className="inline-flex">
              <Avatar person={owner} size={20} />
            </span>
          )}
        </span>
      </footer>
    </article>
  );
}
