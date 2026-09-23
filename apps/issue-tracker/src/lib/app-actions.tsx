import { createContext, useContext } from 'react';
import type { CreateIssueInputType } from 'zitejs/api';

export type CreateDefaults = Partial<Omit<CreateIssueInputType, 'title' | 'parentId'>> & {
  title?: string;
  parent?: { id: string; identifier: string; title: string } | null;
};

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
};

export type AppActions = {
  openCreateIssue: (defaults?: CreateDefaults) => void;
  openPeek: (idOrIdentifier: string) => void;
  closePeek: () => void;
  peekId: string | null;
  openPalette: (initialQuery?: string) => void;
  openShortcuts: () => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** The team the current screen is about, so "create issue" defaults sensibly. */
  setContextTeam: (teamId: string | null) => void;
  contextTeamId: string | null;
};

export const AppActionsContext = createContext<AppActions | null>(null);

export function useAppActions() {
  const ctx = useContext(AppActionsContext);
  if (!ctx) throw new Error('useAppActions must be used inside AppShell');
  return ctx;
}
