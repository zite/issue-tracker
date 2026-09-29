import { lazy, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Logo } from './glyphs';
import { errorMessage } from './lib/errors';
import { useBootstrap } from './lib/queries';
import { SCOPED_SECTIONS } from './lib/scope';
import { useTheme } from './lib/theme';
import { WorkspaceProvider, useWorkspace } from './lib/workspace';
import { AppShell } from './shell/AppShell';
import { Button } from './ui/Button';
import { TooltipProvider } from './ui/Tooltip';

// Pages load on demand: a smaller first paint, and one broken page can't take down the rest.
const GoalPage = lazy(() => import('./pages/GoalPage').then(m => ({ default: m.GoalPage })));
const GoalsPage = lazy(() => import('./pages/GoalsPage').then(m => ({ default: m.GoalsPage })));
const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const InboxPage = lazy(() => import('./pages/InboxPage').then(m => ({ default: m.InboxPage })));
const IntakePage = lazy(() => import('./pages/IntakePage').then(m => ({ default: m.IntakePage })));
const IssuePage = lazy(() => import('./pages/IssuePage').then(m => ({ default: m.IssuePage })));
const IssuesPage = lazy(() => import('./pages/IssuesPage').then(m => ({ default: m.IssuesPage })));
const FilteredIssuesPage = lazy(() => import('./pages/FilteredIssuesPage').then(m => ({ default: m.FilteredIssuesPage })));
const PersonPage = lazy(() => import('./pages/PersonPage').then(m => ({ default: m.PersonPage })));
const ProjectPage = lazy(() => import('./pages/ProjectPage').then(m => ({ default: m.ProjectPage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const RoadmapPage = lazy(() => import('./pages/RoadmapPage').then(m => ({ default: m.RoadmapPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const SprintPage = lazy(() => import('./pages/SprintPage').then(m => ({ default: m.SprintPage })));
const SprintsPage = lazy(() => import('./pages/SprintsPage').then(m => ({ default: m.SprintsPage })));
const ViewPage = lazy(() => import('./pages/ViewPage').then(m => ({ default: m.ViewPage })));
const ViewsPage = lazy(() => import('./pages/ViewsPage').then(m => ({ default: m.ViewsPage })));


/**
 * HashRouter, not BrowserRouter: the app is served under a workspace path the
 * runtime does not rewrite, so a refreshed path-based deep link would 404.
 */

function BootScreen({ state, onRetry, message }: { state: 'loading' | 'error'; onRetry: () => void; message?: string }) {
  return (
    <div className="grid h-[100dvh] place-items-center bg-paper px-6">
      <div className="flex max-w-sm flex-col items-center text-center animate-rise-in">
        <Logo size={44} className="mb-5 shadow-raised [border-radius:11px]" />
        {state === 'error' ? (
          <>
            <h1 className="font-display text-display-sm">Issue Tracker couldn’t load</h1>
            <p className="mt-1.5 text-body text-ink-2">
              {message ?? 'The workspace didn’t respond. If you opened this in a new browser, make sure you’re signed in to your organization.'}
            </p>
            <Button variant="secondary" className="mt-5" onClick={onRetry}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <h1 className="font-display text-display-sm">Opening Issue Tracker</h1>
            <div className="mt-5 h-1 w-40 overflow-hidden rounded-full bg-sunken">
              <div className="h-full w-1/3 rounded-full bg-highlight" style={{ animation: 'boot-slide 1.2s ease-in-out infinite' }} />
            </div>
            <style>{'@keyframes boot-slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
          </>
        )}
      </div>
    </div>
  );
}

/** Scoped sections validate the scope segment; an unknown team falls back to all teams. */
function Scoped({ section, children }: { section: (typeof SCOPED_SECTIONS)[number]; children: ReactNode }) {
  const { scope, tab } = useParams();
  const ws = useWorkspace();
  const key = (scope ?? 'all').toLowerCase();
  if (key !== 'all' && !ws.teamByKey.get(key.toUpperCase())) return <Navigate to={`/all/${section}${tab ? `/${tab}` : ''}`} replace />;
  if (scope !== key) return <Navigate to={`/${key}/${section}${tab ? `/${tab}` : ''}`} replace />;
  return <>{children}</>;
}

/** `/eng/sprints/current`: the running sprint, else the next one, else the team's sprints. A stable link for bookmarks and ⌘K. */
function CurrentSprintRedirect() {
  const { scope = 'all' } = useParams();
  const ws = useWorkspace();
  const team = ws.teamByKey.get(scope.toUpperCase());
  if (!team) return <Navigate to="/all/sprints" replace />;
  const today = new Date().toISOString().slice(0, 10);
  const sprint = ws.activeSprint(team.id) ?? ws.sprintsByTeam.get(team.id)?.find(s => s.status === 'upcoming' && (s.startDate ?? '') >= today) ?? ws.sprintsByTeam.get(team.id)?.find(s => s.status === 'upcoming');
  return <Navigate to={sprint ? `/sprint/${sprint.id}` : `/${team.key.toLowerCase()}/sprints`} replace />;
}

function StoredScopeRedirect({ section }: { section: string }) {
  let key = 'all';
  try {
    key = localStorage.getItem('issue-tracker:scope') ?? 'all';
  } catch {
    /* ignore */
  }
  return <Navigate to={`/${key}/${section}`} replace />;
}

function Boot() {
  const { data, isError, error, refetch } = useBootstrap();

  // A deactivated member is refused by the server with a message worth showing as-is.
  const refusal = isError ? errorMessage(error, '') : '';
  if (isError) return <BootScreen state="error" message={/deactivated/i.test(refusal) ? refusal : undefined} onRetry={() => refetch()} />;
  if (!data) return <BootScreen state="loading" onRetry={() => refetch()} />;

  return (
    <WorkspaceProvider data={data}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/home/:tab" element={<HomePage />} />
          <Route path="/inbox" element={<InboxPage />} />

          <Route path="/issues" element={<StoredScopeRedirect section="issues" />} />
          <Route path="/:scope/issues" element={<Scoped section="issues"><IssuesPage /></Scoped>} />
          <Route path="/:scope/issues/:tab" element={<Scoped section="issues"><IssuesPage /></Scoped>} />
          <Route path="/:scope/intake" element={<Scoped section="intake"><IntakePage /></Scoped>} />
          <Route path="/:scope/sprints" element={<Scoped section="sprints"><SprintsPage /></Scoped>} />
          <Route path="/:scope/sprints/current" element={<CurrentSprintRedirect />} />
          <Route path="/:scope/projects" element={<Scoped section="projects"><ProjectsPage /></Scoped>} />
          <Route path="/:scope/roadmap" element={<Scoped section="roadmap"><RoadmapPage /></Scoped>} />
          <Route path="/:scope/reports" element={<Scoped section="reports"><ReportsPage /></Scoped>} />

          <Route path="/list" element={<FilteredIssuesPage />} />
          <Route path="/issue/:key" element={<IssuePage />} />
          <Route path="/sprint/:sprintId" element={<SprintPage />} />
          <Route path="/project/:projectId" element={<ProjectPage />} />
          <Route path="/project/:projectId/:tab" element={<ProjectPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/goal/:goalId" element={<GoalPage />} />
          <Route path="/views" element={<ViewsPage />} />
          <Route path="/view/:viewId" element={<ViewPage />} />
          <Route path="/people/:memberId" element={<PersonPage />} />
          <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
          <Route path="/settings/:section" element={<SettingsPage />} />
          <Route path="/settings/:section/:itemId" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </WorkspaceProvider>
  );
}

export default function App() {
  const { resolved } = useTheme();
  return (
    <HashRouter>
      <TooltipProvider delayDuration={400} skipDelayDuration={200}>
        <Boot />
        <Toaster position="bottom-center" theme={resolved} closeButton={false} offset={20} toastOptions={{ className: 'text-ui' }} />
      </TooltipProvider>
    </HashRouter>
  );
}
