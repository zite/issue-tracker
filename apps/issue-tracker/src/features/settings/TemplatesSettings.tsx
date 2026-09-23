import { Files, Plus, Tag, Trash } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { saveTemplate } from 'zitejs/api';
import { Mark, PriorityGlyph, TypeGlyph } from '../../glyphs';
import { RichEditor } from '../../editor/RichEditor';
import { useAppActions } from '../../lib/app-actions';
import { ESTIMATE_SCALES, PRIORITY_LABEL } from '../../lib/constants';
import type { IssueTemplate, IssueType } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { LabelPicker, PriorityPicker, TypePicker } from '../../pickers/pickers';
import { Button } from '../../ui/Button';
import { LabelChip, Swatch } from '../../ui/Chip';
import { cn } from '../../ui/cn';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '../../ui/Dialog';
import { Field, Input } from '../../ui/Form';
import { Kbd } from '../../ui/Kbd';
import { Card, EmptyState } from '../../ui/Layout';
import { Tooltip } from '../../ui/Tooltip';
import { KeyChip, LedgerHead, Locked, SectionHeader, SelectMenu, useSettingsLock, useSettingsMutation, type SelectOption } from './kit';

const ALL_TEAMS = '__all__';
const NO_ESTIMATE = '__none__';
/** A property button in the dialog: glyph + value, or the action in ink-3 when empty. */
const prop = 'inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-card px-2.5 text-ui text-ink shadow-hairline transition-colors hover:bg-hover data-[state=open]:bg-pressed';

type Form = {
  name: string;
  teamId: string | null;
  title: string;
  description: string;
  priority: number;
  issueType: IssueType;
  estimate: number | null;
  labelIds: string[];
};

