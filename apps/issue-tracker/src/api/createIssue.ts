import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';
import { createNotifications, subscribe, timestampsForState, POSITION_STEP } from '../server/changes';
import { issueDto, loadIssues } from '../server/issues';

const schema = z.object({
  teamId: z.string().min(1),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(100_000).nullable().optional(),
  statusId: z.string().nullable().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  estimate: z.number().int().min(0).max(100).nullable().optional(),
  issueType: z.enum(['Feature', 'Bug', 'Improvement', 'Task', 'Spike', 'Chore']).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  sprintId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  labelIds: z.array(z.string()).max(50).optional(),
});

export default createEndpoint({
  description: 'Create an issue with the next identifier for its team',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ issue: issueDto }),
  execute: async ({ input, context }) => {
    // inputSchema is NOT enforced before execute runs — re-parse anything that writes.
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid issue', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    const team = await zite.teams.findOne({ id: data.teamId });
    if (!team) throw new ZiteError('Team not found', 'NOT_FOUND');

    // Take the higher of the stored counter and the real maximum. The counter
    // alone would reissue a number after a delete; MAX alone would reuse the
    // number of a deleted trailing issue. Together they only ever go up.
    const { rows } = await zite.sql({
      query: `SELECT COALESCE(MAX("number"), 0) AS "maxNumber" FROM "Issues" WHERE "teamId" = $1`,
      params: [data.teamId],
    });
    const number = Math.max(Number(team.issueCounter ?? 0), Number(rows[0]?.maxNumber ?? 0)) + 1;
    const identifier = `${team.key || 'ISS'}-${number}`;
    // Claim the number before anything else, so two creates racing each other
    // are far less likely to collide.
    await zite.teams.update({ id: data.teamId, record: { issueCounter: number } });

    const states = (await zite.statuses.findAll({ filters: { teamId: data.teamId }, limit: 50 })).records
      .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
    let statusId = data.statusId && states.some(s => s.id === data.statusId) ? data.statusId : null;
    if (!statusId) {
      // A sub-issue or a sprint-scheduled issue belongs in Todo; everything else lands in Backlog.
      const wantsTodo = Boolean(data.sprintId || data.parentId);
      statusId = (
        (wantsTodo ? states.find(s => s.type === 'unstarted') : undefined) ??
        states.find(s => s.type === 'backlog') ??
        states.find(s => s.type === 'unstarted') ??
        states[0]
      )?.id ?? null;
    }

    // A milestone only makes sense inside its own project.
    let milestoneId = data.milestoneId ?? null;
    if (milestoneId) {
      const ms = await zite.milestones.findOne({ id: milestoneId });
      if (!ms || (data.projectId && ms.projectId !== data.projectId)) milestoneId = null;
    }

    const { patch: stamps } = await timestampsForState(statusId, {});
    const now = new Date().toISOString();

    // New issues sort to the top of their column — you want to see what you just made.
    const { rows: posRows } = await zite.sql({
      query: `SELECT MIN("position") AS "minPos" FROM "Issues" WHERE "statusId" = $1 AND COALESCE("archived", false) = false`,
      params: [statusId ?? ''],
    });
    const position = posRows[0]?.minPos == null ? POSITION_STEP * 64 : Number(posRows[0].minPos) - POSITION_STEP;

    const created = await zite.issues.create({
      record: {
        title: data.title,
        identifier,
        number,
        teamId: data.teamId,
        description: data.description ?? null,
        statusId,
        priority: data.priority ?? 0,
        estimate: data.estimate ?? null,
        issueType: data.issueType ?? 'Task',
        assigneeId: data.assigneeId ?? null,
        creatorId: actor.id,
        projectId: data.projectId ?? null,
        milestoneId,
        sprintId: data.sprintId ?? null,
        parentId: data.parentId ?? null,
        dueDate: data.dueDate ?? null,
        openedAt: now,
        position,
        archived: false,
        startedAt: null,
        completedAt: null,
        canceledAt: null,
        ...stamps,
      },
    });

    if (data.labelIds?.length) {
      await zite.issueLabels.bulkCreate({
        records: [...new Set(data.labelIds)].map(labelId => ({ name: identifier, issueId: created.id, labelId })),
      });
    }

    await zite.activity.create({
      record: { name: 'created the issue', issueId: created.id, actorId: actor.id, type: 'created', occurredAt: now },
    });

    await subscribe(created.id, actor.id);
    if (data.assigneeId) {
      await subscribe(created.id, data.assigneeId);
      if (data.assigneeId !== actor.id) {
        await createNotifications([data.assigneeId], {
          type: 'assigned', actorId: actor.id, issueId: created.id,
          name: `${actor.name} assigned you ${identifier}`, body: data.title, occurredAt: now,
        });
      }
    }

    const state = states.find(s => s.id === statusId);
    if (state?.type === 'intake') {
      // Intake is a queue someone has to work — tell the team it has something in it.
      const { records } = await zite.teamMembers.findAll({ filters: { teamId: data.teamId }, limit: 200 });
      const leads = (await zite.members.findAll({ filters: { role: 'Admin' }, limit: 50 })).records.map(m => m.id);
      const audience = records.map(r => r.memberId!).filter(id => id && id !== actor.id && leads.includes(id));
      await createNotifications(audience, {
        type: 'intake', actorId: actor.id, issueId: created.id,
        name: `${actor.name} filed ${identifier} in intake`, body: data.title, occurredAt: now,
      });
    }

    const [issue] = await loadIssues([created.id]);
    return { issue };
  },
});
