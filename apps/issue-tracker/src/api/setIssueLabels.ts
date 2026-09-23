import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';

const schema = z.object({ issueId: z.string().min(1), labelIds: z.array(z.string()).max(50) });

export default createEndpoint({
  description: 'Replace the label set on an issue',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ added: z.number(), removed: z.number() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Invalid labels', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    const issue = await zite.issues.findOne({ id: data.issueId });
    if (!issue) throw new ZiteError('Issue not found', 'NOT_FOUND');

    const existing = (await zite.issueLabels.findAll({ filters: { issueId: data.issueId }, limit: 200 })).records;
    const have = new Map(existing.map(r => [r.labelId ?? '', r.id]));
    const want = new Set(data.labelIds);
    const toAdd = [...want].filter(l => !have.has(l));
    const toRemove = [...have.entries()].filter(([labelId]) => !want.has(labelId));

    if (toAdd.length) {
      await zite.issueLabels.bulkCreate({ records: toAdd.map(labelId => ({ name: issue.identifier ?? 'label', issueId: data.issueId, labelId })) });
    }
    for (const [, rowId] of toRemove) await zite.issueLabels.delete({ id: rowId });

    const all = (await zite.labels.findAll({ limit: 500 })).records;
    const nameOf = (id: string) => all.find(l => l.id === id)?.name ?? null;
    const occurredAt = new Date().toISOString();
    const rows = [
      ...toAdd.map(id => ({ name: 'added label', issueId: data.issueId, actorId: actor.id, type: 'label_added', toLabel: nameOf(id), toValue: id, occurredAt })),
      ...toRemove.map(([id]) => ({ name: 'removed label', issueId: data.issueId, actorId: actor.id, type: 'label_removed', fromLabel: nameOf(id), fromValue: id, occurredAt })),
    ];
    if (rows.length) await zite.activity.bulkCreate({ records: rows });

    return { added: toAdd.length, removed: toRemove.length };
  },
});
