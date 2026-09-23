import {
  CaretUpDown, Check, GearSix, Keyboard, List, MagnifyingGlass, Monitor, Moon, Plus, SquaresFour, Sun, User, UserPlus, UsersThree,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Logo, Mark } from '../glyphs';
import { useAppActions } from '../lib/app-actions';
import { useScope, useSwitchScope } from '../lib/scope';
import { useTheme } from '../lib/theme';
import { useWorkspace } from '../lib/workspace';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Count } from '../ui/Chip';
import { cn } from '../ui/cn';
import { Kbd } from '../ui/Kbd';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';

type NavEntry = { label: string; to: string; match: (path: string) => boolean; count?: number; shortcut: string };

function useNav(): NavEntry[] {
  const ws = useWorkspace();
  const scope = useScope();
  const intake = scope.team ? ws.counts.intakeByTeam[scope.team.id] ?? 0 : Object.values(ws.counts.intakeByTeam).reduce((a, b) => a + b, 0);
  const scoped = (section: string) => (p: string) => new RegExp(`^/[^/]+/${section}(/|$)`).test(p);
  return [
    { label: 'Home', to: '/home', match: p => p.startsWith('/home') || p.startsWith('/people'), shortcut: 'G H' },
    { label: 'Inbox', to: '/inbox', match: p => p.startsWith('/inbox'), count: ws.counts.inboxUnread, shortcut: 'G N' },
    { label: 'Issues', to: scope.to('issues'), match: p => scoped('issues')(p) || scoped('intake')(p) || p.startsWith('/issue/') || p.startsWith('/view') || p.startsWith('/list'), count: intake || undefined, shortcut: 'G I' },
    { label: 'Sprints', to: scope.to('sprints'), match: p => scoped('sprints')(p) || p.startsWith('/sprint/'), shortcut: 'G S' },
    { label: 'Projects', to: scope.to('projects'), match: p => scoped('projects')(p) || p.startsWith('/project/'), shortcut: 'G P' },
    { label: 'Goals', to: '/goals', match: p => p.startsWith('/goal'), shortcut: 'G O' },
    { label: 'Roadmap', to: scope.to('roadmap'), match: scoped('roadmap'), shortcut: 'G R' },
    { label: 'Reports', to: scope.to('reports'), match: scoped('reports'), shortcut: 'G E' },
  ];
}

function ScopeSwitcher({ compact }: { compact?: boolean }) {
  const ws = useWorkspace();
  const scope = useScope();
  const switchScope = useSwitchScope();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="group flex h-8 min-w-0 items-center gap-2 rounded-full border border-line-strong bg-card pl-1 pr-2.5 text-ui font-medium text-ink shadow-hairline transition-colors hover:bg-hover data-[state=open]:bg-hover"
          aria-label="Switch team scope"
        >
          {scope.team ? (
            <Mark icon={scope.team.icon} color={scope.team.color} name={scope.team.name} size={24} className="rounded-full" />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sunken text-ink-2">
              <SquaresFour size={14} weight="bold" />
            </span>
          )}
          <span className={cn('truncate', compact && 'hidden sm:inline')}>{scope.team ? scope.team.name : 'All teams'}</span>
          <CaretUpDown size={12} className="shrink-0 text-ink-3" />
        </button>
      </MenuTrigger>
      <MenuContent className="w-64">
        <MenuLabel>Showing work for</MenuLabel>
        <MenuItem icon={<SquaresFour size={15} weight="bold" />} onSelect={() => switchScope('all')} hint={scope.key === 'all' ? <Check size={13} weight="bold" className="text-ink" /> : undefined}>
          All teams
        </MenuItem>
        <MenuSeparator />
        {ws.teams.map((t, i) => (
          <MenuItem
            key={t.id}
            icon={<Mark icon={t.icon} color={t.color} name={t.name} size={18} />}
            onSelect={() => switchScope(t.key.toLowerCase())}
            hint={scope.team?.id === t.id ? <Check size={13} weight="bold" className="text-ink" /> : <span className="font-mono text-[11px]">{t.key}</span>}
          >
            {t.name}
          </MenuItem>
        ))}
        <MenuSeparator />
        <ManageTeamsItem />
        <div className="px-2 pb-1 pt-1.5 text-meta text-ink-3">
          <Kbd>[</Kbd> <Kbd>]</Kbd> cycle through teams
        </div>
      </MenuContent>
    </Menu>
  );
}

function ManageTeamsItem() {
  const navigate = useNavigate();
  return (
    <MenuItem icon={<UsersThree size={15} />} onSelect={() => navigate('/settings/teams')}>
      Manage teams
    </MenuItem>
  );
}

