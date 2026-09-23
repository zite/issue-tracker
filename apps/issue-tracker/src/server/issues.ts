import { z } from 'zod';
import { zite } from 'zitejs/db';
import { Params, day, isBlank, isSet, iso, num, numOrNull, placeholders, ref, str } from './sql';

/**
 * The single place issue-reading SQL is written.
 *
 * Rows carry IDS, not display names. The client already holds every team,
 * state, member, project and sprint from `bootstrap`, so it resolves names
 * itself — which is what lets an optimistic status change re-render a row
 * correctly without also having to patch a stale `statusName` and `statusColor`.
 *
 * Rules that hold throughout:
 *   - table/column identifiers come from closed allowlists here, never input;
 *   - every runtime value is bound as a parameter;
 *   - joins cast the uuid side (`t.id::text = i."teamId"`) — the system id is a
 *     uuid, our foreign keys are text, and Postgres will not compare them;
 *   - an unset text column is '' (never NULL), so emptiness is `isBlank()`.
 */

export const issueDto = z.object({
  id: z.string(),
  identifier: z.string(),
  number: z.number(),
  title: z.string(),
  teamId: z.string().nullable(),
  statusId: z.string().nullable(),
  priority: z.number(),
  estimate: z.number().nullable(),
  issueType: z.string().nullable(),
  assigneeId: z.string().nullable(),
  creatorId: z.string().nullable(),
  projectId: z.string().nullable(),
  milestoneId: z.string().nullable(),
  sprintId: z.string().nullable(),
  parentId: z.string().nullable(),
  parentIdentifier: z.string().nullable(),
  parentTitle: z.string().nullable(),
  dueDate: z.string().nullable(),
  openedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  canceledAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  position: z.number(),
  archived: z.boolean(),
  labelIds: z.array(z.string()),
  subIssueTotal: z.number(),
  subIssueDone: z.number(),
  commentCount: z.number(),
  attachmentCount: z.number(),
  blockedBy: z.number(),
  blocking: z.number(),
  hasDescription: z.boolean(),
});

export type IssueDto = z.infer<typeof issueDto>;

export const ISSUE_FROM = `
  FROM "Issues" i
  LEFT JOIN "Teams" t           ON t.id::text  = i."teamId"
  LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
  LEFT JOIN "Issues" par        ON par.id::text = i."parentId"
`;

export const ISSUE_SELECT = `
  SELECT
    i.id, i."identifier", i."number", i."title", i."teamId", i."statusId",
    i."priority", i."estimate", i."issueType", i."assigneeId", i."creatorId",
    i."projectId", i."milestoneId", i."sprintId", i."parentId",
    i."dueDate", i."openedAt", i."startedAt", i."completedAt", i."canceledAt",
    i."position", i."archived", i.updated_at AS "updatedAt",
    (COALESCE(i."description", '') <> '') AS "hasDescription",
    par."identifier" AS "parentIdentifier", par."title" AS "parentTitle"
  ${ISSUE_FROM}
`;

