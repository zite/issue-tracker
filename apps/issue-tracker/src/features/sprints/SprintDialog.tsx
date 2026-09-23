import { ArrowRight, CalendarBlank, WarningCircle } from '@phosphor-icons/react';
import { addDays } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { saveSprint } from 'zitejs/api';
import { Mark } from '../../glyphs';
import { errorMessage } from '../../lib/errors';
import { daysBetween, parseDay, shortDate, toDayString } from '../../lib/format';
import { useWorkspace } from '../../lib/workspace';
import { DatePicker } from '../../pickers/pickers';
import { Button } from '../../ui/Button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '../../ui/Dialog';
import { Field, Input, Segmented, Textarea } from '../../ui/Form';
import { Kbd } from '../../ui/Kbd';
import { dateRange, defaultSprintDates, durationLabel, nextSprintNumber, overlappingSprint, type SprintBasics } from './sprint-utils';
import { useSprintActions } from './useSprintActions';

export type EditableSprint = Pick<SprintBasics, 'id' | 'name' | 'number' | 'goal' | 'startDate' | 'endDate'>;

function DateButton({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} htmlFor={id} className="min-w-0 flex-1">
      <DatePicker
        label={label}
        value={value || null}
        onChange={v => v && onChange(v)}
        trigger={
          <Button id={id} variant="secondary" className="w-full justify-start px-2.5 font-normal data-[state=open]:bg-hover" leading={<CalendarBlank size={15} className="text-ink-3" />}>
            <span className="tabular truncate">{value ? shortDate(value) : 'Pick a date'}</span>
          </Button>
        }
      />
    </Field>
  );
}

/** Create or edit a sprint. Dates default to the team's cadence, following on from its last sprint. */
export function SprintDialog({ open, onOpenChange, teamId, sprint }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  /** Present when editing. */
  sprint?: EditableSprint | null;
}) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const { refresh } = useSprintActions();
  const team = ws.teamById.get(teamId);
  const teamSprints = ws.sprintsByTeam.get(teamId) ?? [];
  const weeks = team?.sprintDurationWeeks ?? 2;
  const editing = Boolean(sprint);

  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [goal, setGoal] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const defaults = defaultSprintDates(teamSprints, weeks);
    setName(sprint?.name ?? '');
    setStart(sprint?.startDate ?? defaults.start);
    setEnd(sprint?.endDate ?? defaults.end);
    setGoal(sprint?.goal ?? '');
    setServerError(null);
    // Seed once per open; a bootstrap refetch mustn't wipe what's being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sprint?.id, teamId]);

  const number = sprint?.number ?? nextSprintNumber(teamSprints);
  const orderError = start && end && end <= start ? 'The end date must be after the start date.' : null;
  const clash = useMemo(
    () => (start && end && !orderError ? overlappingSprint(teamSprints, start, end, sprint?.id) : undefined),
    [teamSprints, start, end, orderError, sprint?.id],
  );
  const dateError = orderError ?? (clash ? `Overlaps ${clash.name} (${dateRange(clash.startDate, clash.endDate)}). A team runs one sprint at a time.` : serverError);
  const duration = start && end && !orderError ? durationLabel(start, end) : null;
  const lengthWeeks = start && end && daysBetween(start, end) % 7 === 0 ? String(daysBetween(start, end) / 7) : 'custom';

  const setDuration = (w: string) => {
    if (!start) return;
    setEnd(toDayString(addDays(parseDay(start), Number(w) * 7)));
    setServerError(null);
  };
  const onStart = (v: string) => {
    // Moving the start keeps the sprint's length, which is almost always what's meant.
    const len = start && end && end > start ? daysBetween(start, end) : weeks * 7;
    setStart(v);
    setEnd(toDayString(addDays(parseDay(v), len)));
    setServerError(null);
  };

  const canSubmit = Boolean(start && end) && !orderError && !clash && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setServerError(null);
    try {
      const res = await saveSprint({
        id: sprint?.id,
        teamId,
        name: name.trim() || null,
        startDate: start,
        endDate: end,
        goal: goal.trim() || null,
      });
      await refresh([sprint?.id ?? res.id]);
      const finalName = name.trim() || `Sprint ${res.number || number}`;
      if (editing) {
        toast.success(`Saved ${finalName}`);
      } else {
        toast.success(`Created ${finalName}`, {
          description: dateRange(start, end),
          action: res.id ? { label: 'Open', onClick: () => navigate(`/sprint/${res.id}`) } : undefined,
        });
      }
      onOpenChange(false);
    } catch (e) {
      const msg = errorMessage(e, editing ? 'Couldn’t save the sprint' : 'Couldn’t create the sprint');
      // Date problems belong next to the dates; anything else is a toast.
      if (/overlap|end after|dates/i.test(msg)) setServerError(msg.endsWith('.') ? msg : `${msg}.`);
      else toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <div
          className="flex min-h-0 flex-col"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        >
          <DialogHeader
            title={editing ? `Edit ${sprint?.name}` : 'New sprint'}
            description={
              editing ? (
                'Change the name, dates or goal. Issues in the sprint stay put.'
              ) : (
                <span className="flex items-start gap-1.5">
                  {team && <Mark icon={team.icon} color={team.color} name={team.name} size={16} className="mt-0.5 shrink-0" />}
                  <span className="min-w-0">
                    A time-boxed stretch of work for {team?.name ?? 'the team'}. Their cadence is {weeks} week{weeks === 1 ? '' : 's'}.
                  </span>
                </span>
              )
            }
          />
          <DialogBody className="flex flex-col gap-4 pb-5">
            <Field label="Name" htmlFor="sprint-name">
              <Input
                id="sprint-name"
                autoFocus={!editing}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={`Sprint ${number}`}
                maxLength={120}
                className="h-9 text-body"
              />
            </Field>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-end gap-2">
                <DateButton id="sprint-start" label="Starts" value={start} onChange={onStart} />
                <ArrowRight size={14} className="mb-[9px] shrink-0 text-ink-3" aria-hidden />
                <DateButton
                  id="sprint-end"
                  label="Ends"
                  value={end}
                  onChange={v => {
                    setEnd(v);
                    setServerError(null);
                  }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  value={lengthWeeks}
                  onChange={setDuration}
                  options={['1', '2', '3', '4'].map(w => ({ value: w, label: `${w}w`, title: `${w} week${w === '1' ? '' : 's'}` }))}
                />
                <span className="tabular text-meta text-ink-3">{duration ? `${duration} long` : '—'}</span>
              </div>
              {dateError && (
                <p role="alert" className="flex items-start gap-1.5 text-meta text-danger animate-rise-in">
                  <WarningCircle size={14} weight="bold" className="mt-px shrink-0" />
                  {dateError}
                </p>
              )}
            </div>

            <Field label="Goal" htmlFor="sprint-goal" hint="One or two sentences the team can repeat at standup.">
              <Textarea
                id="sprint-goal"
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder="What does this sprint need to deliver?"
                minRows={3}
                maxLength={5000}
                className="min-h-[84px] text-body"
              />
            </Field>
          </DialogBody>
          <DialogFooter
            start={
              <span className="hidden items-center gap-1.5 text-meta text-ink-3 sm:inline-flex">
                <Kbd keys="mod+enter" /> to {editing ? 'save' : 'create'}
              </span>
            }
          >
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={!canSubmit} loading={saving}>
              {editing ? 'Save changes' : 'Create sprint'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
