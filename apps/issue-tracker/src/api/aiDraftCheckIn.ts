import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { isConfigured, structured, truncate } from '../server/ai';

const schema = z.object({ projectId: z.string().min(1) });
type Draft = { health: 'On Track' | 'At Risk' | 'Off Track'; body: string };

/**
 * Draft a weekly check-in from what actually moved since the last one.
 * The facts section is computed either way; Claude only turns it into prose.
 */
export default createEndpoint({
  description: 'Draft a check-in from the work completed and started since the last update',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ available: z.boolean(), health: z.enum(['On Track', 'At Risk', 'Off Track']), body: z.string() }),
  execute: async ({ input }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Invalid request', 'BAD_REQUEST');
    const project = await zite.projects.findOne({ id: parsed.data.projectId });
    if (!project) throw new ZiteError('Project not found', 'NOT_FOUND');

    const { rows: last } = await zite.sql({
      query: `SELECT "postedAt", "body" FROM "CheckIns" WHERE "projectId" = $1 ORDER BY "postedAt" DESC NULLS LAST LIMIT 1`,
      params: [project.id],
    });
    const since = last[0]?.postedAt ? String(last[0].postedAt) : new Date(Date.now() - 7 * 86_400_000).toISOString();

    const { rows } = await zite.sql({
      query: `
        SELECT i."identifier", i."title", i."completedAt", i."startedAt", i."dueDate", COALESCE(ws."type", 'backlog') AS "statusType",
               m."name" AS "assigneeName"
        FROM "Issues" i
        LEFT JOIN "Statuses" ws ON ws.id::text = i."statusId"
        LEFT JOIN "Members" m ON m.id::text = i."assigneeId"
        WHERE i."projectId" = $1 AND COALESCE(i."archived", false) = false`,
      params: [project.id],
    });

    const completed = rows.filter(r => r.completedAt && String(r.completedAt) >= since);
    const started = rows.filter(r => r.statusType === 'started');
    const open = rows.filter(r => !['completed', 'canceled'].includes(String(r.statusType)));
    const overdue = open.filter(r => r.dueDate && String(r.dueDate).slice(0, 10) < new Date().toISOString().slice(0, 10));
    const total = rows.filter(r => r.statusType !== 'canceled').length;
    const done = rows.filter(r => r.statusType === 'completed').length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const targetDay = project.targetDate ? String(project.targetDate).slice(0, 10) : null;
    // Read by people, so "Oct 8", not "2026-10-08".
    const target = targetDay ? new Date(`${targetDay}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

    const facts =
      (total
        ? `**Progress:** ${done} of ${total} issues done (${pct}%)${target ? `, targeting ${target}` : ''}.\n\n`
        : `**Progress:** No issues in the project yet${target ? `; targeting ${target}` : ''}.\n\n`) +
      (completed.length ? `**Shipped since last update**\n${completed.slice(0, 8).map(r => `- ${r.identifier} ${r.title}`).join('\n')}\n\n` : '') +
      (started.length ? `**In progress**\n${started.slice(0, 8).map(r => `- ${r.identifier} ${r.title}${r.assigneeName ? ` (${r.assigneeName})` : ''}`).join('\n')}\n\n` : '') +
      (overdue.length ? `**Overdue**\n${overdue.slice(0, 5).map(r => `- ${r.identifier} ${r.title}`).join('\n')}\n` : '');

    const guessHealth: Draft['health'] = overdue.length > 2 ? 'Off Track' : overdue.length > 0 || (targetDay && pct < 50 && Date.parse(targetDay) - Date.now() < 14 * 86_400_000) ? 'At Risk' : 'On Track';

    if (!isConfigured()) return { available: false, health: guessHealth, body: facts.trim() };

    const draft = await structured<Draft>({
      system:
        'You write concise weekly check-ins for stakeholders. Lead with the headline in one or two sentences, then short sections. ' +
        'Use Markdown. Only state what the data shows; never invent dates, people, or causes.',
      prompt:
        `Project: ${project.name} — ${truncate(project.summary, 200)}\nPrevious update:\n${truncate(String(last[0]?.body ?? '(none)'), 800)}\n\n` +
        `Facts:\n${facts}\n\nChoose health honestly: On Track, At Risk or Off Track. body: under 180 words.`,
      schema: {
        type: 'object',
        properties: { health: { type: 'string', enum: ['On Track', 'At Risk', 'Off Track'] }, body: { type: 'string' } },
        required: ['health', 'body'],
        additionalProperties: false,
      },
      maxTokens: 1200,
    });

    return { available: true, health: draft?.health ?? guessHealth, body: draft?.body || facts.trim() };
  },
});
