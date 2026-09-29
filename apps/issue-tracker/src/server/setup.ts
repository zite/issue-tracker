import { zite } from 'zitejs/db';
import type { Actor } from './actor';

/**
 * What a workspace needs before anyone has created anything, and when the
 * sample data may still be loaded into it.
 *
 * A fresh install starts empty. The one thing it cannot do without is a team:
 * an issue needs a team for its identifier and a status from that team's
 * workflow. So `bootstrap` creates a default team the first time it finds
 * none, and the sample data (Settings → General) reuses that team rather than
 * adding a second one with the same key.
 */

/** Every new team starts with this workflow. */
export const DEFAULT_STATES = [
  { name: 'Intake', type: 'intake', color: '#D24A22', position: 0, description: 'Inbound work waiting to be accepted.' },
  { name: 'Backlog', type: 'backlog', color: '#A39C8F', position: 1, description: 'Accepted but not yet planned.' },
  { name: 'To do', type: 'unstarted', color: '#8A8275', position: 2, description: 'Planned and ready to pick up.' },
  { name: 'In Progress', type: 'started', color: '#BF8300', position: 3, description: 'Being worked on.' },
  { name: 'In Review', type: 'started', color: '#3F76D0', position: 4, description: 'Waiting on review.' },
  { name: 'Done', type: 'completed', color: '#2E9460', position: 5, description: 'Finished.' },
  { name: 'Canceled', type: 'canceled', color: '#A39C8F', position: 6, description: 'Will not be done.' },
];

/**
 * The team a fresh install starts with. It matches the sample data's first
 * team (`TEAMS[0]` in `seed/data.ts`), so loading the sample fills this team
 * instead of creating another ENG beside it. It can be renamed; its key can't.
 */
export const DEFAULT_TEAM = {
  name: 'Engineering', key: 'ENG', icon: '⚡', color: '#3F76D0',
  sprintsEnabled: true, sprintDurationWeeks: 2, intakeEnabled: true, estimateScale: 'fibonacci' as const,
};

/** Creates the default team, its workflow and memberships when the workspace has no team at all. */
export async function ensureDefaultTeam(actor: Actor) {
  const existing = await zite.teams.findAll({ limit: 1 });
  if (existing.records.length) return;

  const team = await zite.teams.create({
    record: { ...DEFAULT_TEAM, description: null, issueCounter: 0, position: 1 },
  });

  // Two first loads can race past the check above. The older team wins and
  // the newer one removes itself before anything hangs off it.
  const { rows } = await zite.sql({
    query: `SELECT id FROM "Teams" WHERE UPPER("key") = $1 ORDER BY created_at ASC, id ASC`,
    params: [DEFAULT_TEAM.key],
  });
  if (rows.length > 1 && String(rows[0].id) !== team.id) {
    await zite.teams.delete({ id: team.id });
    return;
  }

  await zite.statuses.bulkCreate({ records: DEFAULT_STATES.map(s => ({ ...s, teamId: team.id })) });

  // Everyone already here joins it, as a newcomer joins every team in `getActor`.
  const { rows: people } = await zite.sql({
    query: `SELECT id, "name" FROM "Members" WHERE COALESCE("status", '') <> 'Deactivated'`,
    params: [],
  });
  const ids = new Set(people.map(p => String(p.id)));
  ids.add(actor.id);
  await zite.teamMembers.bulkCreate({
    records: [...ids].map(memberId => ({
      name: `${DEFAULT_TEAM.key} · ${memberId === actor.id ? actor.name : String(people.find(p => String(p.id) === memberId)?.name ?? '')}`,
      teamId: team.id,
      memberId,
    })),
  });
}

/**
 * Every sample person has an address on this reserved domain (`MEMBERS` in
 * `seed/data.ts`). Members are deactivated, never deleted, so one of them
 * existing means the sample was loaded at some point.
 */
export const SAMPLE_EMAIL_DOMAIN = 'quillmark.test';

/**
 * Why the sample data can't be loaded right now, or null when it can: it has
 * never been loaded, and nobody has created an issue, project, goal or sprint.
 * Teams, statuses, labels, templates, views and people are setup, not
 * content, so they don't block it.
 */
export async function sampleDataBlocker(): Promise<string | null> {
  const { rows } = await zite.sql({
    query: `SELECT
      EXISTS (SELECT 1 FROM "Members" WHERE LOWER("email") LIKE $1) AS "loaded",
      EXISTS (SELECT 1 FROM "Issues") AS "issues",
      EXISTS (SELECT 1 FROM "Projects") AS "projects",
      EXISTS (SELECT 1 FROM "Goals") AS "goals",
      EXISTS (SELECT 1 FROM "Sprints") AS "sprints"`,
    params: [`%@${SAMPLE_EMAIL_DOMAIN}`],
  });
  const r = rows[0] ?? {};
  const yes = (v: unknown) => v === true || v === 'true' || v === 't';
  if (yes(r.loaded)) return 'The sample data has already been loaded into this workspace.';
  if (yes(r.issues) || yes(r.projects) || yes(r.goals) || yes(r.sprints)) {
    return 'This workspace already has issues, projects, goals or sprints, so the sample data can’t be added to it.';
  }
  return null;
}
