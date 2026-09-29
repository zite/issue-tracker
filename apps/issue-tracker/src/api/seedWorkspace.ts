import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';
import { SAMPLE_EMAIL_DOMAIN, sampleDataBlocker } from '../server/setup';
import { chunked } from '../server/sql';
import {
  ATTACHMENTS, COMMENTS, SPRINTS, PINS, GOALS, ISSUES, LABELS, MEMBERS, MILESTONES,
  NOTIFICATIONS, PROJECTS, CHECK_INS, RELATIONS, TEAMS, TEMPLATES, VIEWS,
} from '../seed/data';
import { ME, type StateKey } from '../seed/types';

const DAY = 86_400_000;

/** Every new sample team gets this workflow; `intake` only where the team has intake on. */
const WORKFLOW: Array<{ key: StateKey; name: string; type: string; color: string; description: string }> = [
  { key: 'intake', name: 'Intake', type: 'intake', color: '#D24A22', description: 'Inbound work waiting to be accepted.' },
  { key: 'backlog', name: 'Backlog', type: 'backlog', color: '#A39C8F', description: 'Accepted but not yet planned.' },
  { key: 'todo', name: 'To do', type: 'unstarted', color: '#8A8275', description: 'Planned and ready to pick up.' },
  { key: 'progress', name: 'In Progress', type: 'started', color: '#BF8300', description: 'Being worked on.' },
  { key: 'review', name: 'In Review', type: 'started', color: '#3F76D0', description: 'Open for review.' },
  { key: 'done', name: 'Done', type: 'completed', color: '#2E9460', description: 'Finished and shipped.' },
  { key: 'canceled', name: 'Canceled', type: 'canceled', color: '#A39C8F', description: 'Will not be done.' },
];

/** Map inserted rows back to seed keys by a natural key, never by array index. */
function indexBy<T extends { id: string }>(records: T[], key: (r: T) => string | null | undefined) {
  const out = new Map<string, string>();
  for (const r of records) {
    const k = key(r);
    if (k) out.set(k, r.id);
  }
  return out;
}

