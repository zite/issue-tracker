import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.object({
  id: z.string().optional(),
  teamId: z.string().min(1),
  name: z.string().trim().max(120).nullable().optional(),
  startDate: dateStr.optional(),
  endDate: dateStr.optional(),
  goal: z.string().max(5000).nullable().optional(),
  remove: z.boolean().optional(),
});

export default createEndpoint({
  description: 'Create, edit or delete a sprint for a team',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ id: z.string().nullable(), number: z.number() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid sprint', 'BAD_REQUEST');
    const data = parsed.data;
    await getActor(context);

    if (data.startDate && data.endDate && data.endDate <= data.startDate) {
      throw new ZiteError('A sprint must end after it starts', 'BAD_REQUEST');
    }

    // Two sprints of one team overlapping would make "the current sprint" ambiguous.
    const siblings = (await zite.sprints.findAll({ filters: { teamId: data.teamId }, limit: 500 })).records;
    const overlaps = (start: string, end: string, exceptId?: string) =>
      siblings.some(c => c.id !== exceptId && c.startDate && c.endDate &&
        String(c.startDate).slice(0, 10) < end && String(c.endDate).slice(0, 10) > start);

    if (data.remove) {
      if (!data.id) throw new ZiteError('An id is required', 'BAD_REQUEST');
      const issues = await zite.issues.findAll({ filters: { sprintId: data.id }, limit: 2000 });
      for (const i of issues.records) await zite.issues.update({ id: i.id, record: { sprintId: null } });
      await zite.sprints.delete({ id: data.id });
      return { id: null, number: 0 };
    }

    if (data.id) {
      const existing = siblings.find(c => c.id === data.id);
      if (!existing) throw new ZiteError('Sprint not found', 'NOT_FOUND');
      const start = data.startDate ?? String(existing.startDate ?? '').slice(0, 10);
      const end = data.endDate ?? String(existing.endDate ?? '').slice(0, 10);
      if (start && end && end <= start) throw new ZiteError('A sprint must end after it starts', 'BAD_REQUEST');
      if (start && end && overlaps(start, end, data.id)) throw new ZiteError('Those dates overlap another sprint', 'CONFLICT');
      const record: Record<string, unknown> = {};
      for (const k of ['name', 'startDate', 'endDate', 'goal'] as const) if (data[k] !== undefined) record[k] = data[k];
      if (record.name === '' || record.name === null) record.name = `Sprint ${existing.number ?? ''}`.trim();
      await zite.sprints.update({ id: data.id, record });
      return { id: data.id, number: Number(existing.number ?? 0) };
    }

    if (!data.startDate || !data.endDate) throw new ZiteError('A sprint needs start and end dates', 'BAD_REQUEST');
    if (overlaps(data.startDate, data.endDate)) throw new ZiteError('Those dates overlap another sprint', 'CONFLICT');
    const number = Math.max(0, ...siblings.map(c => Number(c.number ?? 0))) + 1;
    const created = await zite.sprints.create({
      record: {
        name: data.name?.trim() || `Sprint ${number}`, number, teamId: data.teamId,
        startDate: data.startDate, endDate: data.endDate, goal: data.goal ?? null, completedAt: null,
      },
    });
    return { id: created.id, number };
  },
});