export function mapIssueRow(row: Record<string, unknown>): IssueDto {
  return {
    id: String(row.id),
    identifier: str(row.identifier) ?? '',
    number: num(row.number),
    title: str(row.title) || 'Untitled',
    teamId: ref(row.teamId),
    statusId: ref(row.statusId),
    priority: num(row.priority),
    estimate: numOrNull(row.estimate),
    issueType: ref(row.issueType),
    assigneeId: ref(row.assigneeId),
    creatorId: ref(row.creatorId),
    projectId: ref(row.projectId),
    milestoneId: ref(row.milestoneId),
    sprintId: ref(row.sprintId),
    parentId: ref(row.parentId),
    parentIdentifier: ref(row.parentIdentifier),
    parentTitle: ref(row.parentTitle),
    dueDate: day(row.dueDate),
    openedAt: iso(row.openedAt),
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    canceledAt: iso(row.canceledAt),
    updatedAt: iso(row.updatedAt),
    position: num(row.position),
    archived: row.archived === true,
    labelIds: [],
    subIssueTotal: 0,
    subIssueDone: 0,
    commentCount: 0,
    attachmentCount: 0,
    blockedBy: 0,
    blocking: 0,
    hasDescription: row.hasDescription === true,
  };
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export const issueFilterSchema = z.object({
  teamIds: z.array(z.string()).optional(),
  statusIds: z.array(z.string()).optional(),
  statusTypes: z.array(z.string()).optional(),
  /** 'none' matches unassigned. */
  assigneeIds: z.array(z.string()).optional(),
  creatorIds: z.array(z.string()).optional(),
  priorities: z.array(z.number()).optional(),
  issueTypes: z.array(z.string()).optional(),
  /** 'none' matches issues outside any project. */
  projectIds: z.array(z.string()).optional(),
  goalIds: z.array(z.string()).optional(),
  milestoneIds: z.array(z.string()).optional(),
  /** 'active' resolves to each team's in-flight sprint; 'upcoming' to the next; 'none' to unscheduled. */
  sprintIds: z.array(z.string()).optional(),
  /** Issues carrying ANY of these labels. 'none' matches unlabelled. */
  labelIds: z.array(z.string()).optional(),
  subscriberIds: z.array(z.string()).optional(),
  due: z.enum(['overdue', 'today', 'week', 'month', 'none', 'any']).optional(),
  estimated: z.enum(['yes', 'no']).optional(),
  relation: z.enum(['blocked', 'blocking', 'any']).optional(),
  /** Hide completed/canceled work older than N days — the "recently completed" window. */
  completedWithinDays: z.number().min(0).max(3650).optional(),
  createdWithinDays: z.number().min(0).max(3650).optional(),
  search: z.string().max(200).optional(),
  parentId: z.string().optional(),
  /** Hide sub-issues from a flat list so a parent is not counted twice. */
  topLevelOnly: z.boolean().optional(),
  includeArchived: z.boolean().optional(),
});

export type IssueFilters = z.infer<typeof issueFilterSchema>;

export async function buildIssueWhere(f: IssueFilters, p = new Params()) {
  const where: string[] = [];

  if (!f.includeArchived) where.push(`COALESCE(i."archived", false) = false`);

  if (f.teamIds?.length) where.push(`i."teamId" IN ${p.list(f.teamIds)}`);
  if (f.statusIds?.length) where.push(`i."statusId" IN ${p.list(f.statusIds)}`);
  if (f.statusTypes?.length) where.push(`COALESCE(ws."type", 'backlog') IN ${p.list(f.statusTypes)}`);
  if (f.creatorIds?.length) where.push(`i."creatorId" IN ${p.list(f.creatorIds)}`);
  if (f.issueTypes?.length) where.push(`COALESCE(NULLIF(i."issueType", ''), 'Task') IN ${p.list(f.issueTypes)}`);
  if (f.milestoneIds?.length) where.push(`i."milestoneId" IN ${p.list(f.milestoneIds)}`);
  if (f.priorities?.length) where.push(`COALESCE(i."priority", 0) IN ${p.list(f.priorities)}`);

  // 'none' has to become an emptiness test rather than an id comparison.
  const withNone = (col: string, ids: string[]) => {
    const real = ids.filter(v => v !== 'none');
    const parts: string[] = [];
    if (real.length) parts.push(`${col} IN ${p.list(real)}`);
    if (ids.includes('none')) parts.push(isBlank(col));
    if (parts.length) where.push(`(${parts.join(' OR ')})`);
  };
  if (f.assigneeIds?.length) withNone('i."assigneeId"', f.assigneeIds);
  if (f.projectIds?.length) withNone('i."projectId"', f.projectIds);

  if (f.goalIds?.length) {
    where.push(
      `EXISTS (SELECT 1 FROM "Projects" ip WHERE ip.id::text = i."projectId" AND ip."goalId" IN ${p.list(f.goalIds)})`,
    );
  }

  if (f.sprintIds?.length) {
    const ids = [...f.sprintIds];
    const today = new Date().toISOString().slice(0, 10);
    if (ids.includes('active') || ids.includes('upcoming')) {
      // "The current sprint" differs per team, so resolve it to real ids first.
      const { rows } = await zite.sql({
        query: `SELECT id, "teamId", "startDate", "endDate" FROM "Sprints" ORDER BY "startDate" ASC`,
      });
      const resolved: string[] = [];
      if (ids.includes('active')) {
        for (const r of rows) {
          if (day(r.startDate)! <= today && day(r.endDate)! >= today) resolved.push(String(r.id));
        }
      }
      if (ids.includes('upcoming')) {
        const seen = new Set<string>();
        for (const r of rows) {
          const team = String(r.teamId);
          if (day(r.startDate)! > today && !seen.has(team)) {
            seen.add(team);
            resolved.push(String(r.id));
          }
        }
      }
      const rest = ids.filter(v => v !== 'active' && v !== 'upcoming');
      ids.splice(0, ids.length, ...rest, ...(resolved.length ? resolved : ['__no_sprint__']));
    }
    withNone('i."sprintId"', ids);
  }

  if (f.labelIds?.length) {
    const real = f.labelIds.filter(v => v !== 'none');
    const parts: string[] = [];
    if (real.length) {
      parts.push(`EXISTS (SELECT 1 FROM "IssueLabels" il WHERE il."issueId" = i.id::text AND il."labelId" IN ${p.list(real)})`);
    }
    if (f.labelIds.includes('none')) {
      parts.push(`NOT EXISTS (SELECT 1 FROM "IssueLabels" il WHERE il."issueId" = i.id::text)`);
    }
    where.push(`(${parts.join(' OR ')})`);
  }

  if (f.subscriberIds?.length) {
    where.push(
      `EXISTS (SELECT 1 FROM "IssueSubscribers" isub WHERE isub."issueId" = i.id::text AND isub."memberId" IN ${p.list(f.subscriberIds)})`,
    );
  }

  const openBlocker = (dir: 'blocked_by' | 'blocks') => `EXISTS (
    SELECT 1 FROM "IssueRelations" r
    JOIN "Issues" o ON o.id::text = r."relatedIssueId"
    LEFT JOIN "Statuses" ows ON ows.id::text = o."statusId"
    WHERE r."issueId" = i.id::text AND r."type" = '${dir}'
      AND COALESCE(ows."type", 'backlog') NOT IN ('completed', 'canceled'))`;
  if (f.relation === 'blocked') where.push(openBlocker('blocked_by'));
  if (f.relation === 'blocking') where.push(openBlocker('blocks'));
  if (f.relation === 'any') where.push(`EXISTS (SELECT 1 FROM "IssueRelations" r WHERE r."issueId" = i.id::text)`);

  // Unset dates are NULL (unlike text), and these comparisons already skip them.
  if (f.due === 'overdue') where.push(`i."dueDate" < CURRENT_DATE AND COALESCE(ws."type", 'backlog') NOT IN ('completed', 'canceled')`);
  if (f.due === 'today') where.push(`i."dueDate" = CURRENT_DATE`);
  if (f.due === 'week') where.push(`i."dueDate" <= CURRENT_DATE + 7`);
  if (f.due === 'month') where.push(`i."dueDate" <= CURRENT_DATE + 31`);
  if (f.due === 'none') where.push(`i."dueDate" IS NULL`);
  if (f.due === 'any') where.push(`i."dueDate" IS NOT NULL`);

  if (f.estimated === 'yes') where.push(`i."estimate" IS NOT NULL`);
  if (f.estimated === 'no') where.push(`i."estimate" IS NULL`);

  if (f.completedWithinDays !== undefined) {
    where.push(
      `(COALESCE(ws."type", 'backlog') NOT IN ('completed', 'canceled') OR COALESCE(i."completedAt", i."canceledAt", i.updated_at) >= NOW() - (${p.add(f.completedWithinDays)}::int * INTERVAL '1 day'))`,
    );
  }
  if (f.createdWithinDays !== undefined) {
    where.push(`COALESCE(i."openedAt", i.created_at) >= NOW() - (${p.add(f.createdWithinDays)}::int * INTERVAL '1 day')`);
  }

  if (f.parentId) where.push(`i."parentId" = ${p.add(f.parentId)}`);
  else if (f.topLevelOnly) where.push(isBlank('i."parentId"'));

  const q = f.search?.trim();
  if (q) {
    const like = p.add(`%${q.toLowerCase()}%`);
    const prefix = p.add(`${q.toUpperCase()}%`);
    where.push(`(LOWER(i."title") LIKE ${like} OR LOWER(COALESCE(i."description", '')) LIKE ${like} OR UPPER(i."identifier") LIKE ${prefix})`);
  }

  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params: p.values, p };
}

