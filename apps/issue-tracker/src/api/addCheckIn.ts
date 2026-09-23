import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';
import { createNotifications } from '../server/changes';

const schema = z.object({
  projectId: z.string().min(1),
  /** Required to post or edit; a delete needs only the id. */
  body: z.string().trim().min(1).max(50_000).optional(),
  health: z.enum(['On Track', 'At Risk', 'Off Track']).optional(),
  id: z.string().optional(),
  remove: z.boolean().optional(),
});

/** Project health follows its most recent update, so editing or deleting that update moves it too. */
async function syncHealth(projectId: string) {
  const { records } = await zite.checkIns.findAll({ filters: { projectId }, limit: 500 });
  const latest = records
    .filter(u => u.postedAt)
    .sort((a, b) => String(b.postedAt).localeCompare(String(a.postedAt)))[0];
  await zite.projects.update({ id: projectId, record: { health: latest?.health || 'Unknown' } });
}

export default createEndpoint({
  description: 'Post, edit or delete a check-in; posting moves the project health with it',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ id: z.string().nullable(), notified: z.number() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid update', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    const project = await zite.projects.findOne({ id: data.projectId });
    if (!project) throw new ZiteError('Project not found', 'NOT_FOUND');

    if (data.id) {
      const update = await zite.checkIns.findOne({ id: data.id });
      if (!update || update.projectId !== data.projectId) throw new ZiteError('Update not found', 'NOT_FOUND');
      if (update.authorId !== actor.id) throw new ZiteError('You can only change your own updates', 'FORBIDDEN');
      if (data.remove) {
        await zite.checkIns.delete({ id: data.id });
        await syncHealth(data.projectId);
        return { id: null, notified: 0 };
      }
      const record: Record<string, unknown> = {};
      if (data.body !== undefined) record.body = data.body;
      if (data.health !== undefined) record.health = data.health;
      if (Object.keys(record).length === 0) throw new ZiteError('Nothing to update', 'BAD_REQUEST');
      await zite.checkIns.update({ id: data.id, record });
      if (data.health !== undefined) await syncHealth(data.projectId);
      return { id: data.id, notified: 0 };
    }

    if (data.remove) throw new ZiteError('An id is required', 'BAD_REQUEST');
    if (!data.body || !data.health) throw new ZiteError('An update needs a health and some words', 'BAD_REQUEST');

    const postedAt = new Date().toISOString();
    const update = await zite.checkIns.create({
      record: {
        name: `${project.name} — ${data.health}`, projectId: data.projectId, authorId: actor.id,
        health: data.health, body: data.body, postedAt,
      },
    });

    // The update IS the health signal — a project whose health lags its latest
    // update is how a dashboard ends up lying.
    await zite.projects.update({ id: data.projectId, record: { health: data.health } });

    const { rows } = await zite.sql({
      query: `SELECT DISTINCT "assigneeId" FROM "Issues" WHERE "projectId" = $1 AND COALESCE("assigneeId", '') <> ''`,
      params: [data.projectId],
    });
    const audience = new Set(rows.map(r => String(r.assigneeId)));
    if (project.leadId) audience.add(project.leadId);
    audience.delete(actor.id);

    const notified = await createNotifications([...audience], {
      type: 'check_in', actorId: actor.id, projectId: data.projectId,
      name: `${actor.name} posted a check-in on ${project.name}`, body: data.body, occurredAt: postedAt,
    });
    return { id: update.id, notified };
  },
});
