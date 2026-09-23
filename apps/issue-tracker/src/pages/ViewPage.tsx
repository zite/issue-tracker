import { CaretRight, CopySimple, DotsThree, LinkSimple, PencilSimple, StackSimple, Trash } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { canEditView, parseView, viewLink } from '../features/views/filter-summary';
import { PinButton, ScopeChip, ViewMark } from '../features/views/ViewBits';
import { ViewDetailsDialog } from '../features/views/ViewDetailsDialog';
import { useDeleteView, useDuplicateView } from '../features/views/useViewActions';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { IssuesView } from '../issues/IssuesView';
import { copyText } from '../lib/clipboard';
import type { Grouping, Ordering } from '../lib/constants';
import { usePinToggle } from '../lib/mutations';
import { useContextTeam } from '../lib/useContextTeam';
import type { ViewOptions } from '../lib/view';
import { useWorkspace } from '../lib/workspace';
import { Button } from '../ui/Button';
import { EmptyState, PageBody, PageHeader } from '../ui/Layout';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';

/** One saved view: its header, then the list or board it saved, filling the page. */
export function ViewPage() {
  const { viewId = '' } = useParams();
  const ws = useWorkspace();
  const navigate = useNavigate();
  const togglePin = usePinToggle();
  const deleteView = useDeleteView();
  const duplicateView = useDuplicateView();
  const [editing, setEditing] = useState(false);
  const view = ws.viewById.get(viewId);
  useDocumentTitle(view?.name ?? 'View not found');

  const parsed = useMemo(() => (view ? parseView(view) : null), [view]);
  // New issues default to the view's team only when its filters name exactly one.
  useContextTeam(parsed?.singleTeamId);

  const defaults = useMemo<Partial<ViewOptions> | undefined>(
    () =>
      view && parsed
        ? { ...parsed.options, layout: parsed.layout, grouping: view.grouping as Grouping, ordering: view.ordering as Ordering }
        : undefined,
    [view, parsed],
  );

  if (!view || !parsed) {
    return (
      <>
        <PageHeader
          eyebrow={
            <Link to="/views" className="rounded-xs font-medium text-ink-2 transition-colors hover:text-ink">
              Views
            </Link>
          }
          title="View not found"
        />
        <PageBody>
          <EmptyState
            icon={<StackSimple size={22} weight="duotone" />}
            title="This view isn’t here"
            actions={
              <Button variant="secondary" asChild>
                <Link to="/views">All views</Link>
              </Button>
            }
          >
            It may have been deleted, or it’s someone else’s private view.
          </EmptyState>
        </PageBody>
      </>
    );
  }

  const pinned = ws.isPinned('View', view.id);
  const canEdit = canEditView(view, ws.me.id);
  const team = ws.teamById.get(view.teamId ?? parsed.singleTeamId ?? '') ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow={
          <>
            <Link to="/views" className="rounded-xs font-medium text-ink-2 transition-colors hover:text-ink">
              Views
            </Link>
            <CaretRight size={11} weight="bold" className="text-ink-3" aria-hidden />
            <ScopeChip scope={view.scope} team={team} />
          </>
        }
        titleAdornment={<ViewMark view={view} size={36} />}
        title={<span title={view.name}>{view.name}</span>}
        description={
          view.description ? (
            <span className="line-clamp-2 sm:line-clamp-none" title={view.description}>
              {view.description}
            </span>
          ) : undefined
        }
        actions={
          <>
            <PinButton pinned={pinned} onToggle={() => togglePin('View', view.id, !pinned)} size="md" />
            <Menu modal={false}>
              <Tooltip content="More">
                <MenuTrigger asChild>
                  <Button variant="ghost" size="md" icon aria-label="View actions" className="data-[state=open]:bg-pressed data-[state=open]:text-ink">
                    <DotsThree size={18} weight="bold" />
                  </Button>
                </MenuTrigger>
              </Tooltip>
              <MenuContent align="end" className="min-w-[220px]">
                <MenuItem icon={<PencilSimple size={15} />} disabled={!canEdit} hint={canEdit ? undefined : 'Owner only'} onSelect={() => setEditing(true)}>
                  Edit details…
                </MenuItem>
                <MenuItem icon={<CopySimple size={15} />} onSelect={() => duplicateView(view, { open: true })}>
                  Duplicate
                </MenuItem>
                <MenuItem icon={<LinkSimple size={15} />} onSelect={() => copyText(viewLink(view.id), 'Link copied')}>
                  Copy link
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={<Trash size={15} />}
                  destructive={canEdit}
                  disabled={!canEdit}
                  hint={canEdit ? undefined : 'Owner only'}
                  onSelect={() => deleteView(view, { beforeRemove: () => navigate('/views') })}
                >
                  Delete view
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
      />
      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <IssuesView
          key={view.id}
          surfaceKey={`view:${view.id}:${view.filters.length}:${view.grouping}:${view.ordering}:${view.display}`}
          baseFilters={{}}
          defaultFilters={parsed.filters}
          defaults={defaults}
          teamId={parsed.singleTeamId}
          savedView={view}
          hideSaveView={!canEdit}
          createDefaults={parsed.singleTeamId ? { teamId: parsed.singleTeamId } : undefined}
          emptyState={
            <EmptyState icon={<StackSimple size={22} weight="duotone" />} title="Nothing matches this view" compact>
              When issues fit these filters, they’ll show up here.
            </EmptyState>
          }
          fill
        />
      </div>
      <ViewDetailsDialog view={view} open={editing} onOpenChange={setEditing} />
    </div>
  );
}
