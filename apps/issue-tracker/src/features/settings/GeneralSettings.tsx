import { ArrowsClockwise, Check, Keyboard, ShieldCheck, Sparkle } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { saveMember, seedWorkspace } from 'zitejs/api';
import { useAppActions } from '../../lib/app-actions';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import { useTheme, type ThemePref } from '../../lib/theme';
import { useWorkspace } from '../../lib/workspace';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Chip';
import { cn } from '../../ui/cn';
import { Field, Input } from '../../ui/Form';
import { Kbd } from '../../ui/Kbd';
import { Card } from '../../ui/Layout';
import { CardFooter, SectionHeader, SettingRow, Subsection, UnsavedNote, useSettingsMutation } from './kit';

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function ProfileCard() {
  const ws = useWorkspace();
  const run = useSettingsMutation();
  const member = ws.memberById.get(ws.me.id);
  const baseName = member?.name ?? ws.me.name;
  const baseTitle = member?.jobTitle ?? ws.me.jobTitle ?? '';
  const role = member?.role ?? ws.me.role ?? 'Member';
  const [name, setName] = useState(baseName);
  const [title, setTitle] = useState(baseTitle);
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== baseName || title.trim() !== baseTitle;

  // Adopt a change saved elsewhere, but never clobber an edit in progress.
  useEffect(() => {
    if (!dirty) {
      setName(baseName);
      setTitle(baseTitle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseName, baseTitle]);

  const discard = () => {
    setName(baseName);
    setTitle(baseTitle);
  };

  const save = async () => {
    if (!name.trim() || !dirty || saving) return;
    setSaving(true);
    await run(() => saveMember({ id: ws.me.id, name: name.trim(), jobTitle: title.trim() || null }), {
      success: 'Profile saved',
      error: 'Couldn’t save your profile',
    });
    setSaving(false);
  };

  const shownName = name.trim() || baseName;

  return (
    <Card>
      <form
        id="profile-form"
        className="grid gap-6 p-4 sm:p-5 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8"
        onSubmit={e => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex min-w-0 items-center gap-4 md:flex-col md:items-start md:gap-3">
          <Avatar person={{ name: shownName, avatarUrl: member?.avatarUrl ?? ws.me.avatarUrl, color: member?.color ?? ws.me.color }} size={64} className="shadow-hairline" />
          <div className="min-w-0">
            <div className="truncate font-display text-[22px] leading-7 text-ink">{shownName}</div>
            <div className="truncate text-ui text-ink-3">{title.trim() || 'No job title yet'}</div>
            <div className="mt-2">
              <Badge tone={role === 'Admin' ? 'ink' : 'neutral'} icon={role === 'Admin' ? <ShieldCheck size={12} weight="fill" /> : undefined}>
                {role}
              </Badge>
            </div>
          </div>
        </div>
        <div className="grid content-start gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="profile-name" error={name.trim() ? null : 'Your name can’t be empty'}>
            <Input id="profile-name" value={name} maxLength={120} onChange={e => setName(e.target.value)} autoComplete="name" invalid={!name.trim()} className="h-9 text-body" />
          </Field>
          <Field label="Job title" htmlFor="profile-title">
            <Input id="profile-title" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="e.g. Staff engineer" className="h-9 text-body" />
          </Field>
          <Field label="Email" htmlFor="profile-email" className="sm:col-span-2" hint="Your email comes from how you sign in, so it can’t be changed here.">
            <Input id="profile-email" value={ws.me.email} disabled className="h-9 text-body" />
          </Field>
        </div>
      </form>
      <CardFooter start={dirty ? <UnsavedNote /> : <span>Shown on issues, comments and in every picker.</span>}>
        {dirty && (
          <Button variant="ghost" size="sm" onClick={discard}>
            Discard
          </Button>
        )}
        {/* Linked by `form` so Enter in a field submits — a hidden submit button doesn't in Safari. */}
        <Button type="submit" form="profile-form" variant="primary" size="sm" disabled={!dirty || !name.trim()} loading={saving}>
          Save changes
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

/**
 * Previews are drawn with fixed colours, not tokens: the Light card has to
 * look light while the app is dark, and vice versa.
 */
const PALETTE = {
  light: { paper: '#F6F4EF', card: '#FFFFFF', sunken: '#EFECE5', line: '#E8E3DA', ink: '#1F1D1A', ink3: '#B7AFA2', faint: '#DDD7CC', started: '#BF8300', done: '#2E9460' },
  dark: { paper: '#131210', card: '#1B1A17', sunken: '#171613', line: '#2B2924', ink: '#EEEBE4', ink3: '#5E5A52', faint: '#3A3731', started: '#EBB450', done: '#6BC98F' },
} as const;

function Tick({ color, type }: { color: string; type: 'started' | 'done' | 'todo' }) {
  return (
    <svg width={8} height={8} viewBox="0 0 14 14" className="shrink-0" aria-hidden>
      {type === 'done' ? (
        <>
          <rect x={1.6} y={1.6} width={10.8} height={10.8} rx={3.2} fill={color} />
          <path d="M4.4 7.1l1.8 1.8 3.5-3.8" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          {type === 'started' && <rect x={1.6} y={7} width={10.8} height={5.4} rx={1.5} fill={color} />}
          <rect x={1.6} y={1.6} width={10.8} height={10.8} rx={3.2} fill="none" stroke={color} strokeWidth={1.8} />
        </>
      )}
    </svg>
  );
}

function ThemeMock({ tone }: { tone: 'light' | 'dark' }) {
  const c = PALETTE[tone];
  const rows: Array<{ type: 'started' | 'done' | 'todo'; w: string }> = [
    { type: 'started', w: '62%' },
    { type: 'todo', w: '48%' },
    { type: 'done', w: '56%' },
  ];
  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: c.paper }}>
      {/* Top bar: logo, a scope pill, nav, New issue */}
      <div className="flex h-[22%] shrink-0 items-center gap-[5%] px-[6%]">
        <span className="h-[46%] rounded-[2px]" style={{ background: '#FFD447', aspectRatio: '1' }} />
        <span className="h-[36%] w-[16%] rounded-full" style={{ background: c.card, boxShadow: `inset 0 0 0 1px ${c.line}` }} />
        <span className="h-[18%] w-[9%] rounded-full" style={{ background: c.ink }} />
        <span className="h-[18%] w-[9%] rounded-full" style={{ background: c.faint }} />
        <span className="h-[18%] w-[9%] rounded-full" style={{ background: c.faint }} />
        <span className="ml-auto h-[38%] w-[17%] rounded-[3px]" style={{ background: c.ink }} />
      </div>
      {/* A ledger card with a sunken header and three rows */}
      <div className="mx-[6%] flex flex-1 flex-col overflow-hidden rounded-t-[5px]" style={{ background: c.card, boxShadow: `0 0 0 1px ${c.line}` }}>
        <div className="flex h-[20%] shrink-0 items-center gap-[6%] px-[5%]" style={{ background: c.sunken, borderBottom: `1px solid ${c.line}` }}>
          <span className="h-[18%] w-[14%] rounded-full" style={{ background: c.ink3 }} />
          <span className="h-[18%] w-[10%] rounded-full" style={{ background: c.ink3 }} />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="flex flex-1 items-center gap-[4%] px-[5%]" style={{ borderBottom: i < rows.length - 1 ? `1px solid ${c.line}` : undefined }}>
            <Tick type={r.type} color={r.type === 'done' ? c.done : r.type === 'started' ? c.started : c.ink3} />
            <span className="h-[16%] rounded-full" style={{ width: r.w, background: i === 0 ? c.ink : c.faint }} />
            {i === 0 && <span className="ml-auto h-[16%] w-[10%] rounded-full" style={{ background: '#FFD447' }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

const THEMES: Array<{ value: ThemePref; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

function AppearanceCards() {
  const { pref, resolved, setPref } = useTheme();
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4" role="radiogroup" aria-label="Theme">
      {THEMES.map(t => {
        const on = pref === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setPref(t.value)}
            className="group min-w-0 rounded-lg text-left outline-none focus-visible:outline-none"
          >
            <div
              className={cn(
                'relative aspect-[16/10] overflow-hidden rounded-lg transition-[box-shadow,transform] duration-150',
                on
                  ? 'shadow-raised ring-2 ring-ink ring-offset-2 ring-offset-paper'
                  : 'shadow-hairline ring-1 ring-line-strong group-hover:-translate-y-px group-hover:shadow-raised group-focus-visible:ring-2 group-focus-visible:ring-ink/60',
              )}
            >
              {t.value === 'system' ? (
                <>
                  <div className="absolute inset-0" style={{ clipPath: 'inset(0 50% 0 0)' }}>
                    <ThemeMock tone="light" />
                  </div>
                  <div className="absolute inset-0" style={{ clipPath: 'inset(0 0 0 50%)' }}>
                    <ThemeMock tone="dark" />
                  </div>
                </>
              ) : (
                <ThemeMock tone={t.value} />
              )}
              {on && (
                <span className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-on-primary shadow-raised animate-pop-in">
                  <Check size={11} weight="bold" />
                </span>
              )}
            </div>
            <div className="mt-2.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 px-0.5">
              <span className={cn('text-ui', on ? 'font-semibold text-ink' : 'text-ink-2 group-hover:text-ink')}>{t.label}</span>
              {t.value === 'system' && <span className="truncate text-meta text-ink-3">now {resolved}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

const AI_FEATURES: Array<{ name: string; on: string; off: string }> = [
  {
    name: 'Draft issue',
    on: 'Turns a few rough lines into a titled issue with a type, priority and labels, for you to review before it’s filed.',
    off: 'The first line becomes the title and the rest the description.',
  },
  {
    name: 'Duplicate detection',
    on: 'Reads open issues while you file and judges which describe the same problem, even in different words.',
    off: 'Flags open issues whose titles share most of the same words.',
  },
  {
    name: 'Thread summaries',
    on: 'Long comment threads get a summary, the decisions made and the questions still open.',
    off: 'Threads are shown in full, without a summary.',
  },
  {
    name: 'Sub-issue breakdown',
    on: 'Suggests a breakdown for a large piece of work; you choose which sub-issues to create.',
    off: 'Add sub-issues by hand.',
  },
  {
    name: 'Sprint risk',
    on: 'Explains what puts the current sprint at risk and what to move out to land the rest.',
    off: 'The verdict and risk flags are still worked out from scope, pace and days left.',
  },
  {
    name: 'Check-in drafts',
    on: 'Writes a project check-in from what actually moved since the last one.',
    off: 'The check-in starts from the facts: progress, what shipped, what’s in flight and what’s overdue.',
  },
];

function AiCard() {
  const ws = useWorkspace();
  const on = ws.aiAvailable;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3.5 border-b border-line px-4 py-4 sm:px-5">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', on ? 'bg-highlight text-highlight-ink' : 'bg-sunken text-ink-3 ring-1 ring-inset ring-line')}>
          <Sparkle size={20} weight={on ? 'fill' : 'regular'} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-title font-semibold text-ink">Anthropic</span>
            {on ? <Badge tone="success" dot>Connected</Badge> : <Badge tone="neutral">Not connected</Badge>}
          </div>
          <p className="mt-0.5 max-w-[560px] text-ui text-ink-2 text-pretty">
            {on
              ? 'Claude drafts and judges the six things below. Nothing is filed, posted or changed until you review it.'
              : 'Every feature below still works, using the fallback described. Attach an Anthropic integration to this app in Zite to turn on the AI versions — no code changes needed.'}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-line">
        {AI_FEATURES.map(f => (
          <li key={f.name} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 px-4 py-3.5 sm:px-5">
            <span
              className={cn('mt-px flex h-7 w-7 items-center justify-center rounded-sm', on ? 'bg-highlight/40 text-ink dark:bg-highlight/15 dark:text-highlight' : 'bg-sunken text-ink-3')}
              title={on ? 'Uses Claude' : 'Uses the fallback'}
            >
              {on ? <Sparkle size={15} weight="fill" /> : <ArrowsClockwise size={15} weight="bold" />}
            </span>
            <div className="min-w-0">
              <div className="text-ui font-semibold text-ink">{f.name}</div>
              <p className={cn('mt-0.5 text-ui text-pretty', on ? 'text-ink-2' : 'text-ink-3')}>{f.on}</p>
              <p className={cn('mt-1 text-ui text-pretty', on ? 'text-ink-3' : 'text-ink-2')}>
                <span className={cn('font-medium', on ? 'text-ink-3' : 'text-ink')}>Without AI:</span> {f.off}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

/**
 * A fresh install starts empty; this is the one way to fill it with the sample
 * company. Only an admin sees it, and only while the sample has never been
 * loaded and nobody has created an issue, project, goal or sprint.
 * `seedWorkspace` refuses on the same rule.
 */
function SampleData() {
  const ws = useWorkspace();
  const app = useAppActions();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  if (!ws.sampleDataAvailable || ws.me.role !== 'Admin') return null;

  const load = async () => {
    const ok = await app.confirm({
      title: 'Load sample data?',
      description:
        'This adds a made-up company to the workspace: 10 people, 3 teams, 110 issues, 9 sprints, 9 projects and 3 goals, plus an inbox for you. There’s no one-click way to remove it, so only load it into a workspace you don’t plan to use for real work.',
      confirmLabel: 'Load sample data',
    });
    if (!ok) return;
    setLoading(true);
    try {
      await seedWorkspace({});
      await qc.invalidateQueries();
      toast.success('Sample data loaded');
      navigate('/home');
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t load the sample data'));
      qc.invalidateQueries({ queryKey: qk.bootstrap });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="sample-data-title" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <h3 id="sample-data-title" className="text-ui font-semibold text-ink-2">
          Sample data
        </h3>
        <p className="mt-0.5 max-w-[520px] text-ui text-ink-3 text-pretty">
          Fill this empty workspace with a made-up company’s teams, people, issues, sprints and projects, so you can try every screen.
        </p>
      </div>
      <Button variant="secondary" size="sm" loading={loading} onClick={load} className="self-start sm:self-auto">
        Load sample data
      </Button>
    </section>
  );
}

// ---------------------------------------------------------------------------

export function GeneralSettings() {
  const app = useAppActions();
  return (
    <>
      <SectionHeader title="General" description="Your profile, how Issue Tracker looks on this device, and the AI working in this workspace." />
      <Subsection title="Profile" description="How you appear to everyone else in the workspace.">
        <ProfileCard />
      </Subsection>
      <Subsection title="Appearance" description="Choose how Issue Tracker looks on this device. System follows your computer’s setting.">
        <AppearanceCards />
      </Subsection>
      <Subsection title="AI" description="A handful of drafting and judgement tasks, each with a plain fallback.">
        <AiCard />
      </Subsection>
      <Subsection title="Keyboard">
        <Card>
          <SettingRow
            label="Keyboard shortcuts"
            description={
              <>
                Almost everything has one. Press <Kbd>?</Kbd> anywhere to see them all, or <Kbd keys="mod+k" /> to find any action.
              </>
            }
            control={
              <Button variant="secondary" size="sm" leading={<Keyboard size={15} />} onClick={() => app.openShortcuts()}>
                View shortcuts
              </Button>
            }
          />
        </Card>
      </Subsection>
      <SampleData />
    </>
  );
}
