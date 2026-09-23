import { Lock, Warning } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Mark, SprintGlyph } from '../../glyphs';
import { ESTIMATE_SCALE_LABEL, ESTIMATE_SCALES, TEAM_ICONS } from '../../lib/constants';
import type { Team } from '../../lib/types';
import { cn } from '../../ui/cn';
import { Field, Input, Switch, Textarea } from '../../ui/Form';
import { IconColorPopover, SelectMenu, SettingRow } from './kit';

export type EstimateScale = 'fibonacci' | 'linear' | 'exponential' | 'tshirt' | 'none';

export type TeamDraft = {
  name: string;
  key: string;
  description: string;
  icon: string;
  color: string;
  sprintsEnabled: boolean;
  sprintDurationWeeks: number;
  intakeEnabled: boolean;
  estimateScale: EstimateScale;
};

export const SCALES: EstimateScale[] = ['fibonacci', 'linear', 'exponential', 'tshirt', 'none'];

export function draftFromTeam(team: Team): TeamDraft {
  return {
    name: team.name,
    key: team.key,
    description: team.description ?? '',
    icon: team.icon ?? TEAM_ICONS[0],
    color: team.color ?? '#3F76D0',
    sprintsEnabled: team.sprintsEnabled,
    sprintDurationWeeks: team.sprintDurationWeeks || 2,
    intakeEnabled: team.intakeEnabled,
    estimateScale: (SCALES as string[]).includes(team.estimateScale) ? (team.estimateScale as EstimateScale) : 'fibonacci',
  };
}

export const blankTeamDraft = (): TeamDraft => ({
  name: '', key: '', description: '', icon: TEAM_ICONS[0], color: '#3F76D0',
  sprintsEnabled: true, sprintDurationWeeks: 2, intakeEnabled: false, estimateScale: 'fibonacci',
});

/** "Mobile Platform" → "MP", "Design" → "DES": letters only, 2–7 of them. */
export function deriveKey(name: string) {
  const words = name
    .normalize('NFKD')
    // Drop the combining accents NFKD split off, or accented names break into one-letter words.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '';
  let key = words.length > 1 ? words.map(w => w[0]).join('') : words[0].slice(0, 3);
  // A one-letter initialism is too short to read as a key; lean on the first word instead.
  if (key.length < 2) key = words.join('').slice(0, 3);
  return key.slice(0, 7).toUpperCase();
}

export function keyProblem(key: string, taken: Set<string>) {
  const k = key.trim();
  if (k.length < 2 || k.length > 7) return 'Use 2–7 characters';
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(k)) return 'Start with a letter, then letters and digits only';
  if (taken.has(k.toUpperCase())) return `Another team already uses ${k.toUpperCase()}`;
  return null;
}

const WEEK_OPTIONS = Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: i === 0 ? '1 week' : `${i + 1} weeks` }));
const SCALE_OPTIONS = SCALES.map(s => ({
  value: s,
  label: ESTIMATE_SCALE_LABEL[s],
  hint: s === 'none' ? undefined : (ESTIMATE_SCALES[s] ?? []).map(e => (s === 'tshirt' ? e.label : e.value)).join(' '),
}));