// ---------------------------------------------------------------------------
// Ordering — a closed map; input never reaches ORDER BY.
// ---------------------------------------------------------------------------

/** Priority 0 means "none" and must sort LAST despite being the lowest number. */
const PRIORITY_RANK = `CASE WHEN COALESCE(i."priority", 0) = 0 THEN 99 ELSE i."priority" END`;

export const ORDER_BY: Record<string, string> = {
  manual: `ws."position" ASC NULLS LAST, i."position" ASC NULLS LAST, i."number" DESC`,
  priority: `${PRIORITY_RANK} ASC, i."position" ASC NULLS LAST, i."number" DESC`,
  due: `i."dueDate" ASC NULLS LAST, ${PRIORITY_RANK} ASC`,
  created: `COALESCE(i."openedAt", i.created_at) DESC`,
  oldest: `COALESCE(i."openedAt", i.created_at) ASC`,
  updated: `i.updated_at DESC`,
  title: `LOWER(i."title") ASC`,
  estimate: `i."estimate" DESC NULLS LAST, ${PRIORITY_RANK} ASC`,
  status: `ws."position" ASC NULLS LAST, ${PRIORITY_RANK} ASC`,
  identifier: `t."key" ASC, i."number" DESC`,
};

// ---------------------------------------------------------------------------
// Second pass: the one-to-many counts a row renders
// ---------------------------------------------------------------------------