function AccountMenu() {
  const ws = useWorkspace();
  const app = useAppActions();
  const navigate = useNavigate();
  const { pref, setPref } = useTheme();
  const me = ws.memberById.get(ws.me.id) ?? ws.me;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" aria-label="Account" className="rounded-full outline-offset-2 transition-opacity hover:opacity-85">
          <Avatar person={me} size={30} />
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="w-64">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar person={me} size={32} />
          <div className="min-w-0">
            <div className="truncate text-ui font-semibold">{ws.me.name}</div>
            <div className="truncate text-meta text-ink-3">{ws.me.email}</div>
          </div>
        </div>
        <MenuSeparator />
        <MenuItem icon={<User size={15} />} onSelect={() => navigate(`/people/${ws.me.id}`)}>Your profile</MenuItem>
        <MenuItem icon={<UserPlus size={15} />} onSelect={() => navigate('/settings/members?invite=1')}>Invite people</MenuItem>
        <MenuItem icon={<GearSix size={15} />} shortcut="mod+," onSelect={() => navigate('/settings')}>Settings</MenuItem>
        <MenuItem icon={<Keyboard size={15} />} shortcut="?" onSelect={() => app.openShortcuts()}>Keyboard shortcuts</MenuItem>
        <MenuSeparator />
        <MenuLabel>Theme</MenuLabel>
        <MenuRadioGroup value={pref} onValueChange={v => setPref(v as never)}>
          <MenuRadioItem value="light" icon={<Sun size={15} />}>Light</MenuRadioItem>
          <MenuRadioItem value="dark" icon={<Moon size={15} />}>Dark</MenuRadioItem>
          <MenuRadioItem value="system" icon={<Monitor size={15} />}>Match system</MenuRadioItem>
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

function MobileNav({ nav }: { nav: NavEntry[] }) {
  const location = useLocation();
  const current = nav.find(n => n.match(location.pathname));
  const navigate = useNavigate();
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="sm" leading={<List size={16} />} className="px-2 text-ink">
          <span className="hidden sm:inline">{current?.label ?? 'Menu'}</span>
        </Button>
      </MenuTrigger>
      <MenuContent className="w-56">
        {nav.map(n => (
          <MenuItem key={n.label} onSelect={() => navigate(n.to)} hint={n.count ? <Count>{n.count}</Count> : undefined} className={cn(n === current && 'font-semibold')}>
            {n.label}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => navigate('/views')}>Views</MenuItem>
        <MenuItem onSelect={() => navigate('/settings')}>Settings</MenuItem>
      </MenuContent>
    </Menu>
  );
}

/**
 * Issue Tracker's navigation is a single top bar, not a sidebar: the logo, the team
 * scope, eight sections, then search, create and you. Content gets the full
 * width, which is what tables, boards and a roadmap want.
 */
export function TopBar() {
  const app = useAppActions();
  const nav = useNav();
  const location = useLocation();
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-paper px-3 sm:gap-3 sm:px-5">
      <Link to="/home" className="flex shrink-0 items-center gap-2 rounded-md pr-1" aria-label="Issue Tracker home">
        <Logo size={26} />
        <span className="hidden whitespace-nowrap font-display text-[19px] leading-none tracking-[-0.01em] text-ink md:inline lg:hidden xl:inline">Issue Tracker</span>
      </Link>
      <span className="hidden h-5 w-px bg-line-strong md:block lg:hidden xl:block" />
      <ScopeSwitcher compact />

      <nav className="ml-1 hidden items-center gap-0.5 lg:flex" aria-label="Sections">
        {nav.map(n => {
          const active = n.match(location.pathname);
          return (
            <Tooltip key={n.label} content={n.label} shortcut={n.shortcut} delay={900}>
              <NavLink
                to={n.to}
                onMouseEnter={() => setHoverKey(n.label)}
                onMouseLeave={() => setHoverKey(null)}
                className={cn(
                  'relative flex h-8 items-center gap-1.5 rounded-md px-2.5 text-ui font-medium transition-colors',
                  active ? 'text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink',
                )}
              >
                <span className={cn(active && 'hl')}>{n.label}</span>
                {n.label === 'Issues' && n.count ? (
                  <span className="-ml-0.5 -mt-3 h-1.5 w-1.5 rounded-full bg-signal" aria-label={`${n.count} waiting in intake`} />
                ) : n.count ? (
                  <Count tone={n.label === 'Inbox' ? 'signal' : 'neutral'} className={cn(hoverKey === n.label && n.label !== 'Inbox' && 'bg-card')}>
                    {n.count}
                  </Count>
                ) : null}
              </NavLink>
            </Tooltip>
          );
        })}
      </nav>
      <div className="lg:hidden">
        <MobileNav nav={nav} />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => app.openPalette()}
          className="hidden h-8 w-[220px] items-center gap-2 rounded-md border border-line-strong bg-card px-2.5 text-ui text-ink-3 shadow-hairline transition-colors hover:border-control hover:text-ink-2 2xl:flex"
        >
          <MagnifyingGlass size={14} />
          <span className="flex-1 text-left">Search or jump to…</span>
          <Kbd keys="mod+k" />
        </button>
        <Tooltip content="Search or jump to" shortcut="mod+k">
          <Button variant="ghost" size="md" icon aria-label="Search" onClick={() => app.openPalette()} className="2xl:hidden">
            <MagnifyingGlass size={17} />
          </Button>
        </Tooltip>
        <Button variant="primary" size="md" leading={<Plus size={14} weight="bold" />} onClick={() => app.openCreateIssue()} aria-label="New issue" className="max-sm:w-8 max-sm:px-0 lg:max-xl:w-8 lg:max-xl:px-0">
          <span className="hidden sm:inline lg:hidden xl:inline">New issue</span>
          <Kbd tone="inverse" className="hidden xl:inline-flex">C</Kbd>
        </Button>
        <AccountMenu />
      </div>
    </header>
  );
}
