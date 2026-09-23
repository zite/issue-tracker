import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';

const schema = z.object({ ids: z.array(z.string().min(1)).min(1).max(250) });

type Dependent = 'issueLabels' | 'comments' | 'reactions' | 'activity' | 'issueSubscribers' | 'notifications' | 'issueAttachments';

/**
 * Permanent delete. There is no cascade, so dependents go by hand — skipping
 * that leaves orphaned rows that joins silently drop, and a comment count that
 * never matches the thread. Sub-issues are promoted, not deleted with the parent.
 */
export default createEndpoint({
  description: 'Permanently delete issues and everything that hangs off them',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ deleted: z.number(), promotedChildren: z.number() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Invalid request', 'BAD_REQUEST');
    await getActor(context);

    let deleted = 0;
    let promotedChildren = 0;

    for (const id of parsed.data.ids) {
      const issue = await zite.issues.findOne({ id });
      if (!issue) continue;

      const children = await zite.issues.findAll({ filters: { parentId: id }, limit: 500 });
      for (const c of children.records) {
        await zite.issues.update({ id: c.id, record: { parentId: null } });
        promotedChildren++;
      }

      const dependents: Array<[Dependent, Record<string, string>]> = [
        ['issueLabels', { issueId: id }],
        ['comments', { issueId: id }],
        ['reactions', { issueId: id }],
        ['activity', { issueId: id }],
        ['issueSubscribers', { issueId: id }],
        ['notifications', { issueId: id }],
        ['issueAttachments', { issueId: id }],
      ];
      for (const [table, filters] of dependents) {
        const { records } = await (zite[table] as any).findAll({ filters, limit: 1000 });
        for (const r of records) await (zite[table] as any).delete({ id: r.id });
      }
      for (const filters of [{ issueId: id }, { relatedIssueId: id }]) {
        const { records } = await zite.issueRelations.findAll({ filters, limit: 500 });
        for (const r of records) await zite.issueRelations.delete({ id: r.id });
      }
      const pins = await zite.pins.findAll({ filters: { entityType: 'Issue', entityId: id }, limit: 100 });
      for (const f of pins.records) await zite.pins.delete({ id: f.id });

      await zite.issues.delete({ id });
      deleted++;
    }

    return { deleted, promotedChildren };
  },
});
