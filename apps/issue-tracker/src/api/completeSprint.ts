import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';
import { recordIssueChanges } from '../server/changes';

const schema = z.object({
  id: z.string().min(1),
  /** Where unfinished work goes: the next sprint (created if there isn't one), back to the backlog, or nowhere. */
  moveTo: z.enum(['next', 'none', 'unscheduled']),
});

/**
 * Close a sprint and roll its unfinished work forward — the sprint-review step
 * Jira calls "complete sprint". Without it, unfinished issues quietly stay in a
 * sprint that ended, and the next sprint starts with an empty board.
 */
export default createEndpoint({
  description: 'Complete a sprint and move its unfinished issues to the next sprint or the backlog',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ moved: z.number(), nextSprintId: z.string().nullable(), createdNext: z.boolean() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Invalid request', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    const sprint = await zite.sprints.findOne({ id: data.id });
    if (!sprint) throw new ZiteError('Sprint not found', 'NOT_FOUND');
    if (sprint.completedAt) throw new ZiteError('That sprint is already complete', 'CONFLICT');

    const today = new Date().toISOString().slice(0, 10);
    const end = String(sprint.endDate ?? today).slice(0, 10);
    // Ending early pulls the end date in, so the sprint reads as the length it really ran.
    await zite.sprints.update({
      id: data.id,
      record: { completedAt: new Date().toISOString(), ...(end > today ? { endDate: today } : {}) },
    });

    const { rows } = await zite.sql({
      query: `
        SELECT i.id FROM "Issues" i LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
        WHERE i."sprintId" = $1 AND COALESCE(i."archived", false) = false
          AND COALESCE(ws."type", 'backlog') NOT IN ('completed', 'canceled')`,
      params: [data.id],
    });
    const unfinished = rows.map(r => String(r.id));

    let nextSprintId: string | null = null;
    let createdNext = false;
    // Nothing left over means nothing to roll forward — don't conjure an empty sprint.
    if (data.moveTo === 'next' && unfinished.length > 0) {
      const siblings = (await zite.sprints.findAll({ filters: { teamId: sprint.teamId ?? '' }, limit: 500 })).records
        .filter(c => c.id !== sprint.id && !c.completedAt && String(c.endDate ?? '').slice(0, 10) >= today)
        .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
      if (siblings[0]) {
        nextSprintId = siblings[0].id;
      } else {
        const team = sprint.teamId ? await zite.teams.findOne({ id: sprint.teamId }) : null;
        const weeks = Number(team?.sprintDurationWeeks ?? 2) || 2;
        const start = new Date(`${today}T00:00:00Z`);
        const finish = new Date(start.getTime() + weeks * 7 * 86_400_000);
        const all = (await zite.sprints.findAll({ filters: { teamId: sprint.teamId ?? '' }, limit: 500 })).records;
        const number = Math.max(0, ...all.map(c => Number(c.number ?? 0))) + 1;
        const created = await zite.sprints.create({
          record: {
            name: `Sprint ${number}`, number, teamId: sprint.teamId ?? null, goal: null, completedAt: null,
            startDate: new Date(start.getTime() + 86_400_000).toISOString().slice(0, 10),
            endDate: finish.toISOString().slice(0, 10),
          },
        });
        nextSprintId = created.id;
        createdNext = true;
      }
    }

    if (data.moveTo !== 'none') {
      const target = data.moveTo === 'next' ? nextSprintId : null;
      for (const id of unfinished) {
        const before = await zite.issues.findOne({ id });
        if (!before) continue;
        await zite.issues.update({ id, record: { sprintId: target } });
        await recordIssueChanges(
          { issueId: id, identifier: before.identifier ?? '', title: before.title ?? '', actor },
          before as unknown as Record<string, unknown>,
          { sprintId: target },
        );
      }
    }

    return { moved: data.moveTo === 'none' ? 0 : unfinished.length, nextSprintId, createdNext };
  },
});
