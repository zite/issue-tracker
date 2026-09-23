import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';
import { recordIssueChanges, timestampsForState, type IssuePatch } from '../server/changes';

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(250),
  /** Status is per team, so a multi-team selection maps a state TYPE onto each team's matching state. */
  statusType: z.enum(['intake', 'backlog', 'unstarted', 'started', 'completed', 'canceled']).optional(),
  statusId: z.string().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  assigneeId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  sprintId: z.string().nullable().optional(),
  estimate: z.number().int().min(0).max(100).nullable().optional(),
  issueType: z.enum(['Feature', 'Bug', 'Improvement', 'Task', 'Spike', 'Chore']).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  parentId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
  addLabelIds: z.array(z.string()).optional(),
  removeLabelIds: z.array(z.string()).optional(),
});

/**
 * One change across a multi-selection. Nothing here is transactional, so it
 * applies per issue and reports what it managed rather than pretending the
 * batch is atomic.
 */
export default createEndpoint({
  description: 'Apply one property change across many selected issues',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ updated: z.number(), skipped: z.number() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid update', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    const base: IssuePatch = {};
    for (const key of ['priority', 'assigneeId', 'projectId', 'estimate', 'issueType', 'dueDate', 'archived', 'parentId'] as const) {
      if ((data as Record<string, unknown>)[key] !== undefined) (base as Record<string, unknown>)[key] = (data as Record<string, unknown>)[key];
    }
    const touchesLabels = Boolean(data.addLabelIds?.length || data.removeLabelIds?.length);
    const touchesState = Boolean(data.statusType || data.statusId);
    if (Object.keys(base).length === 0 && !touchesLabels && !touchesState && data.sprintId === undefined) {
      throw new ZiteError('Nothing to update', 'BAD_REQUEST');
    }

    const states = touchesState ? (await zite.statuses.findAll({ limit: 500 })).records : [];
    const sprint = data.sprintId ? await zite.sprints.findOne({ id: data.sprintId }) : null;

    let updated = 0;
    let skipped = 0;
    for (const id of data.ids) {
      const before = await zite.issues.findOne({ id });
      if (!before) {
        skipped++;
        continue;
      }

      const patch: IssuePatch = { ...base };
      if (data.statusId) {
        const s = states.find(x => x.id === data.statusId);
        if (s && s.teamId === before.teamId) patch.statusId = s.id;
      } else if (data.statusType) {
        const s = states
          .filter(x => x.teamId === before.teamId && x.type === data.statusType)
          .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))[0];
        if (s) patch.statusId = s.id;
      }
      // A sprint belongs to one team; issues from other teams are left unscheduled rather than mis-scheduled.
      if (data.sprintId === null) patch.sprintId = null;
      else if (sprint && sprint.teamId === before.teamId) patch.sprintId = sprint.id;
      if (patch.projectId !== undefined && patch.projectId !== before.projectId && before.milestoneId) patch.milestoneId = null;
      if (patch.parentId === id) delete patch.parentId;

      if (Object.keys(patch).length) {
        const { patch: stamps } = patch.statusId ? await timestampsForState(patch.statusId, before) : { patch: {} };
        await zite.issues.update({ id, record: { ...patch, ...stamps } });
        await recordIssueChanges(
          { issueId: id, identifier: before.identifier ?? '', title: before.title ?? '', actor },
          before as unknown as Record<string, unknown>,
          patch,
        );
      }

      if (touchesLabels) {
        const existing = (await zite.issueLabels.findAll({ filters: { issueId: id }, limit: 200 })).records;
        const have = new Set(existing.map(r => r.labelId));
        const toAdd = (data.addLabelIds ?? []).filter(l => !have.has(l));
        if (toAdd.length) {
          await zite.issueLabels.bulkCreate({ records: toAdd.map(labelId => ({ name: before.identifier ?? 'label', issueId: id, labelId })) });
        }
        for (const row of existing) {
          if (row.labelId && data.removeLabelIds?.includes(row.labelId)) await zite.issueLabels.delete({ id: row.id });
        }
      }
      updated++;
    }

    return { updated, skipped };
  },
});
