import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertCan, getActor } from '../server/actor';

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  teamId: z.string().nullable().optional(),
  title: z.string().max(500).nullable().optional(),
  description: z.string().max(50_000).nullable().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  estimate: z.number().int().min(0).max(100).nullable().optional(),
  issueType: z.enum(['Feature', 'Bug', 'Improvement', 'Task', 'Spike', 'Chore']).nullable().optional(),
  labelIds: z.array(z.string()).max(50).optional(),
  remove: z.boolean().optional(),
});

/** Issue templates pre-fill the create dialog — a bug report that always asks for repro steps. */
export default createEndpoint({
  description: 'Create, update or delete an issue template',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ id: z.string().nullable() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid template', 'BAD_REQUEST');
    const data = parsed.data;
    assertCan(await getActor(context), 'editSettings');

    if (data.remove) {
      if (!data.id) throw new ZiteError('An id is required', 'BAD_REQUEST');
      await zite.issueTemplates.delete({ id: data.id });
      return { id: null };
    }

    const record: Record<string, unknown> = {};
    for (const k of ['name', 'teamId', 'title', 'description', 'priority', 'estimate', 'issueType'] as const) {
      if (data[k] !== undefined) record[k] = data[k];
    }
    if (data.labelIds !== undefined) record.labelIds = JSON.stringify(data.labelIds);

    if (data.id) {
      if (!(await zite.issueTemplates.findOne({ id: data.id }))) throw new ZiteError('Template not found', 'NOT_FOUND');
      await zite.issueTemplates.update({ id: data.id, record });
      return { id: data.id };
    }

    if (!data.name) throw new ZiteError('A template needs a name', 'BAD_REQUEST');
    const all = await zite.issueTemplates.findAll({ limit: 500 });
    const created = await zite.issueTemplates.create({
      record: {
        name: data.name, teamId: data.teamId ?? null, title: data.title ?? null, description: data.description ?? null,
        priority: data.priority ?? 0, estimate: data.estimate ?? null, issueType: data.issueType ?? 'Task',
        labelIds: JSON.stringify(data.labelIds ?? []),
        position: Math.max(0, ...all.records.map(t => Number(t.position ?? 0))) + 1,
      },
    });
    return { id: created.id };
  },
});
