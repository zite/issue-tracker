import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { isConfigured, structured, truncate } from '../server/ai';

const schema = z.object({ issueId: z.string().min(1) });
type Summary = { summary: string; decisions: string[]; openQuestions: string[]; nextSteps: string[] };

export default createEndpoint({
  description: 'Summarize an issue discussion into decisions, open questions and next steps',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({
    available: z.boolean(), summary: z.string(), decisions: z.array(z.string()), openQuestions: z.array(z.string()),
    nextSteps: z.array(z.string()), commentCount: z.number(),
  }),
  execute: async ({ input }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Invalid request', 'BAD_REQUEST');
    const issue = await zite.issues.findOne({ id: parsed.data.issueId });
    if (!issue) throw new ZiteError('Issue not found', 'NOT_FOUND');

    const { rows } = await zite.sql({
      query: `
        SELECT c."body", m."name" AS "authorName"
        FROM "Comments" c LEFT JOIN "Members" m ON m.id::text = c."authorId"
        WHERE c."issueId" = $1 ORDER BY COALESCE(c."postedAt", c.created_at) ASC`,
      params: [issue.id],
    });

    const empty = { summary: '', decisions: [], openQuestions: [], nextSteps: [], commentCount: rows.length };
    if (!isConfigured()) return { available: false, ...empty };
    // A short thread reads faster than any summary of it.
    if (rows.length < 3) return { available: true, ...empty };

    const result = await structured<Summary>({
      system:
        'You summarise engineering discussions for someone joining late. Capture what was decided, what is still open and what ' +
        'happens next — not a play-by-play of who said what. If the thread settled nothing, return empty lists rather than inventing conclusions.',
      prompt:
        `Issue ${issue.identifier}: ${issue.title}\n${truncate(issue.description, 700)}\n\nDiscussion:\n` +
        rows.map(r => `${r.authorName ?? 'Someone'}: ${truncate(String(r.body ?? ''), 900)}`).join('\n\n') +
        `\n\nsummary: 2–3 sentences. Each list: at most 4 short items.`,
      schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          decisions: { type: 'array', items: { type: 'string' } },
          openQuestions: { type: 'array', items: { type: 'string' } },
          nextSteps: { type: 'array', items: { type: 'string' } },
        },
        required: ['summary', 'decisions', 'openQuestions', 'nextSteps'],
        additionalProperties: false,
      },
      maxTokens: 1500,
    });

    return {
      available: true,
      summary: result?.summary ?? '',
      decisions: (result?.decisions ?? []).slice(0, 4),
      openQuestions: (result?.openQuestions ?? []).slice(0, 4),
      nextSteps: (result?.nextSteps ?? []).slice(0, 4),
      commentCount: rows.length,
    };
  },
});
