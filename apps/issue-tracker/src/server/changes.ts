import { zite } from 'zitejs/db';
import type { Actor } from './actor';

/**
 * Recording what changed, and telling the people who care.
 *
 * Every issue mutation funnels through here so history and notifications
 * cannot drift apart from the edit that caused them. Writing them at each call
 * site is how a tracker ends up with an activity feed missing half the changes
 * and an inbox that fires twice for one edit.
 */

export const PRIORITY_LABELS = ['No priority', 'Urgent', 'High', 'Medium', 'Low'];

export type IssuePatch = {
  title?: string;
  description?: string | null;
  statusId?: string | null;
  priority?: number | null;
  estimate?: number | null;
  assigneeId?: string | null;
  projectId?: string | null;
  milestoneId?: string | null;
  sprintId?: string | null;
  parentId?: string | null;
  dueDate?: string | null;
  issueType?: string | null;
  archived?: boolean;
  position?: number | null;
};

type Tracked = {
  field: keyof IssuePatch;
  type: string;
  verb: string;
  label?: (value: unknown) => Promise<string | null>;
};

const TRACKED: Tracked[] = [
  { field: 'statusId', type: 'status_changed', verb: 'changed status', label: v => nameOf('statuses', v) },
  { field: 'assigneeId', type: 'assignee_changed', verb: 'changed assignee', label: v => nameOf('members', v) },
  { field: 'priority', type: 'priority_changed', verb: 'changed priority', label: async v => PRIORITY_LABELS[Number(v ?? 0)] ?? null },
  { field: 'estimate', type: 'estimate_changed', verb: 'changed estimate', label: async v => (v == null ? null : `${v} point${Number(v) === 1 ? '' : 's'}`) },
  { field: 'projectId', type: 'project_changed', verb: 'changed project', label: v => nameOf('projects', v) },
  { field: 'milestoneId', type: 'milestone_changed', verb: 'changed milestone', label: v => nameOf('milestones', v) },
  { field: 'sprintId', type: 'sprint_changed', verb: 'changed sprint', label: v => sprintName(v) },
  { field: 'parentId', type: 'parent_changed', verb: 'changed parent', label: v => nameOf('issues', v, 'identifier') },
  { field: 'dueDate', type: 'due_date_changed', verb: 'changed due date', label: async v => (v ? String(v).slice(0, 10) : null) },
  { field: 'issueType', type: 'type_changed', verb: 'changed type', label: async v => (v ? String(v) : null) },
  { field: 'title', type: 'title_changed', verb: 'renamed the issue' },
];

const blank = (v: unknown) => v == null || v === '';

async function nameOf(table: 'statuses' | 'members' | 'projects' | 'milestones' | 'issues', id: unknown, field = 'name') {
  if (blank(id)) return null;
  const rec = await (zite as any)[table].findOne({ id: String(id) });
  if (!rec) return null;
  return String(rec[field] ?? rec.name ?? rec.title ?? '') || null;
}

async function sprintName(id: unknown) {
  if (blank(id)) return null;
  const rec = await zite.sprints.findOne({ id: String(id) });
  return rec ? rec.name || `Sprint ${rec.number ?? ''}`.trim() : null;
}

/**
 * State transitions also move the lifecycle timestamps — that is what makes
 * velocity, cycle time and burndown computable. Keyed off the state's TYPE, so
 * a team can rename "Done" to "Shipped" without breaking a report.
 */
export async function timestampsForState(
  statusId: string | null | undefined,
  existing: { startedAt?: string | null; completedAt?: string | null; canceledAt?: string | null },
) {
  if (!statusId) return { patch: {} as Record<string, string | null>, type: null as string | null };
  const state = await zite.statuses.findOne({ id: statusId });
  const type = state?.type ?? null;
  return { patch: lifecycleFor(type, existing), type };
}

/** The timestamp changes an issue needs to be consistent with a state of this category. */
export function lifecycleFor(
  type: string | null | undefined,
  existing: { startedAt?: string | null; completedAt?: string | null; canceledAt?: string | null },
) {
  const now = new Date().toISOString();
  const patch: Record<string, string | null> = {};

  if (type === 'started') {
    if (!existing.startedAt) patch.startedAt = now;
    patch.completedAt = null;
    patch.canceledAt = null;
  } else if (type === 'completed') {
    if (!existing.startedAt) patch.startedAt = now;
    if (!existing.completedAt) patch.completedAt = now;
    patch.canceledAt = null;
  } else if (type === 'canceled') {
    if (!existing.canceledAt) patch.canceledAt = now;
    patch.completedAt = null;
  } else {
    // Back to intake/backlog/todo — the work has not started after all.
    patch.startedAt = null;
    patch.completedAt = null;
    patch.canceledAt = null;
  }
  return patch;
}

export type ChangeContext = { issueId: string; identifier: string; title: string; actor: Actor; creatorId?: string | null };

/**
 * Diff the patch against the record, write one history entry per genuinely
 * changed field, and notify watchers who did not make the change.
 */
