import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { OPEN_STATUS_TYPES, STATUS_TYPES } from './constants';
import type { Bootstrap, Sprint, Goal, Issue, Label, Member, Milestone, ProjectRef, SavedView, Team, Status } from './types';

/**
 * The reference data every screen renders names from, indexed once.
 *
 * Issue rows carry ids; this is where those ids become a status icon, an avatar
 * or a project name. Keeping it in one memoised context is what lets an
 * optimistic edit re-render every surface correctly from a single cache write.
 */
export type Workspace = Bootstrap & {
  teamById: Map<string, Team>;
  teamByKey: Map<string, Team>;
  memberById: Map<string, Member>;
  statusById: Map<string, Status>;
  statusesByTeam: Map<string, Status[]>;
  labelById: Map<string, Label>;
  projectById: Map<string, ProjectRef>;
  milestoneById: Map<string, Milestone>;
  milestonesByProject: Map<string, Milestone[]>;
  sprintById: Map<string, Sprint>;
  sprintsByTeam: Map<string, Sprint[]>;
  goalById: Map<string, Goal>;
  viewById: Map<string, SavedView>;
  activeMembers: Member[];
  myTeams: Team[];
  pinSet: Set<string>;
  activeSprint: (teamId: string | null | undefined) => Sprint | undefined;
  upcomingSprint: (teamId: string | null | undefined) => Sprint | undefined;
  statusOf: (issue: Pick<Issue, 'statusId'>) => Status | undefined;
  /** The first state of a type for a team, in board order. */
  statusFor: (teamId: string | null | undefined, type: string) => Status | undefined;
  labelsFor: (teamId: string | null | undefined) => Label[];
  membersFor: (teamId: string | null | undefined) => Member[];
  isPinned: (entityType: string, entityId: string) => boolean;
};

const WorkspaceContext = createContext<Workspace | null>(null);

function groupBy<T>(items: T[], key: (item: T) => string | null | undefined) {
  const m = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(item);
  }
  return m;
}

export function buildWorkspace(data: Bootstrap): Workspace {
  const byId = <T extends { id: string }>(items: T[]) => new Map(items.map(i => [i.id, i]));
  const typeOrder = (t: string) => STATUS_TYPES.indexOf(t as never);
  const statusesByTeam = groupBy(data.statuses, s => s.teamId);
  for (const list of statusesByTeam.values()) {
    list.sort((a, b) => a.position - b.position || typeOrder(a.type) - typeOrder(b.type));
  }
  const sprintsByTeam = groupBy(data.sprints, c => c.teamId);
  for (const list of sprintsByTeam.values()) list.sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
  const milestonesByProject = groupBy(data.milestones, m => m.projectId);
  for (const list of milestonesByProject.values()) {
    list.sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999') || a.position - b.position);
  }

  const statusById = byId(data.statuses);
  const activeMembers = data.members.filter(m => m.status !== 'Deactivated');
  const pinSet = new Set(data.pins.map(f => `${f.entityType}:${f.entityId}`));
  const me = data.members.find(m => m.id === data.me.id);
  const myTeams = data.teams.filter(t => !me || me.teamIds.includes(t.id));

  return {
    ...data,
    teamById: byId(data.teams),
    teamByKey: new Map(data.teams.map(t => [t.key.toUpperCase(), t])),
    memberById: byId(data.members),
    statusById,
    statusesByTeam,
    labelById: byId(data.labels),
    projectById: byId(data.projects),
    milestoneById: byId(data.milestones),
    milestonesByProject,
    sprintById: byId(data.sprints),
    sprintsByTeam,
    goalById: byId(data.goals),
    viewById: byId(data.views),
    activeMembers,
    myTeams: myTeams.length ? myTeams : data.teams,
    pinSet,
    activeSprint: teamId => (teamId ? sprintsByTeam.get(teamId)?.find(c => c.status === 'active') : undefined),
    upcomingSprint: teamId => (teamId ? sprintsByTeam.get(teamId)?.find(c => c.status === 'upcoming') : undefined),
    statusOf: issue => (issue.statusId ? statusById.get(issue.statusId) : undefined),
    statusFor: (teamId, type) => (teamId ? statusesByTeam.get(teamId)?.find(s => s.type === type) : undefined),
    labelsFor: teamId => data.labels.filter(l => !l.teamId || l.teamId === teamId),
    membersFor: teamId => {
      if (!teamId) return activeMembers;
      const onTeam = activeMembers.filter(m => m.teamIds.includes(teamId));
      return [...onTeam, ...activeMembers.filter(m => !m.teamIds.includes(teamId))];
    },
    isPinned: (entityType, entityId) => pinSet.has(`${entityType}:${entityId}`),
  };
}

export function WorkspaceProvider({ data, children }: { data: Bootstrap; children: ReactNode }) {
  const value = useMemo(() => buildWorkspace(data), [data]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ws = useContext(WorkspaceContext);
  if (!ws) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ws;
}

export { OPEN_STATUS_TYPES };
