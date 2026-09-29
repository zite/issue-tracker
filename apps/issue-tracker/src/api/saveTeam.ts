import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertCan, getActor } from '../server/actor';
import { DEFAULT_STATES } from '../server/setup';

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  key: z.string().trim().min(2).max(7).regex(/^[A-Za-z][A-Za-z0-9]*$/, 'Use letters and digits, starting with a letter').optional(),
  description: z.string().max(1000).nullable().optional(),
  icon: z.string().max(16).nullable().optional(),
  color: z.string().max(32).nullable().optional(),
  sprintsEnabled: z.boolean().optional(),
  sprintDurationWeeks: z.number().int().min(1).max(8).optional(),
  intakeEnabled: z.boolean().optional(),
  estimateScale: z.enum(['fibonacci', 'linear', 'exponential', 'tshirt', 'none']).optional(),
  /** Replace the team's membership. */
  memberIds: z.array(z.string()).max(500).optional(),
});

export default createEndpoint({
  description: 'Create or update a team; a new team gets a default workflow',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid team', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);
    assertCan(actor, 'editSettings');

    let teamId = data.id;
    if (teamId) {
      const team = await zite.teams.findOne({ id: teamId });
      if (!team) throw new ZiteError('Team not found', 'NOT_FOUND');
      // The key is baked into every identifier already written down in commits,
      // docs and chat — changing it would orphan all of them.
      if (data.key && data.key.toUpperCase() !== (team.key ?? '')) {
        throw new ZiteError('A team key cannot change once issues exist under it', 'BAD_REQUEST');
      }
      const record: Record<string, unknown> = {};
      for (const k of ['name', 'description', 'icon', 'color', 'sprintsEnabled', 'sprintDurationWeeks', 'intakeEnabled', 'estimateScale'] as const) {
        if (data[k] !== undefined) record[k] = data[k];
      }
      if (Object.keys(record).length) await zite.teams.update({ id: teamId, record });
    } else {
      if (!data.name || !data.key) throw new ZiteError('A team needs a name and a key', 'BAD_REQUEST');
      const key = data.key.toUpperCase();
      if (await zite.teams.findOne({ filters: { key } })) throw new ZiteError(`Another team already uses ${key}`, 'CONFLICT');
      const all = await zite.teams.findAll({ limit: 200 });
      const created = await zite.teams.create({
        record: {
          name: data.name, key, description: data.description ?? null, icon: data.icon ?? '◆', color: data.color ?? '#3F76D0',
          sprintsEnabled: data.sprintsEnabled ?? true, sprintDurationWeeks: data.sprintDurationWeeks ?? 2,
          intakeEnabled: data.intakeEnabled ?? false, estimateScale: data.estimateScale ?? 'fibonacci', issueCounter: 0,
          position: Math.max(0, ...all.records.map(t => Number(t.position ?? 0))) + 1,
        },
      });
      teamId = created.id;
      // A team with no workflow has no board and cannot hold an issue.
      await zite.statuses.bulkCreate({ records: DEFAULT_STATES.map(s => ({ ...s, teamId: created.id })) });
      if (!data.memberIds) await zite.teamMembers.create({ record: { name: `${key} · ${actor.name}`, teamId, memberId: actor.id } });
    }

    if (data.memberIds) {
      const existing = (await zite.teamMembers.findAll({ filters: { teamId }, limit: 1000 })).records;
      const want = new Set(data.memberIds);
      for (const r of existing) if (!want.has(r.memberId ?? '')) await zite.teamMembers.delete({ id: r.id });
      const have = new Set(existing.map(r => r.memberId));
      const toAdd = [...want].filter(id => !have.has(id));
      if (toAdd.length) {
        await zite.teamMembers.bulkCreate({ records: toAdd.map(memberId => ({ name: 'member', teamId: teamId!, memberId })) });
      }
    }

    return { id: teamId! };
  },
});