/** Name, key, icon and description — who the team is. */
export function TeamIdentityFields({ value, onChange, keyLocked, keyError, nameError, onKeyInput, idPrefix = 'team', autoFocus }: {
  value: TeamDraft;
  nameError?: string | null;
  onChange: (patch: Partial<TeamDraft>) => void;
  keyLocked?: boolean;
  keyError?: string | null;
  onKeyInput?: (key: string) => void;
  idPrefix?: string;
  autoFocus?: boolean;
}) {
  const shownKey = (value.key || 'KEY').toUpperCase();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-end gap-2.5">
          <div className="flex flex-col gap-1.5">
            <span className="text-meta font-medium text-ink-2">Icon</span>
            <IconColorPopover icon={value.icon} color={value.color} name={value.name} icons={TEAM_ICONS} onChange={p => onChange(p)}>
              <button
                type="button"
                aria-label="Change icon and colour"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-control/60 bg-card shadow-hairline transition-colors hover:border-control disabled:cursor-not-allowed disabled:opacity-55 data-[state=open]:border-ink/60 data-[state=open]:ring-[3px] data-[state=open]:ring-highlight/45"
              >
                <Mark icon={value.icon} color={value.color} name={value.name} size={24} />
              </button>
            </IconColorPopover>
          </div>
          <Field label="Name" htmlFor={`${idPrefix}-name`} className="min-w-0 flex-1">
            <Input id={`${idPrefix}-name`} autoFocus={autoFocus} value={value.name} maxLength={80} onChange={e => onChange({ name: e.target.value })} placeholder="e.g. Platform" invalid={Boolean(nameError)} aria-invalid={Boolean(nameError)} className="h-9 text-body" />
          </Field>
          <Field label="Key" htmlFor={`${idPrefix}-key`} className="w-[104px] shrink-0">
            {keyLocked ? (
              <div className="relative">
                <Input id={`${idPrefix}-key`} value={value.key} disabled className="h-9 pr-7 font-mono text-ui font-medium tracking-wide" />
                <Lock size={12} weight="bold" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
              </div>
            ) : (
              <Input
                id={`${idPrefix}-key`}
                value={value.key}
                maxLength={7}
                onChange={e => onKeyInput?.(e.target.value.toUpperCase().replace(/\s/g, ''))}
                placeholder="PLT"
                aria-invalid={Boolean(keyError)}
                invalid={Boolean(keyError)}
                className="h-9 font-mono text-ui font-medium uppercase tracking-wide"
              />
            )}
          </Field>
        </div>
        {nameError && <p className="mt-2 text-meta text-danger">{nameError}</p>}
        {keyLocked ? (
          <p className="mt-2 text-meta text-ink-3 text-pretty">
            Identifiers like <span className="font-mono text-[11.5px] font-medium text-ink-2">{shownKey}-42</span> are built from the key and already live in branches, commits and links, so it can’t change.
          </p>
        ) : keyError ? (
          <p className="mt-2 text-meta text-danger">{keyError}</p>
        ) : (
          <p className="mt-2 text-meta text-ink-3 text-pretty">
            Issues will be numbered{' '}
            <span className="rounded-xs bg-highlight/45 px-1 font-mono text-[11.5px] font-medium text-ink dark:bg-highlight/20">{shownKey}-1</span>,{' '}
            <span className="rounded-xs bg-highlight/45 px-1 font-mono text-[11.5px] font-medium text-ink dark:bg-highlight/20">{shownKey}-2</span>… The key can’t change later.
          </p>
        )}
      </div>
      <Field label="Description" htmlFor={`${idPrefix}-description`}>
        <Textarea
          id={`${idPrefix}-description`}
          value={value.description}
          maxLength={1000}
          minRows={2}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="What this team owns"
          className="text-body"
        />
      </Field>
    </div>
  );
}

/** Sprints, intake and estimates — how the team works. Rendered as rows separated by hairlines. */
export function TeamWorkingFields({ value, onChange, idPrefix = 'team', notes, className }: {
  value: TeamDraft;
  onChange: (patch: Partial<TeamDraft>) => void;
  idPrefix?: string;
  notes?: { intake?: ReactNode; estimates?: ReactNode };
  className?: string;
}) {
  const scale = ESTIMATE_SCALES[value.estimateScale] ?? [];
  return (
    <div className={cn('divide-y divide-line', className)}>
      <SettingRow
        inline
        htmlFor={`${idPrefix}-sprints`}
        label="Sprints"
        description="Time-boxed stretches the team plans work into, with a burndown and carry-over at the end."
        control={<Switch id={`${idPrefix}-sprints`} checked={value.sprintsEnabled} onCheckedChange={v => onChange({ sprintsEnabled: v })} />}
      >
        {value.sprintsEnabled && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-ui text-ink-2 animate-rise-in">
            <SprintGlyph status="active" progress={0.5} />
            Each sprint lasts
            <SelectMenu
              ariaLabel="Sprint length"
              value={String(value.sprintDurationWeeks)}
              onChange={v => onChange({ sprintDurationWeeks: Number(v) })}
              options={WEEK_OPTIONS}
              className="w-[112px]"
            />
          </div>
        )}
      </SettingRow>
      <SettingRow
        inline
        htmlFor={`${idPrefix}-intake`}
        label="Intake"
        description="New issues from outside the team wait in Intake to be accepted, declined or merged before they reach the backlog."
        control={<Switch id={`${idPrefix}-intake`} checked={value.intakeEnabled} onCheckedChange={v => onChange({ intakeEnabled: v })} />}
      >
        {value.intakeEnabled && notes?.intake && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-warning/10 px-2.5 py-2 text-meta text-warning animate-rise-in">
            <Warning size={14} weight="bold" className="mt-px shrink-0" />
            <span>{notes.intake}</span>
          </p>
        )}
      </SettingRow>
      <SettingRow
        label="Estimates"
        description="How issues are sized. Points roll up into sprint and project scope."
        control={
          <SelectMenu
            ariaLabel="Estimate scale"
            value={value.estimateScale}
            onChange={v => onChange({ estimateScale: v as EstimateScale })}
            options={SCALE_OPTIONS}
            align="end"
            className="w-full sm:w-[168px]"
            contentClassName="w-[260px]"
          />
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {scale.length ? (
            scale.map(e => (
              <span key={e.value} className="tabular inline-flex h-6 min-w-[28px] items-center justify-center rounded-xs bg-sunken px-1.5 font-mono text-[11.5px] font-medium text-ink-2 ring-1 ring-inset ring-line">
                {value.estimateScale === 'tshirt' ? e.label : e.value}
              </span>
            ))
          ) : (
            <span className="text-meta text-ink-3">Issues in this team won’t show an estimate.</span>
          )}
        </div>
        {notes?.estimates}
      </SettingRow>
    </div>
  );
}
