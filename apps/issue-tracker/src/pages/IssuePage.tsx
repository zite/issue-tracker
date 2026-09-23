import { MagnifyingGlass } from '@phosphor-icons/react';
import { Link, useParams } from 'react-router-dom';
import { IssueDetailView } from '../issue/IssueDetail';
import { useAppActions } from '../lib/app-actions';
import { useContextTeam } from '../lib/useContextTeam';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useIssue } from '../lib/queries';
import { Button } from '../ui/Button';
import { EmptyState, Skeleton } from '../ui/Layout';

/** Shaped like the page it stands in for: breadcrumb bar, title and prose on the left, the facts card on the right. */
function IssuePageSkeleton() {
  return (
    <div className="flex min-h-full flex-col" aria-busy="true" aria-label="Loading issue">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
        <Skeleton className="h-[18px] w-[18px] rounded-xs" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-16 rounded-xs" />
      </div>
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-4 pb-24 pt-8 sm:px-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Skeleton className="h-9 w-4/5" />
          <Skeleton className="mt-3 h-9 w-2/5" />
          <div className="mt-8 space-y-3">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
          <Skeleton className="mt-12 h-5 w-32" />
          <Skeleton className="mt-3 h-24 w-full rounded-lg" />
        </div>
        <div className="hidden flex-col gap-3 lg:flex">
          <div className="rounded-lg border border-line bg-card p-4 shadow-hairline">
            <Skeleton className="h-2.5 w-12" />
            <div className="mt-4 space-y-4">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="grid grid-cols-[84px_1fr] items-center gap-2">
                  <Skeleton className="h-3 w-14" />
                  <div className="skeleton h-3" style={{ width: `${45 + ((i * 29) % 45)}%` }} />
                </div>
              ))}
            </div>
          </div>
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function IssuePage() {
  const { key = '' } = useParams();
  const app = useAppActions();
  const { data, isPending, isError } = useIssue(key);
  useContextTeam(data?.issue.teamId);
  useDocumentTitle(data ? `${data.issue.identifier} ${data.issue.title}` : isPending ? key.toUpperCase() : 'Issue not found');

  if (isPending) return <IssuePageSkeleton />;
  if (isError || !data) {
    return (
      <EmptyState
        icon={<MagnifyingGlass size={22} weight="duotone" />}
        title={`Couldn’t find ${key.toUpperCase()}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => app.openPalette(key.toUpperCase())}>Search issues</Button>
            <Button asChild variant="primary"><Link to="/home">Go home</Link></Button>
          </>
        }
      >
        It may have been deleted, or the link has a typo.
      </EmptyState>
    );
  }
  return <IssueDetailView key={data.issue.id} detail={data} mode="page" />;
}
