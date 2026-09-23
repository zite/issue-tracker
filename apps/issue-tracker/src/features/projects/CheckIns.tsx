import { ArrowRight, ChatCircleText, DotsThree, ListChecks, PencilSimple, Sparkle, Trash } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { addCheckIn, aiDraftCheckIn } from 'zitejs/api';
import { MarkdownView } from '../../editor/MarkdownView';
import { RichEditor, type RichEditorHandle } from '../../editor/RichEditor';
import { HealthPill } from '../../glyphs';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { dateTime, plural, timeAgo } from '../../lib/format';
import { qk } from '../../lib/queries';
import type { ProjectDetail } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Chip';
import { cn } from '../../ui/cn';
import { Kbd } from '../../ui/Kbd';
import { Card, EmptyState, Skeleton } from '../../ui/Layout';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui/Menu';
import { Tooltip } from '../../ui/Tooltip';
import { HEALTH_STRIPE, HealthSegmented } from './bits';
import { asHealth, type Health } from './model';

type CheckIn = ProjectDetail['updates'][number];
type Project = ProjectDetail['project'];

function useRefreshProject(projectId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      qc.invalidateQueries({ queryKey: qk.projects }),
      qc.invalidateQueries({ queryKey: qk.bootstrap }),
    ]);
}

function readDraft(key: string): { body: string; health: Health } | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** A 3px stripe in the health's tone down a card's left edge. */
function Stripe({ health }: { health: string }) {
  return <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px]', HEALTH_STRIPE[health] ?? HEALTH_STRIPE.Unknown)} />;
}

