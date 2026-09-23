import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  summary: z.string().max(500).nullable().optional(),
  description: z.string().max(100_000).nullable().optional(),
  status: z.enum(['Planned', 'Active', 'Completed']).optional(),
  ownerId: z.string().nullable().optional(),
  icon: z.string().max(16).nullable().optional(),
  color: z.string().max(32).nullable().optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** Replace the set of projects under this goal. */
  projectIds: z.array(z.string()).max(200).optional(),
  remove: z.boolean().optional(),
});

/** Goals group projects under a company-level objective. */
export default createEndpoint({
  description: 'Create, update or delete a goal and choose its projects',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ id: z.string().nullable() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid goal', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    if (data.remove) {
      if (!data.id) throw new ZiteError('An id is required', 'BAD_REQUEST');
      const projects = await zite.projects.findAll({ filters: { goalId: data.id }, limit: 500 });
      for (const p of projects.records) await zite.projects.update({ id: p.id, record: { goalId: null } });
      const pins = await zite.pins.findAll({ filters: { entityType: 'Goal', entityId: data.id }, limit: 200 });
      for (const f of pins.records) await zite.pins.delete({ id: f.id });
      await zite.goals.delete({ id: data.id });
      return { id: null };
    }

    const record: Record<string, unknown> = {};
    for (const k of ['name', 'summary', 'description', 'status', 'ownerId', 'icon', 'color', 'targetDate'] as const) {
      if (data[k] !== undefined) record[k] = data[k];
    }

    let id = data.id;
    if (id) {
      const existing = await zite.goals.findOne({ id });
      if (!existing) throw new ZiteError('Goal not found', 'NOT_FOUND');
      if (Object.keys(record).length) await zite.goals.update({ id, record });
    } else {
      if (!data.name) throw new ZiteError('A goal needs a name', 'BAD_REQUEST');
      const all = await zite.goals.findAll({ limit: 500 });
      const created = await zite.goals.create({
        record: {
          name: data.name, summary: data.summary ?? null, description: data.description ?? null,
          status: data.status ?? 'Planned', ownerId: data.ownerId ?? actor.id, icon: data.icon ?? '◎',
          color: data.color ?? '#3F76D0', targetDate: data.targetDate ?? null,
          position: Math.max(0, ...all.records.map(i => Number(i.position ?? 0))) + 1,
        },
      });
      id = created.id;
    }

    if (data.projectIds) {
      const current = await zite.projects.findAll({ filters: { goalId: id }, limit: 500 });
      const want = new Set(data.projectIds);
      for (const p of current.records) if (!want.has(p.id)) await zite.projects.update({ id: p.id, record: { goalId: null } });
      const have = new Set(current.records.map(p => p.id));
      for (const pid of want) if (!have.has(pid)) await zite.projects.update({ id: pid, record: { goalId: id } });
    }

    return { id: id ?? null };
  },
});
