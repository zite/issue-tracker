import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ArrowElbowLeftUp, CalendarBlank, CaretDown, CircleNotch, Copy, Diamond, FileText, Hash, Shapes, Sparkle, Tag, X,
} from '@phosphor-icons/react';
import { addDays, nextDay, nextMonday, type Day } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { aiDraftIssue, aiFindDuplicates, type AiFindDuplicatesOutputType } from 'zitejs/api';
import { RichEditor, type RichEditorHandle } from '../editor/RichEditor';
import { useAutoHeight } from '../issue/useAutoHeight';
import { Mark, PriorityGlyph, SprintGlyph, StatusGlyph, TypeGlyph } from '../glyphs';
import type { CreateDefaults } from '../lib/app-actions';
import { estimateLabel, PRIORITIES, PRIORITY_LABEL } from '../lib/constants';
import { errorMessage } from '../lib/errors';
import { dueLabel, toDayString } from '../lib/format';
import { useIssueActions } from '../lib/mutations';
import type { IssueType } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import {
  AssigneePicker, DatePicker, EstimatePicker, IssueSearchPicker, LabelPicker, MilestonePicker, PriorityPicker, ProjectPicker, SprintPicker, StatusPicker, TeamPicker, TypePicker,
} from '../pickers/pickers';
import { Avatar, Unassigned } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Swatch } from '../ui/Chip';
import { cn } from '../ui/cn';
import { Dialog, DialogContent } from '../ui/Dialog';
import { Switch } from '../ui/Form';
import { Kbd } from '../ui/Kbd';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import { useAppActions } from '../lib/app-actions';

type Form = {
  teamId: string;
  title: string;
  description: string;
  statusId: string | null;
  priority: number;
  assigneeId: string | null;
  labelIds: string[];
  issueType: IssueType;
  projectId: string | null;
  milestoneId: string | null;
  sprintId: string | null;
  estimate: number | null;
  dueDate: string | null;
  parent: { id: string; identifier: string; title: string } | null;
};

const chip = 'inline-flex h-7 max-w-[220px] items-center gap-1.5 rounded-full bg-card px-2.5 text-meta font-medium text-ink shadow-hairline ring-1 ring-inset ring-line-strong transition-colors hover:bg-hover data-[state=open]:bg-hover';
const unset = 'text-ink-3 font-normal';

// ---- Quick-capture tokens ------------------------------------------------------

type Token = { sigil: string; query: string; start: number; end: number };
type Suggestion = { key: string; label: string; icon: ReactNode; hint?: string; apply: (f: Form) => Partial<Form> };

