import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';
import { POSITION_STEP, recordIssueChanges, timestampsForState, type IssuePatch } from '../server/changes';
import { issueDto, loadIssues } from '../server/issues';

const schema = z.object({
  id: z.string().min(1),
  /** The issues either side of the drop point in the destination column. */
  prevId: z.string().nullable().optional(),
  nextId: z.string().nullable().optional(),
  /** The destination column's ids in their new order — used only if positions need re-spacing. */
  columnIds: z.array(z.string()).max(1000).optional(),
  /** Whatever property the destination column represents on the board. */
  statusId: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  projectId: z.string().nullable().optional(),
  sprintId: z.string().nullable().optional(),
});

/**
 * Board drag-and-drop, for any grouping.
 *
 * Positions are integers spaced by a step: dropping between two cards writes
 * the midpoint, so a drag is ONE write rather than renumbering a column. When
 * repeated midpoints exhaust the gap, the destination column is re-spaced in
 * the order the client shows it — rare, and the only time a drag costs more.
 */
export default createEndpoint({
  description: 'Move an issue to a new position, optionally into another board column',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ issue: issueDto, renormalized: z.boolean() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Invalid move', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    const before = await zite.issues.findOne({ id: data.id });
    if (!before) throw new ZiteError('Issue not found', 'NOT_FOUND');

    const posOf = async (id: string | null | undefined) => {
      if (!id || id === data.id) return null;
      const rec = await zite.issues.findOne({ id });
      return rec?.position == null ? null : Number(rec.position);
    };
    const [prev, next] = await Promise.all([posOf(data.prevId), posOf(data.nextId)]);

    let position: number;
    let renormalized = false;
    if (prev == null && next == null) position = Number(before.position ?? POSITION_STEP);
    else if (prev == null) position = next! - POSITION_STEP;
    else if (next == null) position = prev + POSITION_STEP;
    else if (next - prev > 1) position = Math.floor((prev + next) / 2);
    else {
      renormalized = true;
      const order = (data.columnIds ?? []).filter(Boolean);
      if (!order.includes(data.id)) order.push(data.id);
      position = POSITION_STEP;
      for (let i = 0; i < order.length; i++) {
        const p = (i + 1) * POSITION_STEP;
        if (order[i] === data.id) position = p;
        else await zite.issues.update({ id: order[i], record: { position: p } });
      }
    }

    const patch: IssuePatch = { position };
    if (data.statusId !== undefined && data.statusId !== before.statusId) {
      const state = await zite.statuses.findOne({ id: data.statusId });
      if (!state || state.teamId !== before.teamId) {
        throw new ZiteError(`${before.identifier} can only move between its own team's statuses`, 'BAD_REQUEST');
      }
      patch.statusId = data.statusId;
    }
    if (data.assigneeId !== undefined) patch.assigneeId = data.assigneeId;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.projectId !== undefined) {
      patch.projectId = data.projectId;
      if (data.projectId !== before.projectId && before.milestoneId) patch.milestoneId = null;
    }
    if (data.sprintId !== undefined) {
      if (data.sprintId) {
        const sprint = await zite.sprints.findOne({ id: data.sprintId });
        if (!sprint || sprint.teamId !== before.teamId) throw new ZiteError('That sprint belongs to another team', 'BAD_REQUEST');
      }
      patch.sprintId = data.sprintId;
    }

    const { patch: stamps } = patch.statusId ? await timestampsForState(patch.statusId, before) : { patch: {} };
    await zite.issues.update({ id: data.id, record: { ...patch, ...stamps } });

    const { position: _ignored, ...tracked } = patch;
    if (Object.keys(tracked).length) {
      await recordIssueChanges(
        { issueId: data.id, identifier: before.identifier ?? '', title: before.title ?? '', actor },
        before as unknown as Record<string, unknown>,
        tracked,
      );
    }

    const [issue] = await loadIssues([data.id]);
    return { issue, renormalized };
  },
});
