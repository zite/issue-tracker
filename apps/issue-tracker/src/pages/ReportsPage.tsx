import { ArrowClockwise, ChartBar, Plus } from '@phosphor-icons/react';
import { format, subWeeks } from 'date-fns';
import { Fragment, useCallback, useState, type ReactNode } from 'react';
import { AgeBreakdown, AgeSkeleton, StatusDistribution, StatusSkeleton } from '../features/reports/StatusAndAge';
import { BarListSkeleton, LabelBreakdown, PriorityBreakdown, TypeBreakdown } from '../features/reports/Breakdowns';
import { FlowTime, FlowTimeSkeleton } from '../features/reports/FlowTime';
import { Masthead, MastheadSkeleton } from '../features/reports/Masthead';
import { WINDOWS, type Analytics, type WindowWeeks } from '../features/reports/shared';
import { ThroughputChart, ThroughputSkeleton } from '../features/reports/ThroughputChart';
import { VelocityChart, VelocitySkeleton } from '../features/reports/VelocityChart';
import { WorkloadSkeleton, WorkloadTable } from '../features/reports/WorkloadTable';
import { useAppActions } from '../lib/app-actions';
import { useAnalytics } from '../lib/queries';
import { useScope } from '../lib/scope';
import type { Team } from '../lib/types';
import { useContextTeam } from '../lib/useContextTeam';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Form';
import { EmptyState, PageBody, PageHeader, Skeleton } from '../ui/Layout';
import { cn } from '../ui/cn';
import { ScopeEyebrow } from '../shell/ScopeEyebrow';

const STORAGE_KEY = 'issue-tracker:reports';

function readWeeks(): WindowWeeks {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { weeks?: unknown };
    return WINDOWS.includes(raw.weeks as WindowWeeks) ? (raw.weeks as WindowWeeks) : 12;
  } catch {
    return 12;
  }
}

function useWindowPref() {
  const [weeks, setState] = useState<WindowWeeks>(readWeeks);
  const setWeeks = useCallback((next: WindowWeeks) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ weeks: next }));
    } catch {
      /* storage may be unavailable */
    }
  }, []);
  return [weeks, setWeeks] as const;
}

/**
 * Reports: is the team finishing what it plans, is work piling up, how long
 * things take, and who is carrying it. The team comes from the scope in the
 * top bar and the window from the header, so every number on the page agrees.
 */
export function ReportsPage() {
  const { team } = useScope();
  const app = useAppActions();
  const [weeks, setWeeks] = useWindowPref();
  useContextTeam(team?.id);
  useDocumentTitle('Reports', team?.name ?? 'All teams');

  const { data, isPending, isError, refetch, isFetching, isPlaceholderData } = useAnalytics(team?.id, weeks);

  const now = new Date();
  const range = `${format(subWeeks(now, weeks), 'MMM d')} – ${format(now, 'MMM d')}`;
  // The team is already in the eyebrow. Each part keeps its words together, so a narrow header wraps between parts.
  const scopeLine = [`Last ${weeks} weeks`, range].map((part, i) => (
    <Fragment key={i}>
      {i > 0 && ' · '}
      <span className="whitespace-nowrap">{part}</span>
    </Fragment>
  ));
  const totalIssues = data ? data.byStatusType.reduce((s, r) => s + r.count, 0) : 0;
  const refreshing = isPlaceholderData && isFetching;

  return (
    <>
      <PageHeader
        eyebrow={<ScopeEyebrow />}
        title="Reports"
        description={scopeLine}
        actions={
          <div role="group" aria-label="Time window">
            <Segmented
              value={String(weeks)}
              onChange={v => setWeeks(Number(v) as WindowWeeks)}
              options={WINDOWS.map(w => ({ value: String(w), label: `${w}w`, title: `Last ${w} weeks` }))}
              className="tabular"
            />
          </div>
        }
      />
      <PageBody className="pb-10">
        {isError && !data ? (
          <EmptyState
            icon={<ChartBar size={22} weight="duotone" />}
            title="Reports couldn’t load"
            actions={
              <Button variant="secondary" leading={<ArrowClockwise size={14} weight="bold" />} onClick={() => refetch()}>
                Try again
              </Button>
            }
          >
            The numbers didn’t come back. It’s usually temporary.
          </EmptyState>
        ) : isPending || !data ? (
          <ReportSkeleton />
        ) : totalIssues === 0 ? (
          <EmptyState
            icon={<ChartBar size={22} weight="duotone" />}
            title="Nothing to measure yet"
            actions={
              <Button variant="primary" leading={<Plus size={14} weight="bold" />} onClick={() => app.openCreateIssue(team ? { teamId: team.id } : undefined)}>
                New issue
              </Button>
            }
          >
            {team ? `${team.name} has no issues yet. ` : ''}Velocity, throughput, flow time and workload fill in here as issues are created, planned into sprints and completed.
          </EmptyState>
        ) : (
          // While another team or window loads, the previous report stays put, dimmed — no layout jump.
          <div aria-busy={refreshing} className={cn('animate-rise-in transition-opacity duration-200', refreshing && 'pointer-events-none opacity-55')}>
            <Report data={data} team={team} weeks={weeks} />
          </div>
        )}
      </PageBody>
    </>
  );
}

function Report({ data, team, weeks }: { data: Analytics; team: Team | null; weeks: number }) {
  return (
    <div className="flex flex-col gap-4">
      <Masthead data={data} weeks={weeks} team={team} />
      <div className="grid gap-4 xl:grid-cols-3">
        <VelocityChart data={data} team={team} className="xl:col-span-2" />
        <FlowTime data={data} weeks={weeks} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ThroughputChart data={data} weeks={weeks} className="xl:col-span-2" />
        <Stack>
          <StatusDistribution data={data} team={team} />
          <AgeBreakdown data={data} />
        </Stack>
      </div>
      {/* Cards here end at their content: a short ledger shouldn't be padded out with an empty sheet. */}
      <div className="grid items-start gap-4 xl:grid-cols-3">
        <WorkloadTable data={data} weeks={weeks} className="xl:col-span-2" />
        <Stack>
          <PriorityBreakdown data={data} />
          <TypeBreakdown data={data} weeks={weeks} />
        </Stack>
      </div>
      <LabelBreakdown data={data} weeks={weeks} team={team} />
    </div>
  );
}

/** Two small cards beside a wide one on desktop; side by side on a tablet; stacked on a phone. */
function Stack({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-4 md:flex-row xl:flex-col [&>*]:min-w-0 [&>*]:flex-1">{children}</div>;
}

/** The loading state is the report's own shape, so nothing moves when the numbers arrive. */
function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading reports">
      <MastheadSkeleton />
      <div className="grid gap-4 xl:grid-cols-3">
        <VelocitySkeleton className="xl:col-span-2" />
        <FlowTimeSkeleton />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ThroughputSkeleton className="xl:col-span-2" />
        <Stack>
          <StatusSkeleton />
          <AgeSkeleton />
        </Stack>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <WorkloadSkeleton className="xl:col-span-2" />
        <Stack>
          <BarListSkeleton title="Open by priority" />
          <BarListSkeleton title="By type" rows={6} />
        </Stack>
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}
