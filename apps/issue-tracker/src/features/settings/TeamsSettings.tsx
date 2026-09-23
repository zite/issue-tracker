import { CaretRight, Plus, SquaresFour } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { saveTeam } from 'zitejs/api';
import { Mark, SprintGlyph, StatusGlyph } from '../../glyphs';
import { ESTIMATE_SCALE_LABEL } from '../../lib/constants';
import { plural } from '../../lib/format';
import { useWorkspace } from '../../lib/workspace';
import { AvatarStack } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '../../ui/Dialog';
import { Kbd } from '../../ui/Kbd';
import { Card, EmptyState } from '../../ui/Layout';
import { KeyChip, LedgerHead, Locked, SectionHeader, useSettingsMutation } from './kit';
import { TeamIdentityFields, TeamWorkingFields, blankTeamDraft, deriveKey, keyProblem, type TeamDraft } from './TeamFields';

function NewTeamForm({ onDone }: { onDone: () => void }) {
  const ws = useWorkspace();
  const run = useSettingsMutation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<TeamDraft>(blankTeamDraft);
  // The key follows the name until someone types a key of their own.
  const [keyEdited, setKeyEdited] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const taken = useMemo(() => new Set(ws.teams.map(t => t.key.toUpperCase())), [ws.teams]);
  const problem = draft.key ? keyProblem(draft.key, taken) : 'Choose a key';
  // A derived key that is merely too short mid-typing isn't worth shouting about; a clash is.
  const keyError = touched || keyEdited || taken.has(draft.key.trim().toUpperCase()) ? problem : null;
  const valid = Boolean(draft.name.trim()) && !problem;

  const update = (patch: Partial<TeamDraft>) =>
    setDraft(d => {
      const next = { ...d, ...patch };
      if (patch.name !== undefined && !keyEdited) next.key = deriveKey(patch.name);
      return next;
    });

  const submit = async () => {
    setTouched(true);
    if (!valid || saving) return;
    setSaving(true);
    const name = draft.name.trim();
    const res = await run(
      () =>
        saveTeam({
          name,
          key: draft.key.trim().toUpperCase(),
          description: draft.description.trim() || null,
          icon: draft.icon,
          color: draft.color,
          sprintsEnabled: draft.sprintsEnabled,
          sprintDurationWeeks: draft.sprintDurationWeeks,
          intakeEnabled: draft.intakeEnabled,
          estimateScale: draft.estimateScale,
        }),
      { success: `Created ${name}`, error: 'Couldn’t create the team' },
    );
    setSaving(false);
    // The helper waits for the bootstrap refetch, so the team exists by the time its page renders.
    if (res?.id) {
      onDone();
      navigate(`/settings/teams/${res.id}`);
    }
  };

  return (
    <div
      className="contents"
      onKeyDown={e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      }}
    >
      <DialogHeader
        title="New team"
        description="A team gets its own issues and statuses — Intake, Backlog, To do, In Progress, In Review, Done and Canceled to start. You’ll be its first member."
      />
      <DialogBody className="pb-5">
        <form
          id="new-team-form"
          className="flex flex-col gap-5"
          onSubmit={e => {
            e.preventDefault();
            submit();
          }}
        >
          <TeamIdentityFields
            idPrefix="new-team"
            autoFocus
            value={draft}
            onChange={update}
            keyError={keyError}
            nameError={touched && !draft.name.trim() ? 'Give the team a name' : null}
            onKeyInput={key => {
              // Clearing the key hands it back to the name, so typing a new name re-derives it.
              setKeyEdited(key.length > 0);
              setDraft(d => ({ ...d, key }));
            }}
          />
          <div>
            <div className="mb-1.5 text-meta font-medium text-ink-2">How the team works</div>
            <TeamWorkingFields idPrefix="new-team" value={draft} onChange={update} className="rounded-lg bg-sunken/70 ring-1 ring-inset ring-line [&>div]:px-4" />
          </div>
          {/* Enter in a field submits the form. */}
          <button type="submit" hidden />
        </form>
      </DialogBody>
      <DialogFooter
        start={
          <span className="hidden items-center gap-1.5 text-meta text-ink-3 sm:inline-flex">
            <Kbd keys="mod+enter" /> to create
          </span>
        }
      >
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" form="new-team-form" variant="primary" loading={saving} disabled={touched && !valid}>
          Create team
        </Button>
      </DialogFooter>
    </div>
  );
}

