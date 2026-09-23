import { Plus, StackSimple } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SCOPE_COPY } from '../features/views/ViewBits';
import { ViewCard } from '../features/views/ViewCard';
import { ViewDetailsDialog } from '../features/views/ViewDetailsDialog';
import { useDeleteView, useDuplicateView } from '../features/views/useViewActions';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { usePinToggle } from '../lib/mutations';
import { useScope } from '../lib/scope';
import type { SavedView } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import { Button } from '../ui/Button';
import { EmptyState, PageBody, PageHeader, Section } from '../ui/Layout';

const SCOPES = ['Workspace', 'Team', 'Personal'] as const;

/** Every saved view you can open, by who it's shared with. */
export function ViewsPage() {
  const ws = useWorkspace();
  const scope = useScope();
  const navigate = useNavigate();
  const togglePin = usePinToggle();
  const deleteView = useDeleteView();
  const duplicateView = useDuplicateView();
  const [editing, setEditing] = useState<SavedView | null>(null);
  useDocumentTitle('Views');

  const byScope = new Map<string, SavedView[]>(SCOPES.map(s => [s, []]));
  for (const v of ws.views) (byScope.get(v.scope) ?? byScope.get('Workspace')!).push(v);
  // Team views read best next to their teammates' views, in team order.
  const teamOrder = (v: SavedView) => ws.teams.findIndex(t => t.id === v.teamId);
  byScope.get('Team')!.sort((a, b) => teamOrder(a) - teamOrder(b) || a.position - b.position);

  const newView = () => navigate('/list?title=New%20view');
  const total = ws.views.length;

  return (
    <>
      <PageHeader
        title="Views"
        description="Saved lists anyone can come back to — filters, grouping, layout and all."
        actions={
          <Button variant="primary" leading={<Plus size={15} weight="bold" />} onClick={newView}>
            New view
          </Button>
        }
      />
      <PageBody className="pb-12">
        {total === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong">
            <EmptyState
              icon={<StackSimple size={22} weight="duotone" />}
              title="No saved views yet"
              actions={
                <Button variant="secondary" asChild>
                  <Link to={scope.to('issues')}>Go to issues</Link>
                </Button>
              }
            >
              Filter any list the way you like it, then save it as a view from its ⋯ menu. Filters, grouping and layout all come with it.
            </EmptyState>
          </div>
        ) : (
          <div className="flex flex-col gap-9">
            {SCOPES.map(s => {
              const views = byScope.get(s)!;
              const copy = SCOPE_COPY[s];
              if (views.length === 0 && s !== 'Personal') return null;
              return (
                <Section key={s} title={copy.section} count={views.length || undefined} description={copy.hint}>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-3">
                    {views.map(v => (
                      <ViewCard
                        key={v.id}
                        view={v}
                        pinned={ws.isPinned('View', v.id)}
                        onTogglePin={() => togglePin('View', v.id, !ws.isPinned('View', v.id))}
                        onDelete={() => deleteView(v)}
                        onEdit={() => setEditing(v)}
                        onDuplicate={() => duplicateView(v)}
                      />
                    ))}
                    {views.length === 0 && (
                      <div className="flex min-h-[132px] flex-col items-start justify-center gap-1 rounded-lg border border-dashed border-line-strong px-4 py-4">
                        <div className="text-ui font-semibold text-ink">Nothing private yet</div>
                        <p className="text-ui text-ink-2 text-pretty">
                          Save any list as a view and choose <span className="font-medium text-ink">Only me</span> — it stays off everyone else’s screen.
                        </p>
                        <Button variant="link" size="sm" onClick={newView} className="mt-1.5 text-ui font-medium">
                          Start a private view
                        </Button>
                      </div>
                    )}
                  </div>
                </Section>
              );
            })}
            <p className="text-meta text-ink-3">Workspace and team views are anyone’s to change or delete; a personal view is yours alone.</p>
          </div>
        )}
      </PageBody>
      <ViewDetailsDialog view={editing} open={Boolean(editing)} onOpenChange={open => !open && setEditing(null)} />
    </>
  );
}