function TemplateForm({ template, onDone }: { template: IssueTemplate | null; onDone: () => void }) {
  const ws = useWorkspace();
  const run = useSettingsMutation();
  const [form, setForm] = useState<Form>(() =>
    template
      ? {
          name: template.name,
          teamId: template.teamId && ws.teamById.has(template.teamId) ? template.teamId : null,
          title: template.title ?? '',
          description: template.description ?? '',
          priority: template.priority ?? 0,
          issueType: (template.issueType as IssueType) || 'Task',
          estimate: template.estimate,
          labelIds: template.labelIds.filter(id => ws.labelById.has(id)),
        }
      : { name: '', teamId: null, title: '', description: '', priority: 0, issueType: 'Task', estimate: null, labelIds: [] },
  );
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }));

  const team = form.teamId ? ws.teamById.get(form.teamId) : undefined;
  const scaleKey = team?.estimateScale ?? 'fibonacci';
  const scale = ESTIMATE_SCALES[scaleKey] ?? ESTIMATE_SCALES.fibonacci;
  const labels = form.labelIds.map(id => ws.labelById.get(id)).filter((l): l is NonNullable<typeof l> => Boolean(l));

  const teamOptions: SelectOption[] = [
    { value: ALL_TEAMS, label: 'All teams', group: '' },
    ...ws.teams.map(t => ({ value: t.id, label: t.name, icon: <Mark icon={t.icon} color={t.color} name={t.name} size={16} />, hint: t.key, group: 'Teams' })),
  ];
  const estimateOptions: SelectOption[] = [
    { value: NO_ESTIMATE, label: 'No estimate', group: '' },
    ...scale.map(e => ({ value: String(e.value), label: e.label, group: 'Estimate' })),
  ];

  // Labels and estimates belong to a team's setup; keep only what still makes sense after switching.
  const changeTeam = (teamId: string | null) => {
    const nextScale = ESTIMATE_SCALES[(teamId && ws.teamById.get(teamId)?.estimateScale) || 'fibonacci'] ?? [];
    setForm(f => ({
      ...f,
      teamId,
      labelIds: f.labelIds.filter(id => {
        const l = ws.labelById.get(id);
        return l && (!l.teamId || l.teamId === teamId);
      }),
      estimate: f.estimate != null && nextScale.some(e => e.value === f.estimate) ? f.estimate : null,
    }));
  };

  const submit = async () => {
    setTouched(true);
    if (!form.name.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      teamId: form.teamId,
      // A trailing space is deliberate ("[Bug] " leaves room to type), so only the start is trimmed.
      title: form.title.trim() ? form.title.trimStart() : null,
      description: form.description.trim() || null,
      priority: form.priority,
      issueType: form.issueType,
      estimate: scale.length ? form.estimate : null,
      labelIds: form.labelIds,
    };
    const res = await run(() => saveTemplate(template ? { id: template.id, ...payload } : payload), {
      success: template ? `Saved “${payload.name}”` : `Created “${payload.name}”`,
      error: 'Couldn’t save the template',
    });
    savingRef.current = false;
    setSaving(false);
    if (res) onDone();
  };

  return (
    <div
      className="contents"
      onKeyDown={e => {
        // The editor handles its own ⌘↵ (and marks it handled); don't submit twice.
        if (e.defaultPrevented) return;
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      }}
    >
      <DialogHeader
        title={template ? 'Edit template' : 'New template'}
        description="Everything here pre-fills a new issue when someone picks this template while filing."
      />
      <DialogBody className="flex flex-col gap-4 pb-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_210px]">
          <Field label="Template name" htmlFor="template-name" error={touched && !form.name.trim() ? 'Give the template a name' : null}>
            <Input
              id="template-name"
              autoFocus
              value={form.name}
              maxLength={120}
              onChange={e => set({ name: e.target.value })}
              placeholder="e.g. Bug report"
              invalid={touched && !form.name.trim()}
              className="h-9 text-body"
            />
          </Field>
          <Field label="Available in">
            <SelectMenu
              ariaLabel="Available in"
              value={form.teamId ?? ALL_TEAMS}
              onChange={v => changeTeam(v === ALL_TEAMS ? null : v)}
              options={teamOptions}
              className="h-9 text-body"
              contentClassName="w-[240px]"
            />
          </Field>
        </div>

        <Field label="Default title" htmlFor="template-title" hint="Used only while the new issue’s title is still empty.">
          <Input id="template-title" value={form.title} maxLength={500} onChange={e => set({ title: e.target.value })} placeholder="e.g. [Bug] " className="h-9 text-body" />
        </Field>

        <Field label="Description">
          <div className="max-h-[34vh] overflow-y-auto rounded-md border border-control/60 bg-card px-3 py-2.5 shadow-hairline transition-[border-color,box-shadow] focus-within:border-ink/60 focus-within:ring-[3px] focus-within:ring-highlight/45">
            <RichEditor value={form.description} onChange={md => set({ description: md })} onSubmit={() => submit()} placeholder="## Steps to reproduce…" minHeight={120} />
          </div>
        </Field>

        <div>
          <div className="mb-1.5 text-meta font-medium text-ink-2">Properties</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <PriorityPicker
              value={form.priority}
              onChange={v => set({ priority: v })}
              trigger={
                <button type="button" className={cn(prop, !form.priority && 'text-ink-3')}>
                  <PriorityGlyph priority={form.priority} />
                  {form.priority ? PRIORITY_LABEL[form.priority] : 'Priority'}
                </button>
              }
            />
            <TypePicker
              value={form.issueType}
              onChange={v => v && set({ issueType: v as IssueType })}
              trigger={
                <button type="button" className={prop}>
                  <TypeGlyph type={form.issueType} />
                  {form.issueType}
                </button>
              }
            />
            <LabelPicker
              teamId={form.teamId}
              value={form.labelIds}
              onChange={v => set({ labelIds: v })}
              trigger={
                <button type="button" className={cn(prop, 'max-w-[260px]', !labels.length && 'text-ink-3')}>
                  {labels.length ? (
                    <span className="flex -space-x-0.5">
                      {labels.slice(0, 3).map(l => (
                        <Swatch key={l.id} color={l.color} className="ring-1 ring-card" />
                      ))}
                    </span>
                  ) : (
                    <Tag size={14} />
                  )}
                  <span className="truncate">{labels.length ? (labels.length > 2 ? `${labels.length} labels` : labels.map(l => l.name).join(', ')) : 'Labels'}</span>
                </button>
              }
            />
            {scale.length > 0 ? (
              <SelectMenu
                ariaLabel="Estimate"
                value={form.estimate == null ? NO_ESTIMATE : String(form.estimate)}
                onChange={v => set({ estimate: v === NO_ESTIMATE ? null : Number(v) })}
                options={estimateOptions}
                className={cn(prop, 'w-auto justify-start gap-1.5 font-normal', form.estimate == null && 'text-ink-3')}
                renderValue={o =>
                  form.estimate == null || !o ? (
                    <span className="text-ink-3">Estimate</span>
                  ) : (
                    <>
                      <span className="tabular rounded-xs bg-sunken px-1 font-mono text-[11px] font-semibold text-ink-2">{scaleKey === 'tshirt' ? o.label : form.estimate}</span>
                      <span className="text-ink">{scaleKey === 'tshirt' ? 'size' : form.estimate === 1 ? 'point' : 'points'}</span>
                    </>
                  )
                }
              />
            ) : (
              <span className="px-1 text-meta text-ink-3">{team?.name} doesn’t use estimates</span>
            )}
          </div>
          {!team && <p className="mt-2 text-meta text-ink-3">Without a team, estimates use the Fibonacci scale and only workspace labels are offered.</p>}
        </div>
      </DialogBody>
      <DialogFooter
        start={
          <span className="hidden items-center gap-1.5 text-meta text-ink-3 sm:inline-flex">
            <Kbd keys="mod+enter" /> to save
          </span>
        }
      >
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} loading={saving} disabled={touched && !form.name.trim()}>
          {template ? 'Save template' : 'Create template'}
        </Button>
      </DialogFooter>
    </div>
  );
}

const GRID = 'md:grid md:grid-cols-[minmax(0,1.5fr)_120px_110px_minmax(0,1fr)_32px] md:items-center md:gap-x-4';

