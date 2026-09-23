import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';

const schema = z.object({
  id: z.string().min(1),
  body: z.string().trim().min(1).max(50_000).optional(),
  resolved: z.boolean().optional(),
  remove: z.boolean().optional(),
});

export default createEndpoint({
  description: 'Edit, resolve or delete a comment',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ id: z.string(), removed: z.boolean() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('A comment cannot be empty', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    const comment = await zite.comments.findOne({ id: data.id });
    if (!comment) throw new ZiteError('Comment not found', 'NOT_FOUND');

    // Anyone can resolve a thread; only the author can change or delete what they wrote.
    if (data.resolved !== undefined) {
      await zite.comments.update({ id: data.id, record: { resolved: data.resolved } });
      return { id: data.id, removed: false };
    }
    if (comment.authorId !== actor.id) throw new ZiteError('You can only change your own comments', 'FORBIDDEN');

    if (data.remove) {
      const replies = await zite.comments.findAll({ filters: { parentId: data.id }, limit: 500 });
      for (const target of [...replies.records.map(r => r.id), data.id]) {
        const reactions = await zite.reactions.findAll({ filters: { commentId: target }, limit: 500 });
        for (const r of reactions.records) await zite.reactions.delete({ id: r.id });
        await zite.comments.delete({ id: target });
      }
      return { id: data.id, removed: true };
    }

    if (!data.body) throw new ZiteError('Nothing to update', 'BAD_REQUEST');
    await zite.comments.update({ id: data.id, record: { body: data.body, editedAt: new Date().toISOString() } });
    return { id: data.id, removed: false };
  },
});
