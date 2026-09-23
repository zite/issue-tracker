import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { num, ref, str } from '../server/sql';

/**
 * Powers the command palette. An exact identifier match ranks above everything
 * — typing ENG-142 must put ENG-142 first. Projects, people and views are
 * matched client-side from bootstrap, so this only has to search issues.
 */
export default createEndpoint({
  description: 'Search issues by identifier, title and description',
  authenticated: true,
  inputSchema: z.object({ query: z.string().max(200), limit: z.number().int().min(1).max(50).optional() }),
  outputSchema: z.object({
    issues: z.array(z.object({
      id: z.string(), identifier: z.string(), title: z.string(), teamId: z.string().nullable(),
      statusId: z.string().nullable(), priority: z.number(), assigneeId: z.string().nullable(), archived: z.boolean(),
    })),
  }),
  execute: async ({ input }) => {
    const q = input.query.trim();
    if (!q) return { issues: [] };
    const limit = Math.min(50, input.limit ?? 12);
    const like = `%${q.toLowerCase()}%`;
    const upper = q.toUpperCase();

    const { rows } = await zite.sql({
      query: `
        SELECT i.id, i."identifier", i."title", i."teamId", i."statusId", i."priority", i."assigneeId", i."archived"
        FROM "Issues" i
        WHERE LOWER(i."title") LIKE $1 OR UPPER(i."identifier") LIKE $2 OR LOWER(COALESCE(i."description", '')) LIKE $1
        ORDER BY
          CASE WHEN UPPER(i."identifier") = $3 THEN 0
               WHEN UPPER(i."identifier") LIKE $2 THEN 1
               WHEN LOWER(i."title") LIKE $4 THEN 2
               WHEN LOWER(i."title") LIKE $1 THEN 3
               ELSE 4 END ASC,
          COALESCE(i."archived", false) ASC,
          i.updated_at DESC
        LIMIT ${limit}`,
      params: [like, `${upper}%`, upper, `${q.toLowerCase()}%`],
    });

    return {
      issues: rows.map(r => ({
        id: String(r.id), identifier: str(r.identifier) ?? '', title: str(r.title) ?? '', teamId: ref(r.teamId),
        statusId: ref(r.statusId), priority: num(r.priority), assigneeId: ref(r.assigneeId), archived: r.archived === true,
      })),
    };
  },
});
