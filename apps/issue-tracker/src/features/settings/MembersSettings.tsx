import { CaretDown, DotsThree, MagnifyingGlass, PencilSimple, UserCheck, UserCircle, UserMinus, UserPlus, UsersThree } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { saveMember } from 'zitejs/api';
import { Mark } from '../../glyphs';
import { useAppActions } from '../../lib/app-actions';
import { plural } from '../../lib/format';
import type { Bootstrap, Member } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { OptionPicker, type Option } from '../../pickers/OptionPicker';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '../../ui/Dialog';
import { Field, Input, SearchField, Segmented } from '../../ui/Form';
import { Card, EmptyState } from '../../ui/Layout';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui/Menu';
import { Tooltip } from '../../ui/Tooltip';
import { LedgerHead, Locked, MemberStatusBadge, SectionHeader, YouChip, memberStatusOf, useSettingsLock, useSettingsMutation, type MemberStatus } from './kit';

type Role = 'Admin' | 'Member' | 'Guest';
const ROLES: Role[] = ['Admin', 'Member', 'Guest'];
const roleOf = (m: { role?: string | null }): Role => ((ROLES as string[]).includes(m.role ?? '') ? (m.role as Role) : 'Member');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_ABOUT: Record<Role, string> = {
  Admin: 'Can change everything, including who’s in the workspace and their roles.',
  Member: 'Can shape teams, statuses, labels and templates — everything except managing members.',
  Guest: 'Can work on issues and see how the workspace is set up, but can’t change settings.',
};

const ROLE_OPTIONS: Option<string>[] = [
  { value: 'Admin', label: 'Admin', hint: 'Everything' },
  { value: 'Member', label: 'Member', hint: 'All but members' },
  { value: 'Guest', label: 'Guest', hint: 'No settings' },
];

/** Admins who can act right now — an invited admin hasn't signed in yet, so they can't manage anyone. */
const isActingAdmin = (m: Member) => roleOf(m) === 'Admin' && memberStatusOf(m) === 'Active';

/** The one person who could still manage members. Demoting or deactivating them would lock everyone out. */
function useLastAdmin() {
  const ws = useWorkspace();
  const admins = ws.members.filter(isActingAdmin);
  return (m: Member) => admins.length <= 1 && admins[0]?.id === m.id;
}

const patchMember = (id: string, patch: Partial<Member>) => (data: Bootstrap): Bootstrap => ({
  ...data,
  members: data.members.map(m => (m.id === id ? { ...m, ...patch } : m)),
});

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

