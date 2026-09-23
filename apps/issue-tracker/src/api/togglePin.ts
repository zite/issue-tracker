import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';

const schema = z.object({
  entityType: z.enum(['Project', 'View', 'Sprint', 'Issue', 'Team', 'Goal']),
  entityId: z.string().min(1),
  pinned: z.boolean(),
});

export default createEndpoint({
  description: 'Pin or unpin something in your sidebar',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ pinned: z.boolean(), id: z.string().nullable() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Invalid request', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    const mine = (await zite.pins.findAll({ filters: { memberId: actor.id }, limit: 500 })).records;
    const existing = mine.filter(f => f.entityType === data.entityType && f.entityId === data.entityId);

    if (!data.pinned) {
      for (const f of existing) await zite.pins.delete({ id: f.id });
      return { pinned: false, id: null };
    }
    if (existing.length) return { pinned: true, id: existing[0].id };

    const position = Math.max(0, ...mine.map(f => Number(f.position ?? 0))) + 1;
    const created = await zite.pins.create({
      record: { name: data.entityType, memberId: actor.id, entityType: data.entityType, entityId: data.entityId, position },
    });
    return { pinned: true, id: created.id };
  },
});