export function NewTeamDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <NewTeamForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

const GRID = 'md:grid md:grid-cols-[minmax(0,1.6fr)_104px_minmax(0,0.9fr)_72px_minmax(0,0.8fr)_16px] md:items-center md:gap-x-4';

export function TeamsSettings() {
  const ws = useWorkspace();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <SectionHeader
        title="Teams"
        description="Each team has its own issues, statuses, sprints and labels. Open a team to change how it works."
        actions={
          <Button variant="primary" leading={<Plus size={15} weight="bold" />} onClick={() => setCreating(true)}>
            New team
          </Button>
        }
      />
      {ws.teams.length === 0 ? (
        <Card>
          <EmptyState
            icon={<SquaresFour size={22} weight="duotone" />}
            title="No teams yet"
            actions={
              <Locked>
                <Button variant="primary" leading={<Plus size={15} weight="bold" />} onClick={() => setCreating(true)}>
                  New team
                </Button>
              </Locked>
            }
          >
            Every issue belongs to a team. Create one to start filing work.
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <LedgerHead className={cn(GRID, 'hidden')}>
            <span>Team</span>
            <span>Members</span>
            <span>Sprints</span>
            <span>Intake</span>
            <span>Estimates</span>
            <span />
          </LedgerHead>
          <ul className="divide-y divide-line">
            {ws.teams.map(team => {
              const members = ws.activeMembers.filter(m => m.teamIds.includes(team.id));
              const statuses = ws.statusesByTeam.get(team.id) ?? [];
              return (
                <li key={team.id}>
                  <Link
                    to={`/settings/teams/${team.id}`}
                    className={cn(GRID, 'group flex items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-hover/50 focus-visible:bg-hover/60')}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Mark icon={team.icon} color={team.color} name={team.name} size={32} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-ui font-semibold text-ink">{team.name}</span>
                          <KeyChip>{team.key}</KeyChip>
                        </div>
                        <div className="truncate text-meta text-ink-3">
                          <span className="md:hidden">
                            {plural(members.length, 'member')} · {team.sprintsEnabled ? `${team.sprintDurationWeeks}-week sprints` : 'Sprints off'} · {team.intakeEnabled ? 'Intake on' : 'Intake off'}
                          </span>
                          <span className="hidden md:inline">{team.description || plural(statuses.length, 'status', 'statuses')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="hidden items-center gap-2 md:flex">
                      <AvatarStack people={members.slice(0, 3)} size={24} max={3} />
                      <span className="tabular text-meta text-ink-3">{members.length}</span>
                    </div>
                    <div className="hidden items-center gap-1.5 text-ui md:flex">
                      <SprintGlyph status={team.sprintsEnabled ? 'active' : 'upcoming'} progress={0.55} />
                      <span className={team.sprintsEnabled ? 'text-ink' : 'text-ink-3'}>{team.sprintsEnabled ? `${team.sprintDurationWeeks}-week sprints` : 'Sprints off'}</span>
                    </div>
                    <div className="hidden items-center gap-1.5 text-ui md:flex">
                      {team.intakeEnabled ? (
                        <>
                          <StatusGlyph status={{ type: 'intake' }} />
                          <span className="text-ink">On</span>
                        </>
                      ) : (
                        <span className="text-ink-3">Off</span>
                      )}
                    </div>
                    <div className={cn('hidden truncate text-ui md:block', team.estimateScale === 'none' ? 'text-ink-3' : 'text-ink')}>
                      {ESTIMATE_SCALE_LABEL[team.estimateScale] ?? 'Fibonacci'}
                    </div>
                    <CaretRight size={14} weight="bold" className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <NewTeamDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
