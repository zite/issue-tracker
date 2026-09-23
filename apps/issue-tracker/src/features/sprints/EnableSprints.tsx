import { Timer } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { saveTeam } from 'zitejs/api';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import type { Bootstrap, Team } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Button } from '../../ui/Button';
import { Card, EmptyState } from '../../ui/Layout';
import { Tooltip } from '../../ui/Tooltip';

export const GUEST_TEAM_SETTINGS = 'Guests can’t change team settings. Ask a member or admin.';

/** The one switch that turns sprints on for a team, optimistically, shared by the team page and the all-teams card. */
export function useEnableSprints(team: Team) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    setBusy(true);
    // Optimistic: the page flips to the sprint overview straight away.
    const previous = qc.getQueryData<Bootstrap>(qk.bootstrap);
    qc.setQueryData<Bootstrap>(qk.bootstrap, old => (old ? { ...old, teams: old.teams.map(t => (t.id === team.id ? { ...t, sprintsEnabled: true } : t)) } : old));
    try {
      await saveTeam({ id: team.id, sprintsEnabled: true });
      toast.success(`Sprints are on for ${team.name}`);
    } catch (e) {
      qc.setQueryData(qk.bootstrap, previous);
      toast.error(errorMessage(e, 'Couldn’t turn on sprints'));
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: qk.bootstrap });
    }
  };

  return { enable, busy, guest: ws.me.role === 'Guest' };
}

/** A team without sprints: what they are, and the one switch that turns them on. */
export function EnableSprints({ team }: { team: Team }) {
  const { enable, busy, guest } = useEnableSprints(team);
  const weeks = team.sprintDurationWeeks || 2;

  const button = (
    <Button variant="primary" size="lg" onClick={enable} loading={busy} disabled={guest}>
      Turn on sprints
    </Button>
  );

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <EmptyState
        icon={<Timer size={22} weight="duotone" />}
        title={`${team.name} doesn’t run sprints yet`}
        actions={guest ? <Tooltip content={GUEST_TEAM_SETTINGS}><span tabIndex={0}>{button}</span></Tooltip> : button}
      >
        Sprints are short, time-boxed stretches of work — {weeks} week{weeks === 1 ? '' : 's'} by default. Plan issues into one, watch the burndown as work lands, and
        roll anything unfinished into the next. After a few, the team’s velocity tells you how much fits.
      </EmptyState>
    </Card>
  );
}
