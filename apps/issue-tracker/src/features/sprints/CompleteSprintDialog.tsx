import { ArrowBendDownRight, CheckCircle, Stack, Tray } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { completeSprint } from 'zitejs/api';
import { errorMessage } from '../../lib/errors';
import { plural, shortDate } from '../../lib/format';
import { useSprint } from '../../lib/queries';
import { useWorkspace } from '../../lib/workspace';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '../../ui/Dialog';
import { Kbd } from '../../ui/Kbd';
import { Skeleton } from '../../ui/Layout';
import { nextSprintFor, nextSprintNumber, serverToday, type SprintBasics } from './sprint-utils';
import { useSprintActions } from './useSprintActions';

type MoveTo = 'next' | 'unscheduled' | 'none';

export type CompletableSprint = Pick<SprintBasics, 'id' | 'teamId' | 'name' | 'endDate'>;

/**
 * Close a sprint and decide where its unfinished work goes — the sprint-review
 * step. The unfinished count comes from getSprint, the same numbers the page shows.
 */
export function CompleteSprintDialog({ open, onOpenChange, sprint, navigateOnMove = true }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprint: CompletableSprint;
  /** Follow the work into the next sprint afterwards. */
  navigateOnMove?: boolean;
}) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const { refresh } = useSprintActions();
  const { data, isPending } = useSprint(open ? sprint.id : undefined);
  const [moveTo, setMoveTo] = useState<MoveTo>('next');
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setMoveTo('next');
  }, [open]);

  const team = sprint.teamId ? ws.teamById.get(sprint.teamId) : undefined;
  const teamSprints = sprint.teamId ? ws.sprintsByTeam.get(sprint.teamId) ?? [] : [];
  const next = nextSprintFor(sprint, teamSprints);
  const newNumber = nextSprintNumber(teamSprints);
  const weeks = team?.sprintDurationWeeks ?? 2;

  const totals = data?.totals;
  const unfinished = totals ? Math.max(0, totals.issues - totals.completed - totals.canceled) : null;
  const endsEarly = Boolean(sprint.endDate && sprint.endDate > serverToday());

  const options: Array<{ value: MoveTo; title: string; detail: string; icon: ReactNode }> = [
    {
      value: 'next',
      title: 'Move to the next sprint',
      icon: <ArrowBendDownRight size={16} weight="bold" />,
      detail: next
        ? `Into ${next.name}${next.startDate ? `, starting ${shortDate(next.startDate)}` : ''}.`
        : `Sprint ${newNumber} will be created, starting tomorrow for ${weeks} week${weeks === 1 ? '' : 's'}.`,
    },
    { value: 'unscheduled', title: 'Move to the backlog', icon: <Tray size={16} weight="bold" />, detail: 'They leave the sprint unscheduled and keep their status.' },
    { value: 'none', title: 'Leave them in this sprint', icon: <Stack size={16} weight="bold" />, detail: 'They stay here, recorded as unfinished.' },
  ];

  // The choices arrive after the dialog has opened (and Radix has focused its close button), so hand focus
  // to the selected choice once they render — unless the viewer has already moved it themselves.
  const ready = unfinished != null;
  useEffect(() => {
    if (!open || !ready) return;
    const t = window.setTimeout(() => {
      const root = bodyRef.current?.closest<HTMLElement>('[role="dialog"]');
      const active = document.activeElement as HTMLElement | null;
      if (!root || (active && root.contains(active) && active.getAttribute('aria-label') !== 'Close')) return;
      root.querySelector<HTMLElement>('[role="radio"][aria-checked="true"], [data-complete-submit]')?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, ready]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || target.getAttribute('role') === 'radio')) {
      e.preventDefault();
      submit();
      return;
    }
    if (target.getAttribute('role') === 'radio' && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const i = options.findIndex(o => o.value === moveTo);
      const next = options[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
      setMoveTo(next.value);
      window.setTimeout(() => bodyRef.current?.querySelector<HTMLElement>(`[data-move="${next.value}"]`)?.focus(), 0);
    }
  };

  const submit = async () => {
    if (unfinished == null || busy) return;
    // With nothing to move, "next" would still create an empty sprint — don't.
    const target: MoveTo = unfinished === 0 ? 'none' : moveTo;
    setBusy(true);
    try {
      const res = await completeSprint({ id: sprint.id, moveTo: target });
      const nextName = res.createdNext ? `Sprint ${newNumber}` : ws.sprintById.get(res.nextSprintId ?? '')?.name ?? next?.name ?? 'the next sprint';
      if (target === 'next' && res.moved > 0) toast.success(`Moved ${plural(res.moved, 'issue')} to ${nextName}`, { description: `${sprint.name} is complete.` });
      else if (target === 'unscheduled' && res.moved > 0) toast.success(`Moved ${plural(res.moved, 'issue')} to the backlog`, { description: `${sprint.name} is complete.` });
      else toast.success(`Completed ${sprint.name}`);
      await refresh([sprint.id, res.nextSprintId], { issues: true });
      onOpenChange(false);
      if (navigateOnMove && target === 'next' && res.nextSprintId) navigate(`/sprint/${res.nextSprintId}`);
    } catch (e) {
      toast.error(errorMessage(e, `Couldn’t complete ${sprint.name}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <div ref={bodyRef} onKeyDown={onKeyDown} className="flex min-h-0 flex-col">
        <DialogHeader
          title={`Complete ${sprint.name}`}
          description={
            endsEarly && sprint.endDate
              ? `Completing now ends the sprint early — its end date moves in from ${shortDate(sprint.endDate)} to today.`
              : 'Close the sprint and decide what happens to work that didn’t land.'
          }
        />
        <DialogBody className="pb-5">
          {isPending || unfinished == null ? (
            <div className="flex flex-col gap-2" aria-label="Loading">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-[60px] w-full rounded-lg" />
              <Skeleton className="h-[60px] w-full rounded-lg" />
              <Skeleton className="h-[60px] w-full rounded-lg" />
            </div>
          ) : unfinished === 0 ? (
            <div className="flex items-center gap-3 rounded-lg bg-sunken px-4 py-3.5 animate-rise-in">
              <CheckCircle size={20} weight="fill" className="shrink-0 text-success" />
              <p className="text-body text-ink">Every issue in this sprint is finished. Nothing to move.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 animate-rise-in">
              <p className="text-body">
                <span className="font-semibold">{plural(unfinished, 'issue')} unfinished</span>
                <span className="text-ink-2">
                  {' '}· {totals!.started} in flight, {totals!.unstarted} not started
                </span>
              </p>
              <div role="radiogroup" aria-label="Unfinished issues" className="flex flex-col gap-1.5">
                {options.map(o => {
                  const active = moveTo === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      tabIndex={active ? 0 : -1}
                      data-move={o.value}
                      onClick={() => setMoveTo(o.value)}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors',
                        active ? 'border-ink/70 bg-highlight/20 dark:bg-highlight/10' : 'border-line-strong bg-card hover:bg-hover',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                          active ? 'border-primary bg-primary' : 'border-control bg-card',
                        )}
                      >
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-on-primary" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-ui font-semibold text-ink">{o.title}</span>
                        <span className="mt-0.5 block text-meta text-ink-2">{o.detail}</span>
                      </span>
                      <span className={cn('mt-0.5 shrink-0', active ? 'text-ink' : 'text-ink-3')}>{o.icon}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter
          start={
            unfinished ? (
              <span className="hidden items-center gap-1.5 text-meta text-ink-3 sm:inline-flex">
                <Kbd keys="up" /> <Kbd keys="down" /> to choose · <Kbd keys="enter" /> to complete
              </span>
            ) : undefined
          }
        >
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" data-complete-submit onClick={submit} disabled={unfinished == null} loading={busy}>
            Complete sprint
          </Button>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