export async function recordIssueChanges(ctx: ChangeContext, before: Record<string, unknown>, patch: IssuePatch) {
  const occurredAt = new Date().toISOString();
  const rows: Array<Record<string, unknown>> = [];
  const broadcast: Array<{ type: string; name: string }> = [];
  const { actor } = ctx;

  for (const t of TRACKED) {
    if (!(t.field in patch)) continue;
    const next = (patch as Record<string, unknown>)[t.field];
    const prev = before[t.field];
    // null, undefined and '' are one value, so a no-op edit writes nothing.
    if ((blank(prev) && blank(next)) || String(prev ?? '') === String(next ?? '')) continue;

    const [fromLabel, toLabel] = t.label
      ? await Promise.all([t.label(prev), t.label(next)])
      : [blank(prev) ? null : String(prev), blank(next) ? null : String(next)];

    rows.push({
      name: t.verb,
      issueId: ctx.issueId,
      actorId: actor.id,
      type: t.type,
      fromValue: blank(prev) ? null : String(prev).slice(0, 250),
      toValue: blank(next) ? null : String(next).slice(0, 250),
      fromLabel: fromLabel?.slice(0, 250) ?? null,
      toLabel: toLabel?.slice(0, 250) ?? null,
      occurredAt,
    });

    if (t.field === 'statusId' && toLabel) {
      const state = await zite.statuses.findOne({ id: String(next) });
      if (state?.type === 'completed') broadcast.push({ type: 'completed', name: `${actor.name} completed an issue` });
      else broadcast.push({ type: 'status_changed', name: `${actor.name} moved an issue to ${toLabel}` });
    }
    if (t.field === 'priority' && Number(next) === 1) {
      broadcast.push({ type: 'priority_changed', name: `${actor.name} marked an issue urgent` });
    }
  }

  if (patch.archived !== undefined && patch.archived !== (before.archived === true)) {
    rows.push({
      name: patch.archived ? 'archived the issue' : 'restored the issue',
      issueId: ctx.issueId, actorId: actor.id, type: patch.archived ? 'archived' : 'unarchived', occurredAt,
    });
  }

  if (patch.description !== undefined && String(patch.description ?? '') !== String(before.description ?? '')) {
    // Autosaving a description would otherwise write a history row per pause in
    // typing. One row per actor per ten minutes is what a reader wants.
    const { rows: recent } = await zite.sql({
      query: `SELECT id FROM "Activity" WHERE "issueId" = $1 AND "actorId" = $2 AND "type" = 'description_changed' AND "occurredAt" > NOW() - INTERVAL '10 minutes' LIMIT 1`,
      params: [ctx.issueId, actor.id],
    });
    if (recent.length === 0) {
      rows.push({ name: 'updated the description', issueId: ctx.issueId, actorId: actor.id, type: 'description_changed', occurredAt });
    }
  }

  if (rows.length) await zite.activity.bulkCreate({ records: rows });

  // A new assignee always hears about it, whatever their subscription state.
  const newAssignee = patch.assigneeId;
  if (newAssignee && newAssignee !== before.assigneeId && newAssignee !== actor.id) {
    await createNotifications([newAssignee], {
      type: 'assigned', actorId: actor.id, issueId: ctx.issueId,
      name: `${actor.name} assigned you ${ctx.identifier}`, body: ctx.title, occurredAt,
    });
  }
  if (newAssignee) await subscribe(ctx.issueId, newAssignee);

  if (broadcast.length) {
    const watchers = await watchersOf(ctx.issueId, actor.id);
    for (const n of broadcast) {
      await createNotifications(watchers.filter(w => w !== newAssignee), {
        type: n.type, actorId: actor.id, issueId: ctx.issueId, name: n.name, body: ctx.title, occurredAt,
      });
    }
  }

  return rows.length;
}

export async function watchersOf(issueId: string, exceptMemberId?: string) {
  const { records } = await zite.issueSubscribers.findAll({ filters: { issueId }, limit: 500 });
  const ids = new Set(records.map(r => r.memberId).filter((v): v is string => Boolean(v)));
  if (exceptMemberId) ids.delete(exceptMemberId);
  return [...ids];
}

export async function createNotifications(
  memberIds: string[],
  n: {
    type: string; actorId: string; name: string; body: string;
    issueId?: string | null; projectId?: string | null; commentId?: string | null; occurredAt?: string;
  },
) {
  const targets = [...new Set(memberIds.filter(Boolean))];
  if (targets.length === 0) return 0;
  await zite.notifications.bulkCreate({
    records: targets.map(memberId => ({
      name: n.name.slice(0, 240),
      body: n.body.slice(0, 240),
      memberId,
      actorId: n.actorId,
      issueId: n.issueId ?? null,
      projectId: n.projectId ?? null,
      commentId: n.commentId ?? null,
      type: n.type,
      read: false,
      readAt: null,
      snoozedUntil: null,
      archived: false,
      occurredAt: n.occurredAt ?? new Date().toISOString(),
    })),
  });
  return targets.length;
}

/** Idempotent — subscribing twice must not double every future notification. */
export async function subscribe(issueId: string, memberId: string) {
  if (!memberId) return;
  const existing = await zite.issueSubscribers.findOne({ filters: { issueId, memberId } });
  if (existing) return;
  await zite.issueSubscribers.create({ record: { name: 'subscriber', issueId, memberId } });
}

/**
 * @mentions in a comment. The composer inserts `@First Last`; we also accept a
 * first name or email handle, matched against the roster.
 */
export async function mentionedMemberIds(body: string) {
  if (!body.includes('@')) return [];
  const { records } = await zite.members.findAll({ limit: 500 });
  const text = body.toLowerCase();
  const hits = new Set<string>();
  for (const m of records) {
    const name = (m.name ?? '').toLowerCase();
    const first = name.split(' ')[0];
    const handle = (m.email ?? '').split('@')[0].toLowerCase();
    if (
      (name && text.includes(`@${name}`)) ||
      (handle && new RegExp(`@${handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) ||
      (first && new RegExp(`@${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text))
    ) {
      hits.add(m.id);
    }
  }
  return [...hits];
}

/** Fractional positions: a drop between two cards is ONE write. */
export const POSITION_STEP = 1024;
