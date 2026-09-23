import { ChatCircleText, Diamond, DotsThree, PencilSimpleLine, PushPin, SquaresFour, Stack, WarningCircle, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Mark } from '../glyphs';
import { IssuesView } from '../issues/IssuesView';
import { useAppActions } from '../lib/app-actions';
import { usePinToggle } from '../lib/mutations';
import { useProject, useProjects } from '../lib/queries';
import type { IssueFilters, ProjectDetail } from '../lib/types';
import { useScope } from '../lib/scope';
import { useContextTeam } from '../lib/useContextTeam';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { DEFAULT_PROPERTIES } from '../lib/view';
import { useWorkspace } from '../lib/workspace';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { EmptyState, PageBody, PageHeader, Skeleton } from '../ui/Layout';
import { Tabs } from '../ui/Tabs';
import { Tooltip } from '../ui/Tooltip';
import { ProjectIconPicker } from '../features/projects/bits';
import { CheckInComposer, CheckInFeed, CheckInsSkeleton } from '../features/projects/CheckIns';
import { ProjectDialog } from '../features/projects/ProjectDialog';
import { ProjectMenu } from '../features/projects/ProjectMenu';
import { OverviewSkeleton, ProjectOverview } from '../features/projects/ProjectOverview';
import { useProjectActions } from '../features/projects/useProjectActions';

type Tab = 'overview' | 'issues' | 'check-ins';

// Every row is in this project, so its column would only repeat the page title.
const ISSUE_DEFAULTS = { grouping: 'status' as const, completed: 'all' as const, properties: DEFAULT_PROPERTIES.filter(p => p !== 'project') };
type Project = ProjectDetail['project'];

/** The project name as the page title, renamed in place: Enter or blur saves, Esc reverts. */
function InlineName({ project }: { project: Project }) {
  const actions = useProjectActions();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(project.name);
  const done = useRef(false);

  const start = () => {
    setValue(project.name);
    done.current = false;
    setEditing(true);
  };
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    const name = value.trim();
    if (commit && name && name !== project.name) actions.update(project.id, { name });
  };

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        title={`${project.name} — click to rename`}
        onClick={start}
        onKeyDown={e => e.key === 'Enter' && start()}
        className="cursor-text decoration-line-strong decoration-2 underline-offset-[7px] hover:underline"
      >
        {project.name}
      </span>
    );
  }
  return (
    <input
      autoFocus
      value={value}
      maxLength={200}
      aria-label="Project name"
      onChange={e => setValue(e.target.value)}
      onFocus={e => e.currentTarget.select()}
      onBlur={() => finish(true)}
      onKeyDown={e => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') {
          e.stopPropagation();
          finish(false);
        }
      }}
      style={{ font: 'inherit', letterSpacing: 'inherit', width: `${Math.max(6, value.length + 1)}ch` }}
      className="max-w-full bg-transparent text-ink underline decoration-highlight decoration-2 underline-offset-[7px] outline-none focus-visible:outline-none"
    />
  );
}

/** The summary as the page description, edited the same way; an empty summary clears it. */
function InlineSummary({ project }: { project: Project }) {
  const actions = useProjectActions();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(project.summary ?? '');
  const done = useRef(false);

  const start = () => {
    setValue(project.summary ?? '');
    done.current = false;
    setEditing(true);
  };
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    const summary = value.trim() || null;
    if (commit && summary !== (project.summary ?? null)) actions.update(project.id, { summary });
  };

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        title="Edit summary"
        onClick={start}
        onKeyDown={e => e.key === 'Enter' && start()}
        className={cn('cursor-text decoration-line-strong underline-offset-4 hover:underline', !project.summary && 'text-ink-3')}
      >
        {project.summary || 'Add a one-line summary…'}
      </span>
    );
  }
  return (
    <input
      autoFocus
      value={value}
      maxLength={500}
      aria-label="Summary"
      placeholder="Add a one-line summary…"
      onChange={e => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={e => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') {
          e.stopPropagation();
          finish(false);
        }
      }}
      className="-my-px w-full bg-transparent text-body text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
    />
  );
}

