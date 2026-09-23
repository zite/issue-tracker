import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { day, iso, num, ref, str } from '../server/sql';

const breakdownRow = z.object({ id: z.string().nullable(), total: z.number(), completed: z.number(), points: z.number(), completedPoints: z.number() });

/** A sprint with what a standup asks for: what is left, what moved, and whether the burndown says it will land. */
export default createEndpoint({
  description: 'Load a sprint with its burndown, scope changes and breakdowns by assignee, project and label',
  authenticated: true,
  inputSchema: z.object({ id: z.string().min(1) }),
  outputSchema: z.object({
    sprint: z.object({
      id: z.string(), teamId: z.string().nullable(), number: z.number(), name: z.string(), goal: z.string().nullable(),
      startDate: z.string().nullable(), endDate: z.string().nullable(), completedAt: z.string().nullable(),
      status: z.enum(['completed', 'active', 'upcoming']), daysTotal: z.number(), daysElapsed: z.number(),
    }),
    totals: z.object({
      issues: z.number(), completed: z.number(), started: z.number(), unstarted: z.number(), canceled: z.number(),
      points: z.number(), completedPoints: z.number(), startedPoints: z.number(), scopeAddedPoints: z.number(), scopeAddedIssues: z.number(),
    }),
    burndown: z.array(z.object({
      date: z.string(), scope: z.number(), completed: z.number(), started: z.number(),
      remaining: z.number().nullable(), ideal: z.number(),
    })),
    byAssignee: z.array(breakdownRow),
    byProject: z.array(breakdownRow),
    byLabel: z.array(breakdownRow),
  }),
  execute: async ({ input }) => {
    const sprintRows = await zite.sql({ query: `SELECT * FROM "Sprints" WHERE id::text = $1 LIMIT 1`, params: [input.id] });
    if (sprintRows.rows.length === 0) throw new ZiteError('Sprint not found', 'NOT_FOUND');
    const c = sprintRows.rows[0];

    const [issueRows, labelRows] = await Promise.all([
      zite.sql({
        query: `
          SELECT i.id, i."estimate", COALESCE(i."openedAt", i.created_at) AS "openedAt", i."startedAt", i."completedAt", i."canceledAt",
                 i."assigneeId", i."projectId", COALESCE(ws."type", 'backlog') AS "statusType"
          FROM "Issues" i LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
          WHERE i."sprintId" = $1 AND COALESCE(i."archived", false) = false`,
        params: [input.id],
      }),
      zite.sql({
        query: `SELECT il."issueId", il."labelId" FROM "IssueLabels" il JOIN "Issues" i ON i.id::text = il."issueId" WHERE i."sprintId" = $1`,
        params: [input.id],
      }),
    ]);

    const startDate = day(c.startDate);
    const endDate = day(c.endDate);
    const today = new Date().toISOString().slice(0, 10);
    const status = c.completedAt || (endDate && endDate < today) ? 'completed' as const : startDate && startDate > today ? 'upcoming' as const : 'active' as const;

    const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : null);
    const issues = issueRows.rows.map(r => ({
      id: String(r.id),
      // An unestimated issue still has to weigh something, or a sprint full of
      // unsized work flatters its own burndown. One point is the honest default.
      points: r.estimate == null || r.estimate === '' ? 1 : Number(r.estimate),
      opened: d10(r.openedAt), started: d10(r.startedAt), completed: d10(r.completedAt), canceled: d10(r.canceledAt),
      statusType: String(r.statusType), assigneeId: ref(r.assigneeId), projectId: ref(r.projectId),
    }));
    const live = issues.filter(i => i.statusType !== 'canceled');

    const sum = (list: typeof issues) => list.reduce((a, i) => a + i.points, 0);
    const done = live.filter(i => i.statusType === 'completed');
    const started = live.filter(i => i.statusType === 'started');
    const addedLate = startDate ? live.filter(i => i.opened && i.opened > startDate) : [];

    // Day-by-day. `scope` is the committed total as it stood that day, so work
    // pulled in mid-sprint shows as the line going UP — the most useful thing a
    // burndown can tell you. The actual line stops at today: projecting it
    // forward would be inventing data.
    const burndown: Array<{ date: string; scope: number; completed: number; started: number; remaining: number | null; ideal: number }> = [];
    let daysTotal = 0;
    let daysElapsed = 0;
    if (startDate && endDate) {
      const DAY = 86_400_000;
      const start = Date.parse(`${startDate}T00:00:00Z`);
      daysTotal = Math.max(1, Math.round((Date.parse(`${endDate}T00:00:00Z`) - start) / DAY));
      daysElapsed = Math.max(0, Math.min(daysTotal, Math.round((Date.parse(`${today}T00:00:00Z`) - start) / DAY)));
      const initialScope = sum(live.filter(i => !i.opened || i.opened <= startDate));
      for (let n = 0; n <= daysTotal; n++) {
        const date = new Date(start + n * DAY).toISOString().slice(0, 10);
        const inScope = issues.filter(i => (!i.opened || i.opened <= date) && !(i.canceled && i.canceled <= date));
        const scope = sum(inScope);
        const completed = sum(inScope.filter(i => i.completed && i.completed <= date));
        const inProgress = sum(inScope.filter(i => i.started && i.started <= date && !(i.completed && i.completed <= date)));
        burndown.push({
          date, scope, completed, started: inProgress,
          remaining: date <= today ? scope - completed : null,
          ideal: Math.round(initialScope * (1 - n / daysTotal) * 10) / 10,
        });
      }
    }

    const labelsOf = new Map<string, string[]>();
    for (const r of labelRows.rows) {
      const iid = String(r.issueId);
      if (!labelsOf.has(iid)) labelsOf.set(iid, []);
      labelsOf.get(iid)!.push(String(r.labelId));
    }

    const breakdown = (keyOf: (i: (typeof issues)[number]) => Array<string | null>) => {
      const m = new Map<string, { id: string | null; total: number; completed: number; points: number; completedPoints: number }>();
      for (const i of live) {
        for (const key of keyOf(i)) {
          const k = key ?? '__none__';
          if (!m.has(k)) m.set(k, { id: key, total: 0, completed: 0, points: 0, completedPoints: 0 });
          const row = m.get(k)!;
          row.total++;
          row.points += i.points;
          if (i.statusType === 'completed') {
            row.completed++;
            row.completedPoints += i.points;
          }
        }
      }
      return [...m.values()].sort((a, b) => b.points - a.points);
    };

    return {
      sprint: {
        id: String(c.id), teamId: ref(c.teamId), number: num(c.number), name: str(c.name) || `Sprint ${num(c.number)}`,
        goal: ref(c.goal), startDate, endDate, completedAt: iso(c.completedAt), status, daysTotal, daysElapsed,
      },
      totals: {
        issues: issues.length, completed: done.length, started: started.length,
        unstarted: live.filter(i => !['completed', 'started'].includes(i.statusType)).length,
        canceled: issues.length - live.length,
        points: sum(live), completedPoints: sum(done), startedPoints: sum(started),
        scopeAddedPoints: sum(addedLate), scopeAddedIssues: addedLate.length,
      },
      burndown,
      byAssignee: breakdown(i => [i.assigneeId]),
      byProject: breakdown(i => [i.projectId]),
      byLabel: breakdown(i => (labelsOf.get(i.id)?.length ? labelsOf.get(i.id)! : [null])),
    };
  },
});