export default createEndpoint({
  description: 'Load the sample workspace, for an admin trying Issue Tracker in a workspace with no work in it yet',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ counts: z.record(z.string(), z.number()) }),
  execute: async ({ context }) => {
    const actor = await getActor(context);
    if (actor.role !== 'Admin') throw new ZiteError('Only admins can load sample data', 'FORBIDDEN');
    // The same rule decides whether Settings shows the control at all.
    const blocker = await sampleDataBlocker();
    if (blocker) throw new ZiteError(blocker, 'CONFLICT');

    const now = Date.now();
    const at = (offset: number) => new Date(now + offset * DAY).toISOString();
    const dateAt = (offset: number) => at(offset).slice(0, 10);
    const counts: Record<string, number> = {};

    // ---- Members first: they mark the sample as loaded ----------------------
    const memberRes = await zite.members.bulkCreate({
      records: MEMBERS.map(m => ({
        name: m.name, email: m.email.toLowerCase(), jobTitle: m.jobTitle, role: m.role, status: 'Active', color: m.color, avatarUrl: null,
      })),
    });
    // A second run racing this one got past the check above too. Whichever
    // created the oldest sample person carries on; the other removes its own and stops.
    const { rows: oldest } = await zite.sql({
      query: `SELECT id FROM "Members" WHERE LOWER("email") LIKE $1 ORDER BY created_at ASC, id ASC LIMIT 1`,
      params: [`%@${SAMPLE_EMAIL_DOMAIN}`],
    });
    if (!memberRes.records.some(r => r.id === String(oldest[0]?.id))) {
      for (const r of memberRes.records) await zite.members.delete({ id: r.id });
      throw new ZiteError('The sample data is already being loaded.', 'CONFLICT');
    }
    const memberByEmail = indexBy(memberRes.records, r => r.email?.toLowerCase());
    const memberId = (key: string | undefined | null): string | null => {
      if (!key) return null;
      if (key === ME) return actor.id;
      const m = MEMBERS.find(x => x.key === key);
      return m ? memberByEmail.get(m.email.toLowerCase()) ?? null : null;
    };
    const memberName = (key: string) => (key === ME ? actor.name : MEMBERS.find(m => m.key === key)?.name ?? 'Someone');
    counts.members = memberRes.records.length;

    // ---- Teams ---------------------------------------------------------------
    // A team that already uses a sample team's key is filled in, not
    // duplicated: a fresh install's default team is the sample's ENG. Its
    // settings stay as they are; only a blank description is filled.
    const existingTeams = (await zite.teams.findAll({ limit: 200 })).records;
    const teamByKey = new Map<string, string>();
    const intakeOn = new Map<string, boolean>();
    const reused = new Set<string>();
    for (const t of TEAMS) {
      const found = existingTeams.find(e => (e.key ?? '').toUpperCase() === t.key);
      if (!found) continue;
      reused.add(t.key);
      teamByKey.set(t.key, found.id);
      intakeOn.set(t.key, Boolean(found.intakeEnabled));
      if (!found.description) await zite.teams.update({ id: found.id, record: { description: t.description } });
    }
    const newTeams = TEAMS.filter(t => !reused.has(t.key));
    const lastPosition = Math.max(0, ...existingTeams.map(t => Number(t.position ?? 0)));
    if (newTeams.length) {
      const teamRes = await zite.teams.bulkCreate({
        records: newTeams.map((t, n) => ({
          name: t.name, key: t.key, description: t.description, icon: t.icon, color: t.color,
          sprintsEnabled: t.sprintsEnabled, sprintDurationWeeks: t.sprintDurationWeeks, intakeEnabled: t.intakeEnabled,
          estimateScale: t.estimateScale, issueCounter: 0, position: lastPosition + n + 1,
        })),
      });
      for (const [key, id] of indexBy(teamRes.records, r => r.key)) teamByKey.set(key, id);
      for (const t of newTeams) intakeOn.set(t.key, t.intakeEnabled);
    }
    const teamId = (key: string) => teamByKey.get(key)!;
    counts.teams = newTeams.length;

    const reusedIds = [...reused].map(teamId);
    const memberships = reusedIds.length
      ? (await zite.teamMembers.findAll({ filters: { teamId: { in: reusedIds } }, limit: 2000 })).records
      : [];
    const onTeam = new Set(memberships.map(r => `${r.teamId}|${r.memberId}`));
    await zite.teamMembers.bulkCreate({
      records: [
        ...MEMBERS.flatMap(m => m.teams.map(t => ({ name: `${t} · ${m.name}`, teamId: teamId(t), memberId: memberId(m.key)! }))),
        // Whoever loads the sample is on every team.
        ...TEAMS.map(t => ({ name: `${t.key} · ${actor.name}`, teamId: teamId(t.key), memberId: actor.id })),
      ].filter(r => !onTeam.has(`${r.teamId}|${r.memberId}`)),
    });

    // ---- Statuses ---------------------------------------------------
    // New teams get the sample workflow. A reused team keeps its own, and each
    // sample status lands on the one with the same name, else the same type.
    const kept = reusedIds.length
      ? (await zite.statuses.findAll({ filters: { teamId: { in: reusedIds } }, limit: 500 })).records
      : [];
    const needWorkflow = TEAMS.filter(t => !kept.some(s => s.teamId === teamId(t.key)));
    const stateRes = needWorkflow.length
      ? await zite.statuses.bulkCreate({
          records: needWorkflow.flatMap(t =>
            WORKFLOW.filter(s => s.key !== 'intake' || intakeOn.get(t.key)).map((s, position) => ({
              name: s.name, teamId: teamId(t.key), type: s.type, color: s.color, description: s.description, position,
            })),
          ),
        })
      : { records: [] as typeof kept };
    const statesByTeam = new Map<string, typeof kept>();
    for (const s of [...kept, ...stateRes.records].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))) {
      const list = statesByTeam.get(s.teamId ?? '') ?? [];
      list.push(s);
      statesByTeam.set(s.teamId ?? '', list);
    }
    const statusId = (team: string, key: StateKey) => {
      // With intake off, an intake issue waits in the backlog instead.
      const def = WORKFLOW.find(s => s.key === (key === 'intake' && !intakeOn.get(team) ? 'backlog' : key))!;
      const mine = statesByTeam.get(teamId(team)) ?? [];
      const ofType = mine.filter(s => s.type === def.type);
      return (
        mine.find(s => (s.name ?? '').trim().toLowerCase() === def.name.toLowerCase()) ??
        // In Progress and In Review share a type; review takes the second one.
        (def.key === 'review' ? ofType[1] ?? ofType[0] : ofType[0]) ??
        mine.find(s => s.type === 'backlog') ??
        mine[0]
      ).id;
    };
    counts.statuses = stateRes.records.length;

    // ---- Labels ------------------------------------------------------------
    // A label someone already made with the same name is used, not copied.
    const existingLabels = (await zite.labels.findAll({ limit: 2000 })).records;
    const labelByKey = new Map<string, string>();
    const newLabels = LABELS.filter(l => {
      const scope = l.team ? teamId(l.team) : '';
      const found = existingLabels.find(e => (e.name ?? '').trim().toLowerCase() === l.name.toLowerCase() && (!e.teamId || e.teamId === scope));
      if (found) labelByKey.set(l.key, found.id);
      return !found;
    });
    if (newLabels.length) {
      const labelRes = await zite.labels.bulkCreate({
        records: newLabels.map(l => ({ name: l.name, color: l.color, description: l.description, teamId: l.team ? teamId(l.team) : null })),
      });
      const byName = indexBy(labelRes.records, r => r.name);
      for (const l of newLabels) if (byName.get(l.name)) labelByKey.set(l.key, byName.get(l.name)!);
    }
    const labelId = (key: string) => labelByKey.get(key) ?? null;
    counts.labels = newLabels.length;

    // ---- Goals, projects, milestones, updates ------------------------
    const goalRes = await zite.goals.bulkCreate({
      records: GOALS.map((i, n) => ({
        name: i.name, summary: i.summary, description: i.description, status: i.status, ownerId: memberId(i.owner),
        icon: i.icon, color: i.color, targetDate: i.targetOffset == null ? null : dateAt(i.targetOffset), position: n + 1,
      })),
    });
    const goalByName = indexBy(goalRes.records, r => r.name);
    const goalId = (key?: string) => (key ? goalByName.get(GOALS.find(i => i.key === key)?.name ?? '') ?? null : null);
    counts.goals = goalRes.records.length;

    const projectRes = await zite.projects.bulkCreate({
      records: PROJECTS.map((p, n) => ({
        name: p.name, summary: p.summary, description: p.description, status: p.status, health: p.health,
        leadId: memberId(p.lead), teamId: teamId(p.team), goalId: goalId(p.goal), priority: p.priority,
        icon: p.icon, color: p.color, startDate: p.startOffset == null ? null : dateAt(p.startOffset),
        targetDate: p.targetOffset == null ? null : dateAt(p.targetOffset),
        completedAt: p.completedOffset == null ? null : at(p.completedOffset), position: n + 1,
      })),
    });
    const projectByName = indexBy(projectRes.records, r => r.name);
    const projectId = (key?: string) => (key ? projectByName.get(PROJECTS.find(p => p.key === key)?.name ?? '') ?? null : null);
    counts.projects = projectRes.records.length;

    const milestoneRes = await zite.milestones.bulkCreate({
      records: MILESTONES.map((m, n) => ({
        name: m.name, projectId: projectId(m.project), description: m.description, targetDate: dateAt(m.targetOffset), position: n + 1,
      })),
    });
    const milestoneByKey = indexBy(milestoneRes.records, r => `${r.projectId}:${r.name}`);
    const milestoneId = (key?: string) => {
      const m = key ? MILESTONES.find(x => x.key === key) : undefined;
      return m ? milestoneByKey.get(`${projectId(m.project)}:${m.name}`) ?? null : null;
    };
    counts.milestones = milestoneRes.records.length;

    if (CHECK_INS.length) {
      await zite.checkIns.bulkCreate({
        records: CHECK_INS.map(u => ({
          name: `${PROJECTS.find(p => p.key === u.project)?.name ?? 'Project'} — ${u.health}`, projectId: projectId(u.project),
          authorId: memberId(u.author), health: u.health, body: u.body, postedAt: at(u.offset),
        })),
      });
    }
    counts.checkIns = CHECK_INS.length;

    // ---- Sprints ------------------------------------------------------------
    const sprintRes = await zite.sprints.bulkCreate({
      records: SPRINTS.map(c => ({
        name: `Sprint ${c.number}`, number: c.number, teamId: teamId(c.team), startDate: dateAt(c.startOffset),
        endDate: dateAt(c.endOffset), goal: c.goal, completedAt: c.completed ? at(c.endOffset) : null,
      })),
    });
    const sprintByTeamNumber = indexBy(sprintRes.records, r => `${r.teamId}:${r.number}`);
    const sprintId = (key?: string) => {
      const c = key ? SPRINTS.find(x => x.key === key) : undefined;
      return c ? sprintByTeamNumber.get(`${teamId(c.team)}:${c.number}`) ?? null : null;
    };
    counts.sprints = sprintRes.records.length;

    // ---- Issues ------------------------------------------------------------
    // Numbered per team in seed order, so identifiers read like a backlog that grew over time.
    const counters: Record<string, number> = {};
    const positions: Record<string, number> = {};
    const identifierByKey = new Map<string, string>();
    const issueRows = ISSUES.map(i => {
      const number = (counters[i.team] = (counters[i.team] ?? 0) + 1);
      const identifier = `${i.team}-${number}`;
      identifierByKey.set(i.key, identifier);
      const sid = statusId(i.team, i.state);
      const position = (positions[sid] = (positions[sid] ?? 0) + 1024);
      return {
        title: i.title, identifier, number, teamId: teamId(i.team), description: i.description ?? null, statusId: sid,
        priority: i.priority, estimate: i.estimate ?? null, issueType: i.type, assigneeId: memberId(i.assignee),
        creatorId: memberId(i.creator), projectId: projectId(i.project), milestoneId: milestoneId(i.milestone),
        sprintId: sprintId(i.sprint), parentId: null as string | null, dueDate: i.dueOffset == null ? null : dateAt(i.dueOffset),
        openedAt: at(i.openedOffset), startedAt: i.startedOffset == null ? null : at(i.startedOffset),
        completedAt: i.completedOffset == null ? null : at(i.completedOffset),
        canceledAt: i.canceledOffset == null ? null : at(i.canceledOffset), position, archived: false,
      };
    });

    const inserted: Array<{ id: string; identifier?: string }> = [];
    await chunked(issueRows, async batch => {
      const r = await zite.issues.bulkCreate({ records: batch });
      inserted.push(...r.records);
    });
    const issueByIdentifier = indexBy(inserted, r => r.identifier);
    const issueId = (key: string) => issueByIdentifier.get(identifierByKey.get(key) ?? '') ?? null;
    counts.issues = inserted.length;

    for (const t of TEAMS) await zite.teams.update({ id: teamId(t.key), record: { issueCounter: counters[t.key] ?? 0 } });
    for (const i of ISSUES) {
      if (i.parent && issueId(i.key) && issueId(i.parent)) {
        await zite.issues.update({ id: issueId(i.key)!, record: { parentId: issueId(i.parent) } });
      }
    }

    const issueLabelRows = ISSUES.flatMap(i =>
      (i.labels ?? []).map(l => ({ name: identifierByKey.get(i.key) ?? '', issueId: issueId(i.key)!, labelId: labelId(l)! })),
    ).filter(r => r.issueId && r.labelId);
    await chunked(issueLabelRows, async batch => {
      await zite.issueLabels.bulkCreate({ records: batch });
    });
    counts.issueLabels = issueLabelRows.length;

    // ---- Subscribers: creator, assignee, and later every commenter ----------
    const subs = new Set<string>();
    const subscribe = (issue: string | null, member: string | null) => {
      if (issue && member) subs.add(`${issue}|${member}`);
    };
    for (const i of ISSUES) {
      subscribe(issueId(i.key), memberId(i.creator));
      subscribe(issueId(i.key), memberId(i.assignee));
    }

    // ---- Relations (stored from both sides) --------------------------------
    const INVERSE: Record<string, string> = { blocks: 'blocked_by', blocked_by: 'blocks', relates: 'relates', duplicate_of: 'duplicated_by' };
    const relationRows = RELATIONS.flatMap(r => {
      const a = issueId(r.issue);
      const b = issueId(r.related);
      if (!a || !b) return [];
      return [
        { name: `${identifierByKey.get(r.issue)} ${r.type} ${identifierByKey.get(r.related)}`, issueId: a, relatedIssueId: b, type: r.type },
        { name: `${identifierByKey.get(r.related)} ${INVERSE[r.type]} ${identifierByKey.get(r.issue)}`, issueId: b, relatedIssueId: a, type: INVERSE[r.type] },
      ];
    });
    if (relationRows.length) await zite.issueRelations.bulkCreate({ records: relationRows });
    counts.issueRelations = relationRows.length;

    // ---- Attachments -------------------------------------------------------
    const kindOf = (url: string) =>
      url.includes('github.com') ? 'github' : url.includes('figma.com') ? 'figma' : url.includes('loom.com') ? 'loom'
      : url.includes('sentry.io') ? 'sentry' : url.includes('notion.') || url.includes('docs.google') ? 'doc' : 'link';
    const attachmentRows = ATTACHMENTS.map(a => ({
      title: a.title, issueId: issueId(a.issue), url: a.url, kind: kindOf(a.url), creatorId: memberId(a.creator), addedAt: at(a.offset),
    })).filter(a => a.issueId);
    if (attachmentRows.length) await zite.issueAttachments.bulkCreate({ records: attachmentRows });
    counts.attachments = attachmentRows.length;

    // ---- Comments, replies and reactions ------------------------------------
    // postedAt is unique per comment, which gives a natural key to map rows back.
    const postedAtOf = (idx: number) => new Date(now + COMMENTS[idx].offset * DAY + idx * 1000).toISOString();
    const commentIdByIndex = new Map<number, string>();
    for (const pass of ['roots', 'replies'] as const) {
      const indexes = COMMENTS.map((_, idx) => idx).filter(idx => (pass === 'roots') === (COMMENTS[idx].replyTo === undefined));
      const rows = indexes
        .map(idx => ({
          idx,
          record: {
            body: COMMENTS[idx].body, issueId: issueId(COMMENTS[idx].issue), authorId: memberId(COMMENTS[idx].author),
            parentId: COMMENTS[idx].replyTo !== undefined ? commentIdByIndex.get(COMMENTS[idx].replyTo!) ?? null : null,
            postedAt: postedAtOf(idx), editedAt: null, resolved: false,
          },
        }))
        .filter(r => r.record.issueId);
      if (!rows.length) continue;
      const res = await zite.comments.bulkCreate({ records: rows.map(r => r.record) });
      const byPosted = indexBy(res.records, r => (r.postedAt ? new Date(r.postedAt).toISOString() : null));
      for (const r of rows) {
        const id = byPosted.get(r.record.postedAt);
        if (id) commentIdByIndex.set(r.idx, id);
        subscribe(r.record.issueId, r.record.authorId);
      }
    }
    counts.comments = commentIdByIndex.size;

    const reactionRows = COMMENTS.flatMap((c, idx) =>
      (c.reactions ?? []).map(r => ({
        name: r.emoji, commentId: commentIdByIndex.get(idx) ?? null, issueId: issueId(c.issue), memberId: memberId(r.member), emoji: r.emoji,
      })),
    ).filter(r => r.commentId && r.issueId && r.memberId);
    if (reactionRows.length) await zite.reactions.bulkCreate({ records: reactionRows });
    counts.reactions = reactionRows.length;

    const subscriberRows = [...subs].map(s => {
      const [issue, member] = s.split('|');
      return { name: 'subscriber', issueId: issue, memberId: member };
    });
    await chunked(subscriberRows, async batch => {
      await zite.issueSubscribers.bulkCreate({ records: batch });
    });

    // ---- Activity, derived from each issue's own lifecycle -----------------
    // Derived rather than hand-written, so the history can never contradict the issue.
    const activityRows: Array<Record<string, unknown>> = [];
    for (const i of ISSUES) {
      const id = issueId(i.key);
      if (!id) continue;
      const creator = memberId(i.creator);
      const worker = memberId(i.assignee) ?? creator;
      const push = (row: Record<string, unknown>) => activityRows.push({ issueId: id, ...row });
      push({ name: 'created the issue', actorId: creator, type: 'created', occurredAt: at(i.openedOffset) });
      if (i.assignee) {
        push({
          name: 'changed assignee', actorId: creator, type: 'assignee_changed', toValue: memberId(i.assignee),
          toLabel: memberName(i.assignee), occurredAt: at(i.openedOffset + 0.02),
        });
      }
      if (i.sprint) {
        const c = SPRINTS.find(x => x.key === i.sprint)!;
        push({ name: 'changed sprint', actorId: creator, type: 'sprint_changed', toValue: sprintId(i.sprint), toLabel: `Sprint ${c.number}`, occurredAt: at(Math.max(i.openedOffset + 0.05, Math.min(c.startOffset, i.startedOffset ?? c.startOffset))) });
      }
      if (i.startedOffset !== undefined) {
        push({ name: 'changed status', actorId: worker, type: 'status_changed', fromLabel: 'To do', toLabel: 'In Progress', occurredAt: at(i.startedOffset) });
      }
      if (i.state === 'review' || (i.state === 'done' && i.startedOffset !== undefined && i.completedOffset !== undefined && i.type !== 'Chore')) {
        const reviewAt = i.completedOffset !== undefined ? i.completedOffset - Math.min(1, (i.completedOffset - (i.startedOffset ?? i.completedOffset)) / 2) : (i.startedOffset ?? i.openedOffset) + 1;
        push({ name: 'changed status', actorId: worker, type: 'status_changed', fromLabel: 'In Progress', toLabel: 'In Review', occurredAt: at(Math.min(reviewAt, -0.01)) });
      }
      if (i.completedOffset !== undefined) {
        push({ name: 'changed status', actorId: worker, type: 'status_changed', fromLabel: 'In Review', toLabel: 'Done', occurredAt: at(i.completedOffset) });
      }
      if (i.canceledOffset !== undefined) {
        push({ name: 'changed status', actorId: creator, type: 'status_changed', fromLabel: 'Backlog', toLabel: 'Canceled', occurredAt: at(i.canceledOffset) });
      }
    }
    for (const a of ATTACHMENTS) {
      const id = issueId(a.issue);
      if (id) activityRows.push({ issueId: id, name: 'added a link', actorId: memberId(a.creator), type: 'attachment_added', toLabel: a.title, toValue: a.url, occurredAt: at(a.offset) });
    }
    await chunked(activityRows, async batch => {
      await zite.activity.bulkCreate({ records: batch });
    });
    counts.activity = activityRows.length;

    // ---- Views & templates -------------------------------------------------
    // Setup someone already made under the same name is left alone, not copied.
    const taken = async (rows: Promise<{ records: Array<{ name?: string | null }> }>) =>
      new Set((await rows).records.map(r => (r.name ?? '').trim().toLowerCase()));
    const viewNames = await taken(zite.views.findAll({ limit: 2000 }));
    const newViews = VIEWS.filter(v => !viewNames.has(v.name.toLowerCase()));
    const viewRes = newViews.length ? await zite.views.bulkCreate({
      records: newViews.map((v, n) => {
        const f = v.filters;
        const filters: Record<string, unknown> = {};
        if (f.teamKeys) filters.teamIds = f.teamKeys.map(teamId);
        if (f.statusTypes) filters.statusTypes = f.statusTypes;
        // ME stays a token: a shared "assigned to me" view means whoever is looking.
        if (f.assigneeKeys) filters.assigneeIds = f.assigneeKeys.map(k => (k === ME || k === 'none' ? k : memberId(k)));
        if (f.priorities) filters.priorities = f.priorities;
        if (f.issueTypes) filters.issueTypes = f.issueTypes;
        if (f.projectKeys) filters.projectIds = f.projectKeys.map(k => projectId(k));
        if (f.labelKeys) filters.labelIds = f.labelKeys.map(k => labelId(k));
        if (f.sprintIds) filters.sprintIds = f.sprintIds;
        if (f.due) filters.due = f.due;
        if (f.relation) filters.relation = f.relation;
        if (f.estimated) filters.estimated = f.estimated;
        return {
          name: v.name, description: v.description, ownerId: null, teamId: v.team ? teamId(v.team) : null,
          scope: v.team ? 'Team' : 'Workspace', icon: v.icon, color: v.color, filters: JSON.stringify(filters),
          grouping: v.grouping, ordering: v.ordering, options: '{}', display: v.display, position: viewNames.size + n + 1,
        };
      }),
    }) : { records: [] };
    const viewByName = indexBy(viewRes.records, r => r.name);
    counts.views = viewRes.records.length;

    const templateNames = await taken(zite.issueTemplates.findAll({ limit: 2000 }));
    const newTemplates = TEMPLATES.filter(t => !templateNames.has(t.name.toLowerCase()));
    if (newTemplates.length) {
      await zite.issueTemplates.bulkCreate({
        records: newTemplates.map((t, n) => ({
          name: t.name, teamId: t.team ? teamId(t.team) : null, title: t.title, description: t.description, priority: t.priority,
          estimate: t.estimate ?? null, issueType: t.type, labelIds: JSON.stringify(t.labels.map(labelId).filter(Boolean)), position: templateNames.size + n + 1,
        })),
      });
    }
    counts.templates = newTemplates.length;

    // ---- Inbox and pins for whoever loaded the sample ----------------
    if (NOTIFICATIONS.length) {
      await zite.notifications.bulkCreate({
        records: NOTIFICATIONS.map(n => ({
          name: n.name.replace('{issue}', n.issue ? identifierByKey.get(n.issue) ?? '' : ''),
          body: n.body.slice(0, 240), memberId: actor.id, actorId: memberId(n.actor), issueId: n.issue ? issueId(n.issue) : null,
          projectId: n.project ? projectId(n.project) : null, commentId: null, type: n.type, read: n.read,
          readAt: n.read ? at(n.offset + 0.1) : null, snoozedUntil: null, archived: false, occurredAt: at(n.offset),
        })),
      });
    }
    counts.notifications = NOTIFICATIONS.length;

    const pinRows = PINS.map((f, n) => ({
      name: f.entityType, memberId: actor.id, entityType: f.entityType, position: n + 1,
      entityId:
        f.entityType === 'Project' ? projectId(f.key)
        : f.entityType === 'Goal' ? goalId(f.key)
        : f.entityType === 'Sprint' ? sprintId(f.key)
        : viewByName.get(VIEWS.find(v => v.key === f.key)?.name ?? '') ?? null,
    })).filter(f => f.entityId);
    if (pinRows.length) await zite.pins.bulkCreate({ records: pinRows as never });
    counts.pins = pinRows.length;

    return { counts };
  },
});
