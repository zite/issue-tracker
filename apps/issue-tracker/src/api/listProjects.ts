import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { day, iso, num, ref, str } from '../server/sql';

export const projectSummary = z.object({
  id: z.string(), name: z.string(), summary: z.string().nullable(),
  status: z.string(), health: z.string(), icon: z.string().nullable(), color: z.string().nullable(),
  teamId: z.string().nullable(), leadId: z.string().nullable(), goalId: z.string().nullable(), priority: z.number(),
  startDate: z.string().nullable(), targetDate: z.string().nullable(), completedAt: z.string().nullable(), position: z.number(),
  total: z.number(), completed: z.number(), started: z.number(), canceled: z.number(),
  points: z.number(), completedPoints: z.number(),
  memberIds: z.array(z.string()),
  lastUpdateAt: z.string().nullable(), lastUpdateHealth: z.string().nullable(),
});

/**
 * Projects with their progress rollups. Progress is completed ÷ (total − canceled):
 * canceled work leaves the scope, so a project that cut scope to ship on time
 * did not fall behind. The client computes it in `projectProgress`.
 */
export default createEndpoint({
  description: 'List projects with issue rollups, contributors and latest update',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ projects: z.array(projectSummary) }),
  execute: async () => {
    const [rows, contributorRows, updateRows] = await Promise.all([
      zite.sql({
        query: `
          SELECT p.id, p."name", p."summary", p."status", p."health", p."icon", p."color", p."teamId", p."leadId",
                 p."goalId", p."priority", p."startDate", p."targetDate", p."completedAt", p."position",
                 COUNT(i.id) AS "total",
                 COUNT(i.id) FILTER (WHERE ws."type" = 'completed') AS "completed",
                 COUNT(i.id) FILTER (WHERE ws."type" = 'started') AS "started",
                 COUNT(i.id) FILTER (WHERE ws."type" = 'canceled') AS "canceled",
                 COALESCE(SUM(COALESCE(i."estimate", 1)) FILTER (WHERE i.id IS NOT NULL AND COALESCE(ws."type", 'backlog') <> 'canceled'), 0) AS "points",
                 COALESCE(SUM(COALESCE(i."estimate", 1)) FILTER (WHERE ws."type" = 'completed'), 0) AS "completedPoints"
          FROM "Projects" p
          LEFT JOIN "Issues" i ON i."projectId" = p.id::text AND COALESCE(i."archived", false) = false
          LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
          GROUP BY p.id, p."name", p."summary", p."status", p."health", p."icon", p."color", p."teamId", p."leadId",
                   p."goalId", p."priority", p."startDate", p."targetDate", p."completedAt", p."position"
          ORDER BY p."position" ASC NULLS LAST, p."name" ASC`,
      }),
      zite.sql({
        query: `
          SELECT DISTINCT i."projectId", i."assigneeId"
          FROM "Issues" i
          WHERE COALESCE(i."projectId", '') <> '' AND COALESCE(i."assigneeId", '') <> '' AND COALESCE(i."archived", false) = false`,
      }),
      zite.sql({
        query: `
          SELECT DISTINCT ON (pu."projectId") pu."projectId", pu."postedAt", pu."health"
          FROM "CheckIns" pu
          ORDER BY pu."projectId", pu."postedAt" DESC NULLS LAST`,
      }),
    ]);

    const members = new Map<string, string[]>();
    for (const r of contributorRows.rows) {
      const pid = String(r.projectId);
      if (!members.has(pid)) members.set(pid, []);
      members.get(pid)!.push(String(r.assigneeId));
    }
    const lastUpdate = new Map(updateRows.rows.map(r => [String(r.projectId), r]));

    return {
      projects: rows.rows.map(r => {
        const id = String(r.id);
        const u = lastUpdate.get(id);
        return {
          id, name: str(r.name) ?? '', summary: ref(r.summary), status: ref(r.status) ?? 'Planned', health: ref(r.health) ?? 'Unknown',
          icon: ref(r.icon), color: ref(r.color), teamId: ref(r.teamId), leadId: ref(r.leadId), goalId: ref(r.goalId),
          priority: num(r.priority), startDate: day(r.startDate), targetDate: day(r.targetDate), completedAt: iso(r.completedAt),
          position: num(r.position), total: num(r.total), completed: num(r.completed), started: num(r.started), canceled: num(r.canceled),
          points: num(r.points), completedPoints: num(r.completedPoints), memberIds: members.get(id) ?? [],
          lastUpdateAt: u ? iso(u.postedAt) : null, lastUpdateHealth: u ? ref(u.health) : null,
        };
      }),
    };
  },
});
