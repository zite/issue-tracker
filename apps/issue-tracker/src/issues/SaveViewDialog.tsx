import { Check, Globe, Lock, UsersThree } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { saveView } from 'zitejs/api';
import { SWATCHES, VIEW_ICONS } from '../lib/constants';
import { errorMessage } from '../lib/errors';
import { qk } from '../lib/queries';
import type { IssueFilters, SavedView } from '../lib/types';
import type { ViewOptions } from '../lib/view';
import { useWorkspace } from '../lib/workspace';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '../ui/Dialog';
import { Field, Input } from '../ui/Form';
import { Kbd } from '../ui/Kbd';
import { Mark } from '../glyphs';
import { describeFilters, filterSentence, layoutSentence } from '../lib/filter-summary';

type Scope = 'Personal' | 'Team' | 'Workspace';

export function SaveViewDialog({ open, onOpenChange, filters, options, teamId: listTeamId, existing, initialName }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: IssueFilters;
  options: ViewOptions;
  teamId?: string | null;
  existing?: SavedView | null;
  /** Prefills the name when saving a copy. */
  initialName?: string;
}) {
  // A team view keeps its team even when its filters don't pin exactly one.
  const teamId = listTeamId ?? existing?.teamId ?? null;
  const ws = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<Scope>('Workspace');
  const [icon, setIcon] = useState(VIEW_ICONS[0]);
  const [color, setColor] = useState(SWATCHES[9]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? initialName ?? '');
    setDescription(existing?.description ?? '');
    setScope((existing?.scope as Scope) ?? (teamId ? 'Team' : 'Workspace'));
    setIcon(existing?.icon ?? VIEW_ICONS[0]);
    setColor(existing?.color ?? SWATCHES[9]);
  }, [open, existing, teamId, initialName]);

  const summary = filterSentence(describeFilters(filters, ws, { omit: teamId ? ['teamIds'] : [] }));
  const team = teamId ? ws.teamById.get(teamId) : undefined;

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const { layout, grouping, ordering, ...rest } = options;
      const res = await saveView({
        id: existing?.id,
        name: name.trim(),
        description: description.trim() || null,
        scope,
        teamId: scope === 'Team' ? teamId ?? null : null,
        icon,
        color,
        filters: JSON.stringify({ ...filters, ...(teamId && !filters.teamIds ? { teamIds: [teamId] } : {}) }),
        grouping,
        ordering,
        display: layout === 'board' ? 'Board' : 'List',
        options: JSON.stringify(rest),
      });
      await qc.invalidateQueries({ queryKey: qk.bootstrap });
      toast.success(existing ? 'View updated' : `Saved “${name.trim()}”`);
      onOpenChange(false);
      if (!existing && res.id) navigate(`/view/${res.id}`);
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t save the view'));
    } finally {
      setSaving(false);
    }
  };

  const scopes: Array<{ value: Scope; label: string; hint: string; icon: typeof Lock; disabled?: boolean }> = [
    { value: 'Personal', label: 'Only me', hint: 'In your views', icon: Lock },
    { value: 'Team', label: team?.name ?? 'A team', hint: team ? `Everyone on ${team.key}` : 'Open it from a team scope', icon: UsersThree, disabled: !team },
    { value: 'Workspace', label: 'Everyone', hint: 'The whole workspace', icon: Globe },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader title={existing ? 'Update view' : 'Save as view'} description="A view remembers these filters, grouping, order and layout." />
        <DialogBody className="flex flex-col gap-4">
          <div className="flex gap-3">
            <Mark icon={icon} color={color} size={44} className="mt-5" />
            <div className="flex flex-1 flex-col gap-3">
              <Field label="Name" htmlFor="view-name">
                <Input id="view-name" autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Urgent bugs this sprint" />
              </Field>
              <Field label="Description" htmlFor="view-desc">
                <Input id="view-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
              </Field>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1">
              {VIEW_ICONS.map(i => (
                <button key={i} type="button" onClick={() => setIcon(i)} aria-label={`Icon ${i}`} className={cn('flex h-7 w-7 items-center justify-center rounded-sm text-[15px]', icon === i ? 'bg-sunken ring-1 ring-ink/40' : 'hover:bg-hover')}>
                  {i}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SWATCHES.map(c => (
                <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => setColor(c)} className={cn('flex h-5 w-5 items-center justify-center rounded-full ring-offset-2 ring-offset-card', color === c && 'ring-2 ring-ink/60')} style={{ background: c }}>
                  {color === c && <Check size={10} weight="bold" className="text-white" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-meta font-medium text-ink-2">Who can see it</div>
            <div className="grid grid-cols-3 gap-2">
              {scopes.map(s => (
                <button
                  key={s.value}
                  type="button"
                  disabled={s.disabled}
                  onClick={() => setScope(s.value)}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-md border p-2.5 text-left transition-colors disabled:opacity-45',
                    scope === s.value ? 'border-ink bg-card shadow-raised' : 'border-line-strong bg-card hover:bg-hover',
                  )}
                >
                  <s.icon size={16} weight={scope === s.value ? 'fill' : 'regular'} />
                  <span className="text-ui font-semibold">{s.label}</span>
                  <span className="text-meta text-ink-3">{s.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-md bg-sunken px-3 py-2.5 text-meta text-ink-2">
            <span className="font-semibold text-ink">Saves: </span>
            {summary} · {layoutSentence({ display: options.layout === 'board' ? 'Board' : 'List', grouping: options.grouping, ordering: options.ordering })}
          </div>
        </DialogBody>
        <DialogFooter start={<span className="text-meta text-ink-3"><Kbd keys="enter" /> to save</span>}>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!name.trim()}>{existing ? 'Save changes' : 'Save view'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
