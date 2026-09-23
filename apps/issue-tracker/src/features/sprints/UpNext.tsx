import { ArrowRight, Plus, PushPin } from '@phosphor-icons/react';
import { Link, useNavigate } from 'react-router-dom';
import { SprintGlyph } from '../../glyphs';
import { plural } from '../../lib/format';
import type { SprintSummary, Team } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { dateRange, defaultSprintDates, fmtPts, scopePoints, timingLabel } from './sprint-utils';
import { useSprintDialogs } from './SprintDialogs';
import { SprintMenu } from './SprintMenu';

/** Planned sprints as a row of compact cards, ending in a tile to plan one more. */
export function UpNext({ sprints, team }: { sprints: SprintSummary[]; team: Team }) {
  const ws = useWorkspace();
  const dialogs = useSprintDialogs();
  const navigate = useNavigate();
  const teamSprints = ws.sprintsByTeam.get(team.id) ?? [];
  const next = defaultSprintDates(teamSprints, team.sprintDurationWeeks);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {sprints.map(s => {
        const pinned = ws.isPinned('Sprint', s.id);
        const open = () => navigate(`/sprint/${s.id}`);
        return (
          <div
            key={s.id}
            role="link"
            tabIndex={0}
            onClick={open}
            onKeyDown={e => e.key === 'Enter' && e.target === e.currentTarget && open()}
            className="group flex min-w-0 cursor-pointer flex-col rounded-lg border border-line bg-card p-4 shadow-hairline transition-shadow duration-150 hover:shadow-raised animate-rise-in"
          >
            <div className="flex h-6 items-center gap-2">
              <SprintGlyph status="upcoming" size={15} />
              <span className="truncate text-micro font-semibold uppercase text-ink-3">{timingLabel(s)}</span>
              {pinned && <PushPin size={12} weight="fill" className="shrink-0 text-ink-3" aria-label="Pinned" />}
              <SprintMenu sprint={s} issueCount={s.issues} className="-mr-1.5 ml-auto sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100 sm:data-[state=open]:opacity-100" />
            </div>
            <Link to={`/sprint/${s.id}`} onClick={e => e.stopPropagation()} className="mt-1.5 truncate font-display text-[23px] leading-7 text-ink">
              {s.name}
            </Link>
            <div className="tabular text-ui text-ink-2">{dateRange(s.startDate, s.endDate)}</div>
            <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-3">
              <div className="min-w-0 truncate text-meta text-ink-3">
                <span className="tabular text-title font-semibold text-ink">{fmtPts(scopePoints(s))}</span> pts · {plural(s.issues, 'issue')}
              </div>
              <span className="flex shrink-0 items-center gap-1 text-ui font-medium text-ink decoration-highlight decoration-2 underline-offset-4 group-hover:underline">
                Plan <ArrowRight size={13} weight="bold" />
              </span>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => dialogs.openEditor(team.id)}
        className="flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong px-4 py-4 text-center sm:min-h-[146px] text-ink-2 transition-colors hover:border-control hover:bg-card hover:text-ink"
      >
        <span className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-sunken text-ink">
          <Plus size={15} weight="bold" />
        </span>
        <span className="text-ui font-semibold">Plan a sprint</span>
        <span className="tabular text-meta text-ink-3">
          {dateRange(next.start, next.end)}
        </span>
      </button>
    </div>
  );
}
