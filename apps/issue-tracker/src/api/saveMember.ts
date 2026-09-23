import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertCan, colorFor, getActor } from '../server/actor';

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  jobTitle: z.string().max(120).nullable().optional(),
  role: z.enum(['Admin', 'Member', 'Guest']).optional(),
  status: z.enum(['Active', 'Invited', 'Deactivated']).optional(),
  color: z.string().max(32).nullable().optional(),
  avatarUrl: z.string().max(1000).nullable().optional(),
  /** Replace the member's team memberships. */
  teamIds: z.array(z.string()).max(100).optional(),
});

/**
 * Members are app records, not platform accounts. Removing someone is a
 * deactivation, never a delete — the author of a two-year-old comment should
 * not silently become nobody.
 */
export default createEndpoint({
  description: 'Invite or update a member and their team memberships',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError(parsed.error.issues[0]?.message ?? 'Invalid member', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    let memberId = data.id ?? '';
    // Anyone can edit their own profile; roles, status, teams and other people are an admin's call.
    const ownProfileOnly = memberId === actor.id && data.role === undefined && data.status === undefined && data.teamIds === undefined;
    if (!ownProfileOnly) assertCan(actor, 'manageMembers');
    if (memberId) {
      const member = await zite.members.findOne({ id: memberId });
      if (!member) throw new ZiteError('Member not found', 'NOT_FOUND');
      if (memberId === actor.id && data.status === 'Deactivated') throw new ZiteError('You cannot deactivate yourself', 'BAD_REQUEST');
      // A workspace with no active admin can never manage members again, so the last one can't be demoted or deactivated.
      const losesAdmin = member.role === 'Admin' && member.status === 'Active' && ((data.role !== undefined && data.role !== 'Admin') || (data.status !== undefined && data.status !== 'Active'));
      if (losesAdmin) {
        const { rows } = await zite.sql({
          query: `SELECT 1 FROM "Members" WHERE "role" = 'Admin' AND "status" = 'Active' AND id::text <> $1 LIMIT 1`,
          params: [memberId],
        });
        if (!rows.length) throw new ZiteError(`${member.name || 'This person'} is the only admin. Make someone else an admin first.`, 'BAD_REQUEST');
      }
      const record: Record<string, unknown> = {};
      for (const k of ['name', 'jobTitle', 'role', 'status', 'color', 'avatarUrl'] as const) if (data[k] !== undefined) record[k] = data[k];
      if (Object.keys(record).length) await zite.members.update({ id: memberId, record });
    } else {
      if (!data.name || !data.email) throw new ZiteError('A new member needs a name and an email', 'BAD_REQUEST');
      const email = data.email.toLowerCase();
      if (await zite.members.findOne({ filters: { email } })) throw new ZiteError('Someone with that email is already a member', 'CONFLICT');
      const created = await zite.members.create({
        record: {
          name: data.name, email, jobTitle: data.jobTitle ?? null, role: data.role ?? 'Member', status: data.status ?? 'Invited',
          color: data.color ?? colorFor(email), avatarUrl: data.avatarUrl ?? null,
        },
      });
      memberId = created.id;
    }

    if (data.teamIds) {
      const existing = (await zite.teamMembers.findAll({ filters: { memberId }, limit: 200 })).records;
      const want = new Set(data.teamIds);
      for (const r of existing) if (!want.has(r.teamId ?? '')) await zite.teamMembers.delete({ id: r.id });
      const have = new Set(existing.map(r => r.teamId));
      const toAdd = [...want].filter(t => !have.has(t));
      if (toAdd.length) await zite.teamMembers.bulkCreate({ records: toAdd.map(teamId => ({ name: 'member', teamId, memberId })) });
    }

    return { id: memberId };
  },
});
