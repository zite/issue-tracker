import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { isConfigured, structured } from '../server/ai';

const schema = z.object({ text: z.string().trim().min(3).max(4000), teamId: z.string().min(1) });

type Draft = {
  title: string; description: string; priority: number; issueType: string;
  labels: string[]; estimate: number | null; assignee: string | null; dueInDays: number | null;
};

/**
 * A rough note becomes a filled-in issue. The draft comes back for review and
 * is never filed directly — an AI that files issues on your behalf without
 * showing you first is a liability, not a feature.
 */
export default createEndpoint({
  description: 'Draft a structured issue from a rough note',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({
    available: z.boolean(),
    title: z.string(), description: z.string(), priority: z.number(), issueType: z.string(),
    labelIds: z.array(z.string()), estimate: z.number().nullable(), assigneeId: z.string().nullable(), dueDate: z.string().nullable(),
  }),
  execute: async ({ input }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Write a few words first', 'BAD_REQUEST');
    const data = parsed.data;

    if (!isConfigured()) {
      const [first, ...rest] = data.text.split('\n');
      return {
        available: false, title: first.slice(0, 200), description: rest.join('\n').trim(), priority: 0, issueType: 'Task',
        labelIds: [], estimate: null, assigneeId: null, dueDate: null,
      };
    }

    const [labels, members] = await Promise.all([
      zite.sql({ query: `SELECT id, "name" FROM "Labels" WHERE COALESCE("teamId", '') = '' OR "teamId" = $1`, params: [data.teamId] }),
      zite.sql({
        query: `SELECT m.id, m."name" FROM "Members" m JOIN "TeamMembers" tm ON tm."memberId" = m.id::text WHERE tm."teamId" = $1`,
        params: [data.teamId],
      }),
    ]);

    const draft = await structured<Draft>({
      system:
        'You turn rough notes from a software team into well-formed issue tracker entries. Write the title as a short imperative ' +
        'or a crisp problem statement. Write the description in Markdown for the engineer who picks it up: context, and for bugs ' +
        '"Steps to reproduce", "Expected" and "Actual" sections; for features, acceptance criteria as a checklist. Never invent ' +
        'facts, versions, customers or numbers that the note does not imply — omit what is unknown.',
      prompt:
        `Note:\n"""${data.text}"""\n\n` +
        `priority: 0 none, 1 urgent, 2 high, 3 medium, 4 low. Use 0 unless the note implies urgency.\n` +
        `labels: choose only from [${labels.rows.map(l => l.name).join(', ')}], only where clearly warranted.\n` +
        `estimate: story points 1, 2, 3, 5 or 8, or null if the note gives no sense of size.\n` +
        `assignee: a name from [${members.rows.map(m => m.name).join(', ')}] only if the note names them, else null.\n` +
        `dueInDays: days from today if a deadline is implied, else null.`,
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'integer', enum: [0, 1, 2, 3, 4] },
          issueType: { type: 'string', enum: ['Feature', 'Bug', 'Improvement', 'Task', 'Spike', 'Chore'] },
          labels: { type: 'array', items: { type: 'string' } },
          estimate: { type: ['integer', 'null'] },
          assignee: { type: ['string', 'null'] },
          dueInDays: { type: ['integer', 'null'] },
        },
        required: ['title', 'description', 'priority', 'issueType', 'labels', 'estimate', 'assignee', 'dueInDays'],
        additionalProperties: false,
      },
    });
    if (!draft) throw new ZiteError('Could not draft that issue', 'INTERNAL_ERROR');

    // Map names back to ids, dropping anything invented.
    const labelByName = new Map(labels.rows.map(l => [String(l.name).toLowerCase(), String(l.id)]));
    const memberByName = new Map(members.rows.map(m => [String(m.name).toLowerCase(), String(m.id)]));
    return {
      available: true,
      title: (draft.title || data.text).slice(0, 300),
      description: draft.description ?? '',
      priority: Math.max(0, Math.min(4, Number(draft.priority ?? 0))),
      issueType: draft.issueType ?? 'Task',
      labelIds: (draft.labels ?? []).map(n => labelByName.get(String(n).toLowerCase())).filter((v): v is string => Boolean(v)),
      estimate: draft.estimate == null ? null : Number(draft.estimate),
      assigneeId: draft.assignee ? memberByName.get(draft.assignee.toLowerCase()) ?? null : null,
      dueDate: draft.dueInDays == null ? null : new Date(Date.now() + draft.dueInDays * 86_400_000).toISOString().slice(0, 10),
    };
  },
});
