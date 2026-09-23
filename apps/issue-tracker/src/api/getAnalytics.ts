import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { day, num, ref } from '../server/sql';

const schema = z.object({ teamId: z.string().optional(), weeks: z.number().int().min(4).max(52).optional() });

/**
 * Delivery insights. Every number is derived from issue timestamps, which are
 * moved by state TYPE — so renaming a status never breaks a report.
 */
export default createEndpoint({
  description: 'Velocity, throughput, cycle and lead time, workload, ageing and breakdowns',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({
    summary: z.object({
      open: z.number(), inProgress: z.number(), completedInWindow: z.number(), createdInWindow: z.number(),
      overdue: z.number(), urgent: z.number(), unassigned: z.number(), blocked: z.number(),
    }),
    velocity: z.array(z.object({
      sprintId: z.string(), teamId: z.string().nullable(), number: z.number(), name: z.string(), startDate: z.string().nullable(),
      status: z.string(), scope: z.number(), completed: z.number(), completedCount: z.number(),
    })),
    throughput: z.array(z.object({ week: z.string(), created: z.number(), completed: z.number() })),
    cycleTime: z.object({ median: z.number(), p90: z.number(), sample: z.number() }),
    leadTime: z.object({ median: z.number(), p90: z.number(), sample: z.number() }),
    workload: z.array(z.object({ assigneeId: z.string().nullable(), open: z.number(), started: z.number(), points: z.number(), overdue: z.number(), completedInWindow: z.number() })),
    byType: z.array(z.object({ type: z.string(), open: z.number(), completed: z.number() })),
    byPriority: z.array(z.object({ priority: z.number(), open: z.number() })),
    byLabel: z.array(z.object({ labelId: z.string(), open: z.number(), completed: z.number() })),
    byStatusType: z.array(z.object({ statusType: z.string(), count: z.number() })),
    ageing: z.array(z.object({ bucket: z.string(), count: z.number() })),
  }),
  execute: async ({ input }) => {
    // inputSchema is not enforced; `weeks` reaches an interval, so bound it here.
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Invalid request', 'BAD_REQUEST');
    const weeks = parsed.data.weeks ?? 12;
    const teamId = parsed.data.teamId;

    const params: unknown[] = [weeks];
    const team = teamId ? `AND i."teamId" = $${params.push(teamId)}` : '';
    const OPEN = `COALESCE(ws."type", 'backlog') NOT IN ('completed', 'canceled')`;
    const LIVE = `COALESCE(i."archived", false) = false`;
    const q = (query: string) => zite.sql({ query, params });

    const [summaryRows, velocityRows, throughputRows, cycleTimeRows, workloadRows, typeRows, priorityRows, labelRows, stateRows, ageingRows] = await Promise.all([
      q(`
        SELECT
          COUNT(*) FILTER (WHERE ${OPEN}) AS "open",
          COUNT(*) FILTER (WHERE ws."type" = 'started') AS "inProgress",
          COUNT(*) FILTER (WHERE i."completedAt" >= NOW() - ($1::int * INTERVAL '1 week')) AS "completedInWindow",
          COUNT(*) FILTER (WHERE COALESCE(i."openedAt", i.created_at) >= NOW() - ($1::int * INTERVAL '1 week')) AS "createdInWindow",
          COUNT(*) FILTER (WHERE ${OPEN} AND i."dueDate" < CURRENT_DATE) AS "overdue",
          COUNT(*) FILTER (WHERE ${OPEN} AND i."priority" = 1) AS "urgent",
          COUNT(*) FILTER (WHERE ${OPEN} AND COALESCE(i."assigneeId", '') = '' AND COALESCE(ws."type", 'backlog') <> 'intake') AS "unassigned",
          COUNT(*) FILTER (WHERE ${OPEN} AND EXISTS (
            SELECT 1 FROM "IssueRelations" r JOIN "Issues" o ON o.id::text = r."relatedIssueId"
            LEFT JOIN "Statuses" ows ON ows.id::text = o."statusId"
            WHERE r."issueId" = i.id::text AND r."type" = 'blocked_by' AND COALESCE(ows."type", 'backlog') NOT IN ('completed', 'canceled'))) AS "blocked"
        FROM "Issues" i LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
        WHERE ${LIVE} ${team}`),
      q(`
        SELECT cy.id, cy."teamId", cy."number", cy."name", cy."startDate", cy."endDate", cy."completedAt",
               COALESCE(SUM(COALESCE(i."estimate", 1)) FILTER (WHERE i.id IS NOT NULL AND COALESCE(ws."type", 'backlog') <> 'canceled'), 0) AS "scope",
               COALESCE(SUM(COALESCE(i."estimate", 1)) FILTER (WHERE ws."type" = 'completed'), 0) AS "completed",
               COUNT(i.id) FILTER (WHERE ws."type" = 'completed') AS "completedCount"
        FROM "Sprints" cy
        LEFT JOIN "Issues" i ON i."sprintId" = cy.id::text AND ${LIVE}
        LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
        WHERE cy."startDate" <= CURRENT_DATE + 14 AND cy."startDate" >= CURRENT_DATE - ($1::int * INTERVAL '1 week') - INTERVAL '4 weeks'
          ${teamId ? `AND cy."teamId" = $2` : ''}
        GROUP BY cy.id, cy."teamId", cy."number", cy."name", cy."startDate", cy."endDate", cy."completedAt"
        ORDER BY cy."startDate" ASC`),
      q(`
        SELECT TO_CHAR(DATE_TRUNC('week', d), 'YYYY-MM-DD') AS "week",
               COUNT(*) FILTER (WHERE kind = 'created') AS "created",
               COUNT(*) FILTER (WHERE kind = 'completed') AS "completed"
        FROM (
          SELECT COALESCE(i."openedAt", i.created_at) AS d, 'created' AS kind FROM "Issues" i
            WHERE ${LIVE} AND COALESCE(i."openedAt", i.created_at) >= DATE_TRUNC('week', NOW() - ($1::int * INTERVAL '1 week')) ${team}
          UNION ALL
          SELECT i."completedAt" AS d, 'completed' AS kind FROM "Issues" i
            WHERE ${LIVE} AND i."completedAt" >= DATE_TRUNC('week', NOW() - ($1::int * INTERVAL '1 week')) ${team}
        ) events
        GROUP BY DATE_TRUNC('week', d)
        ORDER BY DATE_TRUNC('week', d) ASC`),
      q(`
        SELECT
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (i."completedAt" - i."startedAt")) / 86400) FILTER (WHERE i."startedAt" IS NOT NULL AND i."completedAt" >= i."startedAt") AS "cycleMedian",
          PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (i."completedAt" - i."startedAt")) / 86400) FILTER (WHERE i."startedAt" IS NOT NULL AND i."completedAt" >= i."startedAt") AS "cycleP90",
          COUNT(*) FILTER (WHERE i."startedAt" IS NOT NULL AND i."completedAt" >= i."startedAt") AS "cycleSample",
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (i."completedAt" - COALESCE(i."openedAt", i.created_at))) / 86400) AS "leadMedian",
          PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (i."completedAt" - COALESCE(i."openedAt", i.created_at))) / 86400) AS "leadP90",
          COUNT(*) AS "leadSample"
        FROM "Issues" i
        WHERE i."completedAt" IS NOT NULL AND i."completedAt" >= NOW() - ($1::int * INTERVAL '1 week') ${team}`),
      q(`
        SELECT NULLIF(i."assigneeId", '') AS "assigneeId",
               COUNT(*) FILTER (WHERE ${OPEN}) AS "open",
               COUNT(*) FILTER (WHERE ws."type" = 'started') AS "started",
               COALESCE(SUM(COALESCE(i."estimate", 1)) FILTER (WHERE ${OPEN}), 0) AS "points",
               COUNT(*) FILTER (WHERE ${OPEN} AND i."dueDate" < CURRENT_DATE) AS "overdue",
               COUNT(*) FILTER (WHERE i."completedAt" >= NOW() - ($1::int * INTERVAL '1 week')) AS "completedInWindow"
        FROM "Issues" i LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
        WHERE ${LIVE} AND COALESCE(ws."type", 'backlog') <> 'intake' ${team}
        GROUP BY NULLIF(i."assigneeId", '')
        ORDER BY COUNT(*) FILTER (WHERE ${OPEN}) DESC`),
      q(`
        SELECT COALESCE(NULLIF(i."issueType", ''), 'Task') AS "type",
               COUNT(*) FILTER (WHERE ${OPEN}) AS "open",
               COUNT(*) FILTER (WHERE i."completedAt" >= NOW() - ($1::int * INTERVAL '1 week')) AS "completed"
        FROM "Issues" i LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
        WHERE ${LIVE} ${team}
        GROUP BY COALESCE(NULLIF(i."issueType", ''), 'Task')`),
      q(`
        SELECT COALESCE(i."priority", 0) AS "priority", COUNT(*) AS "open"
        FROM "Issues" i LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
        WHERE ${LIVE} AND ${OPEN} AND $1::int > 0 ${team}
        GROUP BY COALESCE(i."priority", 0)`),
      q(`
        SELECT il."labelId",
               COUNT(*) FILTER (WHERE ${OPEN}) AS "open",
               COUNT(*) FILTER (WHERE i."completedAt" >= NOW() - ($1::int * INTERVAL '1 week')) AS "completed"
        FROM "IssueLabels" il
        JOIN "Issues" i ON i.id::text = il."issueId"
        LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
        WHERE ${LIVE} ${team}
        GROUP BY il."labelId"
        ORDER BY COUNT(*) FILTER (WHERE ${OPEN}) DESC
        LIMIT 12`),
      q(`
        SELECT COALESCE(ws."type", 'backlog') AS "statusType", COUNT(*) AS "count"
        FROM "Issues" i LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
        WHERE ${LIVE} AND $1::int > 0 ${team}
        GROUP BY COALESCE(ws."type", 'backlog')`),
      q(`
        SELECT CASE
                 WHEN COALESCE(i."openedAt", i.created_at) > NOW() - INTERVAL '7 days' THEN '< 1 week'
                 WHEN COALESCE(i."openedAt", i.created_at) > NOW() - INTERVAL '30 days' THEN '1–4 weeks'
                 WHEN COALESCE(i."openedAt", i.created_at) > NOW() - INTERVAL '90 days' THEN '1–3 months'
                 ELSE '3+ months'
               END AS "bucket",
               COUNT(*) AS "count"
        FROM "Issues" i LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
        WHERE ${LIVE} AND ${OPEN} AND $1::int > 0 ${team}
        GROUP BY 1`),
    ]);

    const s = summaryRows.rows[0] ?? {};
    const ct = cycleTimeRows.rows[0] ?? {};
    const round1 = (v: unknown) => Math.round(num(v) * 10) / 10;
    const today = new Date().toISOString().slice(0, 10);
    // Fixed bucket order — a chart whose categories reshuffle as data changes is unreadable.
    const AGEING = ['< 1 week', '1–4 weeks', '1–3 months', '3+ months'];
    const ageing = new Map(ageingRows.rows.map(r => [String(r.bucket), num(r.count)]));

    // Fill empty weeks so the throughput chart has a continuous axis.
    const throughputByWeek = new Map(throughputRows.rows.map(r => [String(r.week), r]));
    const throughput: Array<{ week: string; created: number; completed: number }> = [];
    const monday = new Date();
    monday.setUTCHours(0, 0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    for (let w = weeks; w >= 0; w--) {
      const week = new Date(monday.getTime() - w * 7 * 86_400_000).toISOString().slice(0, 10);
      const r = throughputByWeek.get(week);
      throughput.push({ week, created: num(r?.created), completed: num(r?.completed) });
    }

    return {
      summary: {
        open: num(s.open), inProgress: num(s.inProgress), completedInWindow: num(s.completedInWindow), createdInWindow: num(s.createdInWindow),
        overdue: num(s.overdue), urgent: num(s.urgent), unassigned: num(s.unassigned), blocked: num(s.blocked),
      },
      velocity: velocityRows.rows.map(r => {
        const start = day(r.startDate);
        const end = day(r.endDate);
        return {
          sprintId: String(r.id), teamId: ref(r.teamId), number: num(r.number), name: ref(r.name) ?? `Sprint ${num(r.number)}`, startDate: start,
          status: r.completedAt || (end && end < today) ? 'completed' : start && start > today ? 'upcoming' : 'active',
          scope: num(r.scope), completed: num(r.completed), completedCount: num(r.completedCount),
        };
      }),
      throughput,
      cycleTime: { median: round1(ct.cycleMedian), p90: round1(ct.cycleP90), sample: num(ct.cycleSample) },
      leadTime: { median: round1(ct.leadMedian), p90: round1(ct.leadP90), sample: num(ct.leadSample) },
      workload: workloadRows.rows.map(r => ({
        assigneeId: ref(r.assigneeId), open: num(r.open), started: num(r.started), points: num(r.points),
        overdue: num(r.overdue), completedInWindow: num(r.completedInWindow),
      })),
      byType: typeRows.rows.map(r => ({ type: String(r.type), open: num(r.open), completed: num(r.completed) })),
      byPriority: priorityRows.rows.map(r => ({ priority: num(r.priority), open: num(r.open) })),
      byLabel: labelRows.rows.filter(r => ref(r.labelId)).map(r => ({ labelId: String(r.labelId), open: num(r.open), completed: num(r.completed) })),
      byStatusType: stateRows.rows.map(r => ({ statusType: String(r.statusType), count: num(r.count) })),
      ageing: AGEING.map(bucket => ({ bucket, count: ageing.get(bucket) ?? 0 })),
    };
  },
});
