import { ArrowLeft, ArrowUpRight, UserPlus, UsersThree, X } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { saveTeam } from 'zitejs/api';
import { Mark } from '../../glyphs';
import { errorMessage } from '../../lib/errors';
import { plural } from '../../lib/format';
import { qk } from '../../lib/queries';
import type { Team } from '../../lib/types';
import { useContextTeam } from '../../lib/useContextTeam';
import { useWorkspace } from '../../lib/workspace';
import { MemberMultiPicker } from '../../pickers/pickers';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Card, EmptyState } from '../../ui/Layout';
import { Tabs } from '../../ui/Tabs';
import { Tooltip } from '../../ui/Tooltip';
import { CardFooter, KeyChip, LockNotice, Locked, MemberStatusBadge, UnsavedNote, YouChip, memberStatusOf, patchBootstrap, useSerialWrites, useSettingsLock, useSettingsMutation } from './kit';
import { TeamLabels } from './LabelsSettings';
import { StatusesEditor } from './StatusesEditor';
import { TeamIdentityFields, TeamWorkingFields, draftFromTeam, type TeamDraft } from './TeamFields';

const TABS = ['general', 'members', 'statuses', 'labels'] as const;
type Tab = (typeof TABS)[number];

/** Only the fields that differ, so an untouched field never gets written back. */
function changes(draft: TeamDraft, base: TeamDraft) {
  const patch: Partial<Omit<TeamDraft, 'key'>> = {};
  if (draft.name.trim() !== base.name) patch.name = draft.name.trim();
  if (draft.description.trim() !== base.description) patch.description = draft.description.trim();
  for (const k of ['icon', 'color', 'sprintsEnabled', 'sprintDurationWeeks', 'intakeEnabled', 'estimateScale'] as const) {
    if (draft[k] !== base[k]) (patch as Record<string, unknown>)[k] = draft[k];
  }
  return patch;
}