/** The teams a person belongs to, as a picker whose trigger reads like a field. */
function TeamsField({ value, onChange, id }: { value: string[]; onChange: (ids: string[]) => void; id?: string }) {
  const ws = useWorkspace();
  const options: Option<string>[] = ws.teams.map(t => ({ value: t.id, label: t.name, icon: <Mark icon={t.icon} color={t.color} name={t.name} size={16} />, hint: t.key }));
  const chosen = value.map(v => ws.teamById.get(v)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  return (
    <OptionPicker
      multiple
      value={value}
      onChange={onChange}
      options={options}
      placeholder="Add to teams…"
      width={280}
      trigger={
        <button
          id={id}
          type="button"
          className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-control/60 bg-card px-1.5 py-1 text-left text-body shadow-hairline transition-[border-color,box-shadow] hover:border-control data-[state=open]:border-ink/60 data-[state=open]:ring-[3px] data-[state=open]:ring-highlight/45"
        >
          {chosen.length === 0 ? (
            <span className="px-1 text-ink-3">No teams</span>
          ) : (
            chosen.map(t => (
              <span key={t.id} className="inline-flex h-6 items-center gap-1.5 rounded-xs bg-sunken px-1.5 text-ui text-ink ring-1 ring-inset ring-line">
                <Mark icon={t.icon} color={t.color} name={t.name} size={14} />
                {t.name}
              </span>
            ))
          )}
          <CaretDown size={12} weight="bold" className="ml-auto mr-1 shrink-0 text-ink-3" />
        </button>
      }
    />
  );
}

function MemberForm({ member, onDone }: { member: Member | null; onDone: () => void }) {
  const ws = useWorkspace();
  const run = useSettingsMutation();
  const editing = Boolean(member);
  const [name, setName] = useState(member?.name ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [jobTitle, setJobTitle] = useState(member?.jobTitle ?? '');
  const [role, setRole] = useState<Role>(member ? roleOf(member) : 'Member');
  const [teamIds, setTeamIds] = useState<string[]>(member?.teamIds ?? []);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const isLastAdmin = useLastAdmin();
  const lastAdmin = Boolean(member && isLastAdmin(member));
  const roleError = lastAdmin && role !== 'Admin' ? `${member?.id === ws.me.id ? 'You’re' : `${member?.name} is`} the only admin. Make someone else an admin first — a workspace always needs one.` : null;
  const emailTaken = !editing && ws.members.some(m => (m.email ?? '').toLowerCase() === email.trim().toLowerCase());
  const nameError = !name.trim() ? 'Enter a name' : null;
  const emailError = editing ? null : !EMAIL.test(email.trim()) ? 'Enter a valid email address' : emailTaken ? 'Someone with that email is already a member' : null;
  const valid = !nameError && !emailError && !roleError;

  const submit = async () => {
    setTouched(true);
    if (!valid || saving) return;
    setSaving(true);
    const res = member
      ? await run(() => saveMember({ id: member.id, name: name.trim(), jobTitle: jobTitle.trim() || null, role, teamIds }), {
          success: `Saved ${name.trim()}`,
          error: 'Couldn’t save this member',
        })
      : await run(() => saveMember({ name: name.trim(), email: email.trim(), jobTitle: jobTitle.trim() || null, role, teamIds }), {
          success: `Invited ${name.trim()}`,
          error: 'Couldn’t invite this member',
        });
    setSaving(false);
    if (res) onDone();
  };

  return (
    <>
      <DialogHeader
        title={member ? `Edit ${member.name}` : 'Invite member'}
        description={
          member
            ? 'Change their details, role and the teams they work in.'
            : 'They can be assigned and mentioned straight away, and show as Invited until they first sign in.'
        }
      />
      <DialogBody className="pb-5">
        <form
          id="member-form"
          className="flex flex-col gap-4"
          onSubmit={e => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="member-name" error={touched ? nameError : null}>
              <Input id="member-name" autoFocus value={name} maxLength={120} onChange={e => setName(e.target.value)} placeholder="Ada Lovelace" invalid={touched && Boolean(nameError)} className="h-9 text-body" />
            </Field>
            <Field label="Job title" htmlFor="member-title">
              <Input id="member-title" value={jobTitle} maxLength={120} onChange={e => setJobTitle(e.target.value)} placeholder="Optional" className="h-9 text-body" />
            </Field>
          </div>
          <Field
            label="Email"
            htmlFor="member-email"
            error={touched || emailTaken ? emailError : null}
            hint={editing ? 'An email is how someone signs in, so it stays fixed.' : 'They join this workspace when they sign in with it.'}
          >
            <Input
              id="member-email"
              type="email"
              value={email}
              disabled={editing}
              maxLength={200}
              onChange={e => setEmail(e.target.value)}
              placeholder="ada@company.com"
              invalid={(touched || emailTaken) && Boolean(emailError)}
              className="h-9 text-body"
            />
          </Field>
          <Field label="Role" hint={roleError ? undefined : ROLE_ABOUT[role]} error={roleError}>
            <Segmented value={role} onChange={v => setRole(v as Role)} options={ROLES.map(r => ({ value: r, label: r }))} className="self-start [&>button]:h-7 [&>button]:px-3 [&>button]:text-ui" />
          </Field>
          <Field label="Teams" htmlFor="member-teams" hint="Their teams are offered first when assigning, and set what they see by default.">
            <TeamsField id="member-teams" value={teamIds} onChange={setTeamIds} />
          </Field>
        </form>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" form="member-form" variant="primary" loading={saving} disabled={Boolean(roleError) || (touched && !valid)}>
          {member ? 'Save changes' : 'Invite'}
        </Button>
      </DialogFooter>
    </>
  );
}

function MemberDialog({ open, onOpenChange, member }: { open: boolean; onOpenChange: (open: boolean) => void; member: Member | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <MemberForm key={member?.id ?? 'new'} member={member} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function TeamChips({ member }: { member: Member }) {
  const ws = useWorkspace();
  const teams = member.teamIds.map(id => ws.teamById.get(id)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  if (!teams.length) return <span className="text-ui text-ink-3">—</span>;
  const shown = teams.slice(0, 2);
  return (
    <div className="flex min-w-0 items-center gap-1">
      {shown.map(t => (
        <Tooltip key={t.id} content={t.name}>
          <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-xs bg-sunken pl-1 pr-1.5 ring-1 ring-inset ring-line">
            <Mark icon={t.icon} color={t.color} name={t.name} size={16} />
            <span className="font-mono text-[11px] font-medium text-ink-2">{t.key}</span>
          </span>
        </Tooltip>
      ))}
      {teams.length > shown.length && (
        <Tooltip content={teams.slice(2).map(t => t.name).join(', ')}>
          <span className="tabular shrink-0 rounded-full px-1 text-meta font-medium text-ink-3">+{teams.length - shown.length}</span>
        </Tooltip>
      )}
    </div>
  );
}

function RolePicker({ member, onChange, lastAdmin }: { member: Member; onChange: (role: Role) => void; lastAdmin: boolean }) {
  const role = roleOf(member);
  return (
    <OptionPicker
      value={role}
      onChange={v => onChange(v as Role)}
      options={lastAdmin ? ROLE_OPTIONS.map(o => (o.value === 'Admin' ? o : { ...o, disabled: true })) : ROLE_OPTIONS}
      placeholder="Change role…"
      width={256}
      align="start"
      footer={
        lastAdmin ? (
          <p className="px-2 py-1.5 text-meta text-ink-3 text-pretty">
            {member.name.split(' ')[0]} is the only admin. Make someone else an admin before changing this role.
          </p>
        ) : undefined
      }
      trigger={
        <button
          type="button"
          aria-label={`Role for ${member.name}`}
          className="group/role inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-ui text-ink transition-colors hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent data-[state=open]:bg-pressed"
        >
          {role}
          <CaretDown size={11} weight="bold" className="text-ink-3 group-disabled/role:hidden" />
        </button>
      }
    />
  );
}

const GRID = 'grid items-center gap-x-3 grid-cols-[minmax(0,1fr)_auto_32px] md:grid-cols-[minmax(0,1.55fr)_minmax(0,0.9fr)_minmax(0,1fr)_104px_112px_32px]';

type Filter = 'all' | MemberStatus;

export function MembersSettings() {
  const ws = useWorkspace();
  const app = useAppActions();
  const run = useSettingsMutation();
  const navigate = useNavigate();
  const isLastAdmin = useLastAdmin();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const lock = useSettingsLock();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<{ open: boolean; member: Member | null }>({ open: false, member: null });
  // `?invite=1` (the account menu's "Invite people") opens the dialog once — also when already on this page —
  // then leaves the URL so a refresh doesn't reopen it. Non-admins just land on the list and its notice.
  const inviteRequested = params.get('invite') === '1';
  useEffect(() => {
    if (!params.has('invite')) return;
    if (inviteRequested && !lock) setDialog({ open: true, member: null });
    const next = new URLSearchParams(params);
    next.delete('invite');
    setParams(next, { replace: true });
  }, [params, setParams, inviteRequested, lock]);

  const counts = useMemo(() => {
    const c: Record<MemberStatus, number> = { Active: 0, Invited: 0, Deactivated: 0 };
    for (const m of ws.members) c[memberStatusOf(m)] += 1;
    return c;
  }, [ws.members]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ws.members
      .filter(m => filter === 'all' || memberStatusOf(m) === filter)
      .filter(m => !q || [m.name, m.email, m.jobTitle].some(v => (v ?? '').toLowerCase().includes(q)))
      .sort((a, b) => Number(memberStatusOf(a) === 'Deactivated') - Number(memberStatusOf(b) === 'Deactivated') || a.name.localeCompare(b.name));
  }, [ws.members, filter, query]);

  const changeRole = async (m: Member, role: Role) => {
    const from = roleOf(m);
    if (role === from) return;
    const isMe = m.id === ws.me.id;
    // Stepping down locks this page for you straight away, and only another admin can undo it.
    if (isMe && from === 'Admin') {
      const ok = await app.confirm({
        title: 'Step down as admin?',
        description: `You’ll become ${role === 'Guest' ? 'a guest' : 'a member'} and can no longer invite people, change roles or deactivate anyone. Only another admin can make you an admin again.`,
        confirmLabel: 'Step down',
        destructive: true,
      });
      if (!ok) return;
    }
    run(() => saveMember({ id: m.id, role }), {
      optimistic: patchMember(m.id, { role }),
      success: `${isMe ? 'You’re' : `${m.name} is`} now ${role === 'Admin' ? 'an admin' : `a ${role.toLowerCase()}`}`,
      error: 'Couldn’t change the role',
      // An admin who stepped down can't put it back.
      undo: isMe && from === 'Admin' ? undefined : () => saveMember({ id: m.id, role: from }),
    });
  };

  const setStatus = async (m: Member, status: MemberStatus) => {
    const from = memberStatusOf(m);
    if (status === 'Deactivated') {
      const ok = await app.confirm({
        title: `Deactivate ${m.name}?`,
        description: 'They’ll lose access and disappear from pickers. Their issues, comments and history stay exactly as they are, and you can reactivate them any time.',
        confirmLabel: 'Deactivate',
        destructive: true,
      });
      if (!ok) return;
    } else if (from === 'Deactivated') {
      const ok = await app.confirm({
        title: `Reactivate ${m.name}?`,
        description: 'They’ll be able to sign in again, and can be assigned and mentioned.',
        confirmLabel: 'Reactivate',
      });
      if (!ok) return;
    }
    run(() => saveMember({ id: m.id, status }), {
      optimistic: patchMember(m.id, { status }),
      success: status === 'Deactivated' ? `Deactivated ${m.name}` : from === 'Invited' ? `${m.name} is now active` : `Reactivated ${m.name}`,
      error: status === 'Deactivated' ? 'Couldn’t deactivate this member' : 'Couldn’t reactivate this member',
      // Deactivating moves the row to the bottom of the list, so the way back sits on the toast.
      undo: status === 'Deactivated' ? () => saveMember({ id: m.id, status: from }) : undefined,
    });
  };

  const count = (n: number) => <span className="tabular text-ink-3">{n}</span>;
  const filtered = Boolean(query.trim()) || filter !== 'all';

  return (
    <>
      <SectionHeader title="Members" description="Everyone in the workspace, their role and the teams they work in. Deactivating someone keeps their history." />

      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="-mx-1 overflow-x-auto px-1 no-scrollbar">
          <Segmented
            value={filter}
            onChange={v => setFilter(v as Filter)}
            options={[
              { value: 'all', label: <>All {count(ws.members.length)}</> },
              { value: 'Active', label: <>Active {count(counts.Active)}</> },
              { value: 'Invited', label: <>Invited {count(counts.Invited)}</> },
              { value: 'Deactivated', label: <>Deactivated {count(counts.Deactivated)}</> },
            ]}
            className="[&>button]:h-7 [&>button]:px-2.5 [&>button]:text-ui"
          />
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          <SearchField value={query} onChange={setQuery} placeholder="Search name, email or title" className="min-w-0 flex-1 md:w-64 md:flex-none" />
          <Locked>
            <Button variant="primary" leading={<UserPlus size={15} weight="bold" />} onClick={() => setDialog({ open: true, member: null })}>
              Invite member
            </Button>
          </Locked>
        </div>
      </div>

      <Card className="overflow-hidden">
        <LedgerHead className={cn(GRID, 'hidden md:grid')}>
          <span>Name</span>
          <span>Job title</span>
          <span>Teams</span>
          <span className="pl-2">Role</span>
          <span>Status</span>
          <span />
        </LedgerHead>
        {rows.length === 0 ? (
          <EmptyState
            compact
            icon={query ? <MagnifyingGlass size={22} weight="duotone" /> : <UsersThree size={22} weight="duotone" />}
            title={query ? 'No one matches' : filter === 'Invited' ? 'No pending invites' : filter === 'Deactivated' ? 'No one is deactivated' : 'No members yet'}
          >
            {query ? 'Try part of a name, an email address or a job title.' : filter === 'Invited' ? 'People you invite show here until they first sign in.' : undefined}
          </EmptyState>
        ) : (
          <Locked>
            <ul className="divide-y divide-line">
              {rows.map(m => {
                const isMe = m.id === ws.me.id;
                const status = memberStatusOf(m);
                const off = status === 'Deactivated';
                return (
                  <li key={m.id} className={cn(GRID, 'group min-h-[56px] px-4 py-2 transition-colors hover:bg-hover/40')}>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar person={m} size={30} className={cn(off && 'grayscale')} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <Link to={`/people/${m.id}`} className={cn('truncate text-ui font-semibold hover:underline hover:decoration-line-strong hover:underline-offset-2', off ? 'text-ink-2' : 'text-ink')}>
                            {m.name}
                          </Link>
                          {isMe && <YouChip />}
                          {status !== 'Active' && (
                            <span className="shrink-0 md:hidden">
                              <MemberStatusBadge status={status} />
                            </span>
                          )}
                        </div>
                        <div className="truncate text-meta text-ink-3">
                          <span className={cn(m.jobTitle && 'hidden md:inline')}>{m.email}</span>
                          {m.jobTitle && <span className="md:hidden">{m.jobTitle}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="hidden truncate text-ui text-ink-2 md:block">{m.jobTitle || <span className="text-ink-3">—</span>}</div>
                    <div className="hidden min-w-0 md:block">
                      <TeamChips member={m} />
                    </div>
                    <div className="min-w-0">
                      <RolePicker member={m} lastAdmin={isLastAdmin(m)} onChange={role => changeRole(m, role)} />
                    </div>
                    <div className="hidden md:block">
                      <MemberStatusBadge status={status} />
                    </div>
                    <Menu modal={false}>
                      <MenuTrigger asChild>
                        <Button variant="ghost" size="sm" icon aria-label={`Actions for ${m.name}`} className="data-[state=open]:bg-pressed">
                          <DotsThree size={16} weight="bold" />
                        </Button>
                      </MenuTrigger>
                      <MenuContent align="end" className="w-56">
                        <MenuItem icon={<PencilSimple size={15} />} onSelect={() => setDialog({ open: true, member: m })}>
                          Edit member…
                        </MenuItem>
                        <MenuItem icon={<UserCircle size={15} />} onSelect={() => navigate(`/people/${m.id}`)}>
                          View profile
                        </MenuItem>
                        <MenuSeparator />
                        {status === 'Invited' && (
                          <MenuItem icon={<UserCheck size={15} />} onSelect={() => setStatus(m, 'Active')}>
                            Mark as active
                          </MenuItem>
                        )}
                        {off ? (
                          <MenuItem icon={<UserCheck size={15} />} onSelect={() => setStatus(m, 'Active')}>
                            Reactivate…
                          </MenuItem>
                        ) : (
                          <MenuItem
                            icon={<UserMinus size={15} />}
                            destructive={!isMe && !isLastAdmin(m)}
                            disabled={isMe || isLastAdmin(m)}
                            hint={isMe ? 'That’s you' : isLastAdmin(m) ? 'Only admin' : undefined}
                            onSelect={() => setStatus(m, 'Deactivated')}
                          >
                            Deactivate…
                          </MenuItem>
                        )}
                      </MenuContent>
                    </Menu>
                  </li>
                );
              })}
            </ul>
          </Locked>
        )}
      </Card>
      {rows.length > 0 && filtered && <p className="mt-2.5 px-1 text-meta text-ink-3">Showing {plural(rows.length, 'member')} of {ws.members.length}</p>}

      <MemberDialog open={dialog.open} onOpenChange={open => setDialog(d => ({ ...d, open }))} member={dialog.member} />
    </>
  );
}
