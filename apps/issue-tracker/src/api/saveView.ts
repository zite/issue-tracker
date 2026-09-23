import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  teamId: z.string().nullable().optional(),
  scope: z.enum(['Personal', 'Team', 'Workspace']).optional(),
  icon: z.string().max(16).nullable().optional(),
  color: z.string().max(32).nullable().optional(),
  filters: z.string().max(10_000).optional(),
  grouping: z.string().max(40).optional(),
  ordering: z.string().max(40).optional(),
  options: z.string().max(10_000).optional(),
  display: z.enum(['List', 'Board', 'Table']).optional(),
  remove: z.boolean().optional(),
});

const isJson = (s: string | undefined) => {
  if (s === undefined) return true;
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
};

export default createEndpoint({
  description: 'Create, update or delete a saved view',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ id: z.string().nullable() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid view', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    // Stored as text but read as JSON everywhere — reject bad data at the door,
    // or every reader breaks later with no clue where it came from.
    if (!isJson(data.filters) || !isJson(data.options)) throw new ZiteError('View settings must be valid JSON', 'BAD_REQUEST');

    const existing = data.id ? await zite.views.findOne({ id: data.id }) : null;
    if (data.id && !existing) throw new ZiteError('View not found', 'NOT_FOUND');
    // A personal view belongs to whoever made it; shared views are anyone's to edit.
    if (existing?.ownerId && existing.ownerId !== actor.id) throw new ZiteError('That view belongs to someone else', 'FORBIDDEN');

    if (data.remove) {
      if (!existing) throw new ZiteError('An id is required', 'BAD_REQUEST');
      const pins = await zite.pins.findAll({ filters: { entityType: 'View', entityId: existing.id }, limit: 500 });
      for (const f of pins.records) await zite.pins.delete({ id: f.id });
      await zite.views.delete({ id: existing.id });
      return { id: null };
    }

    const record: Record<string, unknown> = {};
    for (const k of ['name', 'description', 'teamId', 'scope', 'icon', 'color', 'filters', 'grouping', 'ordering', 'options', 'display'] as const) {
      if (data[k] !== undefined) record[k] = data[k];
    }
    if (data.scope !== undefined) record.ownerId = data.scope === 'Personal' ? actor.id : null;

    if (existing) {
      await zite.views.update({ id: existing.id, record });
      return { id: existing.id };
    }

    if (!data.name) throw new ZiteError('A view needs a name', 'BAD_REQUEST');
    const all = await zite.views.findAll({ limit: 1000 });
    const created = await zite.views.create({
      record: {
        name: data.name, description: data.description ?? null, teamId: data.teamId ?? null,
        scope: data.scope ?? 'Workspace', ownerId: data.scope === 'Personal' ? actor.id : null,
        icon: data.icon ?? null, color: data.color ?? '#3F76D0', filters: data.filters ?? '{}',
        grouping: data.grouping ?? 'status', ordering: data.ordering ?? 'manual', options: data.options ?? '{}',
        display: data.display ?? 'List', position: Math.max(0, ...all.records.map(v => Number(v.position ?? 0))) + 1,
      },
    });
    return { id: created.id };
  },
});
