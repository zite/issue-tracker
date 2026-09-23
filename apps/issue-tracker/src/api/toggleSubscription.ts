import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';

const schema = z.object({ issueId: z.string().min(1), subscribed: z.boolean() });

export default createEndpoint({
  description: 'Subscribe to or unsubscribe from an issue',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ subscribed: z.boolean() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Invalid request', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    const issue = await zite.issues.findOne({ id: data.issueId });
    if (!issue) throw new ZiteError('Issue not found', 'NOT_FOUND');

    // Explicit target state rather than a toggle, so a double click is idempotent.
    const existing = await zite.issueSubscribers.findAll({ filters: { issueId: data.issueId, memberId: actor.id }, limit: 10 });
    if (!data.subscribed) {
      for (const r of existing.records) await zite.issueSubscribers.delete({ id: r.id });
      return { subscribed: false };
    }
    if (existing.records.length === 0) {
      await zite.issueSubscribers.create({ record: { name: 'subscriber', issueId: data.issueId, memberId: actor.id } });
    }
    return { subscribed: true };
  },
});
