import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';
import { createNotifications, mentionedMemberIds, subscribe, watchersOf } from '../server/changes';

const schema = z.object({
  issueId: z.string().min(1),
  body: z.string().trim().min(1).max(50_000),
  parentId: z.string().nullable().optional(),
});

export default createEndpoint({
  description: 'Post a comment or reply, notifying watchers and anyone mentioned',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ id: z.string(), postedAt: z.string(), notified: z.number() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('A comment cannot be empty', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    const issue = await zite.issues.findOne({ id: data.issueId });
    if (!issue) throw new ZiteError('Issue not found', 'NOT_FOUND');

    // Replies thread one level deep — a reply to a reply joins its root.
    let parentId = data.parentId ?? null;
    if (parentId) {
      const parent = await zite.comments.findOne({ id: parentId });
      if (!parent || parent.issueId !== data.issueId) throw new ZiteError('Comment not found', 'NOT_FOUND');
      parentId = parent.parentId || parent.id;
    }

    const postedAt = new Date().toISOString();
    const comment = await zite.comments.create({
      record: { body: data.body, issueId: data.issueId, authorId: actor.id, parentId, postedAt, editedAt: null, resolved: false },
    });

    // Commenting is an implicit subscription — you want to hear the reply.
    await subscribe(data.issueId, actor.id);

    const mentioned = (await mentionedMemberIds(data.body)).filter(id => id !== actor.id);
    const watchers = (await watchersOf(data.issueId, actor.id)).filter(id => !mentioned.includes(id));
    const identifier = issue.identifier ?? '';

    // A mention outranks a plain comment notification: exactly one each, the specific one.
    let notified = 0;
    if (mentioned.length) {
      notified += await createNotifications(mentioned, {
        type: 'mentioned', actorId: actor.id, issueId: data.issueId, commentId: comment.id,
        name: `${actor.name} mentioned you in ${identifier}`, body: data.body, occurredAt: postedAt,
      });
      for (const id of mentioned) await subscribe(data.issueId, id);
    }
    if (watchers.length) {
      notified += await createNotifications(watchers, {
        type: 'commented', actorId: actor.id, issueId: data.issueId, commentId: comment.id,
        name: `${actor.name} commented on ${identifier}`, body: data.body, occurredAt: postedAt,
      });
    }

    return { id: comment.id, postedAt, notified };
  },
});
