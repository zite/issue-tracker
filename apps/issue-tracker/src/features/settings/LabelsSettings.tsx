import { ArrowRight, GlobeSimple, MagnifyingGlass, Tag, Trash } from '@phosphor-icons/react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { saveLabel } from 'zitejs/api';
import { Mark } from '../../glyphs';
import { useAppActions } from '../../lib/app-actions';
import { SWATCHES } from '../../lib/constants';
import { plural } from '../../lib/format';
import { qk } from '../../lib/queries';
import type { Bootstrap, Label } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Button } from '../../ui/Button';
import { LabelChip } from '../../ui/Chip';
import { cn } from '../../ui/cn';
import { Input, SearchField } from '../../ui/Form';
import { Card, EmptyState } from '../../ui/Layout';
import { Tooltip } from '../../ui/Tooltip';
import { InlineInput, Locked, SectionHeader, SelectMenu, SwatchButton, useSettingsLock, useSettingsMutation, type SelectOption } from './kit';

const WORKSPACE = '__workspace__';

const patchLabel = (id: string, patch: Partial<Label>) => (data: Bootstrap): Bootstrap => ({
  ...data,
  labels: data.labels.map(l => (l.id === id ? { ...l, ...patch } : l)),
});

function useScopeOptions(): SelectOption[] {
  const ws = useWorkspace();
  return [
    { value: WORKSPACE, label: 'Workspace', icon: <GlobeSimple size={15} className="text-ink-2" />, group: '' },
    ...ws.teams.map(t => ({ value: t.id, label: t.name, icon: <Mark icon={t.icon} color={t.color} name={t.name} size={16} />, group: 'Teams', hint: t.key })),
  ];
}

const ROW_GRID = 'grid grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-x-2 sm:grid-cols-[32px_minmax(0,0.8fr)_minmax(0,1.2fr)_150px_32px]';

function LabelRow({ label }: { label: Label }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const run = useSettingsMutation();
  const lock = useSettingsLock();
  const scopeOptions = useScopeOptions();
  const scopeName = (teamId: string | null) => (teamId ? ws.teamById.get(teamId)?.name ?? 'a team' : 'the workspace');

  const remove = async () => {
    const ok = await app.confirm({
      title: `Delete “${label.name}”?`,
      description: 'This removes the label from every issue that has it, and can’t be undone.',
      confirmLabel: 'Delete label',
      destructive: true,
    });
    if (!ok) return;
    run(() => saveLabel({ id: label.id, remove: true }), {
      optimistic: data => ({ ...data, labels: data.labels.filter(l => l.id !== label.id) }),
      success: res => `Deleted “${label.name}”${res.detached ? ` · removed from ${plural(res.detached, 'issue')}` : ''}`,
      error: 'Couldn’t delete the label',
      alsoInvalidate: [qk.issuesRoot, qk.issueRoot],
    });
  };

  return (
    <li className={cn(ROW_GRID, 'group gap-y-0.5 py-1 pl-2 pr-3 transition-colors hover:bg-hover/30 sm:py-1')}>
      <div className="row-span-2 self-start sm:row-span-1 sm:self-center">
        <SwatchButton
          color={label.color}
          label={`Colour of ${label.name}`}
          onChange={color => run(() => saveLabel({ id: label.id, color }), { optimistic: patchLabel(label.id, { color }), error: 'Couldn’t change the colour' })}
        />
      </div>
      <div className="min-w-0">
        <InlineInput
          value={label.name}
          required
          maxLength={60}
          aria-label="Label name"
          className="font-medium"
          // The name clash check is per scope, so the scope travels with the name.
          onCommit={name => run(() => saveLabel({ id: label.id, name, teamId: label.teamId }), { optimistic: patchLabel(label.id, { name }), error: 'Couldn’t rename the label' })}
        />
      </div>
      <div className="col-start-3 row-start-1 sm:col-start-5">
        {/* A hover-only affordance; when the section is read-only there's nothing to reveal. */}
        {!lock && (
        <Tooltip content="Delete label">
          <Button variant="ghost" size="sm" icon aria-label={`Delete ${label.name}`} onClick={remove} className="hover:text-danger sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100">
            <Trash size={15} />
          </Button>
        </Tooltip>
        )}
      </div>
      <div className="col-span-2 col-start-2 row-start-2 flex min-w-0 items-center gap-1 sm:contents">
        <div className="min-w-0 flex-1 sm:col-start-3 sm:row-start-1">
          <InlineInput
            value={label.description}
            maxLength={300}
            placeholder="Add a description"
            aria-label={`Description of ${label.name}`}
            className="h-7 text-ink-3 focus:text-ink sm:h-8"
            onCommit={description =>
              run(() => saveLabel({ id: label.id, description: description || null }), {
                optimistic: patchLabel(label.id, { description: description || null }),
                error: 'Couldn’t save the description',
              })
            }
          />
        </div>
        <div className="shrink-0 sm:col-start-4 sm:row-start-1 sm:min-w-0">
          <SelectMenu
            variant="quiet"
            ariaLabel={`Where ${label.name} applies`}
            value={label.teamId ?? WORKSPACE}
            options={scopeOptions}
            align="end"
            className="max-w-full"
            contentClassName="w-[230px]"
            onChange={v => {
              const teamId = v === WORKSPACE ? null : v;
              if (teamId === label.teamId) return;
              run(() => saveLabel({ id: label.id, name: label.name, teamId }), {
                optimistic: patchLabel(label.id, { teamId }),
                success: `Moved “${label.name}” to ${scopeName(teamId)}`,
                error: 'Couldn’t change where the label applies',
              });
            }}
          />
        </div>
      </div>
    </li>
  );
}

