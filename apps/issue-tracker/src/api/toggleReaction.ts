import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';

const schema = z.object({ commentId: z.string().min(1), emoji: z.string().min(1).max(16) });

export default createEndpoint({
  description: 'Add or remove your reaction on a comment',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ added: z.boolean() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Invalid reaction', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    const comment = await zite.comments.findOne({ id: data.commentId });
    if (!comment) throw new ZiteError('Comment not found', 'NOT_FOUND');

    const existing = await zite.reactions.findOne({ filters: { commentId: data.commentId, memberId: actor.id, emoji: data.emoji } });
    if (existing) {
      await zite.reactions.delete({ id: existing.id });
      return { added: false };
    }
    await zite.reactions.create({
      record: { name: data.emoji, commentId: data.commentId, issueId: comment.issueId ?? null, memberId: actor.id, emoji: data.emoji },
    });
    return { added: true };
  },
});