const TOKEN = /(^|\s)([@#!+^])([^\s@#!+^]*)$/;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function detectToken(text: string, caret: number): Token | null {
  const m = TOKEN.exec(text.slice(0, caret));
  if (!m) return null;
  const start = caret - m[3].length - 1;
  return { sigil: m[2], query: m[3].toLowerCase(), start, end: caret };
}

/**
 * The new-issue composer. Besides the usual property chips, the title
 * understands quick-capture tokens — `@name` assigns, `#label` labels,
 * `!high` sets priority, `+project` files it, `^fri` sets a due date — so a
 * fully described issue can be written in one line without leaving the keyboard.
 */
export function CreateIssueDialog({ open, onOpenChange, defaults, contextTeamId }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults: CreateDefaults | null;
  contextTeamId: string | null;
}) {
  const ws = useWorkspace();
  const app = useAppActions();
  const actions = useIssueActions();
  const location = useLocation();
  const editor = useRef<RichEditorHandle>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const fallbackTeam = contextTeamId ?? ws.myTeams[0]?.id ?? ws.teams[0]?.id ?? '';

  const blank = (teamId: string): Form => ({
    teamId, title: '', description: '', statusId: null, priority: 0, assigneeId: null, labelIds: [], issueType: 'Task',
    projectId: null, milestoneId: null, sprintId: null, estimate: null, dueDate: null, parent: null,
  });
  const [form, setForm] = useState<Form>(() => blank(fallbackTeam));
  const [createMore, setCreateMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [drafting, setDrafting] = useState(false);
  const [dupes, setDupes] = useState<AiFindDuplicatesOutputType['matches']>([]);
  const [token, setToken] = useState<Token | null>(null);
  const [active, setActive] = useState(0);
  const [needsTitle, setNeedsTitle] = useState(false);
  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }));

  // Opening with explicit defaults starts a fresh draft; opening bare keeps an unsent one.
  useEffect(() => {
    if (!open) return;
    const hasDraft = form.title.trim() || form.description.trim();
    const hasDefaults = defaults && Object.keys(defaults).length > 0;
    if (hasDraft && !hasDefaults) {
      window.setTimeout(() => titleRef.current?.focus(), 30);
      return;
    }
    // Opened bare (C, the top bar) on a sprint or project page, the new issue belongs there.
    const routeDefaults: Partial<Form> = {};
    if (!hasDefaults) {
      const [, section, id] = location.pathname.split('/');
      const sprint = section === 'sprint' && id ? ws.sprintById.get(id) : undefined;
      const project = section === 'project' && id ? ws.projectById.get(id) : undefined;
      if (sprint && sprint.status !== 'completed') Object.assign(routeDefaults, { sprintId: sprint.id, teamId: sprint.teamId ?? undefined });
      if (project) Object.assign(routeDefaults, { projectId: project.id, teamId: project.teamId ?? undefined });
    }
    const teamId = defaults?.teamId ?? routeDefaults.teamId ?? contextTeamId ?? fallbackTeam;
    const next: Form = { ...blank(teamId), ...routeDefaults, teamId };
    if (defaults) {
      Object.assign(next, {
        title: defaults.title ?? '',
        description: defaults.description ?? '',
        statusId: defaults.statusId ?? null,
        priority: defaults.priority ?? 0,
        assigneeId: defaults.assigneeId ?? null,
        labelIds: defaults.labelIds ?? [],
        issueType: (defaults.issueType as IssueType) ?? 'Task',
        projectId: defaults.projectId ?? null,
        milestoneId: defaults.milestoneId ?? null,
        sprintId: defaults.sprintId ?? null,
        estimate: defaults.estimate ?? null,
        dueDate: defaults.dueDate ?? null,
      });
      next.parent = defaults.parent ?? null;
    }
    setForm(next);
    editor.current?.setMarkdown(next.description);
    setDupes([]);
    setToken(null);
    setNeedsTitle(false);
    window.setTimeout(() => titleRef.current?.focus(), 30);
  }, [open]);

  const team = ws.teamById.get(form.teamId);
  const statuses = ws.statusesByTeam.get(form.teamId) ?? [];
  const status = form.statusId ? ws.statusById.get(form.statusId) : statuses.find(s => s.type === 'backlog') ?? statuses.find(s => s.type === 'unstarted');
  const assignee = form.assigneeId ? ws.memberById.get(form.assigneeId) : undefined;
  const project = form.projectId ? ws.projectById.get(form.projectId) : undefined;
  const milestone = form.milestoneId ? ws.milestoneById.get(form.milestoneId) : undefined;
  const sprint = form.sprintId ? ws.sprintById.get(form.sprintId) : undefined;
  const labels = form.labelIds.map(id => ws.labelById.get(id)).filter(Boolean);
  const templates = useMemo(() => ws.templates.filter(t => !t.teamId || t.teamId === form.teamId), [ws.templates, form.teamId]);
  const due = dueLabel(form.dueDate);

  const changeTeam = (teamId: string) => {
    setForm(f => ({
      ...f,
      teamId,
      statusId: null,
      sprintId: null,
      labelIds: f.labelIds.filter(id => {
        const l = ws.labelById.get(id);
        return l && (!l.teamId || l.teamId === teamId);
      }),
    }));
  };

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!token) return [];
    // Accent-insensitive, so "@tomas" finds Tomás.
    const fold = (t: string | null | undefined) => (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = fold(token.query);
    const has = (s: string | null | undefined) => fold(s).includes(q);
    switch (token.sigil) {
      case '@':
        return ws.membersFor(form.teamId)
          .filter(m => !q || fold(m.name).split(' ').some(p => p.startsWith(q)) || fold(m.email).startsWith(q) || (q === 'me' && m.id === ws.me.id))
          .slice(0, 6)
          .map(m => ({ key: m.id, label: m.id === ws.me.id ? `${m.name} (you)` : m.name, icon: <Avatar person={m} size={18} />, hint: 'Assign', apply: () => ({ assigneeId: m.id }) }));
      case '#':
        return ws.labelsFor(form.teamId).filter(l => !q || has(l.name)).slice(0, 6)
          .map(l => ({ key: l.id, label: l.name, icon: <Swatch color={l.color} />, hint: 'Label', apply: f => ({ labelIds: [...new Set([...f.labelIds, l.id])] }) }));
      case '!':
        return PRIORITIES.filter(p => !q || p.label.toLowerCase().startsWith(q) || p.shortcut === q)
          .map(p => ({ key: String(p.value), label: p.label, icon: <PriorityGlyph priority={p.value} />, hint: 'Priority', apply: () => ({ priority: p.value }) }));
      case '+':
        return ws.projects.filter(p => !['Completed', 'Canceled'].includes(p.status) && (!q || has(p.name))).slice(0, 6)
          .map(p => ({ key: p.id, label: p.name, icon: <Mark icon={p.icon} color={p.color} name={p.name} size={16} />, hint: 'Project', apply: () => ({ projectId: p.id, milestoneId: null }) }));
      case '^': {
        // "^" is when: the team's current and next sprint, then due dates.
        const out: Suggestion[] = [];
        if (team?.sprintsEnabled) {
          const current = ws.activeSprint(form.teamId);
          const next = ws.upcomingSprint(form.teamId);
          for (const [word, sp] of [['current sprint', current], ['next sprint', next]] as const) {
            if (!sp) continue;
            if (q && !word.split(' ').some(w => w.startsWith(q)) && !sp.name.toLowerCase().includes(q)) continue;
            out.push({ key: sp.id, label: `${word[0].toUpperCase()}${word.slice(1)}`, icon: <SprintGlyph status={sp.status} progress={0.5} />, hint: sp.name, apply: () => ({ sprintId: sp.id }) });
          }
        }
        const today = new Date();
        const options: Array<[string, Date]> = [
          ['today', today], ['tomorrow', addDays(today, 1)], ['next week', nextMonday(today)], ['in two weeks', addDays(today, 14)],
          ...WEEKDAYS.map((d, i) => [d, nextDay(today, i as Day)] as [string, Date]),
        ];
        out.push(
          ...options
            .filter(([label]) => !q || label.split(' ').some(w => w.startsWith(q)))
            .slice(0, 6 - out.length)
            .map(([label, date]) => ({ key: label, label: `Due ${label}`, icon: <CalendarBlank size={15} className="text-ink-3" />, hint: dueLabel(toDayString(date))?.label, apply: () => ({ dueDate: toDayString(date) }) })),
        );
        return out;
      }
      default:
        return [];
    }
  }, [token, ws, form.teamId, team?.sprintsEnabled]);

  const applySuggestion = (s: Suggestion) => {
    if (!token) return;
    setForm(f => {
      const title = `${f.title.slice(0, token.start)}${f.title.slice(token.end)}`.replace(/\s{2,}/g, ' ');
      return { ...f, ...s.apply(f), title };
    });
    const caret = token.start;
    setToken(null);
    window.setTimeout(() => {
      titleRef.current?.focus();
      titleRef.current?.setSelectionRange(caret, caret);
    }, 0);
  };

  // Duplicate detection while typing: debounced, and silent unless it finds something.
  useEffect(() => {
    if (!open) return;
    const title = form.title.trim();
    if (title.length < 8) {
      setDupes([]);
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        const res = await aiFindDuplicates({ title, description: form.description.slice(0, 2000), teamId: form.teamId });
        setDupes(res.matches);
      } catch {
        /* advisory only — never block creating */
      }
    }, 900);
    return () => window.clearTimeout(t);
  }, [form.title, form.teamId, open]);

  const applyTemplate = (id: string) => {
    const t = ws.templates.find(x => x.id === id);
    if (!t) return;
    // A template never throws away what's already written: its outline goes after it.
    const current = (editor.current?.getMarkdown() ?? form.description).trim();
    const description = t.description ? (current ? `${current}\n\n${t.description}` : t.description) : current;
    setForm(f => ({
      ...f,
      title: f.title || t.title || '',
      description,
      priority: t.priority || f.priority,
      estimate: t.estimate ?? f.estimate,
      issueType: (t.issueType as IssueType) ?? f.issueType,
      labelIds: [...new Set([...f.labelIds, ...t.labelIds.filter(l => ws.labelById.has(l))])],
    }));
    editor.current?.setMarkdown(description);
    window.setTimeout(() => titleRef.current?.focus(), 0);
  };

  const draft = async () => {
    const notes = (editor.current?.getMarkdown() ?? form.description).trim();
    const text = [form.title.trim(), notes].filter(Boolean).join('\n\n').trim();
    if (text.length < 3) {
      toast.info('Jot a rough note in the title or description first, then Draft with AI shapes it into an issue.');
      titleRef.current?.focus();
      return;
    }
    if (!ws.aiAvailable) {
      // Without AI, the promised fallback: the first line of the notes becomes the title.
      if (!form.title.trim() && notes) {
        const [first, ...rest] = notes.split('\n');
        const title = first.replace(/^[#>*\-\s]+|\[[ x]\]\s*/gi, '').trim().slice(0, 200);
        const description = rest.join('\n').trim();
        setForm(f => ({ ...f, title, description }));
        editor.current?.setMarkdown(description);
        toast.info('Used the first line as the title. Connect AI in Settings › General for full drafts.');
      } else {
        toast.info('AI isn’t connected, so there’s nothing more to draft. Connect it in Settings › General.');
      }
      return;
    }
    setDrafting(true);
    try {
      const d = await aiDraftIssue({ text, teamId: form.teamId });
      setForm(f => ({
        ...f,
        title: d.title,
        description: d.description,
        priority: d.priority || f.priority,
        issueType: (d.issueType as IssueType) || f.issueType,
        labelIds: [...new Set([...f.labelIds, ...d.labelIds])],
        estimate: d.estimate ?? f.estimate,
        assigneeId: d.assigneeId ?? f.assigneeId,
        dueDate: d.dueDate ?? f.dueDate,
      }));
      editor.current?.setMarkdown(d.description);
      toast.success('Drafted — give it a read before filing');
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t draft this issue'));
    } finally {
      setDrafting(false);
    }
  };

  const submit = async () => {
    const title = form.title.trim();
    if (!title) {
      setNeedsTitle(true);
      titleRef.current?.focus();
      return;
    }
    // A ref, not `busy`: two ⌘↵ handlers can run in the same tick, before the state update lands.
    if (!form.teamId || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const description = editor.current?.getMarkdown() ?? form.description;
      const issue = await actions.create({
        teamId: form.teamId, title, description: description || null, statusId: form.statusId, priority: form.priority,
        assigneeId: form.assigneeId, labelIds: form.labelIds, issueType: form.issueType, projectId: form.projectId,
        milestoneId: form.milestoneId, sprintId: form.sprintId, estimate: form.estimate, dueDate: form.dueDate,
        parentId: form.parent?.id ?? null,
      });
      toast.success(`Filed ${issue.identifier}`, {
        description: issue.title,
        action: { label: 'Open', onClick: () => app.openPeek(issue.identifier) },
      });
      if (createMore) {
        setForm(f => ({ ...f, title: '', description: '' }));
        editor.current?.clear();
        setDupes([]);
        window.setTimeout(() => titleRef.current?.focus(), 0);
      } else {
        setForm(blank(form.teamId));
        editor.current?.clear();
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t create the issue'));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const autoHeight = useAutoHeight(form.title);
  const setTitleEl = useCallback((el: HTMLTextAreaElement | null) => {
    titleRef.current = el;
    autoHeight(el);
  }, [autoHeight]);

  const showSuggestions = token && suggestions.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" label="New issue" className="overflow-visible">
        <div
          className="flex min-h-0 flex-1 flex-col"
          onKeyDown={e => {
            // The description editor submits on its own ⌘↵ and marks the event handled.
            if (e.defaultPrevented) return;
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        >
          <div className="flex items-center gap-2 px-5 pt-4">
            <TeamPicker
              value={form.teamId}
              onChange={changeTeam}
              trigger={
                <button type="button" className={cn(chip, 'h-6 gap-1 pl-1 pr-2')}>
                  <Mark icon={team?.icon} color={team?.color} name={team?.name} size={16} className="rounded-full" />
                  <span className="font-mono text-[11px]">{team?.key}</span>
                  <CaretDown size={10} className="text-ink-3" />
                </button>
              }
            />
            <span className="text-ui font-medium text-ink-2">New issue</span>
            {form.parent && (
              <span className="flex min-w-0 items-center gap-1 text-meta text-ink-3">
                · part of <span className="font-mono text-[11.5px] text-ink">{form.parent.identifier}</span>
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              {templates.length > 0 && (
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="sm" leading={<FileText size={14} />} trailing={<CaretDown size={10} />}>
                      Template
                    </Button>
                  </MenuTrigger>
                  <MenuContent align="end" className="w-60">
                    <MenuLabel>Start from</MenuLabel>
                    {templates.map(t => (
                      <MenuItem key={t.id} icon={<TypeGlyph type={t.issueType} />} onSelect={() => applyTemplate(t.id)}>
                        {t.name}
                      </MenuItem>
                    ))}
                  </MenuContent>
                </Menu>
              )}
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="sm" icon aria-label="Close">
                  <X size={15} />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className={cn('px-5 pt-3 transition-opacity', drafting && 'pointer-events-none opacity-60')}>
            <div className="relative">
            <textarea
              ref={setTitleEl}
              value={form.title}
              rows={1}
              onChange={e => {
                const value = e.target.value.replace(/\n/g, ' ');
                set({ title: value });
                if (value.trim()) setNeedsTitle(false);
                setToken(detectToken(value, e.target.selectionStart));
                setActive(0);
              }}
              onClick={e => setToken(detectToken(form.title, (e.target as HTMLTextAreaElement).selectionStart))}
              onBlur={() => window.setTimeout(() => setToken(null), 120)}
              onKeyDown={e => {
                if (showSuggestions) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % suggestions.length); return; }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + suggestions.length) % suggestions.length); return; }
                  if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') { e.preventDefault(); applySuggestion(suggestions[Math.min(active, suggestions.length - 1)]); return; }
                  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setToken(null); return; }
                }
                if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  editor.current?.focus();
                }
              }}
              placeholder="What needs doing?"
              aria-label="Issue title"
              aria-invalid={needsTitle || undefined}
              className="w-full resize-none overflow-hidden bg-transparent font-display text-[28px] leading-[34px] text-ink outline-none placeholder:text-ink-3"
            />
            {showSuggestions && (
              <div role="listbox" className="absolute left-0 top-full z-10 mt-1 w-80 overflow-hidden rounded-lg border border-line bg-card p-1 shadow-pop animate-pop-in">
                {suggestions.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={e => { e.preventDefault(); applySuggestion(s); }}
                    onMouseEnter={() => setActive(i)}
                    className={cn('flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-left text-ui', i === active && 'bg-sunken')}
                  >
                    <span className="flex w-4 justify-center">{s.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    {s.hint && <span className="shrink-0 text-meta text-ink-3">{s.hint}</span>}
                  </button>
                ))}
              </div>
            )}
            </div>
            {needsTitle ? (
              <p className="mt-1 text-meta text-danger" role="alert">Give it a title first — one line is enough.</p>
            ) : (
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-3" aria-label="Quick add in the title">
                {([['@', 'assign'], ['#', 'label'], ['!', 'priority'], ['+', 'project'], ['^', team?.sprintsEnabled ? 'sprint or due' : 'due date']] as const).map(([sigil, word]) => (
                  <span key={sigil} className="inline-flex items-center gap-1 whitespace-nowrap">
                    <Kbd className="min-w-[16px] px-0.5">{sigil}</Kbd>
                    {word}
                  </span>
                ))}
              </p>
            )}
            <div className="mt-3 max-h-[36vh] overflow-y-auto pb-2">
              <RichEditor
                ref={editor}
                value={form.description}
                onChange={md => setForm(f => ({ ...f, description: md }))}
                onSubmit={() => submit()}
                placeholder={ws.aiAvailable ? 'Add detail — or jot rough notes and let Draft with AI shape them.' : 'Add detail — what’s happening, why it matters, what done looks like.'}
                minHeight={96}
              />
            </div>
          </div>

          {dupes.length > 0 && (
            <div className="mx-5 mb-3 rounded-lg border border-warning/30 bg-warning/[0.07] p-2 animate-rise-in">
              <div className="flex items-center gap-1.5 pb-1 pl-1.5 text-micro font-semibold uppercase text-warning">
                <Copy size={12} /> Might already exist
                <span className="font-normal normal-case text-ink-3">· open one instead, or file anyway</span>
                <button type="button" onClick={() => setDupes([])} aria-label="Dismiss possible duplicates" className="ml-auto rounded-xs p-1 text-ink-3 hover:bg-card hover:text-ink">
                  <X size={12} />
                </button>
              </div>
              {dupes.map(d => {
                const s = d.statusId ? ws.statusById.get(d.statusId) : undefined;
                return (
                  <button key={d.id} type="button" onClick={() => { onOpenChange(false); app.openPeek(d.identifier); }} className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1.5 text-left text-ui hover:bg-card/70">
                    <StatusGlyph status={s} siblings={s?.teamId ? ws.statusesByTeam.get(s.teamId) : undefined} />
                    <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-ink-3">{d.identifier}</span>
                    <span className="min-w-0 truncate">{d.title}</span>
                    <span className="ml-auto hidden shrink-0 text-meta text-ink-3 md:inline">{d.reason}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 px-5 pb-4">
            <StatusPicker teamId={form.teamId} value={status?.id ?? null} onChange={v => set({ statusId: v })} trigger={<button type="button" className={chip}><StatusGlyph status={status} siblings={statuses} />{status?.name ?? 'Status'}</button>} />
            <PriorityPicker value={form.priority} onChange={v => set({ priority: v })} trigger={<button type="button" className={chip}><PriorityGlyph priority={form.priority} /><span className={cn(!form.priority && unset)}>{form.priority ? PRIORITY_LABEL[form.priority] : 'Priority'}</span></button>} />
            <AssigneePicker teamId={form.teamId} value={form.assigneeId} onChange={v => set({ assigneeId: v })} trigger={<button type="button" className={chip}>{assignee ? <Avatar person={assignee} size={16} /> : <Unassigned size={16} />}<span className={cn('truncate', !assignee && unset)}>{assignee?.name ?? 'Assignee'}</span></button>} />
            <LabelPicker teamId={form.teamId} value={form.labelIds} onChange={v => set({ labelIds: v })} trigger={<button type="button" className={chip}>{labels.length ? <span className="flex gap-0.5">{labels.slice(0, 3).map(l => <Swatch key={l!.id} color={l!.color} size={9} />)}</span> : <Tag size={14} className="text-ink-3" />}<span className={cn('truncate', !labels.length && unset)}>{labels.length ? (labels.length > 2 ? `${labels.length} labels` : labels.map(l => l!.name).join(', ')) : 'Labels'}</span></button>} />
            <TypePicker value={form.issueType} onChange={v => v && set({ issueType: v as IssueType })} trigger={<button type="button" className={chip}><TypeGlyph type={form.issueType} />{form.issueType}</button>} />
            <ProjectPicker teamId={form.teamId} value={form.projectId} onChange={v => set({ projectId: v, milestoneId: null })} trigger={<button type="button" className={chip}>{project ? <Mark icon={project.icon} color={project.color} name={project.name} size={16} /> : <Shapes size={14} className="text-ink-3" />}<span className={cn('truncate', !project && unset)}>{project?.name ?? 'Project'}</span></button>} />
            {project && (ws.milestonesByProject.get(project.id)?.length ?? 0) > 0 && (
              <MilestonePicker projectId={project.id} value={form.milestoneId} onChange={v => set({ milestoneId: v })} trigger={<button type="button" className={chip}><Diamond size={13} className="text-ink-3" /><span className={cn('truncate', !milestone && unset)}>{milestone?.name ?? 'Milestone'}</span></button>} />
            )}
            {team?.sprintsEnabled && (
              <SprintPicker teamId={form.teamId} value={form.sprintId} onChange={v => set({ sprintId: v })} trigger={<button type="button" className={chip}><SprintGlyph status={sprint?.status ?? 'upcoming'} progress={0.5} /><span className={cn(!sprint && unset)}>{sprint?.name ?? 'Sprint'}</span></button>} />
            )}
            {team?.estimateScale !== 'none' && (
              <EstimatePicker teamId={form.teamId} value={form.estimate} onChange={v => set({ estimate: v })} trigger={<button type="button" className={chip}><Hash size={13} className="text-ink-3" /><span className={cn(form.estimate == null && unset)}>{estimateLabel(form.estimate, team?.estimateScale) ?? 'Estimate'}</span></button>} />
            )}
            <DatePicker value={form.dueDate} onChange={v => set({ dueDate: v })} trigger={<button type="button" className={chip}><CalendarBlank size={14} className="text-ink-3" /><span className={cn(!due && unset)}>{due?.label ?? 'Due'}</span></button>} />
            <IssueSearchPicker
              placeholder="Make it part of…"
              onSelect={p => set({ parent: p })}
              trigger={
                <button type="button" className={chip}>
                  <ArrowElbowLeftUp size={13} className="text-ink-3" />
                  <span className={cn(!form.parent && unset)}>{form.parent ? form.parent.identifier : 'Parent'}</span>
                  {form.parent && (
                    <span role="button" tabIndex={-1} onClick={e => { e.stopPropagation(); set({ parent: null }); }} className="-mr-1 px-0.5 text-ink-3 hover:text-ink">
                      ×
                    </span>
                  )}
                </button>
              }
            />
          </div>

          <div className="flex items-center gap-2 border-t border-line bg-paper/70 px-3 py-3 dark:bg-paper/30 sm:gap-3 sm:px-5">
            <Tooltip content={ws.aiAvailable ? 'Turn rough notes into a titled issue with type, priority and labels' : 'AI isn’t connected — the first line of your notes becomes the title'}>
              <Button variant="ghost" size="sm" onClick={draft} disabled={drafting} leading={drafting ? <CircleNotch size={14} className="animate-spin" /> : <Sparkle size={14} weight={ws.aiAvailable ? 'fill' : 'regular'} className={ws.aiAvailable ? 'text-violet' : 'text-ink-3'} />}>
                {drafting ? 'Drafting…' : 'Draft with AI'}
              </Button>
            </Tooltip>
            <label className="ml-auto flex cursor-pointer items-center gap-2 whitespace-nowrap text-meta text-ink-2">
              <Switch size="sm" checked={createMore} onCheckedChange={setCreateMore} label="Keep open after filing" />
              Keep open
            </label>
            <Button variant="primary" onClick={submit} loading={busy} aria-disabled={!form.title.trim() || undefined} className={cn(!form.title.trim() && 'opacity-60')}>
              File issue
              <Kbd keys="mod+enter" tone="inverse" className="hidden sm:inline-flex" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