/**
 * Labels, sub-issue progress, comments, links and blockers are all one-to-many.
 * Fetching them as small keyed queries and stitching in JS keeps the main query
 * free of a GROUP BY over thirty columns.
 */
export async function enrichIssues(issues: IssueDto[]) {
  if (issues.length === 0) return issues;
  const byId = new Map(issues.map(i => [i.id, i]));

  // Keep each IN list well under the parameter and row limits.
  for (let start = 0; start < issues.length; start += 400) {
    const ids = issues.slice(start, start + 400).map(i => i.id);
    const ph = placeholders(ids.length);

    const [labelRows, subRows, commentRows, attachRows, relRows] = await Promise.all([
      zite.sql({ query: `SELECT "issueId", "labelId" FROM "IssueLabels" WHERE "issueId" IN ${ph}`, params: ids }),
      zite.sql({
        query: `
          SELECT c."parentId", COUNT(*) AS "total",
                 COUNT(*) FILTER (WHERE ws."type" IN ('completed', 'canceled')) AS "done"
          FROM "Issues" c
          LEFT JOIN "Statuses" ws ON ws.id::text = c."statusId"
          WHERE c."parentId" IN ${ph} AND COALESCE(c."archived", false) = false
          GROUP BY c."parentId"`,
        params: ids,
      }),
      zite.sql({ query: `SELECT "issueId", COUNT(*) AS "total" FROM "Comments" WHERE "issueId" IN ${ph} GROUP BY "issueId"`, params: ids }),
      zite.sql({ query: `SELECT "issueId", COUNT(*) AS "total" FROM "IssueAttachments" WHERE "issueId" IN ${ph} GROUP BY "issueId"`, params: ids }),
      zite.sql({
        query: `
          SELECT r."issueId", r."type", COUNT(*) AS "total"
          FROM "IssueRelations" r
          JOIN "Issues" o ON o.id::text = r."relatedIssueId"
          LEFT JOIN "Statuses" ows ON ows.id::text = o."statusId"
          WHERE r."issueId" IN ${ph} AND r."type" IN ('blocked_by', 'blocks')
            AND COALESCE(ows."type", 'backlog') NOT IN ('completed', 'canceled')
          GROUP BY r."issueId", r."type"`,
        params: ids,
      }),
    ]);

    for (const r of labelRows.rows) {
      const labelId = ref(r.labelId);
      if (labelId) byId.get(String(r.issueId))?.labelIds.push(labelId);
    }
    for (const r of subRows.rows) {
      const t = byId.get(String(r.parentId));
      if (t) {
        t.subIssueTotal = num(r.total);
        t.subIssueDone = num(r.done);
      }
    }
    for (const r of commentRows.rows) {
      const t = byId.get(String(r.issueId));
      if (t) t.commentCount = num(r.total);
    }
    for (const r of attachRows.rows) {
      const t = byId.get(String(r.issueId));
      if (t) t.attachmentCount = num(r.total);
    }
    for (const r of relRows.rows) {
      const t = byId.get(String(r.issueId));
      if (!t) continue;
      if (r.type === 'blocked_by') t.blockedBy = num(r.total);
      if (r.type === 'blocks') t.blocking = num(r.total);
    }
  }

  return issues;
}

/** Read issues by id with everything a row needs, in the order given. */
export async function loadIssues(ids: string[]) {
  if (ids.length === 0) return [];
  const { rows } = await zite.sql({
    query: `${ISSUE_SELECT} WHERE i.id::text IN ${placeholders(ids.length)}`,
    params: ids,
  });
  const issues = await enrichIssues(rows.map(mapIssueRow));
  const order = new Map(ids.map((id, n) => [id, n]));
  return issues.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export { isBlank, isSet };
