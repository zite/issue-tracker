import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { day, iso, num, ref, str } from '../server/sql';

export default createEndpoint({
  description: 'List sprints with scope and completion totals',
  authenticated: true,
  inputSchema: z.object({ teamId: z.string().optional() }),
  outputSchema: z.object({
    sprints: z.array(z.object({
      id: z.string(), teamId: z.string().nullable(), number: z.number(), name: z.string(), goal: z.string().nullable(),
      startDate: z.string().nullable(), endDate: z.string().nullable(), completedAt: z.string().nullable(),
      status: z.enum(['completed', 'active', 'upcoming']),
      issues: z.number(), completed: z.number(), started: z.number(), points: z.number(), completedPoints: z.number(),
    })),
  }),
  execute: async ({ input }) => {
    const params: unknown[] = [];
    const where = input.teamId ? `WHERE cy."teamId" = $${params.push(input.teamId)}` : '';
    const { rows } = await zite.sql({
      query: `
        SELECT cy.id, cy."teamId", cy."number", cy."name", cy."goal", cy."startDate", cy."endDate", cy."completedAt",
               COUNT(i.id) AS "issues",
               COUNT(i.id) FILTER (WHERE ws."type" = 'completed') AS "completed",
               COUNT(i.id) FILTER (WHERE ws."type" = 'started') AS "started",
               COALESCE(SUM(COALESCE(i."estimate", 1)) FILTER (WHERE i.id IS NOT NULL AND COALESCE(ws."type", 'backlog') <> 'canceled'), 0) AS "points",
               COALESCE(SUM(COALESCE(i."estimate", 1)) FILTER (WHERE ws."type" = 'completed'), 0) AS "completedPoints"
        FROM "Sprints" cy
        LEFT JOIN "Issues" i ON i."sprintId" = cy.id::text AND COALESCE(i."archived", false) = false
        LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
        ${where}
        GROUP BY cy.id, cy."teamId", cy."number", cy."name", cy."goal", cy."startDate", cy."endDate", cy."completedAt"
        ORDER BY cy."startDate" DESC NULLS LAST`,
      params,
    });

    const today = new Date().toISOString().slice(0, 10);
    return {
      sprints: rows.map(r => {
        const start = day(r.startDate);
        const end = day(r.endDate);
        const status = r.completedAt || (end && end < today) ? 'completed' as const : start && start > today ? 'upcoming' as const : 'active' as const;
        return {
          id: String(r.id), teamId: ref(r.teamId), number: num(r.number), name: str(r.name) || `Sprint ${num(r.number)}`,
          goal: ref(r.goal), startDate: start, endDate: end, completedAt: iso(r.completedAt), status,
          issues: num(r.issues), completed: num(r.completed), started: num(r.started),
          points: num(r.points), completedPoints: num(r.completedPoints),
        };
      }),
    };
  },
});