/** Always-visible first row: pick a colour, type a name, press Enter. */
export function NewLabelRow({ defaultTeamId = null }: { defaultTeamId?: string | null }) {
  const ws = useWorkspace();
  const run = useSettingsMutation();
  const scopeOptions = useScopeOptions();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId] = useState<string | null>(defaultTeamId);
  const [color, setColor] = useState(() => SWATCHES[(ws.labels.length + 2) % SWATCHES.length]);
  const [saving, setSaving] = useState(false);

  const clash = ws.labels.find(l => l.name.toLowerCase() === name.trim().toLowerCase() && (l.teamId ?? null) === teamId);

  const create = async () => {
    const n = name.trim();
    if (!n || clash || saving) return;
    setSaving(true);
    const res = await run(() => saveLabel({ name: n, color, description: description.trim() || null, teamId }), {
      success: `Created “${n}”`,
      error: 'Couldn’t create the label',
    });
    setSaving(false);
    if (res) {
      setName('');
      setDescription('');
      // The next label gets a different colour, so a run of new labels doesn't come out all one shade.
      setColor(c => SWATCHES[(SWATCHES.indexOf(c) + 5) % SWATCHES.length]);
      nameRef.current?.focus();
    }
  };

  return (
    <div className="rounded-lg bg-card">
      <form
        className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 sm:grid-cols-[32px_minmax(0,0.8fr)_minmax(0,1.2fr)_170px_auto]"
        onSubmit={e => {
          e.preventDefault();
          create();
        }}
      >
        <SwatchButton color={color} onChange={setColor} label="Colour for the new label" />
        <Input
          ref={nameRef}
          value={name}
          maxLength={60}
          onChange={e => setName(e.target.value)}
          placeholder="New label"
          aria-label="New label name"
          invalid={Boolean(clash)}
        />
        <Button type="submit" variant="primary" disabled={!name.trim() || Boolean(clash)} loading={saving} className="sm:col-start-5">
          Add label
        </Button>
        <div className="col-span-2 col-start-2 flex min-w-0 items-center gap-2 sm:contents">
          <Input
            value={description}
            maxLength={300}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            aria-label="New label description"
            className="min-w-0 flex-1 sm:col-start-3 sm:row-start-1"
          />
          <SelectMenu
            ariaLabel="Where the new label applies"
            value={teamId ?? WORKSPACE}
            onChange={v => setTeamId(v === WORKSPACE ? null : v)}
            options={scopeOptions}
            align="end"
            className="w-[150px] shrink-0 sm:col-start-4 sm:row-start-1 sm:w-full"
            contentClassName="w-[230px]"
          />
        </div>
      </form>
      <div className="flex min-h-[34px] items-center gap-2 rounded-b-lg border-t border-line bg-paper/60 px-3 pl-[52px] text-meta">
        {clash ? (
          <span className="text-danger">
            A label called “{clash.name}” already exists {teamId ? `in ${ws.teamById.get(teamId)?.name}` : 'in the workspace'}.
          </span>
        ) : name.trim() ? (
          <>
            <span className="text-ink-3">Preview</span>
            <LabelChip name={name.trim()} color={color} />
            <span className="text-ink-3">· press Enter to add</span>
          </>
        ) : (
          <span className="text-ink-3">{teamId ? `Only ${ws.teamById.get(teamId)?.name ?? 'this team'} can use this label.` : 'Workspace labels can go on any issue in any team.'}</span>
        )}
      </div>
    </div>
  );
}

