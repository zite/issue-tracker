import { ArrowSquareOut, CheckCircle, Copy, GearSix, Prohibit, Sparkle, TrayArrowDown } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { addComment, aiFindDuplicates, setIssueRelation } from 'zitejs/api';
import { MarkdownView } from '../editor/MarkdownView';
import { Mark, StatusGlyph } from '../glyphs';
import { IssuePropertyPicker, type PickerKind } from '../issues/PropertyPicker';
import { PropertyValue } from '../issues/cells';
import { useAppActions } from '../lib/app-actions';
import { errorMessage } from '../lib/errors';
import { plural, timeAgo } from '../lib/format';
import { useHotkeys } from '../lib/hotkeys';
import { useIssueActions } from '../lib/mutations';
import { qk, useIssue, useIssues } from '../lib/queries';
import { useScope } from '../lib/scope';
import type { Issue } from '../lib/types';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useWorkspace } from '../lib/workspace';
import { IssueSearchPicker } from '../pickers/pickers';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '../ui/Dialog';
import { Textarea } from '../ui/Form';
import { Kbd } from '../ui/Kbd';
import { Card, EmptyState, ListSkeleton, PageHeader, Skeleton } from '../ui/Layout';
import { ProgressBar } from '../ui/Progress';
import { ScopeEyebrow } from '../shell/ScopeEyebrow';
import { IssuesTabs } from './IssuesPage';

