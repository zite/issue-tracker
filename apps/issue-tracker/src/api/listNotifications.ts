import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';
import { bool, iso, num, ref, str } from '../server/sql';

export default createEndpoint({
  description: "Load the signed-in member's inbox",
  authenticated: true,
  inputSchema: z.object({ filter: z.enum(['inbox', 'unread', 'snoozed', 'archived']).optional() }),
  outputSchema: z.object({
    notifications: z.array(z.object({
      id: z.string(), type: z.string(), name: z.string(), body: z.string().nullable(),
      read: z.boolean(), archived: z.boolean(), occurredAt: z.string().nullable(), snoozedUntil: z.string().nullable(),
      actorId: z.string().nullable(), commentId: z.string().nullable(),
      issueId: z.string().nullable(), identifier: z.string().nullable(), issueTitle: z.string().nullable(),
      statusId: z.string().nullable(), priority: z.number().nullable(), assigneeId: z.string().nullable(),
      projectId: z.string().nullable(),
    })),
    unreadCount: z.number(),
    counts: z.object({ inbox: z.number(), snoozed: z.number(), archived: z.number() }),
  }),
  execute: async ({ input, context }) => {
    const actor = await getActor(context);
    const filter = input.filter ?? 'inbox';

    // A snoozed notification is one whose snooze has not elapsed — no sweep job
    // is needed to put it back.
    const clause =
      filter === 'archived' ? `COALESCE(n."archived", false) = true`
      : filter === 'snoozed' ? `n."snoozedUntil" > NOW() AND COALESCE(n."archived", false) = false`
      : filter === 'unread' ? `COALESCE(n."read", false) = false AND COALESCE(n."archived", false) = false AND (n."snoozedUntil" IS NULL OR n."snoozedUntil" <= NOW())`
      : `COALESCE(n."archived", false) = false AND (n."snoozedUntil" IS NULL OR n."snoozedUntil" <= NOW())`;

    const [rows, counts] = await Promise.all([
      zite.sql({
        query: `
          SELECT n.id, n."type", n."name", n."body", n."read", n."archived", n."occurredAt", n."snoozedUntil",
                 n."actorId", n."commentId", n."issueId", n."projectId",
                 i."identifier", i."title" AS "issueTitle", i."statusId", i."priority", i."assigneeId"
          FROM "Notifications" n
          LEFT JOIN "Issues" i ON i.id::text = n."issueId"
          WHERE n."memberId" = $1 AND ${clause}
          ORDER BY COALESCE(n."occurredAt", n.created_at) DESC
          LIMIT 300`,
        params: [actor.id],
      }),
      zite.sql({
        query: `
          SELECT
            COUNT(*) FILTER (WHERE COALESCE("read", false) = false AND COALESCE("archived", false) = false AND ("snoozedUntil" IS NULL OR "snoozedUntil" <= NOW())) AS "unread",
            COUNT(*) FILTER (WHERE COALESCE("archived", false) = false AND ("snoozedUntil" IS NULL OR "snoozedUntil" <= NOW())) AS "inbox",
            COUNT(*) FILTER (WHERE "snoozedUntil" > NOW() AND COALESCE("archived", false) = false) AS "snoozed",
            COUNT(*) FILTER (WHERE COALESCE("archived", false) = true) AS "archived"
          FROM "Notifications" WHERE "memberId" = $1`,
        params: [actor.id],
      }),
    ]);

    const c = counts.rows[0] ?? {};
    return {
      notifications: rows.rows.map(r => ({
        id: String(r.id), type: str(r.type) ?? 'subscribed', name: str(r.name) ?? '', body: ref(r.body),
        read: bool(r.read), archived: bool(r.archived), occurredAt: iso(r.occurredAt), snoozedUntil: iso(r.snoozedUntil),
        actorId: ref(r.actorId), commentId: ref(r.commentId), issueId: ref(r.issueId), identifier: ref(r.identifier),
        issueTitle: ref(r.issueTitle), statusId: ref(r.statusId), priority: r.priority == null ? null : num(r.priority),
        assigneeId: ref(r.assigneeId), projectId: ref(r.projectId),
      })),
      unreadCount: num(c.unread),
      counts: { inbox: num(c.inbox), snoozed: num(c.snoozed), archived: num(c.archived) },
    };
  },
});
