import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { ISSUE_FROM, ISSUE_SELECT, ORDER_BY, buildIssueWhere, enrichIssues, issueDto, issueFilterSchema, mapIssueRow } from '../server/issues';

export default createEndpoint({
  description: 'List issues for any surface — filtered and ordered in SQL, with row counts resolved',
  authenticated: true,
  inputSchema: z.object({
    filters: issueFilterSchema.optional(),
    ordering: z.string().max(40).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    offset: z.number().int().min(0).optional(),
  }),
  outputSchema: z.object({
    issues: z.array(issueDto),
    total: z.number(),
    truncated: z.boolean(),
  }),
  execute: async ({ input }) => {
    const limit = Math.min(1000, Math.max(1, Math.floor(input.limit ?? 600)));
    const offset = Math.max(0, Math.floor(input.offset ?? 0));
    // An unknown ordering degrades to the default rather than reaching SQL.
    const orderBy = ORDER_BY[input.ordering ?? 'manual'] ?? ORDER_BY.manual;

    const { clause, params } = await buildIssueWhere(input.filters ?? {});

    const [rows, countRows] = await Promise.all([
      zite.sql({ query: `${ISSUE_SELECT} ${clause} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`, params }),
      zite.sql({ query: `SELECT COUNT(*) AS "total" ${ISSUE_FROM} ${clause}`, params }),
    ]);

    const issues = await enrichIssues(rows.rows.map(mapIssueRow));
    const total = Number(countRows.rows[0]?.total ?? 0);
    return { issues, total, truncated: total > offset + issues.length };
  },
});
