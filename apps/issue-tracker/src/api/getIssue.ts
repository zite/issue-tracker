import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';
import { ISSUE_SELECT, enrichIssues, issueDto, mapIssueRow } from '../server/issues';
import { bool, iso, ref, str } from '../server/sql';

/** Everything the issue page renders, by identifier (ENG-42) or id. */
export default createEndpoint({
  description: 'Load one issue in full — description, sub-issues, relations, links, comments and history',
  authenticated: true,
  inputSchema: z.object({ id: z.string().optional(), identifier: z.string().optional() }),
  outputSchema: z.object({
    issue: issueDto,
    description: z.string(),
    subIssues: z.array(issueDto),
    relations: z.array(z.object({
      id: z.string(), type: z.string(), issueId: z.string(), identifier: z.string(), title: z.string(),
      statusId: z.string().nullable(), assigneeId: z.string().nullable(), priority: z.number(),
    })),
    attachments: z.array(z.object({
      id: z.string(), title: z.string(), url: z.string(), kind: z.string(), creatorId: z.string().nullable(), addedAt: z.string().nullable(),
    })),
    comments: z.array(z.object({
      id: z.string(), body: z.string(), postedAt: z.string().nullable(), editedAt: z.string().nullable(),
      parentId: z.string().nullable(), authorId: z.string().nullable(), resolved: z.boolean(),
      reactions: z.array(z.object({ emoji: z.string(), count: z.number(), mine: z.boolean(), memberIds: z.array(z.string()) })),
    })),
    activity: z.array(z.object({
      id: z.string(), type: z.string(), name: z.string().nullable(), fromLabel: z.string().nullable(),
      toLabel: z.string().nullable(), fromValue: z.string().nullable(), toValue: z.string().nullable(),
      occurredAt: z.string().nullable(), actorId: z.string().nullable(),
    })),
    subscriberIds: z.array(z.string()),
  }),
  execute: async ({ input, context }) => {
    if (!input.id && !input.identifier) throw new ZiteError('An id or identifier is required', 'BAD_REQUEST');
    const actor = await getActor(context);

    const lookup = input.id
      ? { clause: 'WHERE i.id::text = $1', param: input.id }
      : { clause: 'WHERE UPPER(i."identifier") = $1', param: input.identifier!.trim().toUpperCase() };

    const { rows } = await zite.sql({
      query: `${ISSUE_SELECT.replace('SELECT', 'SELECT i."description",')} ${lookup.clause} LIMIT 1`,
      params: [lookup.param],
    });
    if (rows.length === 0) throw new ZiteError('Issue not found', 'NOT_FOUND');

    const [issue] = await enrichIssues([mapIssueRow(rows[0])]);
    const id = issue.id;

    const [subRows, relRows, attachRows, commentRows, reactionRows, activityRows, subscriberRows] = await Promise.all([
      zite.sql({
        query: `${ISSUE_SELECT} WHERE i."parentId" = $1 AND COALESCE(i."archived", false) = false
                ORDER BY CASE WHEN ws."type" IN ('completed', 'canceled') THEN 1 ELSE 0 END, ws."position" ASC NULLS LAST, i."position" ASC NULLS LAST, i."number" ASC`,
        params: [id],
      }),
      zite.sql({
        query: `
          SELECT r.id, r."type", o.id AS "otherId", o."identifier", o."title", o."statusId", o."assigneeId", o."priority"
          FROM "IssueRelations" r
          JOIN "Issues" o ON o.id::text = r."relatedIssueId"
          WHERE r."issueId" = $1
          ORDER BY r."type" ASC, o."number" ASC`,
        params: [id],
      }),
      zite.sql({
        query: `SELECT id, "title", "url", "kind", "creatorId", "addedAt" FROM "IssueAttachments" WHERE "issueId" = $1 ORDER BY "addedAt" ASC NULLS LAST, created_at ASC`,
        params: [id],
      }),
      zite.sql({
        query: `SELECT id, "body", "postedAt", "editedAt", "parentId", "authorId", "resolved" FROM "Comments" WHERE "issueId" = $1 ORDER BY COALESCE("postedAt", created_at) ASC`,
        params: [id],
      }),
      zite.sql({ query: `SELECT "commentId", "emoji", "memberId" FROM "Reactions" WHERE "issueId" = $1`, params: [id] }),
      zite.sql({
        query: `SELECT id, "type", "name", "fromLabel", "toLabel", "fromValue", "toValue", "occurredAt", "actorId" FROM "Activity" WHERE "issueId" = $1 ORDER BY COALESCE("occurredAt", created_at) ASC`,
        params: [id],
      }),
      zite.sql({ query: `SELECT "memberId" FROM "IssueSubscribers" WHERE "issueId" = $1`, params: [id] }),
    ]);

    // Fold flat reaction rows per comment, so the UI gets "👍 3" not three rows.
    const byComment = new Map<string, Map<string, string[]>>();
    for (const r of reactionRows.rows) {
      const cid = ref(r.commentId);
      const emoji = ref(r.emoji);
      if (!cid || !emoji) continue;
      if (!byComment.has(cid)) byComment.set(cid, new Map());
      const m = byComment.get(cid)!;
      if (!m.has(emoji)) m.set(emoji, []);
      m.get(emoji)!.push(String(r.memberId ?? ''));
    }

    return {
      issue,
      description: str(rows[0].description) ?? '',
      subIssues: await enrichIssues(subRows.rows.map(mapIssueRow)),
      relations: relRows.rows.map(r => ({
        id: String(r.id), type: str(r.type) ?? 'relates', issueId: String(r.otherId), identifier: str(r.identifier) ?? '',
        title: str(r.title) ?? '', statusId: ref(r.statusId), assigneeId: ref(r.assigneeId), priority: Number(r.priority ?? 0),
      })),
      attachments: attachRows.rows.map(r => ({
        id: String(r.id), title: str(r.title) || String(r.url ?? ''), url: str(r.url) ?? '', kind: ref(r.kind) ?? 'link',
        creatorId: ref(r.creatorId), addedAt: iso(r.addedAt),
      })),
      comments: commentRows.rows.map(r => {
        const cid = String(r.id);
        return {
          id: cid, body: str(r.body) ?? '', postedAt: iso(r.postedAt), editedAt: iso(r.editedAt), parentId: ref(r.parentId),
          authorId: ref(r.authorId), resolved: bool(r.resolved),
          reactions: [...(byComment.get(cid)?.entries() ?? [])].map(([emoji, memberIds]) => ({
            emoji, count: memberIds.length, mine: memberIds.includes(actor.id), memberIds,
          })),
        };
      }),
      activity: activityRows.rows.map(r => ({
        id: String(r.id), type: str(r.type) ?? '', name: ref(r.name), fromLabel: ref(r.fromLabel), toLabel: ref(r.toLabel),
        fromValue: ref(r.fromValue), toValue: ref(r.toValue), occurredAt: iso(r.occurredAt), actorId: ref(r.actorId),
      })),
      subscriberIds: subscriberRows.rows.map(r => String(r.memberId)),
    };
  },
});
