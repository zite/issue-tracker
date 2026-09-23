import {
  ArrowRight, ChartLineUp, Check, Copy, GearSix, GitBranch, House, Kanban, Keyboard, LinkSimple, MagnifyingGlass, MapTrifold, Monitor, Moon, Plus, Rows, Shapes, Sparkle,
  PushPin, SquaresFour, Stack, Sun, Target, Tray, TrayArrowDown, User, UserCirclePlus,
} from '@phosphor-icons/react';
import { Command } from 'cmdk';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mark, PriorityGlyph, SprintGlyph, StatusGlyph } from '../glyphs';
import { useAppActions } from '../lib/app-actions';
import { copyText } from '../lib/clipboard';
import { PRIORITIES } from '../lib/constants';
import { branchName, issueUrl } from '../lib/format';
import { useIssueActions } from '../lib/mutations';
import { useIssue, useIssueSearch } from '../lib/queries';
import { useScope, useSwitchScope } from '../lib/scope';
import { useTheme } from '../lib/theme';
import { useWorkspace } from '../lib/workspace';
import { Avatar, Unassigned } from '../ui/Avatar';
import { Dialog, DialogContent } from '../ui/Dialog';
import { Kbd } from '../ui/Kbd';

const item = 'flex h-10 cursor-default select-none items-center gap-3 rounded-md px-3 text-body text-ink outline-none data-[selected=true]:bg-sunken [&>svg]:shrink-0 [&>svg]:text-ink-3';
const group = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-micro [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-ink-3';

type PinRow = { id: string; label: string; to: string | null; identifier?: string; icon: ReactNode };

function Row({ value, onSelect, icon, children, hint, keywords }: { value: string; onSelect: () => void; icon: ReactNode; children: ReactNode; hint?: ReactNode; keywords?: string[] }) {
  return (
    <Command.Item value={value} keywords={keywords} onSelect={onSelect} className={item}>
      <span className="flex w-5 shrink-0 items-center justify-center text-ink-3">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-meta text-ink-3">{hint}</span>}
    </Command.Item>
  );
}

/**
 * ⌘K. Search issues by ID or words, jump anywhere under the current team
 * scope, switch scope, and — when an issue is open — change it without the mouse.
 */
export function CommandPalette({ open, onOpenChange, initialQuery = '' }: { open: boolean; onOpenChange: (o: boolean) => void; initialQuery?: string }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const actions = useIssueActions();
  const navigate = useNavigate();
  const location = useLocation();
  const scope = useScope();
  const switchScope = useSwitchScope();
  const { setPref, pref } = useTheme();
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState<null | 'status' | 'priority' | 'assignee'>(null);
  const { data, isFetching } = useIssueSearch(open && !page ? query : '');

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setPage(null);
    }
  }, [open, initialQuery]);

  const identifier = /^\/issue\/([^/]+)/.exec(location.pathname)?.[1] ?? app.peekId ?? null;
  const { data: current } = useIssue(open ? identifier : null);
  const issue = current?.issue;

  // Issue matches arrive after the local commands have already been ranked, so
  // move the cursor to the best issue when they land instead of leaving it on "New issue".
  const [selected, setSelected] = useState('');
  const firstResult = page ? undefined : data?.issues?.[0];
  useEffect(() => {
    if (firstResult && query.trim()) setSelected(`issue ${firstResult.identifier} ${firstResult.title}`);
  }, [firstResult?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };
  const run = (fn: () => void) => {
    onOpenChange(false);
    window.setTimeout(fn, 0);
  };

  const q = query.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);
  const projects = useMemo(() => (q ? ws.projects.filter(p => match(p.name)).slice(0, 6) : []), [ws.projects, q]);
  const goals = useMemo(() => (q ? ws.goals.filter(g => match(g.name)).slice(0, 4) : []), [ws.goals, q]);
  const members = useMemo(() => (q ? ws.activeMembers.filter(m => match(m.name)).slice(0, 5) : []), [ws.activeMembers, q]);
  const views = useMemo(() => (q ? ws.views.filter(v => match(v.name)).slice(0, 5) : []), [ws.views, q]);
  // Pins are Issue Tracker's bookmarks, so ⌘K reaches them from any page.
  const pins = useMemo(() => ws.pins.flatMap((p): PinRow[] => {
    if (p.entityType === 'Project') { const x = ws.projectById.get(p.entityId); return x ? [{ id: p.id, label: x.name, to: `/project/${x.id}`, icon: <Mark icon={x.icon} color={x.color} name={x.name} size={18} /> }] : []; }
    if (p.entityType === 'Goal') { const x = ws.goalById.get(p.entityId); return x ? [{ id: p.id, label: x.name, to: `/goal/${x.id}`, icon: <Mark icon={x.icon} color={x.color} name={x.name} size={18} /> }] : []; }
    if (p.entityType === 'View') { const x = ws.viewById.get(p.entityId); return x ? [{ id: p.id, label: x.name, to: `/view/${x.id}`, icon: <Mark icon={x.icon} color={x.color} name={x.name} size={18} /> }] : []; }
    if (p.entityType === 'Sprint') { const x = ws.sprintById.get(p.entityId); return x ? [{ id: p.id, label: `${ws.teamById.get(x.teamId ?? '')?.key ?? ''} ${x.name}`.trim(), to: `/sprint/${x.id}`, icon: <SprintGlyph status={x.status} progress={0.5} size={16} /> }] : []; }
    if (p.entityType === 'Issue' && p.issueIdentifier) return [{ id: p.id, label: `${p.issueIdentifier} · ${p.issueTitle ?? ''}`, to: null, identifier: p.issueIdentifier, icon: <PushPin size={17} /> }];
    return [];
  }), [ws]);
  const scopeName = scope.team ? scope.team.name : 'all teams';

  const nav: Array<{ label: string; to: string; icon: ReactNode; keys: string }> = [
    { label: 'Home', to: '/home', icon: <House size={17} />, keys: 'G H' },
    { label: 'Inbox', to: '/inbox', icon: <Tray size={17} />, keys: 'G N' },
    { label: 'My issues', to: '/home/assigned', icon: <User size={17} />, keys: 'G M' },
    { label: `Issues · ${scopeName}`, to: scope.to('issues'), icon: <Rows size={17} />, keys: 'G I' },
    { label: `Intake · ${scopeName}`, to: scope.to('intake'), icon: <TrayArrowDown size={17} />, keys: 'G T' },
    { label: `Sprints · ${scopeName}`, to: scope.to('sprints'), icon: <SprintGlyph status="active" progress={0.6} size={16} />, keys: 'G S' },
    { label: `Projects · ${scopeName}`, to: scope.to('projects'), icon: <Shapes size={17} />, keys: 'G P' },
    { label: 'Goals', to: '/goals', icon: <Target size={17} />, keys: 'G O' },
    { label: `Roadmap · ${scopeName}`, to: scope.to('roadmap'), icon: <MapTrifold size={17} />, keys: 'G R' },
    { label: `Reports · ${scopeName}`, to: scope.to('reports'), icon: <ChartLineUp size={17} />, keys: 'G E' },
    { label: 'Views', to: '/views', icon: <Stack size={17} />, keys: 'G V' },
    { label: 'Settings', to: '/settings', icon: <GearSix size={17} />, keys: 'mod+,' },
  ];

  const status = issue ? ws.statusOf(issue) : undefined;
  const teamStatuses = issue?.teamId ? ws.statusesByTeam.get(issue.teamId) ?? [] : [];
  const results = page ? [] : data?.issues ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" label="Command menu" className="top-[max(20px,13vh)] w-[660px]">
        <Command
          loop
          value={selected}
          onValueChange={setSelected}
          className={group}
          onKeyDown={e => {
            if (e.key === 'Backspace' && !query && page) {
              e.preventDefault();
              setPage(null);
            }
          }}
        >
          {issue && (
            <div className="flex items-center gap-2 px-4 pt-3 text-meta text-ink-2">
              <span className="rounded-xs bg-sunken px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink ring-1 ring-inset ring-line">{issue.identifier}</span>
              <span className="truncate">{issue.title}</span>
            </div>
          )}
          <div className="flex items-center gap-3 border-b border-line px-4">
            <MagnifyingGlass size={18} className="shrink-0 text-ink-3" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              autoFocus
              placeholder={page === 'status' ? 'Move to status…' : page === 'priority' ? 'Set priority…' : page === 'assignee' ? 'Assign to…' : 'Search issues, jump anywhere, or run a command…'}
              className="h-14 w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-3"
            />
            {isFetching && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-highlight" />}
          </div>
          <Command.List className="max-h-[min(460px,58vh)] overflow-y-auto p-2">
            <Command.Empty className="py-10 text-center text-body text-ink-3">{isFetching ? 'Searching…' : 'Nothing found'}</Command.Empty>

            {page === 'status' && issue && (
              <Command.Group>
                {teamStatuses.map(s => (
                  <Row key={s.id} value={s.name} icon={<StatusGlyph status={s} siblings={teamStatuses} />} hint={s.id === issue.statusId ? <Check size={14} weight="bold" className="text-ink" /> : undefined} onSelect={() => run(() => actions.update(issue, { statusId: s.id }).catch(() => undefined))}>
                    {s.name}
                  </Row>
                ))}
              </Command.Group>
            )}
            {page === 'priority' && issue && (
              <Command.Group>
                {PRIORITIES.map(p => (
                  <Row key={p.value} value={p.label} icon={<PriorityGlyph priority={p.value} />} hint={p.value === issue.priority ? <Check size={14} weight="bold" className="text-ink" /> : p.shortcut} onSelect={() => run(() => actions.update(issue, { priority: p.value }).catch(() => undefined))}>
                    {p.label}
                  </Row>
                ))}
              </Command.Group>
            )}
            {page === 'assignee' && issue && (
              <Command.Group>
                <Row value="No assignee" icon={<Unassigned size={18} />} onSelect={() => run(() => actions.update(issue, { assigneeId: null }).catch(() => undefined))}>No assignee</Row>
                {ws.membersFor(issue.teamId).map(m => (
                  <Row key={m.id} value={m.name} keywords={[m.email ?? '']} icon={<Avatar person={m} size={20} />} hint={m.id === issue.assigneeId ? <Check size={14} weight="bold" className="text-ink" /> : m.jobTitle ?? undefined} onSelect={() => run(() => actions.update(issue, { assigneeId: m.id }).catch(() => undefined))}>
                    {m.id === ws.me.id ? `${m.name} (you)` : m.name}
                  </Row>
                ))}
              </Command.Group>
            )}

            {!page && (
              <>
                {results.length > 0 && (
                  <Command.Group heading="Issues">
                    {results.map(i => {
                      const s = i.statusId ? ws.statusById.get(i.statusId) : undefined;
                      return (
                        <Command.Item key={i.id} value={`issue ${i.identifier} ${i.title}`} onSelect={() => run(() => app.openPeek(i.identifier))} className={item}>
                          <span className="flex w-5 justify-center"><StatusGlyph status={s} siblings={s?.teamId ? ws.statusesByTeam.get(s.teamId) : undefined} /></span>
                          <span className="w-16 shrink-0 font-mono text-[11.5px] text-ink-3">{i.identifier}</span>
                          <span className="min-w-0 flex-1 truncate">{i.title}</span>
                          {i.archived && <span className="text-meta text-ink-3">Archived</span>}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}

                {issue && (
                  <Command.Group heading={`This issue · ${issue.identifier}`}>
                    <Row value="Change status" icon={<StatusGlyph status={status} siblings={teamStatuses} />} hint={<Kbd>S</Kbd>} onSelect={() => { setPage('status'); setQuery(''); }}>Change status…</Row>
                    <Row value="Set priority" icon={<PriorityGlyph priority={issue.priority} />} hint={<Kbd>P</Kbd>} onSelect={() => { setPage('priority'); setQuery(''); }}>Set priority…</Row>
                    <Row value="Assign to" icon={<User size={17} />} hint={<Kbd>A</Kbd>} onSelect={() => { setPage('assignee'); setQuery(''); }}>Assign to…</Row>
                    <Row value="Assign to me" icon={<UserCirclePlus size={17} />} hint={<Kbd>I</Kbd>} onSelect={() => run(() => actions.update(issue, { assigneeId: ws.me.id }).catch(() => undefined))}>Take it — assign to me</Row>
                    <Row value="Create sub-issue" icon={<Plus size={17} />} onSelect={() => run(() => app.openCreateIssue({ teamId: issue.teamId ?? undefined, projectId: issue.projectId, sprintId: issue.sprintId, parent: { id: issue.id, identifier: issue.identifier, title: issue.title } }))}>Add a sub-issue</Row>
                    <Row value="Copy issue ID" icon={<Copy size={17} />} hint={<Kbd keys="mod+." />} onSelect={() => run(() => copyText(issue.identifier, `Copied ${issue.identifier}`))}>Copy ID</Row>
                    <Row value="Copy link" icon={<LinkSimple size={17} />} onSelect={() => run(() => copyText(issueUrl(issue.identifier), 'Copied link'))}>Copy link</Row>
                    <Row value="Copy git branch name" icon={<GitBranch size={17} />} onSelect={() => run(() => copyText(branchName(issue.identifier, issue.title, ws.memberById.get(issue.assigneeId ?? '')?.name), 'Copied branch name'))}>Copy branch name</Row>
                  </Command.Group>
                )}

                <Command.Group heading="Create">
                  <Row value="Create new issue" icon={<Plus size={17} />} hint={<Kbd>C</Kbd>} onSelect={() => run(() => app.openCreateIssue())}>New issue</Row>
                  {ws.aiAvailable && <Row value="Draft an issue with AI" icon={<Sparkle size={17} weight="fill" className="text-violet" />} onSelect={() => run(() => app.openCreateIssue())}>Draft an issue from rough notes</Row>}
                  <Row value="Create new project" icon={<Shapes size={17} />} onSelect={() => go(`${scope.to('projects')}?new=1`)}>New project</Row>
                </Command.Group>

                {projects.length > 0 && (
                  <Command.Group heading="Projects">
                    {projects.map(p => (
                      <Row key={p.id} value={`project ${p.name}`} icon={<Mark icon={p.icon} color={p.color} name={p.name} size={18} />} hint={p.status} onSelect={() => go(`/project/${p.id}`)}>{p.name}</Row>
                    ))}
                  </Command.Group>
                )}
                {goals.length > 0 && (
                  <Command.Group heading="Goals">
                    {goals.map(g => (
                      <Row key={g.id} value={`goal ${g.name}`} icon={<Mark icon={g.icon} color={g.color} name={g.name} size={18} />} hint={g.status} onSelect={() => go(`/goal/${g.id}`)}>{g.name}</Row>
                    ))}
                  </Command.Group>
                )}
                {views.length > 0 && (
                  <Command.Group heading="Views">
                    {views.map(v => (
                      <Row key={v.id} value={`view ${v.name}`} icon={<Mark icon={v.icon} color={v.color} name={v.name} size={18} />} onSelect={() => go(`/view/${v.id}`)}>{v.name}</Row>
                    ))}
                  </Command.Group>
                )}
                {members.length > 0 && (
                  <Command.Group heading="People">
                    {members.map(m => (
                      <Row key={m.id} value={`person ${m.name}`} icon={<Avatar person={m} size={20} />} hint={m.jobTitle ?? undefined} onSelect={() => go(`/people/${m.id}`)}>{m.name}</Row>
                    ))}
                  </Command.Group>
                )}

                {pins.length > 0 && (
                  <Command.Group heading="Pinned">
                    {pins.map(p => (
                      <Row key={p.id} value={`pinned ${p.label}`} icon={p.icon} onSelect={() => (p.to ? go(p.to) : p.identifier && run(() => app.openPeek(p.identifier!)))}>{p.label}</Row>
                    ))}
                  </Command.Group>
                )}

                {q && (
                  <Command.Group heading="Teams">
                    {ws.teams.flatMap(t => {
                      const key = t.key.toLowerCase();
                      const mark = <Mark icon={t.icon} color={t.color} name={t.name} size={18} />;
                      const sprint = ws.activeSprint(t.id);
                      return [
                        <Row key={`issues-${t.id}`} value={`team ${t.name} ${t.key} issues`} icon={mark} hint={t.key} onSelect={() => go(`/${key}/issues`)}>{t.name} issues</Row>,
                        t.intakeEnabled ? <Row key={`intake-${t.id}`} value={`team ${t.name} ${t.key} intake`} icon={<TrayArrowDown size={17} />} hint={t.key} onSelect={() => go(`/${key}/intake`)}>{t.name} intake</Row> : null,
                        t.sprintsEnabled ? (
                          <Row key={`sprint-${t.id}`} value={`team ${t.name} ${t.key} current sprint`} icon={<SprintGlyph status={sprint ? 'active' : 'upcoming'} progress={0.5} size={16} />} hint={t.key} onSelect={() => go(`/${key}/sprints/current`)}>
                            {t.name} current sprint{sprint ? ` — ${sprint.name}` : ''}
                          </Row>
                        ) : null,
                      ];
                    })}
                  </Command.Group>
                )}

                <Command.Group heading="Jump to">
                  {nav.map(n => (
                    <Row key={n.label} value={`go ${n.label}`} icon={n.icon} hint={<Kbd keys={n.keys} />} onSelect={() => go(n.to)}>{n.label}</Row>
                  ))}
                </Command.Group>

                <Command.Group heading="Team scope">
                  <Row value="Switch to all teams" icon={<SquaresFour size={17} weight="bold" />} hint={scope.key === 'all' ? <Check size={14} weight="bold" className="text-ink" /> : undefined} onSelect={() => run(() => switchScope('all'))}>Show all teams</Row>
                  {ws.teams.map(t => (
                    <Row key={t.id} value={`switch team ${t.name} ${t.key}`} icon={<Mark icon={t.icon} color={t.color} name={t.name} size={18} />} hint={scope.team?.id === t.id ? <Check size={14} weight="bold" className="text-ink" /> : t.key} onSelect={() => run(() => switchScope(t.key.toLowerCase()))}>
                      Show {t.name}
                    </Row>
                  ))}
                </Command.Group>

                <Command.Group heading="Preferences">
                  <Row value="Light theme" icon={<Sun size={17} />} hint={pref === 'light' ? <Check size={14} weight="bold" className="text-ink" /> : undefined} onSelect={() => run(() => setPref('light'))}>Light theme</Row>
                  <Row value="Dark theme" icon={<Moon size={17} />} hint={pref === 'dark' ? <Check size={14} weight="bold" className="text-ink" /> : undefined} onSelect={() => run(() => setPref('dark'))}>Dark theme</Row>
                  <Row value="System theme" icon={<Monitor size={17} />} hint={pref === 'system' ? <Check size={14} weight="bold" className="text-ink" /> : undefined} onSelect={() => run(() => setPref('system'))}>Match system theme</Row>
                  <Row value="Keyboard shortcuts" icon={<Keyboard size={17} />} hint={<Kbd>?</Kbd>} onSelect={() => run(() => app.openShortcuts())}>Keyboard shortcuts</Row>
                </Command.Group>
              </>
            )}
          </Command.List>
          <div className="flex items-center gap-4 border-t border-line bg-paper/70 px-4 py-2 text-meta text-ink-3">
            <span className="flex items-center gap-1.5"><Kbd keys="up" /><Kbd keys="down" /> move</span>
            <span className="flex items-center gap-1.5"><Kbd keys="enter" /> open</span>
            {page && <span className="flex items-center gap-1.5"><Kbd keys="backspace" /> back</span>}
            <span className="ml-auto flex items-center gap-1.5"><Kanban size={13} /> Issue Tracker</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export { ArrowRight };
