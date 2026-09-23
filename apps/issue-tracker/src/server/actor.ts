import { ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';

/**
 * Who is making this request, as a Issue Tracker member.
 *
 * Every mutation resolves the actor from the SESSION rather than trusting an
 * id the client sends. A client-supplied `actorId` lets anyone post comments as
 * someone else, clear another person's inbox, or edit their saved views — and
 * nothing in the UI would ever reveal it.
 *
 * Members are app records (they carry a job title, colour, team memberships
 * and can exist before someone signs in), so a signed-in user is matched to one
 * by email and a member is created the first time someone new shows up.
 */

export type Role = 'Admin' | 'Member' | 'Guest';
export type Actor = { id: string; name: string; email: string; role: Role; created: boolean };

const asRole = (v: unknown): Role => (v === 'Admin' || v === 'Guest' ? v : 'Member');

/**
 * Roles gate what changes the workspace itself. Admins manage people; Members
 * and Admins shape teams, workflows, labels and templates; Guests do the work
 * without rearranging anyone else's setup.
 */
export function assertCan(actor: Actor, action: 'manageMembers' | 'editSettings') {
  if (action === 'manageMembers' && actor.role !== 'Admin') {
    throw new ZiteError('Only admins can manage members', 'FORBIDDEN');
  }
  if (action === 'editSettings' && actor.role === 'Guest') {
    throw new ZiteError("Guests can't change workspace settings", 'FORBIDDEN');
  }
}

type UserLike = { email?: string | null; firstName?: string | null; lastName?: string | null } | null | undefined;

const AVATAR_COLORS = ['#3F76D0', '#8656C9', '#1F8A86', '#2E9460', '#BF8300', '#D24A22', '#B04FA6', '#2B86B8'];

/** A stable colour per person, so an avatar never changes between loads. */
export function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export async function getActor(context: { user?: UserLike }): Promise<Actor> {
  const email = context.user?.email?.trim().toLowerCase();
  if (!email) throw new ZiteError('You need to be signed in', 'UNAUTHORIZED');

  const existing = await zite.members.findOne({ filters: { email } });
  if (existing) {
    if (existing.status === 'Deactivated') {
      throw new ZiteError('Your access to this workspace has been deactivated. Ask an admin to reactivate you.', 'FORBIDDEN');
    }
    // An invitation is accepted by showing up.
    if (existing.status === 'Invited') await zite.members.update({ id: existing.id, record: { status: 'Active' } });
    return { id: existing.id, name: existing.name || email, email, role: asRole(existing.role), created: false };
  }

  // `context.user` omits the display name and image, so read the fuller
  // profile from the auth users table.
  const { rows } = await zite.sql({
    query: `SELECT "name", "image" FROM "ziteUsers" WHERE LOWER("email") = $1 LIMIT 1`,
    params: [email],
  });
  const profile = rows[0] ?? {};
  const name =
    [context.user?.firstName, context.user?.lastName].filter(Boolean).join(' ').trim() ||
    (profile.name ? String(profile.name) : '') ||
    email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // The first person in becomes the admin; everyone after joins as a member.
  const { rows: admins } = await zite.sql({ query: `SELECT 1 FROM "Members" WHERE "role" = 'Admin' LIMIT 1`, params: [] });
  const role: Role = admins.length ? 'Member' : 'Admin';

  const created = await zite.members.create({
    record: {
      name,
      email,
      avatarUrl: profile.image ? String(profile.image) : null,
      jobTitle: null,
      role,
      status: 'Active',
      color: colorFor(email),
    },
  });

  // Put a newcomer on every team so no board or list is empty for them.
  const teams = await zite.teams.findAll({ limit: 100 });
  if (teams.records.length) {
    await zite.teamMembers.bulkCreate({
      records: teams.records.map(t => ({ name: `${t.key ?? ''} · ${name}`, teamId: t.id, memberId: created.id })),
    });
  }

  return { id: created.id, name, email, role, created: true };
}
