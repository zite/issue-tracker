import { ArrowsDownUp, Kanban, MagnifyingGlass, Plus, Rows, SquaresFour, WarningCircle } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useProjects } from '../lib/queries';
import { useScope } from '../lib/scope';
import type { ProjectSummary } from '../lib/types';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { Segmented } from '../ui/Form';
import { EmptyState, PageBody, PageHeader } from '../ui/Layout';
import { Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '../ui/Menu';
import { Tabs } from '../ui/Tabs';
import { ScopeEyebrow } from '../shell/ScopeEyebrow';
import { ProjectBoard, BoardSkeleton } from '../features/projects/ProjectBoard';
import { ProjectDialog } from '../features/projects/ProjectDialog';
import { GallerySkeleton, ProjectGallery, type ProjectSection } from '../features/projects/ProjectGallery';
import { ProjectTable, TableSkeleton } from '../features/projects/ProjectTable';
import {
  LAYOUTS, LIST_ORDER, SORTS, TABS, isClosedStatus, sortProjects, useStoredChoice,
  type LayoutKey, type ProjectStatus, type SortKey, type TabKey,
} from '../features/projects/model';

type DialogState = { open: boolean; project?: ProjectSummary | null; status?: ProjectStatus };

export function ProjectsPage() {
  const scope = useScope();
  const team = scope.team;
  const [params, setParams] = useSearchParams();
  const { data, isPending, isError, refetch, isRefetching } = useProjects();
  const [layout, setLayout] = useStoredChoice<LayoutKey>('issue-tracker:projects:layout', 'gallery', LAYOUTS);
  const [sort, setSort] = useStoredChoice<SortKey>('issue-tracker:projects:sort', 'manual', SORTS.map(s => s.key));
  const [dialog, setDialog] = useState<DialogState>({ open: false });

  const tab = TABS.find(t => t.key === params.get('status')) ?? TABS[0];
  useDocumentTitle('Projects', team?.name ?? 'All teams');

  // The palette links here with ?new=1 to open the create dialog.
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setDialog({ open: true, project: null });
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const scoped = useMemo(() => (data?.projects ?? []).filter(p => !team || p.teamId === team.id), [data, team]);
  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { all: scoped.length, active: 0, planned: 0, backlog: 0, completed: 0 };
    for (const p of scoped) for (const t of TABS) if (t.key !== 'all' && t.statuses.includes(p.status as ProjectStatus)) c[t.key]++;
    return c;
  }, [scoped]);
  const visible = useMemo(() => sortProjects(scoped.filter(p => tab.statuses.includes(p.status as ProjectStatus)), sort), [scoped, tab, sort]);
  const sections = useMemo<ProjectSection[]>(
    () => LIST_ORDER.map(status => ({ status, projects: visible.filter(p => p.status === status) })).filter(s => s.projects.length > 0),
    [visible],
  );

  const inFlight = scoped.filter(p => p.status === 'In Progress').length;
  const atRisk = scoped.filter(p => !isClosedStatus(p.status) && (p.health === 'At Risk' || p.health === 'Off Track')).length;

  const openCreate = useCallback((status?: ProjectStatus) => setDialog({ open: true, project: null, status }), []);
  const openEdit = useCallback((project: ProjectSummary) => setDialog({ open: true, project }), []);

  const setTab = (key: string) => {
    const next = new URLSearchParams(params);
    if (key === 'all') next.delete('status');
    else next.set('status', key);
    setParams(next, { replace: true });
  };

  const showTeam = !team;
  const board = layout === 'board';

  let body;
  if (isPending) {
    body = board ? <BoardSkeleton /> : layout === 'table' ? <TableSkeleton /> : <GallerySkeleton />;
  } else if (isError) {
    body = (
      <EmptyState
        icon={<WarningCircle size={22} weight="duotone" />}
        title="Projects didn’t load"
        actions={<Button variant="secondary" loading={isRefetching} onClick={() => refetch()}>Try again</Button>}
      >
        Something went wrong reaching the workspace. Your projects are safe — try again in a moment.
      </EmptyState>
    );
  } else if (scoped.length === 0) {
    body = (
      <EmptyState
        icon={<SquaresFour size={22} weight="duotone" />}
        title={team ? `${team.name} has no projects yet` : 'No projects yet'}
        actions={<Button variant="primary" leading={<Plus size={14} weight="bold" />} onClick={() => openCreate()}>New project</Button>}
      >
        A project gathers issues toward one outcome — with a lead, a target date, milestones and regular check-ins on how it’s going.
      </EmptyState>
    );
  } else if (visible.length === 0 && !board) {
    body = (
      <EmptyState
        compact
        icon={<MagnifyingGlass size={22} weight="duotone" />}
        title={`No ${tab.label.toLowerCase()} projects`}
        actions={<Button variant="secondary" onClick={() => setTab('all')}>Show all projects</Button>}
      >
        {tab.key === 'active' ? 'Nothing is in progress right now.' : `None of ${team ? `${team.name}’s` : 'your'} projects are ${tab.label.toLowerCase()}.`}
      </EmptyState>
    );
  } else if (board) {
    body = <ProjectBoard projects={visible} statuses={tab.statuses} onEdit={openEdit} onCreate={openCreate} showTeam={showTeam} />;
  } else if (layout === 'table') {
    body = <ProjectTable sections={sections} onEdit={openEdit} onCreate={openCreate} showTeam={showTeam} sort={sort} onSort={setSort} />;
  } else {
    body = <ProjectGallery sections={sections} onEdit={openEdit} onCreate={openCreate} showTeam={showTeam} />;
  }

  const sortLabel = SORTS.find(s => s.key === sort)?.label ?? 'Manual';

  return (
    <div className={cn('flex flex-col', board ? 'h-full' : 'min-h-full')}>
      <PageHeader
        eyebrow={<ScopeEyebrow />}
        title="Projects"
        description={
          data && scoped.length > 0 ? (
            <>
              {scoped.length} {scoped.length === 1 ? 'project' : 'projects'}
              <span className="mx-1.5 text-ink-3">·</span>
              {inFlight} in flight
              {atRisk > 0 && (
                <>
                  <span className="mx-1.5 text-ink-3">·</span>
                  <span className="hl whitespace-nowrap text-ink">{atRisk} at risk</span>
                </>
              )}
            </>
          ) : data ? (
            'Outcomes your teams are driving toward.'
          ) : (
            <span className="inline-block h-4 w-56 align-middle skeleton" />
          )
        }
        actions={
          <>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="sm" leading={<ArrowsDownUp size={15} />} aria-label={`Order by ${sortLabel.toLowerCase()}`} className={cn(sort !== 'manual' && 'text-ink')}>
                  <span className="hidden sm:inline">{sort === 'manual' ? 'Order' : sortLabel}</span>
                </Button>
              </MenuTrigger>
              <MenuContent align="end" className="w-52">
                <MenuLabel>Order projects by</MenuLabel>
                <MenuRadioGroup value={sort} onValueChange={v => setSort(v as SortKey)}>
                  {SORTS.map(s => (
                    <MenuRadioItem key={s.key} value={s.key}>
                      {s.label}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuContent>
            </Menu>
            <Segmented
              value={layout}
              onChange={setLayout}
              options={[
                { value: 'gallery', title: 'Gallery', icon: <SquaresFour size={14} />, label: <span className="hidden md:inline">Gallery</span> },
                { value: 'table', title: 'Table', icon: <Rows size={14} />, label: <span className="hidden md:inline">Table</span> },
                { value: 'board', title: 'Board', icon: <Kanban size={14} />, label: <span className="hidden md:inline">Board</span> },
              ]}
            />
            <Button variant="primary" leading={<Plus size={14} weight="bold" />} onClick={() => openCreate()} aria-label="New project" className="max-sm:w-8 max-sm:px-0">
              <span className="hidden sm:inline">New project</span>
            </Button>
          </>
        }
        tabs={<Tabs items={TABS.map(t => ({ value: t.key, label: t.label, count: data ? counts[t.key] : null }))} value={tab.key} onChange={setTab} />}
      />

      {board && !isError && (isPending || scoped.length > 0) ? <div className="min-h-0 flex-1 pt-4">{body}</div> : <PageBody className="flex-1">{body}</PageBody>}

      <ProjectDialog
        open={dialog.open}
        onOpenChange={open => setDialog(d => ({ ...d, open }))}
        project={dialog.project}
        defaultStatus={dialog.status}
        defaultTeamId={team?.id}
      />
    </div>
  );
}