function LabelGroup({ title, icon, labels, action }: { title: string; icon?: ReactNode; labels: Label[]; action?: ReactNode }) {
  return (
    <section className="mb-7 last:mb-0">
      <div className="mb-2 flex items-center gap-2 px-1">
        {icon}
        <h3 className="text-title font-semibold text-ink">{title}</h3>
        <span className="tabular text-meta text-ink-3">{labels.length}</span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {labels.map(l => (
            <LabelRow key={l.id} label={l} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** A team's own labels — the Labels tab of team settings. */
export function TeamLabels({ teamId }: { teamId: string }) {
  const ws = useWorkspace();
  const own = ws.labels.filter(l => l.teamId === teamId);
  const shared = ws.labels.filter(l => !l.teamId).length;
  const team = ws.teamById.get(teamId);
  return (
    <div>
      <p className="mb-4 max-w-[640px] text-ui text-ink-2 text-pretty">
        Labels only {team?.name ?? 'this team'} can use. {plural(shared, 'workspace label')} also apply to every team —{' '}
        <Link to="/settings/labels" className="font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">
          manage workspace labels
        </Link>
        .
      </p>
      <Locked>
        <Card className="mb-6">
          <NewLabelRow key={teamId} defaultTeamId={teamId} />
        </Card>
        {own.length === 0 ? (
          <Card>
            <EmptyState compact icon={<Tag size={22} weight="duotone" />} title="No team labels yet">
              Add one above, or keep using workspace labels.
            </EmptyState>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {own.map(l => (
                <LabelRow key={l.id} label={l} />
              ))}
            </ul>
          </Card>
        )}
      </Locked>
    </div>
  );
}

export function LabelsSettings() {
  const ws = useWorkspace();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => ws.labels.filter(l => !q || l.name.toLowerCase().includes(q) || (l.description ?? '').toLowerCase().includes(q)), [ws.labels, q]);
  const workspace = visible.filter(l => !l.teamId);
  const byTeam = ws.teams.map(t => ({ team: t, labels: visible.filter(l => l.teamId === t.id) })).filter(g => g.labels.length > 0);

  return (
    <>
      <SectionHeader
        title="Labels"
        description="Workspace labels can go on any issue; team labels only within their team. Renaming or recolouring a label updates it everywhere it’s used."
      />
      <Locked>
        <Card className="mb-8">
          <NewLabelRow />
        </Card>
      </Locked>

      {ws.labels.length > 6 && (
        <div className="mb-5 flex items-center justify-between gap-3">
          <SearchField value={query} onChange={setQuery} placeholder="Filter labels" className="w-full sm:w-64" />
          {q && <span className="shrink-0 text-meta text-ink-3">{plural(visible.length, 'label')}</span>}
        </div>
      )}

      {ws.labels.length === 0 ? (
        <Card>
          <EmptyState icon={<Tag size={22} weight="duotone" />} title="No labels yet">
            Labels group issues across projects and teams — Bug, Performance, Customer request. Add your first above.
          </EmptyState>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState compact icon={<MagnifyingGlass size={22} weight="duotone" />} title="No labels match">
            Try another word from a name or description.
          </EmptyState>
        </Card>
      ) : (
        <Locked>
          {workspace.length > 0 && <LabelGroup title="Workspace" icon={<GlobeSimple size={16} className="text-ink-2" />} labels={workspace} />}
          {byTeam.map(({ team, labels }) => (
            <LabelGroup
              key={team.id}
              title={team.name}
              icon={<Mark icon={team.icon} color={team.color} name={team.name} size={18} />}
              labels={labels}
              action={
                <Link to={`/settings/teams/${team.id}?tab=labels`} className="inline-flex items-center gap-1 text-meta font-medium text-ink-2 hover:text-ink">
                  Team settings <ArrowRight size={12} weight="bold" />
                </Link>
              }
            />
          ))}
        </Locked>
      )}
    </>
  );
}
