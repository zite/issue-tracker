import { GlobeSimple, LockSimple, UsersThree, Warning, type Icon } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { saveView } from 'zitejs/api';
import { Mark } from '../../glyphs';
import { SWATCHES, VIEW_ICONS } from '../../lib/constants';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import type { Bootstrap, SavedView } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '../../ui/Dialog';
import { Field, Input, Textarea } from '../../ui/Form';
import { Kbd } from '../../ui/Kbd';
import { IconColorPopover, SelectMenu } from '../settings/kit';
import { parseView } from './filter-summary';

type Scope = 'Workspace' | 'Team' | 'Personal';

const SCOPES: Array<{ value: Scope; label: string; hint: string; icon: Icon }> = [
  { value: 'Workspace', label: 'Everyone', hint: 'The whole workspace', icon: GlobeSimple },
  { value: 'Team', label: 'A team', hint: 'Listed with its team', icon: UsersThree },
  { value: 'Personal', label: 'Only me', hint: 'Private to you', icon: LockSimple },
];

const asScope = (s: string): Scope => (s === 'Team' || s === 'Personal' ? s : 'Workspace');

/**
 * A saved view's name, look and who it's shared with. Filters, grouping and
 * layout aren't here: those are saved from the view itself, where you can see
 * what they do.
 */
