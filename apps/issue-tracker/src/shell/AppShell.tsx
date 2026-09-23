import { Warning } from '@phosphor-icons/react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Button } from '../ui/Button';
import { EmptyState, ListSkeleton, Skeleton } from '../ui/Layout';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { IssueSheet } from '../issue/IssueSheet';
import { AppActionsContext, type AppActions, type ConfirmOptions, type CreateDefaults } from '../lib/app-actions';
import { useHotkeys } from '../lib/hotkeys';
import { ScopeProvider, useScope, useSwitchScope } from '../lib/scope';
import { useTheme } from '../lib/theme';
import { useWorkspace } from '../lib/workspace';
import { ConfirmDialog } from '../ui/Dialog';
import { CommandPalette } from './CommandPalette';
import { CreateIssueDialog } from './CreateIssueDialog';
import { ShortcutsDialog } from './ShortcutsDialog';
import { TopBar } from './TopBar';

/** "G then …" — scoped sections resolve under the current team scope. */
const GO: Record<string, string | { section: 'issues' | 'intake' | 'sprints' | 'projects' | 'roadmap' | 'reports' }> = {
  h: '/home',
  m: '/home/assigned',
  n: '/inbox',
  i: { section: 'issues' },
  t: { section: 'intake' },
  s: { section: 'sprints' },
  p: { section: 'projects' },
  o: '/goals',
  r: { section: 'roadmap' },
  e: { section: 'reports' },
  v: '/views',
};

function PageLoading() {
  return (
    <div className="px-4 pt-7 sm:px-7">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-64" />
      <Skeleton className="mt-3 h-3 w-96 max-w-full" />
      <div className="mt-8">
        <ListSkeleton rows={8} />
      </div>
    </div>
  );
}

function PageError({ error }: { error: unknown }) {
  return (
    <EmptyState icon={<Warning size={22} weight="duotone" />} title="This page hit a snag" actions={<Button onClick={() => window.location.reload()}>Reload</Button>}>
      {error instanceof Error ? error.message : 'Something went wrong while showing this page.'}
    </EmptyState>
  );
}

function Shell() {
  const ws = useWorkspace();
  const scope = useScope();
  const switchScope = useSwitchScope();
  const navigate = useNavigate();
  const location = useLocation();
  const { toggle: toggleTheme } = useTheme();

  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<CreateDefaults | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);
  // A page about one team (a sprint, a project) names it; otherwise the scope's team is the context.
  const [pageTeamId, setContextTeam] = useState<string | null>(null);
  const contextTeamId = pageTeamId ?? scope.team?.id ?? null;
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const confirmResolver = useRef<((ok: boolean) => void) | null>(null);
  const pendingG = useRef<number | null>(null);

  // A new page closes the issue sheet, except when the sheet itself navigated within Inbox/Intake.
  useEffect(() => {
    setPeekId(null);
  }, [location.pathname]);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      confirmResolver.current = resolve;
      setConfirmState({ ...options, open: true });
    });
  }, []);

  const actions = useMemo<AppActions>(
    () => ({
      openCreateIssue: defaults => {
        setCreateDefaults(defaults ?? null);
        setCreateOpen(true);
      },
      openPeek: id => setPeekId(id),
      closePeek: () => setPeekId(null),
      peekId,
      openPalette: q => {
        setPaletteQuery(q ?? '');
        setPaletteOpen(true);
      },
      openShortcuts: () => setShortcutsOpen(true),
      confirm,
      setContextTeam,
      contextTeamId,
    }),
    [peekId, confirm, contextTeamId],
  );

  const cycleScope = (dir: 1 | -1) => {
    const keys = ['all', ...ws.teams.map(t => t.key.toLowerCase())];
    const at = Math.max(0, keys.indexOf(scope.key));
    switchScope(keys[(at + dir + keys.length) % keys.length]);
  };

  useHotkeys({ 'mod+k': () => setPaletteOpen(o => !o) }, { allowInOverlay: true, allowInInputs: ['mod+k'] });
  useHotkeys({
    c: () => actions.openCreateIssue(),
    '?': () => setShortcutsOpen(true),
    '[': () => cycleScope(-1),
    ']': () => cycleScope(1),
    'mod+,': () => navigate('/settings'),
    'mod+shift+l': toggleTheme,
    g: () => {
      if (pendingG.current) window.clearTimeout(pendingG.current);
      pendingG.current = window.setTimeout(() => (pendingG.current = null), 1200);
    },
  });

  // The second key of "G then X" is claimed in the capture phase so list shortcuts don't take it first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pendingG.current || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ['INPUT', 'TEXTAREA'].includes(t.tagName)) return;
      const key = e.key.toLowerCase();
      if (key === 'g') return;
      window.clearTimeout(pendingG.current);
      pendingG.current = null;
      const target = GO[key];
      if (!target) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      navigate(typeof target === 'string' ? target : scope.to(target.section));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [navigate, scope]);

  return (
    <AppActionsContext.Provider value={actions}>
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-paper">
        <TopBar />
        <main id="main" className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <ErrorBoundary resetKeys={[location.pathname]} fallbackRender={({ error }) => <PageError error={error} />}>
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
        <IssueSheet id={peekId} onClose={() => setPeekId(null)} />
        <CreateIssueDialog open={createOpen} onOpenChange={setCreateOpen} defaults={createDefaults} contextTeamId={contextTeamId} />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} initialQuery={paletteQuery} />
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        <ConfirmDialog
          open={Boolean(confirmState?.open)}
          title={confirmState?.title ?? ''}
          description={confirmState?.description}
          confirmLabel={confirmState?.confirmLabel}
          destructive={confirmState?.destructive}
          onConfirm={() => {
            confirmResolver.current?.(true);
            confirmResolver.current = null;
            setConfirmState(s => (s ? { ...s, open: false } : s));
          }}
          onCancel={() => {
            confirmResolver.current?.(false);
            confirmResolver.current = null;
            setConfirmState(s => (s ? { ...s, open: false } : s));
          }}
        />
      </div>
    </AppActionsContext.Provider>
  );
}

export function AppShell() {
  return (
    <ScopeProvider>
      <Shell />
    </ScopeProvider>
  );
}