function GeneralTab({ team, onTab }: { team: Team; onTab: (tab: Tab, add?: 'intake') => void }) {
  const ws = useWorkspace();
  const run = useSettingsMutation();
  const lock = useSettingsLock();
  const base = useMemo(() => draftFromTeam(team), [team]);
  const [draft, setDraft] = useState(base);
  const [saving, setSaving] = useState(false);
  const patch = changes(draft, base);
  const dirty = Object.keys(patch).length > 0;
  const hasIntakeStatus = (ws.statusesByTeam.get(team.id) ?? []).some(s => s.type === 'intake');

  // Adopt the saved team (or someone else's edit) unless there are unsaved changes here.
  const baseKey = JSON.stringify(base);
  useEffect(() => {
    if (!dirty) setDraft(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey]);

  const save = async () => {
    if (!dirty || !draft.name.trim() || saving || lock) return false;
    setSaving(true);
    const { description, ...rest } = patch;
    const res = await run(() => saveTeam({ id: team.id, ...rest, ...(description !== undefined ? { description: description || null } : {}) }), {
      success: `Saved ${draft.name.trim()}`,
      error: 'Couldn’t save the team',
    });
    setSaving(false);
    return Boolean(res);
  };

  const set = (p: Partial<TeamDraft>) => setDraft(d => ({ ...d, ...p }));

  return (
    <form
      id="team-general-form"
      onSubmit={e => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-6"
    >
      <section>
        <h3 className="mb-3 text-title font-semibold text-ink">Identity</h3>
        <Card padded>
          <TeamIdentityFields idPrefix={`team-${team.id}`} value={draft} onChange={set} keyLocked nameError={draft.name.trim() ? null : 'A team needs a name'} />
        </Card>
      </section>
      <section>
        <h3 className="mb-3 truncate text-title font-semibold text-ink">How {draft.name.trim() || team.name} works</h3>
        <Card>
          <TeamWorkingFields
            idPrefix={`team-${team.id}`}
            value={draft}
            onChange={set}
            notes={{
              intake: !hasIntakeStatus ? (
                <>
                  This team has no Intake status yet, so there’s nowhere for new issues to wait.{' '}
                  <button
                    type="button"
                    // Leaving the tab would drop the unsaved switch, so it's saved on the way.
                    onClick={async () => {
                      if (dirty && !(await save())) return;
                      onTab('statuses', 'intake');
                    }}
                    className="font-semibold underline decoration-warning/40 underline-offset-2 hover:decoration-warning"
                  >
                    {dirty ? 'Save and add one in Statuses' : 'Add one in Statuses'}
                  </button>
                </>
              ) : undefined,
              estimates: patch.estimateScale ? <p className="mt-2 text-meta text-ink-3 animate-rise-in">Issues that already have an estimate keep their value.</p> : undefined,
            }}
          />
        </Card>
      </section>
      {/* Enter in a field submits the form. */}
      <button type="submit" hidden />
      {/* The save bar only rises once there's something to save, so an untouched team reads as a finished document. */}
      {!lock && (dirty || saving) && (
        <div className="sticky bottom-0 z-10 -mx-1 -mt-2 px-1 pb-4 pt-2 animate-rise-in">
          <div className="rounded-lg border border-line-strong bg-card/95 shadow-pop backdrop-blur">
            <CardFooter start={<UnsavedNote />} className="rounded-lg border-t-0 bg-transparent">
              <Button variant="ghost" size="sm" onClick={() => setDraft(base)} disabled={saving}>
                Discard
              </Button>
              <Button type="submit" form="team-general-form" variant="primary" size="sm" disabled={!draft.name.trim()} loading={saving}>
                Save changes
              </Button>
            </CardFooter>
          </div>
        </div>
      )}
    </form>
  );
}

function MembersTab({ team }: { team: Team }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const serial = useSerialWrites();
  const members = ws.members.filter(m => m.teamIds.includes(team.id)).sort((a, b) => Number(a.id !== ws.me.id) - Number(b.id !== ws.me.id) || a.name.localeCompare(b.name));
  const ids = members.map(m => m.id);

  const setMembers = (next: string[]) => {
    const added = next.filter(id => !ids.includes(id));
    const removed = ids.filter(id => !next.includes(id));
    if (!added.length && !removed.length) return;
    const who = (list: string[]) => (list.length === 1 ? ws.memberById.get(list[0])?.name ?? '1 person' : plural(list.length, 'person', 'people'));
    const message = added.length ? `Added ${who(added)} to ${team.name}` : `Removed ${who(removed)} from ${team.name}`;

    qc.cancelQueries({ queryKey: qk.bootstrap });
    patchBootstrap(qc, data => ({
      ...data,
      members: data.members.map(m => {
        const want = next.includes(m.id);
        const has = m.teamIds.includes(team.id);
        if (want === has) return m;
        return { ...m, teamIds: want ? [...m.teamIds, team.id] : m.teamIds.filter(t => t !== team.id) };
      }),
    }));
    // Membership is sent as the full set, so writes queue rather than race; the refetch once the queue drains restores the truth on failure.
    serial(async () => {
      try {
        await saveTeam({ id: team.id, memberIds: next });
        toast.success(message);
      } catch (e) {
        toast.error(errorMessage(e, `Couldn’t update ${team.name}’s members`));
      }
    });
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[520px] text-ui text-ink-2 text-pretty">
          Members see {team.name} first when switching teams and are offered first when assigning its issues.
        </p>
        <Locked className="shrink-0">
          <MemberMultiPicker
            value={ids}
            onChange={setMembers}
            align="end"
            trigger={
              <Button variant="primary" leading={<UserPlus size={15} weight="bold" />}>
                Add members
              </Button>
            }
          />
        </Locked>
      </div>
      <Card className="overflow-hidden">
        {members.length === 0 ? (
          <EmptyState compact icon={<UsersThree size={22} weight="duotone" />} title="No one is on this team">
            Add members so {team.name} shows up for them and its issues can be assigned.
          </EmptyState>
        ) : (
          <Locked>
            <ul className="divide-y divide-line">
              {members.map(m => {
                const status = memberStatusOf(m);
                return (
                  <li key={m.id} className="group flex min-h-[56px] items-center gap-3 px-4 py-2 transition-colors hover:bg-hover/40">
                    <Avatar person={m} size={30} className={status === 'Deactivated' ? 'grayscale' : undefined} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Link to={`/people/${m.id}`} className="truncate text-ui font-semibold text-ink hover:underline hover:decoration-line-strong hover:underline-offset-2">
                          {m.name}
                        </Link>
                        {m.id === ws.me.id && <YouChip />}
                        {status !== 'Active' && <MemberStatusBadge status={status} />}
                      </div>
                      <div className="truncate text-meta text-ink-3">{[m.jobTitle, m.email].filter(Boolean).join(' · ')}</div>
                    </div>
                    <span className="hidden text-ui text-ink-2 sm:inline">{m.role ?? 'Member'}</span>
                    <Tooltip content={`Remove from ${team.name}`}>
                      <Button variant="ghost" size="sm" icon aria-label={`Remove ${m.name} from ${team.name}`} onClick={() => setMembers(ids.filter(id => id !== m.id))}>
                        <X size={14} weight="bold" />
                      </Button>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </Locked>
        )}
      </Card>
    </div>
  );
}

export function TeamDetail({ team }: { team: Team }) {
  const ws = useWorkspace();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') ?? '';
  const tab: Tab = (TABS as readonly string[]).includes(requested) ? (requested as Tab) : 'general';
  useContextTeam(team.id);

  const memberCount = ws.members.filter(m => m.teamIds.includes(team.id)).length;
  const statusCount = ws.statusesByTeam.get(team.id)?.length ?? 0;
  const labelCount = ws.labels.filter(l => l.teamId === team.id).length;
  const setTab = (t: Tab, add?: 'intake') => {
    setParams(t === 'general' ? {} : add ? { tab: t, add } : { tab: t }, { replace: true });
    document.getElementById('main')?.scrollTo({ top: 0 });
  };

  return (
    <>
      <Link to="/settings/teams" className="mb-3 inline-flex items-center gap-1 rounded-sm text-meta font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={13} weight="bold" /> Teams
      </Link>
      <div className="flex items-start gap-4">
        <Mark icon={team.icon} color={team.color} name={team.name} size={48} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="min-w-0 truncate font-display text-display-sm text-ink" title={team.name}>{team.name}</h2>
            <KeyChip>{team.key}</KeyChip>
          </div>
          <p className="mt-0.5 line-clamp-2 text-body text-ink-2">
            {team.description || `${plural(memberCount, 'member')} · ${plural(statusCount, 'status', 'statuses')}${team.sprintsEnabled ? ` · ${team.sprintDurationWeeks}-week sprints` : ''}`}
          </p>
        </div>
        <Button asChild variant="secondary" className="hidden shrink-0 sm:inline-flex">
          <Link to={`/${team.key.toLowerCase()}/issues`}>
            Open issues <ArrowUpRight size={14} weight="bold" />
          </Link>
        </Button>
      </div>

      <div className="mb-6 mt-5 border-b border-line">
        <Tabs
          value={tab}
          onChange={v => setTab(v as Tab)}
          items={[
            { value: 'general', label: 'General' },
            { value: 'members', label: 'Members', count: memberCount },
            { value: 'statuses', label: 'Statuses', count: statusCount },
            { value: 'labels', label: 'Labels', count: labelCount },
          ]}
        />
      </div>

      <LockNotice />
      <Locked>
        {tab === 'general' && <GeneralTab key={team.id} team={team} onTab={setTab} />}
      </Locked>
      {tab === 'members' && <MembersTab team={team} />}
      {tab === 'statuses' && <StatusesEditor key={team.id} team={team} />}
      {tab === 'labels' && <TeamLabels teamId={team.id} />}
    </>
  );
}