function ViewDetailsForm({ view, onDone }: { view: SavedView; onDone: () => void }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const initialScope = asScope(view.scope);
  const [name, setName] = useState(view.name);
  const [description, setDescription] = useState(view.description ?? '');
  const [icon, setIcon] = useState(view.icon || VIEW_ICONS[0]);
  const [color, setColor] = useState(view.color || SWATCHES[9]);
  const [scope, setScope] = useState<Scope>(initialScope);
  const [teamId, setTeamId] = useState<string | null>(() => {
    const id = view.teamId ?? parseView(view).singleTeamId;
    return id && ws.teamById.has(id) ? id : ws.teams[0]?.id ?? null;
  });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const nameError = touched && !name.trim() ? 'Give the view a name' : null;
  const teamMissing = scope === 'Team' && !teamId;
  const team = teamId ? ws.teamById.get(teamId) : undefined;

  const submit = async () => {
    setTouched(true);
    if (!name.trim() || teamMissing || busy.current) return;
    busy.current = true;
    setSaving(true);
    const patch = {
      name: name.trim(),
      description: description.trim() || null,
      icon,
      color,
      scope,
      teamId: scope === 'Team' ? teamId : null,
    };
    await qc.cancelQueries({ queryKey: qk.bootstrap });
    const previous = qc.getQueryData<Bootstrap>(qk.bootstrap);
    qc.setQueryData<Bootstrap>(qk.bootstrap, old =>
      old ? { ...old, views: old.views.map(v => (v.id === view.id ? { ...v, ...patch, ownerId: scope === 'Personal' ? ws.me.id : null } : v)) } : old,
    );
    try {
      await saveView({ id: view.id, ...patch });
      onDone();
    } catch (e) {
      if (previous) qc.setQueryData(qk.bootstrap, previous);
      toast.error(errorMessage(e, 'Couldn’t save the view'));
    } finally {
      busy.current = false;
      setSaving(false);
      qc.invalidateQueries({ queryKey: qk.bootstrap });
    }
  };

  // What changes for other people when the sharing changes — the part that's easy to get wrong.
  const sharingNote =
    initialScope === 'Personal' && scope !== 'Personal'
      ? scope === 'Team'
        ? `Everyone will find it under ${team?.name ?? 'the team'}’s views, and anyone can change or delete it.`
        : 'Everyone in the workspace will see it, and anyone can change or delete it.'
      : initialScope !== 'Personal' && scope === 'Personal'
        ? 'It disappears for everyone else, including anyone who pinned it.'
        : null;

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
      <DialogHeader title="Edit view" description="Its name, how it looks and who can see it." />
      <DialogBody className="pb-5">
        <form
          id="view-details-form"
          className="flex flex-col gap-4"
          onSubmit={e => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex items-start gap-2.5">
            <div className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink-2">Icon</span>
              <IconColorPopover
                icon={icon}
                color={color}
                name={name}
                untitled="Untitled view"
                icons={VIEW_ICONS}
                onChange={p => {
                  if (p.icon) setIcon(p.icon);
                  if (p.color) setColor(p.color);
                }}
              >
                <button
                  type="button"
                  aria-label="Change icon and colour"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-control/60 bg-card shadow-hairline transition-colors hover:border-control data-[state=open]:border-ink/60 data-[state=open]:ring-[3px] data-[state=open]:ring-highlight/45"
                >
                  <Mark icon={icon} color={color} name={name} size={24} />
                </button>
              </IconColorPopover>
            </div>
            <Field label="Name" htmlFor="view-details-name" error={nameError} className="min-w-0 flex-1">
              <Input
                id="view-details-name"
                autoFocus
                value={name}
                maxLength={120}
                onChange={e => setName(e.target.value)}
                placeholder="Urgent bugs this sprint"
                invalid={Boolean(nameError)}
                className="h-9 text-body"
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="view-details-description">
            <Textarea
              id="view-details-description"
              value={description}
              maxLength={500}
              minRows={2}
              onChange={e => setDescription(e.target.value)}
              placeholder="What it’s for, so people know when to open it"
              className="text-body"
            />
          </Field>
          <div>
            <div className="mb-1.5 text-meta font-medium text-ink-2">Who can see it</div>
            <div role="radiogroup" aria-label="Who can see it" className="grid gap-2 sm:grid-cols-3">
              {SCOPES.map(s => {
                const on = scope === s.value;
                const disabled = s.value === 'Team' && ws.teams.length === 0;
                return (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={disabled}
                    onClick={() => setScope(s.value)}
                    className={cn(
                      // A row on a phone, a small card side by side from sm up.
                      'grid min-w-0 grid-cols-[16px_auto_minmax(0,1fr)] items-center gap-x-2.5 rounded-md border bg-card px-3 py-2 text-left transition-[background-color,border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-45 sm:flex sm:flex-col sm:items-start sm:gap-1 sm:p-2.5',
                      on ? 'border-ink shadow-raised ring-1 ring-inset ring-ink' : 'border-line-strong hover:bg-hover',
                    )}
                  >
                    <s.icon size={16} weight={on ? 'fill' : 'regular'} className={on ? 'text-ink' : 'text-ink-2'} />
                    <span className="text-ui font-semibold text-ink">{s.label}</span>
                    <span className="truncate text-meta text-ink-3 sm:max-w-full">{s.hint}</span>
                  </button>
                );
              })}
            </div>
            {scope === 'Team' && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-ui text-ink-2 animate-rise-in">
                Shared with
                <SelectMenu
                  ariaLabel="Team"
                  value={teamId}
                  onChange={setTeamId}
                  placeholder="Choose a team"
                  options={ws.teams.map(t => ({ value: t.id, label: t.name, hint: t.key, icon: <Mark icon={t.icon} color={t.color} name={t.name} size={16} /> }))}
                  className="w-[220px]"
                  contentClassName="w-[240px]"
                />
              </div>
            )}
            {sharingNote && (
              <p className="mt-3 flex items-start gap-1.5 rounded-md bg-warning/10 px-2.5 py-2 text-meta text-warning animate-rise-in">
                <Warning size={14} weight="bold" className="mt-px shrink-0" />
                {sharingNote}
              </p>
            )}
          </div>
          {/* Enter in the name field submits. */}
          <button type="submit" hidden />
        </form>
      </DialogBody>
      <DialogFooter
        start={
          <span className="hidden items-center gap-1.5 text-meta text-ink-3 sm:inline-flex">
            <Kbd keys="mod+enter" /> to save
          </span>
        }
      >
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" form="view-details-form" variant="primary" loading={saving} disabled={teamMissing || (touched && !name.trim())}>
          Save changes
        </Button>
      </DialogFooter>
    </div>
  );
}

export function ViewDetailsDialog({ view, open, onOpenChange }: { view: SavedView | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  // Keep the last view while the dialog animates closed, so it never flashes empty.
  const last = useRef(view);
  if (view) last.current = view;
  const shown = view ?? last.current;
  return (
    <Dialog open={open && Boolean(shown)} onOpenChange={onOpenChange}>
      <DialogContent size="md">{shown && <ViewDetailsForm key={shown.id} view={shown} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}
