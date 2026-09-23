import { UserCircle } from '@phosphor-icons/react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ProfileHero } from '../features/people/ProfileHero';
import { StatTiles, type Stat } from '../features/people/StatTiles';
import { IssuesView } from '../issues/IssuesView';
import { useIssues } from '../lib/queries';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useMediaQuery } from '../lib/useMediaQuery';
import type { IssueFilters, StatusType } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import { Button } from '../ui/Button';
import { EmptyState, PageBody, PageHeader } from '../ui/Layout';
import { Tabs } from '../ui/Tabs';

const OPEN: StatusType[] = ['backlog', 'unstarted', 'started'];

/** Someone's work at a glance — what a lead opens before a 1:1. */
export function PersonPage() {
  const { memberId = '' } = useParams();
  const [params] = useSearchParams();
  const tab = params.get('tab') === 'created' ? 'created' : 'assigned';
  const ws = useWorkspace();
  const member = ws.memberById.get(memberId);
  const isMe = member?.id === ws.me.id;
  // On a phone the profile scrolls away above the list; wider, the list fills the space under it.
  const fill = useMediaQuery('(min-width: 640px)');
  useDocumentTitle(member ? (isMe ? 'Your profile' : member.name) : 'Person not found');

  const enabled = Boolean(member);
  const openF: IssueFilters = { assigneeIds: [memberId], statusTypes: OPEN };
  const flightF: IssueFilters = { assigneeIds: [memberId], statusTypes: ['started'] };
  const doneF: IssueFilters = { assigneeIds: [memberId], statusTypes: ['completed'], completedWithinDays: 14 };
  // Someone's intake submissions are still their open requests, even before a team accepts them.
  const createdF: IssueFilters = { creatorIds: [memberId], statusTypes: ['intake', ...OPEN] };
  const open = useIssues(openF, 'priority', { enabled, limit: 1 });
  const flight = useIssues(flightF, 'priority', { enabled, limit: 1 });
  const done = useIssues(doneF, 'updated', { enabled, limit: 1 });
  const createdOpen = useIssues(createdF, 'priority', { enabled, limit: 1 });

  if (!member) {
    return (
      <>
        <PageHeader title="Person not found" />
        <PageBody>
          <EmptyState
            icon={<UserCircle size={22} weight="duotone" />}
            title="No one here"
            actions={
              <Button variant="secondary" asChild>
                <Link to="/settings/members">See everyone</Link>
              </Button>
            }
          >
            This person isn’t in the workspace, or the link is wrong.
          </EmptyState>
        </PageBody>
      </>
    );
  }

  const teams = member.teamIds.map(id => ws.teamById.get(id)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  const first = member.name.split(' ')[0];
  const who = isMe ? 'you' : first;
  const stats: Stat[] = [
    { label: 'Open', value: open.data?.total, loading: open.isLoading, hint: 'Not done yet', filters: openF, listTitle: `Open · ${member.name}` },
    { label: 'In flight', value: flight.data?.total, loading: flight.isLoading, hint: 'Underway now', filters: flightF, listTitle: `In flight · ${member.name}` },
    { label: 'Done', unit: '14d', value: done.data?.total, loading: done.isLoading, hint: 'Past two weeks', filters: doneF, listTitle: `Done in 14 days · ${member.name}` },
  ];
  const base = `/people/${member.id}`;
  const canAssign = member.status !== 'Deactivated';

  return (
    <div className={fill ? 'flex h-full min-h-0 flex-col' : 'flex flex-col pb-4'}>
      <header className="px-4 pt-6 sm:px-7 sm:pt-9">
        <ProfileHero
          member={member}
          teams={teams}
          isMe={isMe}
          aside={<StatTiles stats={stats} className="w-full shrink-0 lg:w-[440px]" />}
        />
        <div className="mt-6 border-b border-line sm:mt-7">
          <Tabs
            value={tab}
            items={[
              { value: 'assigned', label: 'Assigned', count: open.data?.total, to: base, title: `Open issues assigned to ${who}` },
              { value: 'created', label: 'Created', count: createdOpen.data?.total, to: `${base}?tab=created`, title: `Open issues ${who} created` },
            ]}
          />
        </div>
      </header>
      <div className={fill ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-col'}>
        <IssuesView
          key={`${member.id}:${tab}`}
          surfaceKey={`person:${member.id}:${tab}`}
          baseFilters={tab === 'assigned' ? { assigneeIds: [member.id] } : { creatorIds: [member.id] }}
          lockedFields={tab === 'assigned' ? ['assigneeIds'] : ['creatorIds']}
          defaults={{ grouping: 'status', ordering: 'priority', completed: 'week' }}
          createDefaults={tab === 'assigned' && canAssign ? { assigneeId: member.id } : undefined}
          hideSaveView
          emptyState={
            <EmptyState icon={<UserCircle size={22} weight="duotone" />} title={tab === 'assigned' ? 'Nothing assigned' : 'Nothing created yet'} compact>
              {tab === 'assigned'
                ? `Issues assigned to ${who} will show up here, with anything finished this week.`
                : `Issues ${who} ${isMe ? 'create' : 'creates'} will show up here.`}
            </EmptyState>
          }
          fill={fill}
        />
      </div>
    </div>
  );
}
