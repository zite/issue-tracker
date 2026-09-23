import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';
import { createNotifications } from '../server/changes';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  summary: z.string().max(500).nullable().optional(),
  description: z.string().max(100_000).nullable().optional(),
  status: z.enum(['Backlog', 'Planned', 'In Progress', 'Paused', 'Completed', 'Canceled']).optional(),
  health: z.enum(['On Track', 'At Risk', 'Off Track', 'Unknown']).optional(),
  leadId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  goalId: z.string().nullable().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  icon: z.string().max(16).nullable().optional(),
  color: z.string().max(32).nullable().optional(),
  startDate: dateStr.nullable().optional(),
  targetDate: dateStr.nullable().optional(),
  position: z.number().optional(),
  remove: z.boolean().optional(),
});

export default createEndpoint({
  description: 'Create, update or delete a project',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ id: z.string().nullable() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid project', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    if (data.remove) {
      if (!data.id) throw new ZiteError('An id is required', 'BAD_REQUEST');
      const project = await zite.projects.findOne({ id: data.id });
      if (!project) throw new ZiteError('Project not found', 'NOT_FOUND');
      // Deleting a project must not delete its work — the issues simply leave it.
      const issues = await zite.issues.findAll({ filters: { projectId: data.id }, limit: 2000 });
      for (const i of issues.records) await zite.issues.update({ id: i.id, record: { projectId: null, milestoneId: null } });
      for (const table of ['milestones', 'checkIns'] as const) {
        const { records } = await (zite[table] as any).findAll({ filters: { projectId: data.id }, limit: 500 });
        for (const r of records) await (zite[table] as any).delete({ id: r.id });
      }
      const pins = await zite.pins.findAll({ filters: { entityType: 'Project', entityId: data.id }, limit: 200 });
      for (const f of pins.records) await zite.pins.delete({ id: f.id });
      await zite.projects.delete({ id: data.id });
      return { id: null };
    }

    const record: Record<string, unknown> = {};
    for (const k of ['name', 'summary', 'description', 'status', 'health', 'leadId', 'teamId', 'goalId', 'priority', 'icon', 'color', 'startDate', 'targetDate', 'position'] as const) {
      if (data[k] !== undefined) record[k] = data[k];
    }

    // Validate the dates the project will END UP with — moving only the start past the target is still backwards.
    const existing = data.id ? await zite.projects.findOne({ id: data.id }) : null;
    if (data.id && !existing) throw new ZiteError('Project not found', 'NOT_FOUND');
    const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);
    const start = data.startDate !== undefined ? data.startDate : day(existing?.startDate);
    const target = data.targetDate !== undefined ? data.targetDate : day(existing?.targetDate);
    if (start && target && target < start) throw new ZiteError('The target date must be after the start date', 'BAD_REQUEST');

    if (data.id && existing) {
      if (Object.keys(record).length === 0) throw new ZiteError('Nothing to update', 'BAD_REQUEST');
      // Completion is a fact about time: stamp it once, clear it if the project reopens.
      if (data.status === 'Completed' && !existing.completedAt) record.completedAt = new Date().toISOString();
      if (data.status && data.status !== 'Completed') record.completedAt = null;
      await zite.projects.update({ id: data.id, record });

      if (data.leadId && data.leadId !== existing.leadId && data.leadId !== actor.id) {
        await createNotifications([data.leadId], {
          type: 'check_in', actorId: actor.id, projectId: data.id,
          name: `${actor.name} made you lead of ${existing.name}`, body: existing.summary ?? existing.name ?? '',
        });
      }
      return { id: data.id };
    }

    if (!data.name) throw new ZiteError('A project needs a name', 'BAD_REQUEST');
    const all = await zite.projects.findAll({ limit: 2000 });
    const created = await zite.projects.create({
      record: {
        name: data.name, summary: data.summary ?? null, description: data.description ?? null,
        status: data.status ?? 'Planned', health: data.health ?? 'Unknown', leadId: data.leadId === undefined ? actor.id : data.leadId,
        teamId: data.teamId ?? null, goalId: data.goalId ?? null, priority: data.priority ?? 0,
        icon: data.icon ?? '◆', color: data.color ?? '#3F76D0', startDate: data.startDate ?? null,
        targetDate: data.targetDate ?? null, completedAt: data.status === 'Completed' ? new Date().toISOString() : null,
        position: data.position ?? Math.max(0, ...all.records.map(p => Number(p.position ?? 0))) + 1,
      },
    });
    return { id: created.id };
  },
});