/** Say how it's going: pick a health, write what moved. Posting sets the project's health. */
export function CheckInComposer({ project, autoFocus, audience }: { project: Project; autoFocus?: boolean; audience: number }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const refresh = useRefreshProject(project.id);
  const draftKey = `issue-tracker:checkin-draft:${project.id}`;
  const editor = useRef<RichEditorHandle>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const [initial] = useState(() => readDraft(draftKey));
  const [health, setHealth] = useState<Health>(initial?.health ?? asHealth(project.health));
  const [body, setBody] = useState(initial?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [factsOnly, setFactsOnly] = useState(false);

  // An unsent check-in survives a reload or a wander to another tab.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        if (body.trim()) localStorage.setItem(draftKey, JSON.stringify({ body, health }));
        else localStorage.removeItem(draftKey);
      } catch {
        /* storage may be unavailable */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [body, health, draftKey]);

  // An untouched composer follows the project's health (it moves when a check-in is posted, edited or deleted).
  const bodyRef = useRef(body);
  bodyRef.current = body;
  useEffect(() => {
    if (!bodyRef.current.trim()) setHealth(asHealth(project.health));
  }, [project.health]);

  useEffect(() => {
    if (!autoFocus) return;
    const t = window.setTimeout(() => {
      wrap.current?.scrollIntoView({ block: 'nearest' });
      editor.current?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [autoFocus]);

  const draft = async () => {
    const current = editor.current?.getMarkdown() ?? body;
    if (current.trim()) {
      const ok = await app.confirm({ title: 'Replace your draft?', description: 'The drafted check-in replaces what you’ve written so far.', confirmLabel: 'Replace draft' });
      if (!ok) return;
    }
    setDrafting(true);
    try {
      const d = await aiDraftCheckIn({ projectId: project.id });
      setHealth(d.health);
      setBody(d.body);
      editor.current?.setMarkdown(d.body);
      setFactsOnly(!d.available);
      if (d.available) toast.success('Drafted from recent work — read it through before posting');
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t draft a check-in'));
    } finally {
      setDrafting(false);
    }
  };

  const post = async () => {
    const md = (editor.current?.getMarkdown() ?? body).trim();
    if (!md || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await addCheckIn({ projectId: project.id, body: md, health });
      editor.current?.clear();
      setBody('');
      setFactsOnly(false);
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      await refresh();
      toast.success('Check-in posted', { description: res.notified ? `${plural(res.notified, 'person', 'people')} notified` : 'Nobody else to notify yet' });
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t post the check-in'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      ref={wrap}
      className="scroll-mt-4"
      onKeyDown={e => {
        // ⌘↵ posts from anywhere in the composer, not only the editor (which handles it itself).
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.defaultPrevented) {
          e.preventDefault();
          post();
        }
      }}
    >
      <Card className="transition-[border-color,box-shadow] focus-within:border-line-strong focus-within:shadow-raised">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="mr-1 text-ui font-semibold text-ink">How’s it going?</span>
          <HealthSegmented value={health} onChange={setHealth} />
        </div>
        <div className={cn('px-4 py-3 transition-opacity', drafting && 'pointer-events-none opacity-50')}>
          <RichEditor ref={editor} value={body} onChange={setBody} onSubmit={() => post()} placeholder="What shipped, what’s next, what’s in the way…" minHeight={112} />
        </div>
        {factsOnly && (
          <div className="mx-4 mb-3 flex items-start gap-2 rounded-md bg-sunken px-3 py-2 text-meta text-ink-2 animate-rise-in">
            <ListChecks size={14} className="mt-px shrink-0 text-ink-3" />
            <span>
              Started from the facts — progress, what shipped, what’s in flight and what’s overdue. Add the story: what it means and what’s next.{' '}
              <Link to="/settings/general" className="whitespace-nowrap font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">
                Connect AI
              </Link>{' '}
              to have Claude write the first draft.
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-paper/50 px-3 py-2.5 dark:bg-paper/30">
          <Tooltip content={ws.aiAvailable ? 'Claude drafts it from what moved since the last check-in' : 'Starts the check-in from what moved since the last one — progress, shipped, in flight, overdue'}>
            <Button
              variant="ghost"
              size="sm"
              leading={ws.aiAvailable ? <Sparkle size={14} weight="fill" className="text-violet" /> : <ListChecks size={14} />}
              onClick={draft}
              loading={drafting}
              disabled={busy}
            >
              {drafting ? 'Drafting…' : ws.aiAvailable ? 'Draft with AI' : 'Draft from activity'}
            </Button>
          </Tooltip>
          <span className="ml-auto hidden text-meta text-ink-3 md:inline">
            Sets health{audience > 0 ? ` · notifies ${plural(audience, 'person', 'people')}` : ''}
          </span>
          <Button variant="highlight" onClick={post} loading={busy} disabled={!body.trim() || drafting} className="max-md:ml-auto">
            Post check-in
            <Kbd keys="mod+enter" className="ml-0.5 hidden bg-transparent shadow-none ring-highlight-ink/25 sm:inline-flex" />
          </Button>
        </div>
      </Card>
    </div>
  );
}

function CheckInEditor({ projectId, checkIn, onDone }: { projectId: string; checkIn: CheckIn; onDone: () => void }) {
  const qc = useQueryClient();
  const refresh = useRefreshProject(projectId);
  const editor = useRef<RichEditorHandle>(null);
  const [health, setHealth] = useState<Health>(asHealth(checkIn.health));
  const [body, setBody] = useState(checkIn.body);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const save = async () => {
    const md = (editor.current?.getMarkdown() ?? body).trim();
    if (!md || busyRef.current) return;
    if (md === checkIn.body.trim() && health === checkIn.health) return onDone();
    busyRef.current = true;
    setBusy(true);
    const before = qc.getQueryData<ProjectDetail>(qk.project(projectId));
    qc.setQueryData<ProjectDetail>(qk.project(projectId), old => (old ? { ...old, updates: old.updates.map(u => (u.id === checkIn.id ? { ...u, body: md, health } : u)) } : old));
    onDone();
    try {
      await addCheckIn({ projectId, id: checkIn.id, body: md, health });
      // Health follows the latest check-in, so the list and header may have moved too.
      refresh();
    } catch (e) {
      if (before) qc.setQueryData(qk.project(projectId), before);
      toast.error(errorMessage(e, 'Couldn’t save the check-in'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      className="mt-3 rounded-md border border-line-strong bg-card animate-rise-in"
      onKeyDown={e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.defaultPrevented) {
          e.preventDefault();
          save();
        }
        if (e.key === 'Escape' && !e.defaultPrevented) onDone();
      }}
    >
      <div className="border-b border-line px-3 py-2">
        <HealthSegmented value={health} onChange={setHealth} />
      </div>
      <div className="px-3.5 py-3">
        <RichEditor ref={editor} value={body} onChange={setBody} onSubmit={() => save()} onEscape={onDone} autoFocus minHeight={80} />
      </div>
      <div className="flex items-center justify-end gap-1.5 border-t border-line px-3 py-2">
        <span className="mr-auto hidden text-meta text-ink-3 sm:inline">
          <Kbd keys="mod+enter" /> to save · <Kbd>Esc</Kbd> to cancel
        </span>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={save} disabled={!body.trim()} loading={busy}>
          Save
        </Button>
      </div>
    </div>
  );
}

function dayParts(iso: string | null) {
  if (!iso) return { day: '', month: '' };
  const d = parseISO(iso);
  return { day: format(d, 'd'), month: format(d, 'MMM') };
}

/** Check-ins newest first, on a dated rail. Authors can edit or delete their own. */
export function CheckInFeed({ project, checkIns }: { project: Project; checkIns: CheckIn[] }) {
  const ws = useWorkspace();
  const app = useAppActions();
  const qc = useQueryClient();
  const refresh = useRefreshProject(project.id);
  const [editing, setEditing] = useState<string | null>(null);

  const remove = async (c: CheckIn) => {
    const ok = await app.confirm({
      title: 'Delete this check-in?',
      description: 'It leaves the feed, and the project’s health goes back to what the previous check-in said.',
      confirmLabel: 'Delete check-in',
      destructive: true,
    });
    if (!ok) return;
    const before = qc.getQueryData<ProjectDetail>(qk.project(project.id));
    qc.setQueryData<ProjectDetail>(qk.project(project.id), old => (old ? { ...old, updates: old.updates.filter(x => x.id !== c.id) } : old));
    try {
      await addCheckIn({ projectId: project.id, id: c.id, remove: true });
      toast.success('Check-in deleted');
      refresh();
    } catch (e) {
      if (before) qc.setQueryData(qk.project(project.id), before);
      toast.error(errorMessage(e, 'Couldn’t delete the check-in'));
    }
  };

  if (checkIns.length === 0) {
    return (
      <EmptyState compact icon={<ChatCircleText size={22} weight="duotone" />} title="No check-ins yet">
        A short note every week or two on how it’s going keeps everyone aligned — and sets the project’s health on every list and roadmap.
      </EmptyState>
    );
  }

  return (
    <ol className="relative" aria-label="Check-ins">
      {checkIns.map((c, i) => {
        const author = c.authorId ? ws.memberById.get(c.authorId) : undefined;
        const mine = Boolean(c.authorId && c.authorId === ws.me.id);
        const { day, month } = dayParts(c.postedAt);
        return (
          <li key={c.id} className="group/ci relative flex gap-4 pb-5 last:pb-0 sm:gap-5">
            {i < checkIns.length - 1 && <span aria-hidden className="absolute -bottom-3 left-[27px] top-[68px] hidden w-px bg-line-strong sm:block" />}
            <div className="relative hidden w-14 shrink-0 flex-col items-center pt-3 sm:flex" aria-hidden>
              <span className={cn('flex h-14 w-14 flex-col items-center justify-center rounded-full border bg-card leading-none', i === 0 ? 'border-ink' : 'border-line-strong')}>
                <span className="text-micro font-semibold uppercase text-ink-3">{month}</span>
                <span className="tabular mt-0.5 font-display text-[22px] text-ink">{day}</span>
              </span>
            </div>
            <Card as="article" className="relative min-w-0 flex-1 overflow-hidden">
              <Stripe health={c.health} />
              <div className="px-5 pb-4 pt-3.5">
                <div className="flex min-h-7 flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Avatar person={author} size={24} />
                  {author ? (
                    <Link to={`/people/${author.id}`} className="text-ui font-semibold text-ink hover:underline">
                      {author.name}
                    </Link>
                  ) : (
                    <span className="text-ui font-semibold text-ink">Someone</span>
                  )}
                  <Tooltip content={dateTime(c.postedAt)}>
                    <span className="text-meta text-ink-3">{timeAgo(c.postedAt)}</span>
                  </Tooltip>
                  <HealthPill health={c.health} className="text-meta" />
                  {i === 0 && <Badge tone="highlight">Latest</Badge>}
                  {mine && editing !== c.id && (
                    <Menu>
                      <MenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="xs"
                          icon
                          aria-label="Check-in actions"
                          className="ml-auto opacity-0 focus-visible:opacity-100 group-hover/ci:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                        >
                          <DotsThree size={15} weight="bold" />
                        </Button>
                      </MenuTrigger>
                      <MenuContent align="end" className="w-44" onCloseAutoFocus={e => e.preventDefault()}>
                        <MenuItem icon={<PencilSimple size={15} />} onSelect={() => setEditing(c.id)}>
                          Edit
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem destructive icon={<Trash size={15} />} onSelect={() => remove(c)}>
                          Delete…
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  )}
                </div>
                {editing === c.id ? (
                  <CheckInEditor projectId={project.id} checkIn={c} onDone={() => setEditing(null)} />
                ) : (
                  <MarkdownView className="mt-2.5">{c.body}</MarkdownView>
                )}
              </div>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

/** The newest check-in on the overview — or a nudge to post the first. */
export function LatestCheckInCard({ project, checkIns }: { project: Project; checkIns: CheckIn[] }) {
  const ws = useWorkspace();
  const latest = checkIns[0];
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el) setOverflows(el.scrollHeight > 244);
  }, [latest?.id, latest?.body]);

  const compose = `/project/${project.id}/check-ins?compose=1`;

  if (!latest) {
    return (
      <Card className="relative overflow-hidden">
        <Stripe health="Unknown" />
        <div className="px-4 py-4 pl-5">
          <h2 className="text-title font-semibold text-ink">Latest check-in</h2>
          <p className="mt-1 text-ui text-ink-2">Nobody has checked in yet. A check-in sets the project’s health everywhere it’s shown.</p>
          <Button asChild variant="secondary" size="sm" className="mt-3">
            <Link to={compose}>Post the first check-in</Link>
          </Button>
        </div>
      </Card>
    );
  }

  const author = latest.authorId ? ws.memberById.get(latest.authorId) : undefined;
  const ageDays = latest.postedAt ? (Date.now() - new Date(latest.postedAt).getTime()) / 86_400_000 : 0;
  const stale = project.status === 'In Progress' && ageDays > 14;

  return (
    <Card className="relative overflow-hidden">
      <Stripe health={latest.health} />
      <div className="px-4 pb-4 pl-5 pt-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-title font-semibold text-ink">Latest check-in</h2>
          <Link to={`/project/${project.id}/check-ins`} className="ml-auto flex items-center gap-1 text-meta text-ink-2 hover:text-ink">
            All check-ins <ArrowRight size={11} />
          </Link>
        </div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <Avatar person={author} size={28} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-ui font-medium text-ink">{author?.name ?? 'Someone'}</span>
              <HealthPill health={latest.health} className="ml-auto text-meta" />
            </div>
            <Tooltip content={dateTime(latest.postedAt)}>
              <p className={cn('w-fit text-meta', stale ? 'font-medium text-warning' : 'text-ink-3')}>
                {timeAgo(latest.postedAt)}
                {stale ? ' · due for a new one' : ''}
              </p>
            </Tooltip>
          </div>
        </div>
        <div ref={bodyRef} className={cn('relative mt-2.5 overflow-hidden', !expanded && 'max-h-[240px]')}>
          <MarkdownView className="text-ui [&_h2]:text-[18px] [&_h2]:leading-6 [&_p]:leading-[1.55]">{latest.body}</MarkdownView>
          {!expanded && overflows && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card to-transparent" />}
        </div>
        {overflows && (
          <button type="button" onClick={() => setExpanded(e => !e)} className="mt-1 text-meta font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
        <Button asChild variant="secondary" size="sm" className="mt-3 w-full">
          <Link to={compose}>Post a check-in</Link>
        </Button>
      </div>
    </Card>
  );
}

export function CheckInsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="rounded-lg border border-line bg-card">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Skeleton className="h-6 w-64" />
        </div>
        <div className="space-y-2 px-4 py-4">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3.5 w-1/2" />
          <div className="h-12" />
        </div>
      </div>
      {[0, 1].map(i => (
        <div key={i} className="flex gap-5">
          <Skeleton className="hidden h-14 w-14 rounded-full sm:block" />
          <div className="flex-1 rounded-lg border border-line bg-card p-5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-16" />
            </div>
            <Skeleton className="mt-4 h-3.5 w-11/12" />
            <Skeleton className="mt-2 h-3.5 w-4/5" />
            <Skeleton className="mt-2 h-3.5 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
