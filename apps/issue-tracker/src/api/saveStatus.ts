import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertCan, getActor } from '../server/actor';
import { lifecycleFor } from '../server/changes';

const TYPE_ORDER = ['intake', 'backlog', 'unstarted', 'started', 'completed', 'canceled'];
/** Every team needs somewhere for new, in-flight, finished and dropped work to go. Intake is optional. */
const REQUIRED = ['backlog', 'unstarted', 'started', 'completed', 'canceled'];
const byPosition = (a: { position?: number | null }, b: { position?: number | null }) => Number(a.position ?? 0) - Number(b.position ?? 0);

const schema = z.object({
  id: z.string().optional(),
  teamId: z.string().min(1),
  name: z.string().trim().min(1).max(60).optional(),
  type: z.enum(['intake', 'backlog', 'unstarted', 'started', 'completed', 'canceled']).optional(),
  color: z.string().max(32).optional(),
  description: z.string().max(300).nullable().optional(),
  /** Full ordering of the team's states, ids in order. */
  order: z.array(z.string()).max(50).optional(),
  remove: z.boolean().optional(),
  /** Where issues go when their state is deleted. */
  reassignToStatusId: z.string().optional(),
});

export default createEndpoint({
  description: 'Add, edit, reorder or remove a status for a team',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ id: z.string().nullable(), movedIssues: z.number() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid status', 'BAD_REQUEST');
    const data = parsed.data;
    assertCan(await getActor(context), 'editSettings');

    const all = (await zite.statuses.findAll({ filters: { teamId: data.teamId }, limit: 50 })).records;

    /** Issues keep their lifecycle timestamps in step with their state's category, or velocity and cycle time lie. */
    const syncIssues = async (issues: Array<{ id: string; startedAt?: string | null; completedAt?: string | null; canceledAt?: string | null }>, type: string | null | undefined, statusId?: string) => {
      for (const i of issues) {
        const record: Record<string, unknown> = { ...lifecycleFor(type, i) };
        if (statusId) record.statusId = statusId;
        await zite.issues.update({ id: i.id, record });
      }
    };

    if (data.order) {
      for (let i = 0; i < data.order.length; i++) {
        if (all.some(s => s.id === data.order![i])) await zite.statuses.update({ id: data.order[i], record: { position: i } });
      }
      return { id: null, movedIssues: 0 };
    }

    if (data.remove) {
      const state = all.find(s => s.id === data.id);
      if (!state) throw new ZiteError('Status not found', 'NOT_FOUND');
      const sameType = all.filter(s => s.type === state.type);
      // Every team needs somewhere for finished and unstarted work to go.
      if (sameType.length <= 1 && REQUIRED.includes(state.type ?? '')) {
        throw new ZiteError(`A team needs at least one ${state.type} status`, 'BAD_REQUEST');
      }
      // Issues in the deleted column must land somewhere, or they vanish from every board.
      const fallback = all.find(s => s.id === data.reassignToStatusId && s.id !== state.id)
        ?? sameType.find(s => s.id !== state.id)
        ?? all.find(s => s.id !== state.id && s.type === 'backlog')!;
      const affected = await zite.issues.findAll({ filters: { statusId: state.id }, limit: 2000 });
      if (fallback.type === state.type) {
        for (const i of affected.records) await zite.issues.update({ id: i.id, record: { statusId: fallback.id } });
      } else {
        await syncIssues(affected.records, fallback.type, fallback.id);
      }
      await zite.statuses.delete({ id: state.id });
      return { id: null, movedIssues: affected.records.length };
    }

    if (data.id) {
      const state = all.find(s => s.id === data.id);
      if (!state) throw new ZiteError('Status not found', 'NOT_FOUND');
      const record: Record<string, unknown> = {};
      for (const k of ['name', 'color', 'description'] as const) if (data[k] !== undefined) record[k] = data[k];
      const recategorised = data.type !== undefined && data.type !== state.type;
      if (recategorised) {
        if (all.filter(s => s.type === state.type).length <= 1 && REQUIRED.includes(state.type ?? '')) {
          throw new ZiteError(`A team needs at least one ${state.type} status`, 'BAD_REQUEST');
        }
        record.type = data.type;
      }
      if (Object.keys(record).length === 0) throw new ZiteError('Nothing to update', 'BAD_REQUEST');
      await zite.statuses.update({ id: data.id, record });

      if (recategorised) {
        // Move it to the end of its new category so the board keeps its left-to-right shape.
        const rest = all.filter(s => s.id !== state.id).sort(byPosition);
        const lastOfGroup = rest.reduce((at, s, i) => (TYPE_ORDER.indexOf(s.type ?? 'backlog') <= TYPE_ORDER.indexOf(data.type!) ? i + 1 : at), 0);
        const next = [...rest.slice(0, lastOfGroup), state, ...rest.slice(lastOfGroup)];
        for (let i = 0; i < next.length; i++) {
          if (Number(next[i].position ?? -1) !== i) await zite.statuses.update({ id: next[i].id, record: { position: i } });
        }
        const affected = await zite.issues.findAll({ filters: { statusId: state.id }, limit: 2000 });
        await syncIssues(affected.records, data.type);
      }
      return { id: data.id, movedIssues: 0 };
    }

    if (!data.name || !data.type) throw new ZiteError('A new status needs a name and a category', 'BAD_REQUEST');
    // Insert after the last state of the same category, so the board keeps its shape.
    const ordered = all.slice().sort(byPosition);
    let insertAt = ordered.length;
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (TYPE_ORDER.indexOf(ordered[i].type ?? 'backlog') <= TYPE_ORDER.indexOf(data.type)) {
        insertAt = i + 1;
        break;
      }
      insertAt = i;
    }
    const created = await zite.statuses.create({
      record: { name: data.name, teamId: data.teamId, type: data.type, color: data.color ?? '#8b8d98', description: data.description ?? null, position: insertAt },
    });
    const next = [...ordered.slice(0, insertAt).map(s => s.id), created.id, ...ordered.slice(insertAt).map(s => s.id)];
    for (let i = 0; i < next.length; i++) await zite.statuses.update({ id: next[i], record: { position: i } });
    return { id: created.id, movedIssues: 0 };
  },
});
