import { ArrowRight, CaretDown, Tray } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Mark } from '../glyphs';
import { IssuesView } from '../issues/IssuesView';
import { useScope } from '../lib/scope';
import type { IssueFilters } from '../lib/types';
import type { ViewOptions } from '../lib/view';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useWorkspace } from '../lib/workspace';
import { Count } from '../ui/Chip';
import { PageHeader } from '../ui/Layout';
import { ScopeEyebrow } from '../shell/ScopeEyebrow';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '../ui/Menu';
import { Tabs } from '../ui/Tabs';

const TABS = ['all', 'active', 'backlog'] as const;

function ViewsMenu() {
  const ws = useWorkspace();
  const scope = useScope();
  const navigate = useNavigate();
  const views = ws.views.filter(v => !scope.team || !v.teamId || v.teamId === scope.team.id);
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className="inline-flex h-9 items-center gap-1.5 text-ui font-medium text-ink-2 hover:text-ink data-[state=open]:text-ink">
          Views <Count>{views.length}</Count>
          <CaretDown size={11} />
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="w-72">
        <MenuLabel>Saved views</MenuLabel>
        {views.length === 0 && <div className="px-2 pb-2 text-ui text-ink-3">None yet — save any list from its ⋯ menu.</div>}
        {views.slice(0, 12).map(v => (
          <MenuItem key={v.id} icon={<Mark icon={v.icon} color={v.color} name={v.name} size={18} />} hint={v.scope === 'Personal' ? 'Only you' : v.teamId ? ws.teamById.get(v.teamId)?.key : undefined} onSelect={() => navigate(`/view/${v.id}`)}>
            {v.name}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem icon={<ArrowRight size={15} />} onSelect={() => navigate('/views')}>
          All views
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** The Issues section's tab row — shared by the ledger tabs and the intake deck so the header never jumps. */
export function IssuesTabs({ tab }: { tab: string }) {
  const ws = useWorkspace();
  const scope = useScope();
  const team = scope.team;
  const intakeCount = team ? ws.counts.intakeByTeam[team.id] ?? 0 : Object.values(ws.counts.intakeByTeam).reduce((a, b) => a + b, 0);
  const intakeOn = team ? team.intakeEnabled : ws.teams.some(t => t.intakeEnabled);
  return (
    <Tabs
      value={tab}
      items={[
        { value: 'all', label: 'All issues', to: scope.to('issues') },
        { value: 'active', label: 'In flight', to: scope.to('issues', '/active') },
        { value: 'backlog', label: 'Backlog', to: scope.to('issues', '/backlog') },
        ...(intakeOn || tab === 'intake' ? [{ value: 'intake', label: <span className="inline-flex items-center gap-1.5"><Tray size={14} />Intake</span>, count: intakeCount || undefined, to: scope.to('intake') }] : []),
      ]}
      end={<ViewsMenu />}
    />
  );
}

/** One Issues page for every scope: all teams, or one team. */
export function IssuesPage() {
  const { tab = 'all' } = useParams();
  const scope = useScope();
  const team = scope.team;
  useDocumentTitle(tab === 'active' ? 'In flight' : tab === 'backlog' ? 'Backlog' : 'Issues', team?.name ?? 'All teams');

  const base = useMemo<IssueFilters>(() => {
    const f: IssueFilters = team ? { teamIds: [team.id] } : {};
    if (tab === 'active') f.statusTypes = ['unstarted', 'started'];
    if (tab === 'backlog') f.statusTypes = ['backlog'];
    return f;
  }, [team, tab]);

  const defaults = useMemo<Partial<ViewOptions>>(() => {
    if (tab === 'active') return { layout: 'board', grouping: 'status', completed: 'week' };
    if (tab === 'backlog') return { grouping: 'priority', ordering: 'manual' };
    return { grouping: team ? 'status' : 'team', completed: 'month', ordering: team ? 'manual' : 'priority' };
  }, [tab, team]);

  if (!TABS.includes(tab as (typeof TABS)[number])) return <Navigate to={scope.to('issues')} replace />;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow={<ScopeEyebrow />}
        title="Issues"
        description={team ? team.description : 'Everything every team is tracking, in one ledger.'}
        tabs={<IssuesTabs tab={tab} />}
      />
      <IssuesView
        key={`${scope.key}:${tab}`}
        fill
        surfaceKey={`issues:${scope.key}:${tab}`}
        baseFilters={base}
        lockedFields={team ? ['teamIds'] : []}
        teamId={team?.id ?? null}
        defaults={defaults}
        createDefaults={team ? { teamId: team.id } : undefined}
      />
    </div>
  );
}
