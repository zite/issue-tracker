import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';
import { isConfigured } from '../server/ai';
import { bool, day, iso, num, numOrNull, ref, str } from '../server/sql';

/**
 * Everything the app shell needs, in one round trip.
 *
 * Every picker, filter menu and row renders names out of these small reference
 * tables. Loading them once — rather than per surface — is what lets a status
 * menu open instantly and an optimistic edit re-render with the right label.
 */
export default createEndpoint({
  description: 'Load the signed-in member and every reference table the app shell renders from',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({
    seeded: z.boolean(),
    aiAvailable: z.boolean(),
    me: z.object({
      id: z.string(), name: z.string(), email: z.string(), avatarUrl: z.string().nullable(),
      color: z.string().nullable(), role: z.string().nullable(), jobTitle: z.string().nullable(),
    }),
    teams: z.array(z.object({
      id: z.string(), name: z.string(), key: z.string(), icon: z.string().nullable(), color: z.string().nullable(),
      description: z.string().nullable(), sprintsEnabled: z.boolean(), sprintDurationWeeks: z.number(),
      intakeEnabled: z.boolean(), estimateScale: z.string(), position: z.number(),
    })),
    members: z.array(z.object({
      id: z.string(), name: z.string(), email: z.string().nullable(), avatarUrl: z.string().nullable(),
      color: z.string().nullable(), jobTitle: z.string().nullable(), role: z.string().nullable(),
      status: z.string().nullable(), teamIds: z.array(z.string()),
    })),
    statuses: z.array(z.object({
      id: z.string(), teamId: z.string().nullable(), name: z.string(), type: z.string(),
      color: z.string().nullable(), position: z.number(), description: z.string().nullable(),
    })),
    labels: z.array(z.object({
      id: z.string(), name: z.string(), color: z.string(), description: z.string().nullable(), teamId: z.string().nullable(),
    })),
    goals: z.array(z.object({
      id: z.string(), name: z.string(), summary: z.string().nullable(), description: z.string().nullable(), status: z.string(), ownerId: z.string().nullable(),
      icon: z.string().nullable(), color: z.string().nullable(), targetDate: z.string().nullable(), position: z.number(),
    })),
    projects: z.array(z.object({
      id: z.string(), name: z.string(), icon: z.string().nullable(), color: z.string().nullable(),
      status: z.string(), health: z.string(), teamId: z.string().nullable(), leadId: z.string().nullable(),
      goalId: z.string().nullable(), priority: z.number(), summary: z.string().nullable(),
      startDate: z.string().nullable(), targetDate: z.string().nullable(), position: z.number(),
    })),
    milestones: z.array(z.object({
      id: z.string(), projectId: z.string().nullable(), name: z.string(), targetDate: z.string().nullable(), position: z.number(),
    })),
    sprints: z.array(z.object({
      id: z.string(), teamId: z.string().nullable(), number: z.number(), name: z.string(),
      startDate: z.string().nullable(), endDate: z.string().nullable(), goal: z.string().nullable(),
      completedAt: z.string().nullable(), status: z.enum(['completed', 'active', 'upcoming']),
    })),
    views: z.array(z.object({
      id: z.string(), name: z.string(), description: z.string().nullable(), ownerId: z.string().nullable(),
      teamId: z.string().nullable(), scope: z.string(), icon: z.string().nullable(), color: z.string().nullable(),
      filters: z.string(), grouping: z.string(), ordering: z.string(), options: z.string(), display: z.string(),
      position: z.number(),
    })),
    templates: z.array(z.object({
      id: z.string(), name: z.string(), teamId: z.string().nullable(), title: z.string().nullable(),
      description: z.string().nullable(), priority: z.number(), estimate: z.number().nullable(),
      issueType: z.string().nullable(), labelIds: z.array(z.string()), position: z.number(),
    })),
    pins: z.array(z.object({
      id: z.string(), entityType: z.string(), entityId: z.string(), position: z.number(),
      issueIdentifier: z.string().nullable(), issueTitle: z.string().nullable(),
    })),
    counts: z.object({
      inboxUnread: z.number(),
      myOpen: z.number(),
      intakeByTeam: z.record(z.string(), z.number()),
    }),
  }),
  execute: async ({ context }) => {
    const actor = await getActor(context);

    const q = (query: string, params: unknown[] = []) => zite.sql({ query, params });
    const [
      teamRows, memberRows, membershipRows, stateRows, labelRows, goalRows, projectRows,
      milestoneRows, sprintRows, viewRows, templateRows, pinRows, countRows, intakeRows,
    ] = await Promise.all([
      q(`SELECT id, "name", "key", "icon", "color", "description", "sprintsEnabled", "sprintDurationWeeks", "intakeEnabled", "estimateScale", "position" FROM "Teams" ORDER BY "position" ASC NULLS LAST, "name" ASC`),
      q(`SELECT id, "name", "email", "avatarUrl", "color", "jobTitle", "role", "status" FROM "Members" ORDER BY "name" ASC`),
      q(`SELECT "teamId", "memberId" FROM "TeamMembers"`),
      q(`SELECT id, "teamId", "name", "type", "color", "position", "description" FROM "Statuses" ORDER BY "position" ASC NULLS LAST`),
      q(`SELECT id, "name", "color", "description", "teamId" FROM "Labels" ORDER BY LOWER("name") ASC`),
      q(`SELECT id, "name", "summary", "description", "status", "ownerId", "icon", "color", "targetDate", "position" FROM "Goals" ORDER BY "position" ASC NULLS LAST`),
      q(`SELECT id, "name", "icon", "color", "status", "health", "teamId", "leadId", "goalId", "priority", "summary", "startDate", "targetDate", "position" FROM "Projects" ORDER BY "position" ASC NULLS LAST, "name" ASC`),
      q(`SELECT id, "projectId", "name", "targetDate", "position" FROM "Milestones" ORDER BY "position" ASC NULLS LAST, "targetDate" ASC NULLS LAST`),
      q(`SELECT id, "teamId", "number", "name", "startDate", "endDate", "goal", "completedAt" FROM "Sprints" ORDER BY "startDate" ASC NULLS LAST`),
      q(`SELECT id, "name", "description", "ownerId", "teamId", "scope", "icon", "color", "filters", "grouping", "ordering", "options", "display", "position" FROM "Views" WHERE COALESCE("ownerId", '') = '' OR "ownerId" = $1 ORDER BY "position" ASC NULLS LAST`, [actor.id]),
      q(`SELECT id, "name", "teamId", "title", "description", "priority", "estimate", "issueType", "labelIds", "position" FROM "IssueTemplates" ORDER BY "position" ASC NULLS LAST`),
      q(`SELECT f.id, f."entityType", f."entityId", f."position", i."identifier" AS "issueIdentifier", i."title" AS "issueTitle"
         FROM "Pins" f LEFT JOIN "Issues" i ON i.id::text = f."entityId" AND f."entityType" = 'Issue'
         WHERE f."memberId" = $1 ORDER BY f."position" ASC NULLS LAST`, [actor.id]),
      q(
        `SELECT
          (SELECT COUNT(*) FROM "Notifications" n
            WHERE n."memberId" = $1 AND COALESCE(n."read", false) = false AND COALESCE(n."archived", false) = false
              AND (n."snoozedUntil" IS NULL OR n."snoozedUntil" <= NOW())) AS "inboxUnread",
          (SELECT COUNT(*) FROM "Issues" i LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
            WHERE i."assigneeId" = $1 AND COALESCE(i."archived", false) = false
              AND COALESCE(ws."type", 'backlog') NOT IN ('completed', 'canceled')) AS "myOpen"`,
        [actor.id],
      ),
      q(`SELECT i."teamId", COUNT(*) AS "total" FROM "Issues" i JOIN "Statuses" ws ON ws.id::text = i."statusId" WHERE ws."type" = 'intake' AND COALESCE(i."archived", false) = false GROUP BY i."teamId"`),
    ]);

    const teamsOf = new Map<string, string[]>();
    for (const r of membershipRows.rows) {
      const mid = String(r.memberId);
      if (!teamsOf.has(mid)) teamsOf.set(mid, []);
      teamsOf.get(mid)!.push(String(r.teamId));
    }

    const today = new Date().toISOString().slice(0, 10);
    const me = memberRows.rows.find(r => String(r.id) === actor.id);
    const counts = countRows.rows[0] ?? {};

    const parseIds = (v: unknown) => {
      try {
        const parsed = JSON.parse(String(v ?? '[]'));
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    };

    return {
      seeded: teamRows.rows.length > 0,
      aiAvailable: isConfigured(),
      me: {
        id: actor.id,
        name: str(me?.name) || actor.name,
        email: actor.email,
        avatarUrl: ref(me?.avatarUrl),
        color: ref(me?.color),
        role: ref(me?.role),
        jobTitle: ref(me?.jobTitle),
      },
      teams: teamRows.rows.map(r => ({
        id: String(r.id), name: str(r.name) ?? '', key: str(r.key) ?? '', icon: ref(r.icon), color: ref(r.color),
        description: ref(r.description), sprintsEnabled: bool(r.sprintsEnabled), sprintDurationWeeks: num(r.sprintDurationWeeks, 2),
        intakeEnabled: bool(r.intakeEnabled), estimateScale: ref(r.estimateScale) ?? 'fibonacci', position: num(r.position),
      })),
      members: memberRows.rows.map(r => ({
        id: String(r.id), name: str(r.name) ?? '', email: ref(r.email), avatarUrl: ref(r.avatarUrl), color: ref(r.color),
        jobTitle: ref(r.jobTitle), role: ref(r.role), status: ref(r.status), teamIds: teamsOf.get(String(r.id)) ?? [],
      })),
      statuses: stateRows.rows.map(r => ({
        id: String(r.id), teamId: ref(r.teamId), name: str(r.name) ?? '', type: ref(r.type) ?? 'backlog',
        color: ref(r.color), position: num(r.position), description: ref(r.description),
      })),
      labels: labelRows.rows.map(r => ({
        id: String(r.id), name: str(r.name) ?? '', color: ref(r.color) ?? '#8b8d98', description: ref(r.description), teamId: ref(r.teamId),
      })),
      goals: goalRows.rows.map(r => ({
        id: String(r.id), name: str(r.name) ?? '', summary: ref(r.summary), description: ref(r.description), status: ref(r.status) ?? 'Planned',
        ownerId: ref(r.ownerId), icon: ref(r.icon), color: ref(r.color), targetDate: day(r.targetDate), position: num(r.position),
      })),
      projects: projectRows.rows.map(r => ({
        id: String(r.id), name: str(r.name) ?? '', icon: ref(r.icon), color: ref(r.color),
        status: ref(r.status) ?? 'Planned', health: ref(r.health) ?? 'Unknown', teamId: ref(r.teamId), leadId: ref(r.leadId),
        goalId: ref(r.goalId), priority: num(r.priority), summary: ref(r.summary),
        startDate: day(r.startDate), targetDate: day(r.targetDate), position: num(r.position),
      })),
      milestones: milestoneRows.rows.map(r => ({
        id: String(r.id), projectId: ref(r.projectId), name: str(r.name) ?? '', targetDate: day(r.targetDate), position: num(r.position),
      })),
      sprints: sprintRows.rows.map(r => {
        const start = day(r.startDate);
        const end = day(r.endDate);
        // Derived, not stored — a stored status is wrong the moment nobody opens
        // the app on the day a sprint rolls over.
        const status = r.completedAt || (end && end < today) ? 'completed' as const
          : start && start > today ? 'upcoming' as const
          : 'active' as const;
        return {
          id: String(r.id), teamId: ref(r.teamId), number: num(r.number), name: str(r.name) || `Sprint ${num(r.number)}`,
          startDate: start, endDate: end, goal: ref(r.goal), completedAt: iso(r.completedAt), status,
        };
      }),
      views: viewRows.rows.map(r => ({
        id: String(r.id), name: str(r.name) ?? '', description: ref(r.description), ownerId: ref(r.ownerId),
        teamId: ref(r.teamId), scope: ref(r.scope) ?? 'Workspace', icon: ref(r.icon), color: ref(r.color),
        filters: ref(r.filters) ?? '{}', grouping: ref(r.grouping) ?? 'status', ordering: ref(r.ordering) ?? 'manual',
        options: ref(r.options) ?? '{}', display: ref(r.display) ?? 'List', position: num(r.position),
      })),
      templates: templateRows.rows.map(r => ({
        id: String(r.id), name: str(r.name) ?? '', teamId: ref(r.teamId), title: ref(r.title), description: ref(r.description),
        priority: num(r.priority), estimate: numOrNull(r.estimate), issueType: ref(r.issueType),
        labelIds: parseIds(r.labelIds), position: num(r.position),
      })),
      pins: pinRows.rows.map(r => ({
        id: String(r.id), entityType: str(r.entityType) ?? '', entityId: str(r.entityId) ?? '', position: num(r.position),
        issueIdentifier: ref(r.issueIdentifier), issueTitle: ref(r.issueTitle),
      })),
      counts: {
        inboxUnread: num(counts.inboxUnread),
        myOpen: num(counts.myOpen),
        intakeByTeam: Object.fromEntries(intakeRows.rows.map(r => [String(r.teamId), num(r.total)])),
      },
    };
  },
});
