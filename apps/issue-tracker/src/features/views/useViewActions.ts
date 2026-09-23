import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { saveView, togglePin } from 'zitejs/api';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import type { Bootstrap, SavedView } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';

/**
 * Deleting a saved view: confirm, drop it from the workspace cache at once, then
 * tell the server. The toast's Undo saves it again with the same settings (and
 * re-pins it if it was pinned) — the issues were never touched, so that is a
 * complete undo apart from its place in the list.
 */
export function useDeleteView() {
  const qc = useQueryClient();
  const app = useAppActions();
  const ws = useWorkspace();

  return useCallback(
    async (view: SavedView, opts: { beforeRemove?: () => void } = {}) => {
      const ok = await app.confirm({
        title: `Delete “${view.name}”?`,
        description: 'The issues stay exactly as they are — only this saved view goes, and it’s unpinned for everyone who pinned it.',
        confirmLabel: 'Delete view',
        destructive: true,
      });
      if (!ok) return false;

      const wasPinned = ws.isPinned('View', view.id);
      await qc.cancelQueries({ queryKey: qk.bootstrap });
      const previous = qc.getQueryData<Bootstrap>(qk.bootstrap);
      opts.beforeRemove?.();
      qc.setQueryData<Bootstrap>(qk.bootstrap, old =>
        old
          ? {
              ...old,
              views: old.views.filter(v => v.id !== view.id),
              pins: old.pins.filter(p => !(p.entityType === 'View' && p.entityId === view.id)),
            }
          : old,
      );

      try {
        await saveView({ id: view.id, remove: true });
      } catch (e) {
        if (previous) qc.setQueryData(qk.bootstrap, previous);
        toast.error(errorMessage(e, 'Couldn’t delete the view'));
        return false;
      } finally {
        qc.invalidateQueries({ queryKey: qk.bootstrap });
      }

      toast.success(`Deleted “${view.name}”`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              const { id } = await saveView(viewFields(view));
              if (id && wasPinned) await togglePin({ entityType: 'View', entityId: id, pinned: true });
              toast.success(`Restored “${view.name}”`);
            } catch (e) {
              toast.error(errorMessage(e, 'Couldn’t restore the view'));
            } finally {
              qc.invalidateQueries({ queryKey: qk.bootstrap });
            }
          },
        },
      });
      return true;
    },
    [qc, app, ws],
  );
}

/** The fields that make a saved view what it is — everything but its id, owner and place in the list. */
function viewFields(view: SavedView) {
  return {
    name: view.name,
    description: view.description,
    teamId: view.teamId,
    scope: view.scope as 'Personal' | 'Team' | 'Workspace',
    icon: view.icon,
    color: view.color,
    filters: view.filters,
    grouping: view.grouping,
    ordering: view.ordering,
    options: view.options,
    display: view.display as 'List' | 'Board' | 'Table',
  };
}

/**
 * Duplicating a view: a copy with the same filters, layout and sharing, named
 * "… copy". From the directory the toast offers to open it; from the view
 * itself you go straight there, since that's where you'd change it.
 */
export function useDuplicateView() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useCallback(
    async (view: SavedView, opts: { open?: boolean } = {}) => {
      const name = `${view.name.slice(0, 114)} copy`;
      try {
        const { id } = await saveView({ ...viewFields(view), name });
        await qc.invalidateQueries({ queryKey: qk.bootstrap });
        if (!id) return null;
        if (opts.open) {
          navigate(`/view/${id}`);
          toast.success(`Duplicated as “${name}”`);
        } else {
          toast.success(`Duplicated as “${name}”`, { action: { label: 'Open', onClick: () => navigate(`/view/${id}`) } });
        }
        return id;
      } catch (e) {
        toast.error(errorMessage(e, 'Couldn’t duplicate the view'));
        return null;
      }
    },
    [qc, navigate],
  );
}
