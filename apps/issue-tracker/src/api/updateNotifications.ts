import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';

const schema = z.object({
  /** Omit to act on the whole inbox — that is what "mark all read" and "archive all read" are. */
  ids: z.array(z.string()).max(500).optional(),
  read: z.boolean().optional(),
  archived: z.boolean().optional(),
  /** 0 un-snoozes. */
  snoozeHours: z.number().min(0).max(24 * 60).optional(),
  /** With no ids: only touch notifications that are already read. */
  onlyRead: z.boolean().optional(),
});

export default createEndpoint({
  description: 'Mark inbox notifications read, archived or snoozed',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ updated: z.number() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Invalid request', 'BAD_REQUEST');
    const data = parsed.data;
    if (data.read === undefined && data.archived === undefined && data.snoozeHours === undefined) {
      throw new ZiteError('Nothing to update', 'BAD_REQUEST');
    }
    const actor = await getActor(context);

    // Filter checkboxes in JS: an unset checkbox is null, which an `archived: false` filter would miss.
    // Scoped to the caller's own inbox, so an id from someone else's is simply not in this set.
    const mine = (await zite.notifications.findAll({ filters: { memberId: actor.id }, limit: 2000 })).records;
    const targets = data.ids?.length
      ? mine.filter(n => data.ids!.includes(n.id))
      : mine.filter(n => n.archived !== true && (!data.onlyRead || n.read === true));

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    if (data.read !== undefined) {
      patch.read = data.read;
      patch.readAt = data.read ? now : null;
    }
    if (data.archived !== undefined) patch.archived = data.archived;
    if (data.snoozeHours !== undefined) {
      patch.snoozedUntil = data.snoozeHours > 0 ? new Date(Date.now() + data.snoozeHours * 3_600_000).toISOString() : null;
      if (data.snoozeHours > 0) patch.read = true;
    }

    let updated = 0;
    for (const n of targets) {
      await zite.notifications.update({ id: n.id, record: patch });
      updated++;
    }
    return { updated };
  },
});
