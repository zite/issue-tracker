import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { getActor } from '../server/actor';

const schema = z.object({
  issueId: z.string().min(1),
  id: z.string().optional(),
  url: z.string().trim().url().max(2000).optional(),
  title: z.string().trim().max(300).optional(),
  remove: z.boolean().optional(),
});

/** Recognise the tools teams actually link, so the row can show the right mark. */
function kindOf(url: string) {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  })();
  if (host.endsWith('github.com')) return 'github';
  if (host.endsWith('figma.com')) return 'figma';
  if (host.endsWith('loom.com')) return 'loom';
  if (host.endsWith('sentry.io')) return 'sentry';
  if (host.includes('docs.google.com') || host.endsWith('notion.so') || host.endsWith('notion.site')) return 'doc';
  return 'link';
}

/** A readable default title from a URL — "acme/web#412" beats a raw link. */
function titleFor(url: string) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (u.hostname.endsWith('github.com') && parts.length >= 4 && (parts[2] === 'pull' || parts[2] === 'issues')) {
      return `${parts[0]}/${parts[1]}#${parts[3]}`;
    }
    const last = decodeURIComponent(parts[parts.length - 1] ?? '').replace(/[-_]+/g, ' ');
    return last ? `${u.hostname.replace(/^www\./, '')} · ${last}`.slice(0, 120) : u.hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 120);
  }
}

export default createEndpoint({
  description: 'Add, rename or remove a link attached to an issue',
  authenticated: true,
  inputSchema: schema,
  outputSchema: z.object({ id: z.string().nullable() }),
  execute: async ({ input, context }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ZiteError('Enter a full URL, including https://', 'BAD_REQUEST');
    const data = parsed.data;
    const actor = await getActor(context);

    const issue = await zite.issues.findOne({ id: data.issueId });
    if (!issue) throw new ZiteError('Issue not found', 'NOT_FOUND');
    const occurredAt = new Date().toISOString();

    if (data.remove) {
      if (!data.id) throw new ZiteError('An id is required', 'BAD_REQUEST');
      const row = await zite.issueAttachments.findOne({ id: data.id });
      if (!row || row.issueId !== data.issueId) throw new ZiteError('Link not found', 'NOT_FOUND');
      await zite.issueAttachments.delete({ id: data.id });
      await zite.activity.create({
        record: { name: 'removed a link', issueId: data.issueId, actorId: actor.id, type: 'attachment_removed', fromLabel: row.title ?? row.url ?? null, occurredAt },
      });
      return { id: null };
    }

    if (data.id) {
      const row = await zite.issueAttachments.findOne({ id: data.id });
      if (!row || row.issueId !== data.issueId) throw new ZiteError('Link not found', 'NOT_FOUND');
      await zite.issueAttachments.update({
        id: data.id,
        record: { title: data.title || row.title, ...(data.url ? { url: data.url, kind: kindOf(data.url) } : {}) },
      });
      return { id: data.id };
    }

    if (!data.url) throw new ZiteError('A URL is required', 'BAD_REQUEST');
    const created = await zite.issueAttachments.create({
      record: {
        title: data.title || titleFor(data.url), issueId: data.issueId, url: data.url, kind: kindOf(data.url),
        creatorId: actor.id, addedAt: occurredAt,
      },
    });
    await zite.activity.create({
      record: { name: 'added a link', issueId: data.issueId, actorId: actor.id, type: 'attachment_added', toLabel: data.title || titleFor(data.url), toValue: data.url.slice(0, 250), occurredAt },
    });
    return { id: created.id };
  },
});
