import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor, type Actor } from '../server/actor';
import { recordIssueChanges, timestampsForState, type IssuePatch } from '../server/changes';
import { issueDto, loadIssues } from '../server/issues';

const schema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(100_000).nullable().optional(),
  statusId: z.string().nullable().optional(),
  priority: z.number().int().min(0).max(4).nullable().optional(),
  estimate: z.number().int().min(0).max(100).nullable().optional(),
  issueType: z.enum(['Feature', 'Bug', 'Improvement', 'Task', 'Spike', 'Chore']).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  sprintId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  archived: z.boolean().optional(),
  position: z.number().nullable().optional(),
  /** Move to another team. Sent on its own — see moveToTeam. */
  teamId: z.string().min(1).optional(),
});

type IssueRecord = NonNullable<Awaited<ReturnType<typeof zite.issues.findOne>>>;

/**
 * Moving an issue to another team is its own operation. The issue takes the next
 * number in the new team (identifiers are per team), a status of the same kind
 * in that team's workflow, and sheds what only existed in the old team: its
 * sprint and any team-only labels. One history row records the old identifier.
 */
async function moveToTeam(before: IssueRecord, teamId: string, actor: Actor) {
  const [from, to] = await Promise.all([
    before.teamId ? zite.teams.findOne({ id: before.teamId }) : Promise.resolve(null),
    zite.teams.findOne({ id: teamId }),
  ]);
  if (!to) throw new ZiteError('Team not found', 'NOT_FOUND');

  // Same numbering rule as createIssue: never reuse a number.
  const { rows } = await zite.sql({
    query: `SELECT COALESCE(MAX("number"), 0) AS "maxNumber" FROM "Issues" WHERE "teamId" = $1`,
    params: [teamId],
  });
  const number = Math.max(Number(to.issueCounter ?? 0), Number(rows[0]?.maxNumber ?? 0)) + 1;
  const identifier = `${to.key || 'ISS'}-${number}`;
  await zite.teams.update({ id: teamId, record: { issueCounter: number } });

  const oldType = before.statusId ? (await zite.statuses.findOne({ id: before.statusId }))?.type ?? null : null;
  const states = (await zite.statuses.findAll({ filters: { teamId }, limit: 50 })).records
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
  const status = (oldType ? states.find(s => s.type === oldType) : undefined)
    ?? states.find(s => s.type === 'backlog') ?? states.find(s => s.type === 'unstarted') ?? states[0];
  const { patch: stamps } = await timestampsForState(status?.id ?? null, before);

  const links = (await zite.issueLabels.findAll({ filters: { issueId: before.id }, limit: 200 })).records;
  for (const link of links) {
    const label = link.labelId ? await zite.labels.findOne({ id: link.labelId }) : null;
    if (label?.teamId && label.teamId !== teamId) await zite.issueLabels.delete({ id: link.id });
  }

  await zite.issues.update({
    id: before.id,
    record: { teamId, number, identifier, statusId: status?.id ?? null, sprintId: null, ...stamps },
  });
  await zite.activity.create({
    record: {
      name: `moved it from ${from?.name ?? 'another team'} to ${to.name}`,
      issueId: before.id, actorId: actor.id, type: 'team_changed',
      fromValue: before.teamId ?? null, toValue: teamId, fromLabel: before.identifier ?? null, toLabel: identifier,
      occurredAt: new Date().toISOString(),
    },
  });

  const [issue] = await loadIssues([before.id]);
  return { issue, changes: 1 };
}

const PATCHABLE = [
  'title', 'description', 'statusId', 'priority', 'estimate', 'issueType', 'assigneeId',
  'projectId', 'milestoneId', 'sprintId', 'parentId', 'dueDate', 'archived', 'position',
] as const;

export default createEndpoint({
  description: 'Update issue properties, recording history and notifying watchers',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ issue: issueDto, changes: z.number() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid update', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    const before = await zite.issues.findOne({ id: data.id });
    if (!before) throw new ZiteError('Issue not found', 'NOT_FOUND');

    if (data.teamId !== undefined && data.teamId !== before.teamId) {
      if (PATCHABLE.some(key => (data as Record<string, unknown>)[key] !== undefined)) {
        throw new ZiteError('Move an issue to another team on its own, then edit it', 'BAD_REQUEST');
      }
      return moveToTeam(before, data.teamId, actor);
    }

    // An absent key means "leave alone", which is different from an explicit null.
    const patch: IssuePatch = {};
    for (const key of PATCHABLE) {
      if ((data as Record<string, unknown>)[key] !== undefined) {
        (patch as Record<string, unknown>)[key] = (data as Record<string, unknown>)[key];
      }
    }
    if (Object.keys(patch).length === 0) throw new ZiteError('Nothing to update', 'BAD_REQUEST');

    if (patch.parentId) {
      if (patch.parentId === data.id) throw new ZiteError('An issue cannot be its own parent', 'BAD_REQUEST');
      // Walk up from the new parent; meeting this issue means a sprint.
      let cursor: string | null | undefined = patch.parentId;
      for (let depth = 0; cursor && depth < 20; depth++) {
        if (cursor === data.id) throw new ZiteError('That would make the issue its own ancestor', 'BAD_REQUEST');
        const parent = await zite.issues.findOne({ id: cursor });
        cursor = parent?.parentId || null;
      }
    }

    if (patch.statusId) {
      const state = await zite.statuses.findOne({ id: patch.statusId });
      if (!state || state.teamId !== before.teamId) throw new ZiteError('That status belongs to another team', 'BAD_REQUEST');
    }

    // Moving to another project drops a milestone that belonged to the old one.
    if (patch.projectId !== undefined && patch.projectId !== before.projectId && patch.milestoneId === undefined && before.milestoneId) {
      patch.milestoneId = null;
    }
    if (patch.milestoneId) {
      const ms = await zite.milestones.findOne({ id: patch.milestoneId });
      const projectId = patch.projectId !== undefined ? patch.projectId : before.projectId;
      if (!ms) throw new ZiteError('Milestone not found', 'NOT_FOUND');
      if (!projectId) patch.projectId = ms.projectId ?? null;
      else if (ms.projectId !== projectId) throw new ZiteError('That milestone belongs to another project', 'BAD_REQUEST');
    }

    const { patch: stamps } = patch.statusId !== undefined
      ? await timestampsForState(patch.statusId, before)
      : { patch: {} };

    await zite.issues.update({ id: data.id, record: { ...patch, ...stamps } });

    const changes = await recordIssueChanges(
      { issueId: data.id, identifier: before.identifier ?? '', title: patch.title ?? before.title ?? '', actor },
      before as unknown as Record<string, unknown>,
      patch,
    );

    const [issue] = await loadIssues([data.id]);
    return { issue, changes };
  },
});
