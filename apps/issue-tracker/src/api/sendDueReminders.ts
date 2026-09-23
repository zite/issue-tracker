import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { createNotifications } from '../server/changes';

/**
 * Every morning: tell each assignee about open work due tomorrow, and about work
 * that just went overdue. Runs on a schedule (no signed-in user), and is
 * idempotent per issue per day, so a retry or a manual run never double-notifies.
 */
export default createEndpoint({
  description: 'Daily reminders for open issues due tomorrow or newly overdue',
  schedule: {
    scheduleType: 'recurring',
    schedule: { frequency: 'daily', interval: 1, times: ['08:00'] },
    timezone: 'UTC',
    overlapPolicy: 'skip',
  },
  inputSchema: z.object({}),
  outputSchema: z.object({ notified: z.number() }),
  execute: async () => {
    const { rows } = await zite.sql({
      query: `
        SELECT i.id, i."identifier", i."title", i."assigneeId", i."creatorId", i."dueDate",
               CASE WHEN i."dueDate" = CURRENT_DATE + 1 THEN 'tomorrow' ELSE 'overdue' END AS "kind"
        FROM "Issues" i
        LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
        WHERE COALESCE(i."archived", false) = false
          AND COALESCE(i."assigneeId", '') <> ''
          AND COALESCE(ws."type", 'backlog') NOT IN ('completed', 'canceled')
          AND (i."dueDate" = CURRENT_DATE + 1 OR i."dueDate" = CURRENT_DATE - 1)
          AND NOT EXISTS (
            SELECT 1 FROM "Notifications" n
            WHERE n."issueId" = i.id::text AND n."type" = 'due_soon' AND n."occurredAt" > NOW() - INTERVAL '20 hours'
          )`,
    });

    let notified = 0;
    for (const r of rows) {
      const identifier = String(r.identifier ?? '');
      notified += await createNotifications([String(r.assigneeId)], {
        type: 'due_soon',
        // The creator is the natural "actor" for a deadline they set; the actor is only used for the avatar.
        actorId: String(r.creatorId || r.assigneeId),
        issueId: String(r.id),
        name: r.kind === 'tomorrow' ? `${identifier} is due tomorrow` : `${identifier} is now overdue`,
        body: String(r.title ?? ''),
      });
    }
    return { notified };
  },
});
