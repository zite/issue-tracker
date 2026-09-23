import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { day, iso, num, ref, str } from '../server/sql';

/** One project: description, milestones with progress, the update feed and a weekly progress history. */
export default createEndpoint({
  description: 'Load one project with milestones, updates, contributors and progress over time',
  authenticated: true,
  inputSchema: z.object({ id: z.string().min(1) }),
  outputSchema: z.object({
    project: z.object({
      id: z.string(), name: z.string(), summary: z.string().nullable(), description: z.string(),
      status: z.string(), health: z.string(), icon: z.string().nullable(), color: z.string().nullable(),
      teamId: z.string().nullable(), leadId: z.string().nullable(), goalId: z.string().nullable(), priority: z.number(),
      startDate: z.string().nullable(), targetDate: z.string().nullable(), completedAt: z.string().nullable(),
    }),
    breakdown: z.array(z.object({ statusType: z.string(), count: z.number(), points: z.number() })),
    milestones: z.array(z.object({
      id: z.string(), name: z.string(), description: z.string().nullable(), targetDate: z.string().nullable(),
      position: z.number(), total: z.number(), done: z.number(),
    })),
    updates: z.array(z.object({
      id: z.string(), name: z.string(), body: z.string(), health: z.string(), postedAt: z.string().nullable(), authorId: z.string().nullable(),
    })),
    contributors: z.array(z.object({ id: z.string(), open: z.number(), completed: z.number(), points: z.number() })),
    progress: z.array(z.object({ week: z.string(), scope: z.number(), completed: z.number(), started: z.number() })),
  }),
  execute: async ({ input }) => {
    const [projectRows, breakdownRows, milestoneRows, updateRows, contributorRows, issueRows] = await Promise.all([
      zite.sql({ query: `SELECT * FROM "Projects" WHERE id::text = $1 LIMIT 1`, params: [input.id] }),
      zite.sql({
        query: `
          SELECT COALESCE(ws."type", 'backlog') AS "statusType", COUNT(*) AS "count", COALESCE(SUM(COALESCE(i."estimate", 1)), 0) AS "points"
          FROM "Issues" i LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
          WHERE i."projectId" = $1 AND COALESCE(i."archived", false) = false
          GROUP BY COALESCE(ws."type", 'backlog')`,
        params: [input.id],
      }),
      zite.sql({
        query: `
          SELECT ms.id, ms."name", ms."description", ms."targetDate", ms."position",
                 COUNT(i.id) AS "total",
                 COUNT(i.id) FILTER (WHERE ws."type" IN ('completed', 'canceled')) AS "done"
          FROM "Milestones" ms
          LEFT JOIN "Issues" i ON i."milestoneId" = ms.id::text AND COALESCE(i."archived", false) = false
          LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
          WHERE ms."projectId" = $1
          GROUP BY ms.id, ms."name", ms."description", ms."targetDate", ms."position"
          ORDER BY ms."targetDate" ASC NULLS LAST, ms."position" ASC NULLS LAST`,
        params: [input.id],
      }),
      zite.sql({
        query: `SELECT id, "name", "body", "health", "postedAt", "authorId" FROM "CheckIns" WHERE "projectId" = $1 ORDER BY COALESCE("postedAt", created_at) DESC`,
        params: [input.id],
      }),
      zite.sql({
        query: `
          SELECT i."assigneeId",
                 COUNT(*) FILTER (WHERE COALESCE(ws."type", 'backlog') NOT IN ('completed', 'canceled')) AS "open",
                 COUNT(*) FILTER (WHERE ws."type" = 'completed') AS "completed",
                 COALESCE(SUM(COALESCE(i."estimate", 1)), 0) AS "points"
          FROM "Issues" i LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
          WHERE i."projectId" = $1 AND COALESCE(i."archived", false) = false AND COALESCE(i."assigneeId", '') <> ''
          GROUP BY i."assigneeId"
          ORDER BY COUNT(*) DESC`,
        params: [input.id],
      }),
      zite.sql({
        query: `
          SELECT COALESCE(i."openedAt", i.created_at) AS "openedAt", i."startedAt", i."completedAt", i."canceledAt"
          FROM "Issues" i WHERE i."projectId" = $1 AND COALESCE(i."archived", false) = false`,
        params: [input.id],
      }),
    ]);

    if (projectRows.rows.length === 0) throw new ZiteError('Project not found', 'NOT_FOUND');
    const p = projectRows.rows[0];

    // Weekly scope vs completed, from each issue's own timestamps. Twelve weeks
    // back from now (or from the project's start, whichever is later).
    const WEEK = 7 * 86_400_000;
    const issues = issueRows.rows.map(r => ({
      opened: r.openedAt ? new Date(String(r.openedAt)).getTime() : 0,
      started: r.startedAt ? new Date(String(r.startedAt)).getTime() : null,
      completed: r.completedAt ? new Date(String(r.completedAt)).getTime() : null,
      canceled: r.canceledAt ? new Date(String(r.canceledAt)).getTime() : null,
    }));
    const now = Date.now();
    const earliest = issues.length ? Math.min(...issues.map(i => i.opened || now)) : now;
    const start = Math.max(earliest, now - 12 * WEEK);
    const progress: Array<{ week: string; scope: number; completed: number; started: number }> = [];
    for (let t = start; t <= now + 1; t += WEEK) {
      const at = Math.min(t, now);
      const inScope = issues.filter(i => i.opened <= at && !(i.canceled && i.canceled <= at));
      progress.push({
        week: new Date(at).toISOString().slice(0, 10),
        scope: inScope.length,
        completed: inScope.filter(i => i.completed && i.completed <= at).length,
        started: inScope.filter(i => i.started && i.started <= at && !(i.completed && i.completed <= at)).length,
      });
    }
    if (progress.length && progress[progress.length - 1].week !== new Date(now).toISOString().slice(0, 10)) {
      const inScope = issues.filter(i => !i.canceled);
      progress.push({
        week: new Date(now).toISOString().slice(0, 10),
        scope: inScope.length,
        completed: inScope.filter(i => i.completed).length,
        started: inScope.filter(i => i.started && !i.completed).length,
      });
    }

    return {
      project: {
        id: String(p.id), name: str(p.name) ?? '', summary: ref(p.summary), description: str(p.description) ?? '',
        status: ref(p.status) ?? 'Planned', health: ref(p.health) ?? 'Unknown', icon: ref(p.icon), color: ref(p.color),
        teamId: ref(p.teamId), leadId: ref(p.leadId), goalId: ref(p.goalId), priority: num(p.priority),
        startDate: day(p.startDate), targetDate: day(p.targetDate), completedAt: iso(p.completedAt),
      },
      breakdown: breakdownRows.rows.map(r => ({ statusType: String(r.statusType), count: num(r.count), points: num(r.points) })),
      milestones: milestoneRows.rows.map(r => ({
        id: String(r.id), name: str(r.name) ?? '', description: ref(r.description), targetDate: day(r.targetDate),
        position: num(r.position), total: num(r.total), done: num(r.done),
      })),
      updates: updateRows.rows.map(r => ({
        id: String(r.id), name: str(r.name) ?? '', body: str(r.body) ?? '', health: ref(r.health) ?? 'On Track',
        postedAt: iso(r.postedAt), authorId: ref(r.authorId),
      })),
      contributors: contributorRows.rows.map(r => ({ id: String(r.assigneeId), open: num(r.open), completed: num(r.completed), points: num(r.points) })),
      progress,
    };
  },
});