function ProjectIssues({ projectId, teamId }: { projectId: string; teamId: string | null }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const [params] = useSearchParams();
  const milestoneId = params.get('milestone');
  const milestone = milestoneId ? ws.milestoneById.get(milestoneId) : undefined;
  // The milestone is part of the surface (its own chip clears it), not a filter "Clear filters" can drop.
  const baseFilters = useMemo<IssueFilters>(() => ({ projectIds: [projectId], ...(milestoneId ? { milestoneIds: [milestoneId] } : {}) }), [projectId, milestoneId]);
  const createDefaults = useMemo(() => ({ projectId, teamId: teamId ?? undefined, ...(milestoneId ? { milestoneId } : {}) }), [projectId, teamId, milestoneId]);

  return (
    <IssuesView
      key={milestoneId ?? 'all'}
      surfaceKey={milestoneId ? `project:${projectId}:milestone:${milestoneId}` : `project:${projectId}`}
      baseFilters={baseFilters}
      lockedFields={milestoneId ? ['projectIds', 'milestoneIds'] : ['projectIds']}
      teamId={teamId}
      defaults={ISSUE_DEFAULTS}
      createDefaults={createDefaults}
      fill
      toolbarStart={
        milestoneId ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-highlight/30 pl-2 pr-1 text-ui font-medium text-ink ring-1 ring-inset ring-highlight dark:bg-highlight/15">
            <Diamond size={12} weight="bold" />
            <span className="max-w-[200px] truncate">{milestone?.name ?? 'Milestone'}</span>
            <Tooltip content="Show all project issues">
              <Link to={`/project/${projectId}/issues`} aria-label="Clear milestone" className="flex h-5 w-5 items-center justify-center rounded-xs text-ink-2 hover:bg-card hover:text-ink">
                <X size={11} weight="bold" />
              </Link>
            </Tooltip>
          </span>
        ) : undefined
      }
      emptyState={
        <EmptyState
          compact
          icon={milestoneId ? <Diamond size={22} weight="duotone" /> : <Stack size={22} weight="duotone" />}
          title={milestoneId ? 'Nothing in this milestone yet' : 'No issues in this project yet'}
          actions={
            <Button variant="primary" onClick={() => app.openCreateIssue(createDefaults)}>
              New issue
            </Button>
          }
        >
          {milestoneId ? 'Set the milestone from an issue’s properties, or create one here.' : 'Issues created here join the project and count toward its progress.'}
        </EmptyState>
      }
    />
  );
}

function CheckInsTab({ detail }: { detail: ProjectDetail }) {
  const [params, setParams] = useSearchParams();
  const compose = params.get('compose') === '1';
  // Focus once, then drop the flag so a reload doesn't steal focus again.
  useEffect(() => {
    if (!compose) return;
    const t = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      next.delete('compose');
      setParams(next, { replace: true });
    }, 400);
    return () => window.clearTimeout(t);
  }, [compose, params, setParams]);
  const audience = useMemo(() => {
    const ids = new Set(detail.contributors.map(c => c.id));
    if (detail.project.leadId) ids.add(detail.project.leadId);
    return ids.size;
  }, [detail.contributors, detail.project.leadId]);
  const ws = useWorkspace();
  const others = audience - (detail.contributors.some(c => c.id === ws.me.id) || detail.project.leadId === ws.me.id ? 1 : 0);

  return (
    <div className="relative mx-auto flex w-full max-w-[820px] flex-col gap-6 pb-16 animate-rise-in">
      <div className="relative flex gap-4 sm:gap-5">
        {/* The rail runs from this node through the heading to the newest check-in's date. */}
        {detail.updates.length > 0 && <span aria-hidden className="absolute -bottom-[62px] left-[27px] top-[62px] hidden w-px bg-line-strong sm:block" />}
        <div className="relative hidden w-14 shrink-0 justify-center pt-1.5 sm:flex" aria-hidden>
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-highlight text-highlight-ink shadow-hairline">
            <PencilSimpleLine size={20} weight="bold" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <CheckInComposer key={detail.project.id} project={detail.project} autoFocus={compose} audience={others} />
        </div>
      </div>
      <section>
        <h2 className="relative mb-3 text-micro font-semibold uppercase text-ink-3 sm:pl-[76px]">
          {detail.updates.length ? `${detail.updates.length} check-in${detail.updates.length === 1 ? '' : 's'}, newest first` : 'History'}
        </h2>
        <CheckInFeed project={detail.project} checkIns={detail.updates} />
      </section>
    </div>
  );
}