export function TemplatesSettings() {
  const ws = useWorkspace();
  const app = useAppActions();
  const run = useSettingsMutation();
  const lock = useSettingsLock();
  const [dialog, setDialog] = useState<{ open: boolean; template: IssueTemplate | null }>({ open: false, template: null });

  const remove = async (t: IssueTemplate) => {
    const ok = await app.confirm({
      title: `Delete “${t.name}”?`,
      description: 'Issues already created from it aren’t affected.',
      confirmLabel: 'Delete template',
      destructive: true,
    });
    if (!ok) return;
    run(() => saveTemplate({ id: t.id, remove: true }), {
      optimistic: data => ({ ...data, templates: data.templates.filter(x => x.id !== t.id) }),
      success: `Deleted “${t.name}”`,
      error: 'Couldn’t delete the template',
    });
  };

  const open = (template: IssueTemplate | null) => {
    if (!lock) setDialog({ open: true, template });
  };

  return (
    <>
      <SectionHeader
        title="Templates"
        description="Templates pre-fill the title, description and properties of a new issue — a bug report that always asks for steps to reproduce."
        actions={
          <Button variant="primary" leading={<Plus size={15} weight="bold" />} onClick={() => open(null)}>
            New template
          </Button>
        }
      />
      {ws.templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Files size={22} weight="duotone" />}
            title="No templates yet"
            actions={
              <Locked>
                <Button variant="primary" leading={<Plus size={15} weight="bold" />} onClick={() => open(null)}>
                  New template
                </Button>
              </Locked>
            }
          >
            Create one for the issues your teams file again and again.
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <LedgerHead className={cn(GRID, 'hidden')}>
            <span>Template</span>
            <span>Available in</span>
            <span>Priority</span>
            <span>Labels</span>
            <span />
          </LedgerHead>
          <Locked>
            <ul className="divide-y divide-line">
              {ws.templates.map(t => {
                const team = t.teamId ? ws.teamById.get(t.teamId) : undefined;
                const labels = t.labelIds.map(id => ws.labelById.get(id)).filter((l): l is NonNullable<typeof l> => Boolean(l));
                return (
                  <li
                    key={t.id}
                    role={lock ? undefined : 'button'}
                    tabIndex={lock ? undefined : 0}
                    aria-label={lock ? undefined : `Edit ${t.name}`}
                    onClick={() => open(t)}
                    onKeyDown={e => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        open(t);
                      }
                    }}
                    className={cn(
                      GRID,
                      'group flex items-center gap-3 px-4 py-2.5 outline-none transition-colors focus-visible:bg-hover/60',
                      lock ? 'cursor-default' : 'cursor-pointer hover:bg-hover/50',
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sunken ring-1 ring-inset ring-line">
                        <TypeGlyph type={t.issueType} size={16} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-ui font-semibold text-ink">{t.name}</span>
                          <span className="md:hidden">{team ? <KeyChip>{team.key}</KeyChip> : <KeyChip className="font-sans">All</KeyChip>}</span>
                        </div>
                        <div className="truncate text-meta text-ink-3">{t.title ? <>Title starts “{t.title.trim()}”</> : 'No default title'}</div>
                      </div>
                    </div>
                    <div className="hidden min-w-0 items-center gap-1.5 text-ui md:flex">
                      {team ? (
                        <>
                          <Mark icon={team.icon} color={team.color} name={team.name} size={16} />
                          <span className="truncate text-ink">{team.key}</span>
                        </>
                      ) : (
                        <span className="text-ink-3">All teams</span>
                      )}
                    </div>
                    <div className="hidden items-center gap-1.5 text-ui md:flex">
                      <PriorityGlyph priority={t.priority} />
                      <span className={t.priority ? 'text-ink' : 'text-ink-3'}>{t.priority ? PRIORITY_LABEL[t.priority] : 'None'}</span>
                    </div>
                    <div className="hidden min-w-0 items-center gap-1 md:flex">
                      {labels.slice(0, 2).map(l => (
                        <LabelChip key={l.id} name={l.name} color={l.color} className="max-w-[120px]" />
                      ))}
                      {labels.length > 2 && (
                        <Tooltip content={labels.slice(2).map(l => l.name).join(', ')}>
                          <span className="tabular shrink-0 text-meta font-medium text-ink-3">+{labels.length - 2}</span>
                        </Tooltip>
                      )}
                      {labels.length === 0 && <span className="text-ui text-ink-3">—</span>}
                    </div>
                    {!lock && (
                    <Tooltip content="Delete template">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon
                        aria-label={`Delete ${t.name}`}
                        onClick={e => {
                          e.stopPropagation();
                          remove(t);
                        }}
                        onKeyDown={e => e.stopPropagation()}
                        className="shrink-0 hover:text-danger md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
                      >
                        <Trash size={15} />
                      </Button>
                    </Tooltip>
                    )}
                  </li>
                );
              })}
            </ul>
          </Locked>
        </Card>
      )}
      <Dialog open={dialog.open} onOpenChange={o => setDialog(d => ({ ...d, open: o }))}>
        <DialogContent size="lg">
          <TemplateForm key={dialog.template?.id ?? 'new'} template={dialog.template} onDone={() => setDialog(d => ({ ...d, open: false }))} />
        </DialogContent>
      </Dialog>
    </>
  );
}
