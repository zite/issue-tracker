import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';
import { createNotifications, watchersOf } from '../server/changes';

const RELATION = z.enum(['blocks', 'blocked_by', 'relates', 'duplicate_of', 'duplicated_by']);
const schema = z.object({
  issueId: z.string().min(1),
  relatedIssueId: z.string().min(1),
  type: RELATION,
  remove: z.boolean().optional(),
});

const INVERSE: Record<string, string> = {
  blocks: 'blocked_by', blocked_by: 'blocks', relates: 'relates',
  duplicate_of: 'duplicated_by', duplicated_by: 'duplicate_of',
};

const PHRASE: Record<string, string> = {
  blocks: 'blocks', blocked_by: 'is blocked by', relates: 'relates to',
  duplicate_of: 'is a duplicate of', duplicated_by: 'is duplicated by',
};

/**
 * Relations are stored from both sides. Two rows, but "what blocks this?" is a
 * plain lookup from either issue instead of a UNION on every read.
 */
export default createEndpoint({
  description: 'Link or unlink two issues (blocks, relates, duplicates)',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ linked: z.boolean() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Invalid relation', 'BAD_REQUEST');
    const data = parsed.data;
    if (data.issueId === data.relatedIssueId) throw new ZiteError('An issue cannot relate to itself', 'BAD_REQUEST');
    const actor = await getActor(context);

    const [a, b] = await Promise.all([zite.issues.findOne({ id: data.issueId }), zite.issues.findOne({ id: data.relatedIssueId })]);
    if (!a || !b) throw new ZiteError('Issue not found', 'NOT_FOUND');
    const inverse = INVERSE[data.type];
    const occurredAt = new Date().toISOString();

    if (data.remove) {
      for (const filters of [
        { issueId: data.issueId, relatedIssueId: data.relatedIssueId, type: data.type },
        { issueId: data.relatedIssueId, relatedIssueId: data.issueId, type: inverse },
      ]) {
        const row = await zite.issueRelations.findOne({ filters });
        if (row) await zite.issueRelations.delete({ id: row.id });
      }
      await zite.activity.bulkCreate({
        records: [
          { name: `removed relation`, issueId: a.id, actorId: actor.id, type: 'relation_removed', fromLabel: b.identifier ?? null, fromValue: b.id, occurredAt },
          { name: `removed relation`, issueId: b.id, actorId: actor.id, type: 'relation_removed', fromLabel: a.identifier ?? null, fromValue: a.id, occurredAt },
        ],
      });
      return { linked: false };
    }

    // One relation per pair — replacing "relates" with "blocks" should not leave both.
    for (const filters of [
      { issueId: data.issueId, relatedIssueId: data.relatedIssueId },
      { issueId: data.relatedIssueId, relatedIssueId: data.issueId },
    ]) {
      const { records } = await zite.issueRelations.findAll({ filters, limit: 20 });
      for (const r of records) await zite.issueRelations.delete({ id: r.id });
    }

    await zite.issueRelations.bulkCreate({
      records: [
        { name: `${a.identifier} ${data.type} ${b.identifier}`, issueId: a.id, relatedIssueId: b.id, type: data.type },
        { name: `${b.identifier} ${inverse} ${a.identifier}`, issueId: b.id, relatedIssueId: a.id, type: inverse },
      ],
    });

    await zite.activity.bulkCreate({
      records: [
        { name: `marked as ${PHRASE[data.type]}`, issueId: a.id, actorId: actor.id, type: 'relation_added', toLabel: b.identifier ?? null, toValue: b.id, fromValue: data.type, occurredAt },
        { name: `marked as ${PHRASE[inverse]}`, issueId: b.id, actorId: actor.id, type: 'relation_added', toLabel: a.identifier ?? null, toValue: a.id, fromValue: inverse, occurredAt },
      ],
    });

    // Becoming blocked is news the assignee of the blocked issue needs.
    const blocked = data.type === 'blocks' ? b : data.type === 'blocked_by' ? a : null;
    const blocker = blocked === a ? b : a;
    if (blocked) {
      const audience = new Set(await watchersOf(blocked.id, actor.id));
      if (blocked.assigneeId && blocked.assigneeId !== actor.id) audience.add(blocked.assigneeId);
      await createNotifications([...audience], {
        type: 'blocked', actorId: actor.id, issueId: blocked.id,
        name: `${blocked.identifier} is now blocked by ${blocker.identifier}`, body: blocked.title ?? '', occurredAt,
      });
    }

    return { linked: true };
  },
});