export function ProjectPage() {
  const { projectId = '', tab: rawTab } = useParams();
  const location = useLocation();
  const ws = useWorkspace();
  const scope = useScope();
  const navigate = useNavigate();
  const togglePin = usePinToggle();
  const actions = useProjectActions();
  const { data, isError, error, failureCount, refetch, isRefetching } = useProject(projectId);
  const projects = useProjects();
  const [editOpen, setEditOpen] = useState(false);

  const ref = ws.projectById.get(projectId);
  const summary = projects.data?.projects.find(p => p.id === projectId);
  const project = data?.project;
  const teamId = project?.teamId ?? ref?.teamId ?? null;
  const team = teamId ? ws.teamById.get(teamId) : undefined;
  useContextTeam(teamId);

  useDocumentTitle(project?.name ?? ref?.name ?? (projects.isPending ? null : 'Project not found'));

  // Legacy links said "updates".
  if (rawTab === 'updates') return <Navigate to={`/project/${projectId}/check-ins${location.search}`} replace />;
  if (rawTab === 'overview') return <Navigate to={`/project/${projectId}${location.search}`} replace />;
  const tab: Tab = rawTab === 'issues' || rawTab === 'check-ins' ? rawTab : 'overview';
  if (rawTab && rawTab !== tab) return <Navigate to={`/project/${projectId}`} replace />;

  // Back to the projects list under the scope the person was browsing, not the project's team.
  const projectsLink = scope.to('projects');
  const errorText = String((error as Error | null)?.message ?? '');
  // Bootstrap knows every project, so an unknown id can say so after one failed fetch, not after retries.
  const notFound = !data && (isError || failureCount > 0) && (!ref || /not found|404/i.test(errorText));

  if (notFound) {
    return (
      <>
        <PageHeader
          eyebrow={
            <Link to={projectsLink} className="font-medium text-ink-2 hover:text-ink">
              Projects
            </Link>
          }
          title="Project not found"
        />
        <PageBody>
          <EmptyState
            icon={<SquaresFour size={22} weight="duotone" />}
            title="This project doesn’t exist"
            actions={
              <Button asChild variant="secondary">
                <Link to={projectsLink}>Back to projects</Link>
              </Button>
            }
          >
            It may have been deleted, or the link is wrong.
          </EmptyState>
        </PageBody>
      </>
    );
  }

  const pinned = ws.isPinned('Project', projectId);
  // The bootstrap ref stands in until the full project loads; the dialog fetches the description itself.
  const menuProject = project ?? ref ?? null;
  const name = project?.name ?? ref?.name;

  const tabs = (
    <Tabs
      value={tab}
      items={[
        { value: 'overview', label: 'Overview', to: `/project/${projectId}` },
        { value: 'issues', label: 'Issues', count: summary ? summary.total : null, to: `/project/${projectId}/issues` },
        { value: 'check-ins', label: 'Check-ins', count: data ? data.updates.length : null, to: `/project/${projectId}/check-ins` },
      ]}
    />
  );

  const header = (
    <PageHeader
      eyebrow={
        <>
          {team && <Mark icon={team.icon} color={team.color} name={team.name} size={16} />}
          {team && <span className="font-medium text-ink-2">{team.name}</span>}
          {team && <span aria-hidden className="text-ink-3">›</span>}
          <Link to={projectsLink} className="font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline">
            Projects
          </Link>
        </>
      }
      titleAdornment={
        project ? (
          <ProjectIconPicker icon={project.icon} color={project.color} name={project.name} size={40} onChange={p => actions.update(project.id, p)} />
        ) : ref ? (
          <Mark icon={ref.icon} color={ref.color} name={ref.name} size={40} />
        ) : (
          <Skeleton className="h-10 w-10 rounded-[30%]" />
        )
      }
      title={project ? <InlineName project={project} /> : name ?? <span className="inline-block h-7 w-64 align-middle skeleton" />}
      description={project ? <InlineSummary project={project} /> : ref?.summary ?? undefined}
      actions={
        <>
          <Tooltip content={pinned ? 'Unpin' : 'Pin'}>
            <Button variant="ghost" size="md" icon aria-label={pinned ? 'Unpin project' : 'Pin project'} aria-pressed={pinned} onClick={() => togglePin('Project', projectId, !pinned)} className={cn(pinned && 'text-ink')}>
              <PushPin size={17} weight={pinned ? 'fill' : 'regular'} />
            </Button>
          </Tooltip>
          {menuProject && (
            <ProjectMenu
              project={menuProject}
              onEdit={() => setEditOpen(true)}
              onDeleted={() => navigate(projectsLink, { replace: true })}
              trigger={
                <Button variant="ghost" size="md" icon aria-label="Project actions" className="data-[state=open]:bg-hover">
                  <DotsThree size={17} weight="bold" />
                </Button>
              }
            />
          )}
          <Button variant="highlight" leading={<ChatCircleText size={15} weight="bold" />} onClick={() => navigate(`/project/${projectId}/check-ins?compose=1`)}>
            Post check-in
          </Button>
        </>
      }
      tabs={tabs}
    />
  );

  let body;
  if (isError && !data) {
    body = (
      <PageBody>
        <EmptyState
          icon={<WarningCircle size={22} weight="duotone" />}
          title="This project didn’t load"
          actions={
            <Button variant="secondary" loading={isRefetching} onClick={() => refetch()}>
              Try again
            </Button>
          }
        >
          Something went wrong reaching the workspace. Try again in a moment.
        </EmptyState>
      </PageBody>
    );
  } else if (tab === 'issues') {
    body = ref || project ? <ProjectIssues projectId={projectId} teamId={teamId} /> : null;
  } else if (tab === 'check-ins') {
    body = <PageBody>{data ? <CheckInsTab detail={data} /> : <div className="mx-auto max-w-[760px]"><CheckInsSkeleton /></div>}</PageBody>;
  } else {
    body = <PageBody className="pb-16">{data ? <ProjectOverview key={projectId} detail={data} /> : <OverviewSkeleton />}</PageBody>;
  }

  return (
    <div className={cn('flex flex-col', tab === 'issues' ? 'h-full' : 'min-h-full')}>
      {header}
      {body}
      {menuProject && <ProjectDialog open={editOpen} onOpenChange={setEditOpen} project={menuProject} />}
    </div>
  );
}
