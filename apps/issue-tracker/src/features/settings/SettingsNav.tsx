import { CaretUpDown, Files, SquaresFour, Tag, UserCircle, UsersThree, type Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Mark } from '../../glyphs';
import { useWorkspace } from '../../lib/workspace';
import { cn } from '../../ui/cn';
import { Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '../../ui/Menu';

export const SECTIONS = {
  general: { label: 'General', icon: UserCircle },
  members: { label: 'Members', icon: UsersThree },
  teams: { label: 'Teams', icon: SquaresFour },
  labels: { label: 'Labels', icon: Tag },
  templates: { label: 'Templates', icon: Files },
} as const satisfies Record<string, { label: string; icon: Icon }>;
export type SectionKey = keyof typeof SECTIONS;

const WORKSPACE_SECTIONS: SectionKey[] = ['members', 'teams', 'labels', 'templates'];

function useCounts(): Partial<Record<SectionKey, number>> {
  const ws = useWorkspace();
  return { members: ws.members.length, teams: ws.teams.length, labels: ws.labels.length, templates: ws.templates.length };
}

function Item({ to, icon, label, count, active }: { to: string; icon: ReactNode; label: string; count?: number; active: boolean }) {
  return (
    <NavLink
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-ui transition-[background-color,color,box-shadow] duration-100',
        active ? 'bg-card font-medium text-ink shadow-hairline ring-1 ring-line' : 'text-ink-2 hover:bg-hover/70 hover:text-ink',
      )}
    >
      <span className={cn('flex w-4 shrink-0 items-center justify-center', active ? 'text-ink' : 'text-ink-3 group-hover:text-ink-2')}>{icon}</span>
      <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
      {count != null && <span className="tabular text-meta text-ink-3">{count}</span>}
    </NavLink>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-1.5 px-2.5 text-micro font-semibold uppercase text-ink-3">{label}</div>
      <div className="flex flex-col gap-px">{children}</div>
    </div>
  );
}

/** The plain list down the left of settings, on the paper — not a boxed sidebar. */
export function SettingsNav({ current }: { current: string }) {
  const ws = useWorkspace();
  const counts = useCounts();
  const item = (key: SectionKey) => {
    const S = SECTIONS[key].icon;
    const to = `/settings/${key}`;
    return <Item key={key} to={to} icon={<S size={16} weight={current === to ? 'fill' : 'regular'} />} label={SECTIONS[key].label} count={counts[key]} active={current === to} />;
  };
  return (
    <nav aria-label="Settings" className="hidden lg:block">
      <div className="sticky top-5">
        <Group label="Account">{item('general')}</Group>
        <Group label="Workspace">{WORKSPACE_SECTIONS.map(item)}</Group>
        {ws.teams.length > 0 && (
          <Group label="Teams">
            {ws.teams.map(t => {
              const to = `/settings/teams/${t.id}`;
              return <Item key={t.id} to={to} icon={<Mark icon={t.icon} color={t.color} name={t.name} size={18} />} label={t.name} active={current === to} />;
            })}
          </Group>
        )}
      </div>
    </nav>
  );
}

/** Below lg the column would squeeze the content, so the same list becomes a grouped select. */
export function SettingsNavSelect({ current }: { current: string }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const counts = useCounts();
  const team = ws.teams.find(t => current === `/settings/teams/${t.id}`);
  const key = (Object.keys(SECTIONS) as SectionKey[]).find(k => current === `/settings/${k}`);
  const CurrentIcon = key ? SECTIONS[key].icon : null;
  const option = (k: SectionKey) => {
    const S = SECTIONS[k].icon;
    return (
      <MenuRadioItem key={k} value={`/settings/${k}`} icon={<S size={15} />} hint={counts[k]}>
        {SECTIONS[k].label}
      </MenuRadioItem>
    );
  };
  return (
    <div className="lg:hidden">
      <Menu modal={false}>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label="Settings section"
            className="flex h-10 w-full items-center gap-2.5 rounded-md border border-line-strong bg-card px-3 text-body text-ink shadow-hairline transition-colors hover:bg-hover data-[state=open]:bg-hover"
          >
            {team ? <Mark icon={team.icon} color={team.color} name={team.name} size={20} /> : CurrentIcon ? <CurrentIcon size={17} weight="fill" /> : null}
            <span className="min-w-0 flex-1 truncate text-left font-medium">{team ? team.name : key ? SECTIONS[key].label : 'Settings'}</span>
            {team && <span className="text-meta text-ink-3">Team</span>}
            <CaretUpDown size={14} className="shrink-0 text-ink-3" />
          </button>
        </MenuTrigger>
        <MenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-[70vh] overflow-y-auto">
          <MenuRadioGroup value={current} onValueChange={v => navigate(v)}>
            <MenuLabel>Account</MenuLabel>
            {option('general')}
            <MenuSeparator />
            <MenuLabel>Workspace</MenuLabel>
            {WORKSPACE_SECTIONS.map(option)}
            {ws.teams.length > 0 && (
              <>
                <MenuSeparator />
                <MenuLabel>Teams</MenuLabel>
                {ws.teams.map(t => (
                  <MenuRadioItem key={t.id} value={`/settings/teams/${t.id}`} icon={<Mark icon={t.icon} color={t.color} name={t.name} size={16} />} hint={t.key}>
                    {t.name}
                  </MenuRadioItem>
                ))}
              </>
            )}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
    </div>
  );
}
