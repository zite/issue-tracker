import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';

const schema = z.object({
  id: z.string().optional(),
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  remove: z.boolean().optional(),
});

export default createEndpoint({
  description: 'Add, edit or remove a project milestone',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ id: z.string().nullable() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid milestone', 'BAD_REQUEST');
    const data = parsed.data;
    await getActor(context);

    const project = await zite.projects.findOne({ id: data.projectId });
    if (!project) throw new ZiteError('Project not found', 'NOT_FOUND');

    if (data.id) {
      const ms = await zite.milestones.findOne({ id: data.id });
      if (!ms || ms.projectId !== data.projectId) throw new ZiteError('Milestone not found', 'NOT_FOUND');
      if (data.remove) {
        // The issues stay in the project; they just stop belonging to the milestone.
        const issues = await zite.issues.findAll({ filters: { milestoneId: data.id }, limit: 2000 });
        for (const i of issues.records) await zite.issues.update({ id: i.id, record: { milestoneId: null } });
        await zite.milestones.delete({ id: data.id });
        return { id: null };
      }
      const record: Record<string, unknown> = {};
      for (const k of ['name', 'description', 'targetDate'] as const) if (data[k] !== undefined) record[k] = data[k];
      await zite.milestones.update({ id: data.id, record });
      return { id: data.id };
    }

    if (!data.name) throw new ZiteError('A milestone needs a name', 'BAD_REQUEST');
    const siblings = await zite.milestones.findAll({ filters: { projectId: data.projectId }, limit: 200 });
    const created = await zite.milestones.create({
      record: {
        name: data.name, projectId: data.projectId, description: data.description ?? null, targetDate: data.targetDate ?? null,
        position: Math.max(0, ...siblings.records.map(m => Number(m.position ?? 0))) + 1,
      },
    });
    return { id: created.id };
  },
});
