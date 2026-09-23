import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertCan, getActor } from '../server/actor';

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().max(32).optional(),
  description: z.string().max(300).nullable().optional(),
  teamId: z.string().nullable().optional(),
  remove: z.boolean().optional(),
});

export default createEndpoint({
  description: 'Add, edit or remove a label',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ id: z.string().nullable(), detached: z.number() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid label', 'BAD_REQUEST');
    const data = parsed.data;
    assertCan(await getActor(context), 'editSettings');

    if (data.remove) {
      if (!data.id) throw new ZiteError('An id is required', 'BAD_REQUEST');
      // Detach first — a join row pointing at a deleted label leaves a phantom in every count.
      const links = await zite.issueLabels.findAll({ filters: { labelId: data.id }, limit: 2000 });
      for (const l of links.records) await zite.issueLabels.delete({ id: l.id });
      await zite.labels.delete({ id: data.id });
      return { id: null, detached: links.records.length };
    }

    const all = (await zite.labels.findAll({ limit: 1000 })).records;
    const current = data.id ? all.find(l => l.id === data.id) : undefined;
    if (data.id && !current) throw new ZiteError('Label not found', 'NOT_FOUND');
    if (data.name || data.teamId !== undefined) {
      // Names are unique per scope; a rename that doesn't resend the scope keeps the one it has.
      const name = (data.name ?? current?.name ?? '').toLowerCase();
      const scope = data.teamId !== undefined ? data.teamId || null : current?.teamId || null;
      const clash = all.find(l => l.id !== data.id && (l.name ?? '').toLowerCase() === name && (l.teamId || null) === scope);
      if (clash) throw new ZiteError(`A label called "${clash.name}" already exists ${scope ? 'in this team' : 'in the workspace'}`, 'CONFLICT');
    }

    if (data.id) {
      const record: Record<string, unknown> = {};
      for (const k of ['name', 'color', 'description', 'teamId'] as const) if (data[k] !== undefined) record[k] = data[k];
      if (Object.keys(record).length === 0) throw new ZiteError('Nothing to update', 'BAD_REQUEST');
      await zite.labels.update({ id: data.id, record });
      return { id: data.id, detached: 0 };
    }

    if (!data.name) throw new ZiteError('A label needs a name', 'BAD_REQUEST');
    const created = await zite.labels.create({
      record: { name: data.name, color: data.color ?? '#8b8d98', description: data.description ?? null, teamId: data.teamId ?? null },
    });
    return { id: created.id, detached: 0 };
  },
});
