import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { isConfigured, structured, truncate } from '../server/ai';

const schema = z.object({ sprintId: z.string().min(1) });
type Assessment = { headline: string; risks: string[]; suggestions: string[] };

export default createEndpoint({
  description: 'Assess whether a sprint will land and what is putting it at risk',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({
    available: z.boolean(),
    verdict: z.enum(['on_track', 'at_risk', 'off_track', 'not_started', 'done']),
    headline: z.string(),
    risks: z.array(z.string()),
    suggestions: z.array(z.string()),
    stats: z.object({
      daysLeft: z.number(), pointsRemaining: z.number(), pointsTotal: z.number(), requiredPerDay: z.number(),
      observedPerDay: z.number(), unassigned: z.number(), blocked: z.number(), notStarted: z.number(),
    }),
  }),
  execute: async ({ input }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Invalid request', 'BAD_REQUEST');
    const sprint = await zite.sprints.findOne({ id: parsed.data.sprintId });
    if (!sprint) throw new ZiteError('Sprint not found', 'NOT_FOUND');

    const { rows } = await zite.sql({
      query: `
        SELECT i."identifier", i."title", i."estimate", i."priority", m."name" AS "assigneeName",
               COALESCE(ws."type", 'backlog') AS "statusType",
               (SELECT COUNT(*) FROM "IssueRelations" r
                  JOIN "Issues" b ON b.id::text = r."relatedIssueId"
                  LEFT JOIN "Statuses" bws ON bws.id::text = b."statusId"
                 WHERE r."issueId" = i.id::text AND r."type" = 'blocked_by'
                   AND COALESCE(bws."type", 'backlog') NOT IN ('completed', 'canceled')) AS "blockedBy"
        FROM "Issues" i
        LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
        LEFT JOIN "Members" m ON m.id::text = i."assigneeId"
        WHERE i."sprintId" = $1 AND COALESCE(i."archived", false) = false`,
      params: [sprint.id],
    });

    const issues = rows.map(r => ({
      identifier: String(r.identifier ?? ''), title: String(r.title ?? ''),
      points: r.estimate == null || r.estimate === '' ? 1 : Number(r.estimate), priority: Number(r.priority ?? 0),
      statusType: String(r.statusType), assigneeName: r.assigneeName ? String(r.assigneeName) : null, blockedBy: Number(r.blockedBy ?? 0),
    })).filter(i => i.statusType !== 'canceled');

    const DAY = 86_400_000;
    const today = new Date().toISOString().slice(0, 10);
    const start = String(sprint.startDate ?? today).slice(0, 10);
    const end = String(sprint.endDate ?? today).slice(0, 10);
    const daysLeft = Math.max(0, Math.round((Date.parse(end) - Date.parse(today)) / DAY));
    const daysElapsed = Math.max(0, Math.round((Date.parse(today) - Date.parse(start)) / DAY));
    const open = (i: (typeof issues)[number]) => !['completed', 'canceled'].includes(i.statusType);

    const pointsTotal = issues.reduce((a, i) => a + i.points, 0);
    const pointsDone = issues.filter(i => i.statusType === 'completed').reduce((a, i) => a + i.points, 0);
    const pointsRemaining = pointsTotal - pointsDone;
    const observedPerDay = daysElapsed > 0 ? Math.round((pointsDone / daysElapsed) * 10) / 10 : 0;
    const requiredPerDay = daysLeft > 0 ? Math.round((pointsRemaining / daysLeft) * 10) / 10 : pointsRemaining;
    const stats = {
      daysLeft, pointsRemaining, pointsTotal, requiredPerDay, observedPerDay,
      unassigned: issues.filter(i => open(i) && !i.assigneeName).length,
      blocked: issues.filter(i => open(i) && i.blockedBy > 0).length,
      notStarted: issues.filter(i => ['backlog', 'unstarted', 'intake'].includes(i.statusType)).length,
    };

    // The verdict is arithmetic; Claude only writes the prose around it, so the
    // headline number is never a hallucination and the feature works with no AI.
    const ratio = observedPerDay > 0 ? requiredPerDay / observedPerDay : Infinity;
    const verdict =
      pointsRemaining === 0 ? 'done' as const
      : start > today || daysElapsed === 0 ? 'not_started' as const
      : daysLeft === 0 ? 'off_track' as const
      : ratio <= 1.15 ? 'on_track' as const
      : ratio <= 1.75 ? 'at_risk' as const
      : 'off_track' as const;

    const fallbackHeadline = verdict === 'done'
      ? `All ${pointsTotal} points are done.`
      : `${pointsRemaining} of ${pointsTotal} points remain with ${daysLeft} day${daysLeft === 1 ? '' : 's'} left — needs ${requiredPerDay}/day against ${observedPerDay}/day so far.`;

    if (!isConfigured() || issues.length === 0) {
      const risks: string[] = [];
      if (stats.blocked) risks.push(`${stats.blocked} open issue${stats.blocked === 1 ? ' is' : 's are'} blocked by unfinished work.`);
      if (stats.unassigned) risks.push(`${stats.unassigned} open issue${stats.unassigned === 1 ? ' has' : 's have'} no assignee.`);
      if (stats.notStarted && daysLeft < 4) risks.push(`${stats.notStarted} issue${stats.notStarted === 1 ? ' has' : 's have'} not started with ${daysLeft} days left.`);
      return { available: false, verdict, headline: fallbackHeadline, risks, suggestions: [], stats };
    }

    const assessment = await structured<Assessment>({
      system:
        'You are an engineering manager reviewing a sprint mid-flight. Be direct and specific — name the issues that are the problem. ' +
        'Do not soften a bad picture and do not manufacture concern about a sprint that is fine. Every claim must follow from the data; ' +
        'never invent an issue, a person or a number.',
      prompt:
        `${sprint.name || `Sprint ${sprint.number}`} — goal: ${truncate(sprint.goal, 300) || '(none)'}\n` +
        `${daysLeft} days left, ${daysElapsed} elapsed. ${pointsDone}/${pointsTotal} points done. Burn ${observedPerDay}/day; ${requiredPerDay}/day needed.\n` +
        `The verdict is already computed as "${verdict}" — explain it, do not re-derive it.\n\nIssues:\n` +
        issues.map(i => `${i.identifier} [${i.statusType}] ${i.points}pt P${i.priority} ${i.assigneeName ?? 'UNASSIGNED'}${i.blockedBy ? ` BLOCKED×${i.blockedBy}` : ''} — ${i.title}`).join('\n') +
        `\n\nheadline: one sentence for standup. risks: up to 4, most serious first, naming issues. suggestions: up to 3 concrete actions.`,
      schema: {
        type: 'object',
        properties: {
          headline: { type: 'string' },
          risks: { type: 'array', items: { type: 'string' } },
          suggestions: { type: 'array', items: { type: 'string' } },
        },
        required: ['headline', 'risks', 'suggestions'],
        additionalProperties: false,
      },
      maxTokens: 1500,
    });

    return {
      available: true, verdict, headline: assessment?.headline || fallbackHeadline,
      risks: (assessment?.risks ?? []).slice(0, 4), suggestions: (assessment?.suggestions ?? []).slice(0, 3), stats,
    };
  },
});
