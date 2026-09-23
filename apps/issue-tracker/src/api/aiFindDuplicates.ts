import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { isConfigured, structured, truncate } from '../server/ai';
import { ref } from '../server/sql';

const schema = z.object({
  title: z.string().trim().min(3).max(500),
  description: z.string().max(10_000).optional(),
  teamId: z.string().optional(),
  excludeId: z.string().optional(),
});

type Verdict = { matches: Array<{ identifier: string; confidence: number; reason: string }> };

const STOP = new Set(['the', 'and', 'for', 'with', 'when', 'from', 'that', 'this', 'not', 'are', 'was', 'has', 'but', 'can', 'add', 'fix', 'issue', 'bug', 'should', 'make', 'into', 'have', 'does', 'page']);

/**
 * Duplicate detection while filing. Two stages on purpose: SQL narrows the
 * backlog to a few dozen candidates by word overlap — cheap, and the model never
 * sees the whole backlog — then Claude judges which are genuinely the same
 * problem, the part keyword matching is bad at ("login loops" vs "SSO redirect
 * never completes").
 */
export default createEndpoint({
  description: 'Find existing issues that look like duplicates of one being written',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({
    available: z.boolean(),
    matches: z.array(z.object({
      id: z.string(), identifier: z.string(), title: z.string(), statusId: z.string().nullable(), confidence: z.number(), reason: z.string(),
    })),
  }),
  execute: async ({ input }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { available: isConfigured(), matches: [] };
    const data = parsed.data;

    const words = [...new Set(`${data.title} ${data.description ?? ''}`.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.has(w)))].slice(0, 12);
    if (words.length === 0) return { available: isConfigured(), matches: [] };

    const params: unknown[] = [];
    const likes = words.map(w => {
      const p = `$${params.push(`%${w}%`)}`;
      return `(LOWER(i."title") LIKE ${p} OR LOWER(COALESCE(i."description", '')) LIKE ${p})`;
    });
    // Rank by how many of the words each issue matches — the most-overlapping few, not an arbitrary slice.
    const score = likes.map(l => `(CASE WHEN ${l} THEN 1 ELSE 0 END)`).join(' + ');
    let where = `WHERE COALESCE(i."archived", false) = false AND (${likes.join(' OR ')})`;
    if (data.teamId) where += ` AND i."teamId" = $${params.push(data.teamId)}`;
    if (data.excludeId) where += ` AND i.id::text <> $${params.push(data.excludeId)}`;

    const { rows } = await zite.sql({
      query: `
        SELECT i.id, i."identifier", i."title", i."description", i."statusId", (${score}) AS "overlap"
        FROM "Issues" i ${where}
        ORDER BY (${score}) DESC, i.updated_at DESC
        LIMIT 25`,
      params,
    });
    if (rows.length === 0) return { available: isConfigured(), matches: [] };

    const toMatch = (r: Record<string, unknown>, confidence: number, reason: string) => ({
      id: String(r.id), identifier: String(r.identifier), title: String(r.title ?? ''), statusId: ref(r.statusId), confidence, reason,
    });

    if (!isConfigured()) {
      // Without Claude, the overlap score alone still catches someone re-filing the same title.
      const bar = Math.max(2, Math.ceil(words.length * 0.6));
      return {
        available: false,
        matches: rows.filter(r => Number(r.overlap ?? 0) >= bar).slice(0, 3).map(r => toMatch(r, 0.5, 'Shares most of its key words with this issue.')),
      };
    }

    const verdict = await structured<Verdict>({
      system:
        'You detect duplicate issues in a software tracker. Two issues are duplicates when resolving one would resolve the other — ' +
        'not merely when they touch the same area. Different symptoms of one root cause are duplicates; two different bugs in the same ' +
        'file are not. Be conservative: a false duplicate flag teaches people to ignore the warning. Return an empty list when nothing matches.',
      prompt:
        `New issue:\nTitle: ${data.title}\nDescription: ${truncate(data.description, 800)}\n\nExisting issues:\n` +
        rows.map(r => `${r.identifier}: ${r.title}\n  ${truncate(String(r.description ?? ''), 220)}`).join('\n') +
        `\n\nReturn only genuine duplicates. confidence is 0–1. reason is one short sentence.`,
      schema: {
        type: 'object',
        properties: {
          matches: {
            type: 'array',
            items: {
              type: 'object',
              properties: { identifier: { type: 'string' }, confidence: { type: 'number' }, reason: { type: 'string' } },
              required: ['identifier', 'confidence', 'reason'],
              additionalProperties: false,
            },
          },
        },
        required: ['matches'],
        additionalProperties: false,
      },
    });

    const byIdentifier = new Map(rows.map(r => [String(r.identifier), r]));
    return {
      available: true,
      matches: (verdict?.matches ?? [])
        // Only confident calls, and only identifiers we actually offered — never invented ones.
        .filter(m => Number(m.confidence) >= 0.6 && byIdentifier.has(m.identifier))
        .slice(0, 3)
        .map(m => toMatch(byIdentifier.get(m.identifier)!, Math.round(Number(m.confidence) * 100) / 100, String(m.reason ?? ''))),
    };
  },
});