function Similar({ issue }: { issue: Issue }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const { data, isPending } = useQuery({
    queryKey: ['intake-similar', issue.id],
    queryFn: () => aiFindDuplicates({ title: issue.title, teamId: issue.teamId ?? undefined }),
    staleTime: 5 * 60_000,
  });
  const matches = (data?.matches ?? []).filter(m => m.id !== issue.id);
  if (isPending) return <Skeleton className="h-10" />;
  if (!matches.length) {
    return (
      <div className="flex items-center gap-2 text-meta text-ink-3">
        <CheckCircle size={14} className="text-success" /> Nothing similar has been filed already.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-warning/30 bg-warning/[0.06]">
      <div className="flex items-center gap-1.5 px-3 pt-2 text-micro font-semibold uppercase text-warning">
        {data?.available ? <Sparkle size={12} weight="fill" /> : <Copy size={12} />} Possibly the same as
      </div>
      {matches.map(m => {
        const s = m.statusId ? ws.statusById.get(m.statusId) : undefined;
        return (
          <button key={m.id} type="button" onClick={() => app.openPeek(m.identifier)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-ui hover:bg-card/70">
            <StatusGlyph status={s} siblings={s?.teamId ? ws.statusesByTeam.get(s.teamId) : undefined} />
            <span className="font-mono text-[11px] text-ink-3">{m.identifier}</span>
            <span className="min-w-0 flex-1 truncate">{m.title}</span>
            <span className="hidden max-w-[40%] shrink-0 truncate text-meta text-ink-3 md:inline">{m.reason}</span>
          </button>
        );
      })}
    </div>
  );
}

function DeckCard({ issue }: { issue: Issue }) {
  const ws = useWorkspace();
  const { data } = useIssue(issue.identifier);
  const [kind, setKind] = useState<PickerKind | null>(null);
  const creator = issue.creatorId ? ws.memberById.get(issue.creatorId) : undefined;
  const team = issue.teamId ? ws.teamById.get(issue.teamId) : undefined;
  const pick = (k: PickerKind, label: string) => (
    <IssuePropertyPicker
      issues={[issue]}
      kind={k}
      open={kind === k}
      onOpenChange={o => setKind(o ? k : null)}
      trigger={
        <button type="button" className="inline-flex h-7 items-center gap-1.5 rounded-full bg-card px-2.5 text-meta shadow-hairline ring-1 ring-inset ring-line-strong hover:bg-hover">
          <span className="text-ink-3">{label}</span>
          <span className="flex items-center gap-1.5 font-medium text-ink"><PropertyValue issue={issue} kind={k} /></span>
        </button>
      }
    />
  );
  return (
    <Card className="relative overflow-hidden animate-deck-in">
      <div className="flex items-center gap-2 border-b border-dashed border-line-strong px-6 py-3 text-meta text-ink-2">
        <Avatar person={creator} size={22} />
        <span><span className="font-medium text-ink">{creator?.name ?? 'Someone'}</span> reported this {timeAgo(issue.openedAt)}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {team && <Mark icon={team.icon} color={team.color} name={team.name} size={16} />}
          <span className="font-mono text-[11px]">{issue.identifier}</span>
        </span>
      </div>
      <div className="px-6 pb-6 pt-5">
        <h2 className="font-display text-[32px] leading-[38px] text-ink text-balance">{issue.title}</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pick('priority', 'Priority')}
          {pick('type', 'Type')}
          {pick('labels', 'Labels')}
          {pick('assignee', 'Assignee')}
          {pick('project', 'Project')}
        </div>
        <div className="mt-5 max-h-[34vh] overflow-y-auto pr-1">
          {data ? (
            data.description ? <MarkdownView>{data.description}</MarkdownView> : <p className="text-body text-ink-3">No description — the title is all there is.</p>
          ) : (
            <div className="space-y-2"><Skeleton className="h-4" /><Skeleton className="h-4 w-5/6" /></div>
          )}
        </div>
        {data && data.comments.length > 0 && (
          <p className="mt-3 text-meta text-ink-3">{plural(data.comments.length, 'comment')} so far</p>
        )}
        <div className="mt-5">
          <Similar issue={issue} />
        </div>
      </div>
    </Card>
  );
}

/**
 * Intake is a review deck, not another list: one report at a time, with what
 * you need to decide — who sent it, what it says, whether it already exists —
 * and four decisions on the number keys. Nothing reaches a board without a person saying yes.
 */
export function IntakePage() {
  const ws = useWorkspace();
  const scope = useScope();
  const app = useAppActions();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const actions = useIssueActions();
  const team = scope.team;
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [decided, setDecided] = useState(0);

  const enabledTeams = team ? (team.intakeEnabled ? [team] : []) : ws.teams.filter(t => t.intakeEnabled);
  const { data, isPending } = useIssues({ teamIds: enabledTeams.length ? enabledTeams.map(t => t.id) : ['__none__'], statusTypes: ['intake'] }, 'oldest', { enabled: enabledTeams.length > 0 });
  const issues = useMemo(() => data?.issues ?? [], [data]);
  const current = issues.find(i => i.id === currentId) ?? null;
  const index = current ? issues.indexOf(current) : -1;

  useEffect(() => {
    if ((!currentId || !issues.some(i => i.id === currentId)) && issues.length) setCurrentId(issues[Math.min(Math.max(index, 0), issues.length - 1)].id);
  }, [issues, currentId]);

  useDocumentTitle(issues.length ? `Intake (${issues.length})` : 'Intake', team?.name ?? 'All teams');

  const statusesFor = (i: Issue) => (i.teamId ? ws.statusesByTeam.get(i.teamId) ?? [] : []);
  const advance = (issue: Issue) => {
    const pos = issues.indexOf(issue);
    const next = issues[pos + 1] ?? issues[pos - 1];
    setCurrentId(next?.id ?? null);
    setDecided(d => d + 1);
  };

  const accept = async (issue: Issue, type: 'backlog' | 'unstarted') => {
    const target = statusesFor(issue).find(s => s.type === type);
    if (!target) return;
    advance(issue);
    try {
      await actions.update(issue, { statusId: target.id }, { quiet: true });
    } catch (e) {
      toast.error(errorMessage(e, `Couldn’t accept ${issue.identifier}`));
      return;
    }
    toast.success(`${issue.identifier} accepted into ${target.name}`, { action: { label: 'Open', onClick: () => app.openPeek(issue.identifier) } });
    qc.invalidateQueries({ queryKey: qk.bootstrap });
  };

  const markDuplicate = async (issue: Issue, original: { id: string; identifier: string }) => {
    setBusy(true);
    try {
      await setIssueRelation({ issueId: issue.id, relatedIssueId: original.id, type: 'duplicate_of' });
      const canceled = statusesFor(issue).find(s => s.type === 'canceled');
      if (canceled) await actions.update(issue, { statusId: canceled.id }, { quiet: true });
      advance(issue);
      toast.success(`${issue.identifier} folded into ${original.identifier}`);
      qc.invalidateQueries({ queryKey: qk.bootstrap });
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t mark it as a duplicate'));
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    if (!current) return;
    const canceled = statusesFor(current).find(s => s.type === 'canceled');
    if (!canceled) return;
    setBusy(true);
    try {
      if (reason.trim()) await addComment({ issueId: current.id, body: `Declined in intake: ${reason.trim()}` });
      await actions.update(current, { statusId: canceled.id }, { quiet: true });
      toast.success(`Declined ${current.identifier}`);
      advance(current);
      setDeclineOpen(false);
      setReason('');
      qc.invalidateQueries({ queryKey: qk.bootstrap });
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t decline it'));
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    if (!issues.length) return;
    setCurrentId(issues[(index + 1) % issues.length].id);
  };

  useHotkeys({
    j: () => issues[index + 1] && setCurrentId(issues[index + 1].id),
    k: () => issues[index - 1] && setCurrentId(issues[index - 1].id),
    right: skip,
    '1': () => current && accept(current, 'backlog'),
    '2': () => current && accept(current, 'unstarted'),
    '3': () => current && setDuplicateOpen(true),
    '4': () => current && setDeclineOpen(true),
    'mod+enter': () => current && navigate(`/issue/${current.identifier}`),
    // While the issue is open in the sheet, keys belong to the sheet, not the deck behind it.
  }, { enabled: !app.peekId });

  const total = issues.length + decided;
  const oldest = issues[0]?.openedAt;

  if (enabledTeams.length === 0) {
    return (
      <>
        <PageHeader eyebrow={<ScopeEyebrow />} title="Issues" tabs={<IssuesTabs tab="intake" />} />
        <EmptyState
          icon={<TrayArrowDown size={22} weight="duotone" />}
          title={team ? `${team.name} doesn’t use intake` : 'No team uses intake'}
          actions={team ? <Button asChild variant="primary" leading={<GearSix size={14} />}><Link to={`/settings/teams/${team.id}`}>Turn it on in team settings</Link></Button> : undefined}
        >
          With intake on, anything filed from outside the team waits for a person to accept it before it reaches the backlog.
        </EmptyState>
      </>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        eyebrow={<ScopeEyebrow />}
        title="Issues"
        description={
          issues.length ? (
            <><span className="hl font-medium text-ink">{plural(issues.length, 'report')} waiting in intake</span>{oldest && <> · the oldest came in {timeAgo(oldest)}</>}</>
          ) : 'Nothing in intake is waiting for a decision.'
        }
        tabs={<IssuesTabs tab="intake" />}
      />
      {isPending ? (
        <div className="px-7 py-6"><ListSkeleton rows={6} /></div>
      ) : issues.length === 0 ? (
        <EmptyState icon={<CheckCircle size={22} weight="duotone" />} title="Intake is clear" actions={<Button asChild><Link to={scope.to('issues')}>Back to the issues</Link></Button>}>
          {decided > 0 ? `You worked through ${plural(decided, 'report')}. ` : ''}New reports filed into {team ? team.name : 'a team with intake on'} will wait here for a decision.
        </EmptyState>
      ) : (
        <div className="grid flex-1 gap-5 px-4 pb-10 pt-5 sm:px-7 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-4">
              <div className="mb-2 flex items-center justify-between text-micro font-semibold uppercase text-ink-3">
                <span>Queue</span>
                <span className="tabular">{decided} of {total} decided</span>
              </div>
              <ProgressBar value={decided} max={Math.max(1, total)} tone="highlight" height={4} className="mb-3" />
              <Card className="overflow-hidden">
                {issues.map(i => {
                  const creator = i.creatorId ? ws.memberById.get(i.creatorId) : undefined;
                  const active = i.id === currentId;
                  return (
                    <button key={i.id} type="button" onClick={() => setCurrentId(i.id)} className={cn('relative flex w-full gap-2.5 border-b border-line px-3.5 py-3 text-left last:border-b-0 transition-colors', active ? 'bg-highlight/30 dark:bg-highlight/[0.10]' : 'hover:bg-paper/80 dark:hover:bg-hover/50')}>
                      {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-ink" />}
                      <Avatar person={creator} size={22} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-ui font-medium text-ink">{i.title}</span>
                        <span className="mt-0.5 block text-meta text-ink-3"><span className="font-mono text-[11px]">{i.identifier}</span> · {timeAgo(i.openedAt)}</span>
                      </span>
                    </button>
                  );
                })}
              </Card>
            </div>
          </aside>

          <div className="mx-auto w-full max-w-[820px]">
            {current && (
              <>
                <div className="mb-3 flex items-center gap-2 text-meta text-ink-3 lg:hidden">
                  <span className="tabular shrink-0 whitespace-nowrap">{index + 1} of {issues.length}</span>
                  <ProgressBar value={decided} max={Math.max(1, total)} tone="highlight" height={4} />
                </div>
                <DeckCard key={current.id} issue={current} />
                <div className="sticky bottom-4 z-10 mt-4">
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-primary p-2 shadow-pop sm:grid-cols-4">
                    <button type="button" onClick={() => accept(current, 'backlog')} className="flex h-12 items-center justify-center gap-2 rounded-lg bg-highlight px-3 text-ui font-semibold text-highlight-ink transition hover:brightness-95">
                      <StatusGlyph status={statusesFor(current).find(s => s.type === 'backlog')} /> Accept <Kbd className="bg-card/60">1</Kbd>
                    </button>
                    <button type="button" onClick={() => accept(current, 'unstarted')} className="flex h-12 items-center justify-center gap-2 rounded-lg px-3 text-ui font-semibold text-on-primary transition hover:bg-on-primary/10">
                      Accept &amp; plan it <Kbd tone="inverse">2</Kbd>
                    </button>
                    <IssueSearchPicker
                      open={duplicateOpen}
                      onOpenChange={setDuplicateOpen}
                      excludeIds={[current.id]}
                      placeholder="It duplicates…"
                      align="end"
                      onSelect={original => markDuplicate(current, original)}
                      trigger={
                        <button type="button" disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-lg px-3 text-ui font-semibold text-on-primary transition hover:bg-on-primary/10">
                          <Copy size={15} /> Duplicate <Kbd tone="inverse">3</Kbd>
                        </button>
                      }
                    />
                    <button type="button" onClick={() => setDeclineOpen(true)} className="flex h-12 items-center justify-center gap-2 rounded-lg px-3 text-ui font-semibold text-on-primary transition hover:bg-on-primary/10">
                      <Prohibit size={15} /> Decline <Kbd tone="inverse">4</Kbd>
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-4 text-meta text-ink-3">
                    <button type="button" onClick={skip} className="flex items-center gap-1.5 hover:text-ink">Skip for now <Kbd keys="right" /></button>
                    <button type="button" onClick={() => app.openPeek(current.identifier)} className="flex items-center gap-1.5 hover:text-ink">Open the whole issue <ArrowSquareOut size={12} /></button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent size="sm">
          <DialogHeader title={`Decline ${current?.identifier ?? ''}?`} description="It moves to Canceled. Say why — whoever reported it follows the issue and will see your note." />
          <DialogBody>
            <Textarea autoFocus minRows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Working as intended — exports use the workspace time zone." onKeyDown={e => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && decline()} />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeclineOpen(false)}>Keep it</Button>
            <Button variant="danger" onClick={decline} loading={busy}>Decline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
