import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { isConfigured, structured, truncate } from '../server/ai';

const schema = z.object({ issueId: z.string().min(1) });
type Breakdown = { subIssues: Array<{ title: string; description: string; estimate: number | null }> };

/**
 * Suggest sub-issues for a large piece of work. Suggestions only — the UI lets
 * you pick which to create, because a plan nobody reviewed is not a plan.
 */
export default createEndpoint({
  description: 'Suggest a breakdown of an issue into sub-issues',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({
    available: z.boolean(),
    suggestions: z.array(z.object({ title: z.string(), description: z.string(), estimate: z.number().nullable() })),
  }),
  execute: async ({ input }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Invalid request', 'BAD_REQUEST');
    if (!isConfigured()) return { available: false, suggestions: [] };

    const issue = await zite.issues.findOne({ id: parsed.data.issueId });
    if (!issue) throw new ZiteError('Issue not found', 'NOT_FOUND');
    const existing = await zite.issues.findAll({ filters: { parentId: issue.id }, limit: 100 });

    const result = await structured<Breakdown>({
      system:
        'You are a senior engineer breaking a piece of work into sub-issues that can each be picked up and finished independently ' +
        'in a day or two. Order them the way the work should flow. Do not pad the list with ceremony ("write tests", "code review") ' +
        'unless the issue calls for it specifically, and do not repeat sub-issues that already exist.',
      prompt:
        `${issue.identifier}: ${issue.title}\n\n${truncate(issue.description, 3000) || '(no description)'}\n\n` +
        (existing.records.length ? `Existing sub-issues:\n${existing.records.map(r => `- ${r.title}`).join('\n')}\n\n` : '') +
        `Suggest 3–7 sub-issues. title: imperative, under 80 characters. description: one or two sentences. estimate: 1, 2, 3, 5 or null.`,
      schema: {
        type: 'object',
        properties: {
          subIssues: {
            type: 'array',
            items: {
              type: 'object',
              properties: { title: { type: 'string' }, description: { type: 'string' }, estimate: { type: ['integer', 'null'] } },
              required: ['title', 'description', 'estimate'],
              additionalProperties: false,
            },
          },
        },
        required: ['subIssues'],
        additionalProperties: false,
      },
      maxTokens: 2000,
    });

    return {
      available: true,
      suggestions: (result?.subIssues ?? []).slice(0, 8).map(s => ({
        title: String(s.title).slice(0, 200), description: String(s.description ?? ''), estimate: s.estimate == null ? null : Number(s.estimate),
      })),
    };
  },
});
