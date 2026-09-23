/**
 * Demo workspace for Issue Tracker: Quillmark, a small company building a collaborative
 * writing app (web, iOS, Android) with a sync engine, search, an AI assistant and
 * a public API.
 *
 * The data is written to make every screen believable on first open — a sprint in
 * flight with a burndown that steps down, velocity history in past sprints, a
 * roadmap spread across three months either side of today, and an inbox waiting
 * for whoever opens the app (`ME`). The shapes and their rules live in `./types`;
 * `api/seedWorkspace.ts` is the consumer.
 */
import {
  ME,
  type AttachmentSeed, type CommentSeed, type SprintSeed, type PinSeed, type GoalSeed, type IssueSeed,
  type LabelSeed, type MemberSeed, type MilestoneSeed, type NotificationSeed, type ProjectSeed,
  type CheckInSeed, type RelationSeed, type TeamSeed, type TemplateSeed, type ViewSeed,
} from './types';

/** Joins lines into one Markdown string, so long bodies stay readable here. */
const md = (...lines: string[]) => lines.join('\n');

// ---- Teams & people ---------------------------------------------------------

export const TEAMS: TeamSeed[] = [
  {
    key: 'ENG', name: 'Engineering', description: 'Web app, public API, sync engine, search and infrastructure.',
    icon: '⚡', color: '#3F76D0', sprintsEnabled: true, sprintDurationWeeks: 2, intakeEnabled: true, estimateScale: 'fibonacci',
  },
  {
    key: 'MOB', name: 'Mobile', description: 'The iOS and Android apps, offline support and push notifications.',
    icon: '📱', color: '#1F8A86', sprintsEnabled: true, sprintDurationWeeks: 2, intakeEnabled: false, estimateScale: 'fibonacci',
  },
  {
    key: 'DES', name: 'Design', description: 'Product design, the design system and user research.',
    icon: '🎨', color: '#B04FA6', sprintsEnabled: false, sprintDurationWeeks: 2, intakeEnabled: false, estimateScale: 'tshirt',
  },
];

export const MEMBERS: MemberSeed[] = [
  { key: 'priya', name: 'Priya Raman', email: 'priya@quillmark.test', jobTitle: 'Engineering Manager', role: 'Admin', color: '#3F76D0', teams: ['ENG', 'MOB'] },
  { key: 'marcus', name: 'Marcus Bell', email: 'marcus@quillmark.test', jobTitle: 'Product Manager', role: 'Admin', color: '#8656C9', teams: ['ENG', 'MOB', 'DES'] },
  { key: 'tomas', name: 'Tomás Ortega', email: 'tomas@quillmark.test', jobTitle: 'Staff Engineer', role: 'Member', color: '#BF8300', teams: ['ENG'] },
  { key: 'ana', name: 'Ana Petrova', email: 'ana@quillmark.test', jobTitle: 'Senior Backend Engineer', role: 'Member', color: '#B04FA6', teams: ['ENG'] },
  { key: 'kenji', name: 'Kenji Watanabe', email: 'kenji@quillmark.test', jobTitle: 'Frontend Engineer', role: 'Member', color: '#1F8A86', teams: ['ENG', 'DES'] },
  { key: 'grace', name: 'Grace Lindqvist', email: 'grace@quillmark.test', jobTitle: 'Infrastructure Engineer', role: 'Member', color: '#2B86B8', teams: ['ENG'] },
  { key: 'amara', name: 'Amara Okafor', email: 'amara@quillmark.test', jobTitle: 'iOS Engineer', role: 'Member', color: '#2E9460', teams: ['MOB'] },
  { key: 'lukas', name: 'Lukas Brenner', email: 'lukas@quillmark.test', jobTitle: 'Android Engineer', role: 'Member', color: '#D24A22', teams: ['MOB'] },
  { key: 'sofia', name: 'Sofia Marin', email: 'sofia@quillmark.test', jobTitle: 'Senior Product Designer', role: 'Member', color: '#8656C9', teams: ['DES', 'MOB'] },
  { key: 'elena', name: 'Elena Voss', email: 'elena@quillmark.test', jobTitle: 'UX Researcher (Contract)', role: 'Guest', color: '#BF8300', teams: ['DES'] },
];

export const LABELS: LabelSeed[] = [
  { key: 'bug', name: 'Bug', color: '#e5484d', description: 'Something is broken or behaves differently than documented.' },
  { key: 'feature', name: 'Feature', color: '#8e6fdd', description: 'New capability for customers.' },
  { key: 'improvement', name: 'Improvement', color: '#4d8fe0', description: 'Makes something that already exists better.' },
  { key: 'performance', name: 'Performance', color: '#d99a2b', description: 'Latency, memory, battery or bundle size.' },
  { key: 'security', name: 'Security', color: '#e2557b', description: 'Access control, secrets, data exposure or compliance.' },
  { key: 'techdebt', name: 'Tech debt', color: '#7a8599', description: 'Cleanup that makes future work cheaper.' },
  { key: 'customer', name: 'Customer request', color: '#2fa89b', description: 'Asked for by a customer; link the ticket or conversation.' },
  { key: 'a11y', name: 'Accessibility', color: '#4caf6e', description: 'Keyboard, screen reader, contrast and motion.' },
  { key: 'regression', name: 'Regression', color: '#e8793a', description: 'Worked before and broke in a recent release.' },
  { key: 'docs', name: 'Documentation', color: '#8e8e99', description: 'Help center, API reference or internal runbooks.' },
  { key: 'api', name: 'API', color: '#6b7fd7', description: 'Public API, webhooks and backend services.', team: 'ENG' },
  { key: 'frontend', name: 'Frontend', color: '#3fa3c4', description: 'Web app and editor.', team: 'ENG' },
  { key: 'infra', name: 'Infra', color: '#a5835f', description: 'CI, databases, queues and deploys.', team: 'ENG' },
  { key: 'ios', name: 'iOS', color: '#6e8fb3', description: 'Specific to the iOS app.', team: 'MOB' },
  { key: 'android', name: 'Android', color: '#6dab55', description: 'Specific to the Android app.', team: 'MOB' },
  { key: 'research', name: 'Research', color: '#b07ccf', description: 'Interviews, surveys and usability testing.', team: 'DES' },
  { key: 'uxwriting', name: 'UX writing', color: '#c98a5b', description: 'Interface copy, error messages and empty states.', team: 'DES' },
];

// ---- Goals, projects, milestones, updates ----------------------------

export const GOALS: GoalSeed[] = [
  {
    key: 'ent', name: 'Enterprise readiness', summary: 'Everything a 1,000-seat company needs before it can say yes.',
    description: md(
      'Large teams are our fastest-growing segment, but deals stall in security review. This goal covers identity, compliance and admin controls.',
      '',
      '**Target:** pass a standard enterprise security questionnaire with no exceptions.',
    ),
    status: 'Active', owner: 'priya', icon: '🏢', color: '#3F76D0', targetOffset: 100,
  },
  {
    key: 'mobile', name: 'Mobile-first writing', summary: 'Make Quillmark the place people write on their phones, not just read.',
    description: md(
      'Over half of new signups now start on mobile, but our apps were built for reading. Writing on a phone should feel as dependable as on a laptop, with or without a connection.',
      '',
      '- Offline editing on both platforms',
      '- Notifications people keep switched on',
      '- An onboarding flow designed for small screens',
    ),
    status: 'Active', owner: 'marcus', icon: '✍️', color: '#1F8A86', targetOffset: 80,
  },
  {
    key: 'ai', name: 'Quillmark AI', summary: 'Help people write and find things faster, without their content leaving the workspace.',
    description: md(
      'AI features that are useful every day and that admins can trust: summarize and rewrite, inline suggestions, and search that understands what you meant.',
      '',
      '- Admins can switch everything off per workspace',
      '- Customer content is never used for training',
    ),
    status: 'Active', owner: ME, icon: '✨', color: '#8656C9', targetOffset: 60,
  },
];

export const PROJECTS: ProjectSeed[] = [
  {
    key: 'sso', name: 'SSO & SCIM provisioning', summary: 'SAML sign-in and automatic account provisioning for enterprise workspaces.',
    description: md(
      '## Problem',
      "Enterprise IT teams won't roll Quillmark out beyond a pilot until sign-in runs through their identity provider and accounts are created and removed automatically. Today admins invite people by email and remove leavers by hand, which fails security reviews and is the most common blocker in enterprise deals.",
      '',
      '## Goals',
      '- SAML 2.0 sign-in, both SP- and IdP-initiated',
      '- SCIM 2.0 provisioning and deprovisioning, with group-to-team mapping',
      '- An option to require SSO for everyone on a verified domain',
      '',
      '## Non-goals',
      '- OpenID Connect (next half)',
      '- Custom attribute mapping beyond name, email and role',
      '',
      '## Success metrics',
      '- Three pilot workspaces fully provisioned through SCIM',
      '- Security questionnaires pass without SSO exceptions',
      '- Median time from signed contract to first sign-in under 5 days',
    ),
    status: 'In Progress', health: 'At Risk', lead: 'ana', team: 'ENG', goal: 'ent', priority: 1,
    icon: '🔐', color: '#3F76D0', startOffset: -56, targetOffset: 24,
  },
  {
    key: 'search', name: 'Search 2.0', summary: 'Hybrid keyword and semantic ranking that respects permissions instantly.',
    description: md(
      '## Problem',
      "Search is the second most common topic in support tickets. It only matches exact words, ranks old documents above recent ones, and misses anything phrased differently from the query. In large workspaces people give up and ask a colleague for the link.",
      '',
      '## Goals',
      '- Blend keyword and semantic ranking',
      '- Results that reflect permission changes immediately',
      '- Filters for author, last edited and workspace section',
      '',
      '## Non-goals',
      '- Searching inside attached files',
      '- Search across workspaces',
      '',
      '## Success metrics',
      '- nDCG@10 on the judgement set from 0.61 to at least 0.72',
      '- Search p95 latency under 250 ms',
      '- 20% fewer "can\'t find it" support tickets',
    ),
    status: 'In Progress', health: 'On Track', lead: 'tomas', team: 'ENG', goal: 'ai', priority: 2,
    icon: '🔎', color: '#1F8A86', startOffset: -63, targetOffset: 38,
  },
  {
    key: 'aiassist', name: 'AI writing assistant beta', summary: 'Summarize, rewrite and inline suggestions, with the admin controls enterprises ask for.',
    description: md(
      '## Problem',
      'Writers already copy drafts out of Quillmark into separate AI tools to summarize and rewrite them. That loses formatting, moves content outside the workspace, and bypasses every admin control we offer.',
      '',
      '## Goals',
      '- Summarize, rewrite and continue writing from a side panel',
      '- Inline suggestions while typing, accepted with Tab',
      '- Admin controls: workspace switch, usage quotas and secret redaction',
      '',
      '## Non-goals',
      '- Generating whole documents from a prompt',
      '- Training on customer content, ever',
      '',
      '## Success metrics',
      '- 12 private beta workspaces, then public beta',
      '- 30% of weekly active writers use the assistant each week',
      '- Suggestion accept rate above 25%',
      '- First-token latency under 1 second at p95',
    ),
    status: 'In Progress', health: 'On Track', lead: ME, team: 'ENG', goal: 'ai', priority: 2,
    icon: '✨', color: '#8656C9', startOffset: -35, targetOffset: 45,
  },
  {
    key: 'offline', name: 'Offline mode', summary: 'Read and edit documents on iOS and Android without a connection.',
    description: md(
      '## Problem',
      'Our mobile apps are close to unusable without a connection: documents won\'t open, and edits made on a flaky network can fail silently. App reviews mention it more than anything else, and it is the main reason people keep drafts in a separate notes app.',
      '',
      '## Goals',
      '- Recently opened documents readable offline on both platforms',
      '- Offline editing, with edits queued and merged on reconnect',
      '- Calm, specific UI for the rare edit that can\'t be merged',
      '',
      '## Non-goals',
      '- Offline search',
      '- Creating workspaces or inviting people while offline',
      '',
      '## Success metrics',
      '- Zero known data-loss bugs at launch',
      '- 95% of offline edits merge with no user action',
      '- Reviews mentioning "offline" fall by half',
    ),
    status: 'In Progress', health: 'Off Track', lead: 'amara', team: 'MOB', goal: 'mobile', priority: 1,
    icon: '📶', color: '#2E9460', startOffset: -42, targetOffset: 30,
  },
  {
    key: 'push', name: 'Push notifications v2', summary: 'Per-document preferences, grouped threads and a new delivery service.',
    description: md(
      '## Problem',
      'Notifications were all-or-nothing, often late, and impossible to tune per document. Opt-in rates were low, and people who did opt in muted the app within a week.',
      '',
      '## Goals',
      '- Per-document and per-workspace notification preferences',
      '- Notifications grouped by comment thread',
      '- Ask for permission in context instead of at first launch',
      '- Move to the new delivery service and retire the old token store',
      '',
      '## Non-goals',
      '- Rich previews with document thumbnails',
      '- Changes to email digests',
      '',
      '## Success metrics',
      '- Android opt-in rate above 55% (was 41%)',
      '- Median delivery time under 3 seconds',
      '- Silent push volume down by at least half',
    ),
    status: 'Completed', health: 'On Track', lead: 'lukas', team: 'MOB', goal: 'mobile', priority: 2,
    icon: '🔔', color: '#BF8300', startOffset: -70, targetOffset: -12, completedOffset: -9,
  },
  {
    key: 'ds', name: 'Design system 2.0', summary: 'One set of tokens and component specs for web, iOS and Android.',
    description: md(
      '## Problem',
      'Web and mobile have drifted into three slightly different visual languages. Several colors fail contrast in dark mode, there are 14 button variants in production, and every new screen starts with a debate about spacing.',
      '',
      '## Goals',
      '- Shared tokens for color, type and spacing across all platforms',
      '- Specs for the 20 most-used components, including keyboard and screen reader behaviour',
      '- A documentation site engineers actually use',
      '',
      '## Non-goals',
      '- A rebrand or new logo',
      '- Migrating every existing screen at once (teams adopt as they touch code)',
      '',
      '## Success metrics',
      '- All text tokens meet WCAG AA in both themes',
      '- Button variants in production down from 14 to 4',
      '- New screens ship without custom styles for standard components',
    ),
    status: 'In Progress', health: 'On Track', lead: 'sofia', team: 'DES', priority: 3,
    icon: '🧩', color: '#B04FA6', startOffset: -49, targetOffset: 21,
  },
  {
    key: 'audit', name: 'Audit log', summary: 'An exportable record of security-relevant events for workspace admins.',
    description: md(
      '## Problem',
      'Enterprise admins can\'t answer "who changed this permission, and when?" without contacting support. Security reviews ask for an exportable audit trail, and today we have to answer no.',
      '',
      '## Goals',
      '- Record sign-ins, permission changes, exports, deletions and admin setting changes',
      '- Admin page with filters and CSV export',
      '- Stream events to a customer-provided endpoint',
      '',
      '## Non-goals',
      '- Document edit history (version history covers it)',
      '- Real-time alerting rules',
      '',
      '## Success metrics',
      '- 1-year retention on Enterprise, 90 days on Business',
      '- Audit questions in security reviews answered without exceptions',
    ),
    status: 'Planned', health: 'Unknown', lead: 'priya', team: 'ENG', goal: 'ent', priority: 2,
    icon: '📜', color: '#BF8300', startOffset: 20, targetOffset: 90,
  },
  {
    key: 'onboarding', name: 'Onboarding redesign', summary: 'A short, mobile-friendly first run that ends with a real document.',
    description: md(
      '## Problem',
      'Only 38% of new workspaces create a second document in their first week. New users land in an empty workspace with a generic welcome page and no obvious first step, and most signups now happen on a phone, where the current flow was never designed to work.',
      '',
      '## Goals',
      '- Understand what successful new teams do in their first week',
      '- A skippable setup flow that ends with a real document, not a tour',
      '- Empty states that point to one clear next action',
      '',
      '## Non-goals',
      '- Pricing or trial length changes',
      '- Redesigning team invitations (separate project)',
      '',
      '## Success metrics',
      '- Week-one second-document rate from 38% to 50%',
      '- Onboarding completion above 70% on mobile',
    ),
    status: 'Planned', health: 'Unknown', lead: ME, team: 'DES', goal: 'mobile', priority: 3,
    icon: '👋', color: '#2B86B8', startOffset: 7, targetOffset: 75,
  },
  {
    key: 'billing', name: 'Billing migration', summary: 'Move subscriptions and invoicing off the homegrown billing service.',
    description: md(
      '## Problem',
      "Billing runs on a homegrown invoicing service that can't handle mid-term seat changes, annual prepay with overages, or tax rules in new regions. Finance reconciles enterprise invoices by hand every month.",
      '',
      '## Goals',
      '- Move subscriptions and invoices to the new payments provider',
      '- Proration previews before seat changes',
      '- Retire the homegrown invoicing service',
      '',
      '## Non-goals',
      '- Changing prices or plans',
      '- Usage-based billing for AI features',
      '',
      '## Success metrics',
      '- Zero double-charged or missed invoices during the move',
      '- Monthly reconciliation from 3 days to under half a day',
      '',
      '## Status',
      'Paused while finance finalizes the provider contract. We pick it back up after SSO reaches GA.',
    ),
    status: 'Paused', health: 'Unknown', lead: 'grace', team: 'ENG', goal: 'ent', priority: 3,
    icon: '💳', color: '#D24A22', startOffset: -30, targetOffset: 120,
  },
];

export const MILESTONES: MilestoneSeed[] = [
  { key: 'sso_m1', project: 'sso', name: 'SAML sign-in for our own workspace', description: 'Everyone at Quillmark signs in through SAML.', targetOffset: -24 },
  { key: 'sso_m2', project: 'sso', name: 'SCIM beta with pilot customers', description: 'Users provisioned and deactivated from the pilot identity providers.', targetOffset: 3 },
  { key: 'sso_m3', project: 'sso', name: 'Enterprise GA', description: 'Available to every Enterprise workspace, with setup docs.', targetOffset: 24 },
  { key: 'search_m1', project: 'search', name: 'New index behind a flag', description: 'Internal workspaces read from the new index.', targetOffset: -28 },
  { key: 'search_m2', project: 'search', name: 'Ranking & filters', description: 'Hybrid ranking, permission-aware results and filters.', targetOffset: 16 },
  { key: 'search_m3', project: 'search', name: 'GA', description: 'New search for every workspace; old index removed.', targetOffset: 38 },
  { key: 'ai_m1', project: 'aiassist', name: 'Internal alpha', description: 'Side panel and admin switch available to Quillmark staff.', targetOffset: -7 },
  { key: 'ai_m2', project: 'aiassist', name: 'Private beta', description: 'Inline suggestions, quotas and redaction for 12 beta workspaces.', targetOffset: 18 },
  { key: 'ai_m3', project: 'aiassist', name: 'Public beta', description: 'Opt-in for every workspace, with citations and safety hardening.', targetOffset: 45 },
  { key: 'off_m1', project: 'offline', name: 'Read-only offline', description: 'Recently opened documents readable offline on both platforms.', targetOffset: -10 },
  { key: 'off_m2', project: 'offline', name: 'Offline editing on iOS', description: 'Edits queue offline and merge on reconnect.', targetOffset: 9 },
  { key: 'off_m3', project: 'offline', name: 'Offline editing on Android', description: 'Parity with iOS using the shared operation format.', targetOffset: 30 },
  { key: 'push_m1', project: 'push', name: 'Notification preferences', description: 'Per-document and per-workspace settings on both platforms.', targetOffset: -22 },
  { key: 'push_m2', project: 'push', name: 'Rollout to 100%', description: 'All users on the new delivery service; old token store removed.', targetOffset: -10 },
  { key: 'ds_m1', project: 'ds', name: 'Tokens & foundations', description: 'Color, type and spacing tokens agreed and published.', targetOffset: -20 },
  { key: 'ds_m2', project: 'ds', name: 'Core component specs', description: 'Specs for buttons, menus, alerts, tables and form fields.', targetOffset: 5 },
  { key: 'ds_m3', project: 'ds', name: 'Documentation site', description: 'Tokens and components documented with usage guidance.', targetOffset: 21 },
  { key: 'audit_m1', project: 'audit', name: 'Event schema & storage', description: 'Events recorded and retained per plan.', targetOffset: 45 },
  { key: 'audit_m2', project: 'audit', name: 'Admin UI & export', description: 'Filterable audit page, CSV export and event streaming.', targetOffset: 90 },
  { key: 'onb_m1', project: 'onboarding', name: 'Research synthesis', description: 'Interviews and survey findings shared with the team.', targetOffset: 20 },
  { key: 'onb_m2', project: 'onboarding', name: 'Prototype tested', description: 'Clickable prototype tested with recent signups on mobile.', targetOffset: 50 },
  { key: 'onb_m3', project: 'onboarding', name: 'Live for new workspaces', description: 'New flow on by default for every new workspace.', targetOffset: 75 },
];

export const CHECK_INS: CheckInSeed[] = [
  {
    project: 'sso', author: 'ana', health: 'On Track', offset: -22,
    body: md(
      '**SAML sign-in works end to end, and all of Quillmark has been signing in through it since Monday.**',
      '',
      '- Signature validation, clock-skew handling and replay protection are merged',
      '- Just-in-time member creation is in progress and on schedule for this sprint',
      '- Metadata upload is next, then SCIM `/Users`',
      '- No open questions from security review so far',
    ),
  },
  {
    project: 'sso', author: 'ana', health: 'On Track', offset: -15,
    body: md(
      '**Metadata upload and just-in-time provisioning are both in review. SCIM starts next sprint.**',
      '',
      '- Two of the three pilot customers have test connections configured',
      '- We cut the self-hosted settings page: self-hosted reaches end of support before it would ship',
      '- SCIM is scoped to users first, then groups, based on what the pilots need at launch',
    ),
  },
  {
    project: 'sso', author: 'ana', health: 'At Risk', offset: -8,
    body: md(
      '**Moving to At Risk: a pilot customer found that IdP-initiated sign-in fails when assertions are encrypted.**',
      '',
      '- SP-initiated sign-in is unaffected, so there is a workaround',
      '- The fix means decrypting before verifying the signature, plus canonicalizing the decrypted XML',
      '- SCIM deactivation is also bigger than estimated: revoking mobile sessions needs a new server-to-app logout path',
      '- I\'ll confirm whether the GA date holds in next week\'s update',
    ),
  },
  {
    project: 'sso', author: 'ana', health: 'At Risk', offset: -1,
    body: md(
      '**Still At Risk. SCIM user provisioning is done, but deactivation and group mapping will push GA by about one sprint.**',
      '',
      '- `/Users` create, update and patch merged; the conformance suite runs in CI',
      '- Encrypted assertion fix is in progress with tests against four identity provider fixtures',
      '- Deactivation: sessions revoke on web; mobile logout is the remaining work',
      '- Group mapping will use explicit admin mapping rather than auto-creating teams',
      '- Proposed new GA target: two weeks after the current date',
    ),
  },
  {
    project: 'search', author: 'tomas', health: 'On Track', offset: -20,
    body: md(
      '**Hybrid ranking is in review and beats the current index on every query category we measure.**',
      '',
      '- nDCG@10 on the judgement set: 0.61 → 0.74',
      '- p95 latency 180 ms, inside the 250 ms budget',
      '- Internal workspaces have been on the new index for a week with no rollbacks',
    ),
  },
  {
    project: 'search', author: 'tomas', health: 'On Track', offset: -6,
    body: md(
      '**Hybrid ranking is live for internal and beta workspaces. Next: permission-aware results and filters.**',
      '',
      '- Beta admins report fewer "search can\'t find it" complaints already',
      '- Typo tolerance for titles shipped this sprint',
      '- We found that removed access doesn\'t hide results until the nightly reindex; the fix is scheduled for sprint 22 and blocks GA',
      '- Filters are designed and ready to build',
    ),
  },
  {
    project: 'aiassist', author: ME, health: 'At Risk', offset: -13,
    body: md(
      '**At Risk: first-token latency is above our 1-second budget on mobile networks.**',
      '',
      '- p95 is 1.6 s, mostly connection setup for a separate HTTP stream per request',
      '- Plan: stream completions over the collaboration socket clients already hold open',
      '- Everything else for the internal alpha is done: the workspace AI switch and the side panel shipped',
      '- Private beta invite list (12 workspaces) is drafted',
    ),
  },
  {
    project: 'aiassist', author: ME, health: 'On Track', offset: -3,
    body: md(
      '**Back on track: streaming over the collaboration socket brought p95 first-token latency down to 900 ms.**',
      '',
      '- Ghost-text rendering is in review',
      '- Secret redaction and usage quotas are the last two beta blockers',
      '- Beta scope is paragraphs only; tables, code blocks and headings come later',
      '- Invites go to the 12 beta workspaces once quotas land, still on track for the private beta milestone',
    ),
  },
  {
    project: 'offline', author: 'amara', health: 'On Track', offset: -16,
    body: md(
      '**Read-only offline is feature complete on iOS; Android is a few days behind.**',
      '',
      '- Last 50 opened documents are cached with images under 5 MB',
      '- Operation log format is agreed and shared across both platforms',
      '- Android cache eviction still needs testing on low-storage devices',
      '- Offline editing work starts next sprint, beginning with the local operation queue on iOS',
    ),
  },
  {
    project: 'offline', author: 'amara', health: 'At Risk', offset: -9,
    body: md(
      '**At Risk: read-only offline slipped a week, and merging offline edits is harder than we planned.**',
      '',
      '- Android cache eviction needed a rewrite after testing on low-storage devices',
      '- Edits made against an old revision can conflict in ways the server currently rejects outright',
      '- Sofia is designing a conflict banner so we never fail silently',
    ),
  },
  {
    project: 'offline', author: 'priya', health: 'Off Track', offset: -2,
    body: md(
      '**Off Track: we found a sync bug that drops edits during token refresh, and fixing it comes before offline editing.**',
      '',
      '- The bug affects online users too, so it is Urgent on both platforms',
      '- iOS offline editing milestone moves by about a week',
      '- The Android spike on reusing the iOS operation format continues in parallel',
      '- Revised dates in next week\'s update, once the fix is verified',
    ),
  },
  {
    project: 'push', author: 'lukas', health: 'On Track', offset: -24,
    body: md(
      '**Notification preferences shipped on both platforms. Rollout to 100% starts next week.**',
      '',
      '- Android opt-in rate is 58% with the in-context permission prompt (was 41%)',
      '- Grouped notifications are live on iOS',
      '- Crash on notifications for deleted comments is fixed',
      '- Before 100%: watch delivery latency at 50% for a week and write the rollback runbook',
    ),
  },
  {
    project: 'push', author: 'lukas', health: 'On Track', offset: -10,
    body: md(
      '**Push notifications v2 is at 100% of users. Closing out the project.**',
      '',
      '- Median delivery time is 1.9 s',
      '- Silent push volume is down 83% after we stopped sending them for presence changes',
      '- The old token table is deleted',
      '- Rich previews are canceled for now; thumbnails tripled delivery latency',
    ),
  },
  {
    project: 'ds', author: 'sofia', health: 'On Track', offset: -5,
    body: md(
      '**Foundations are done and core component specs are about halfway.**',
      '',
      '- Color, type and spacing tokens are published; every text token passes AA in both themes',
      '- Buttons are specced; menus and combobox are in review with engineering',
      '- Toasts and tables are next, then the documentation site',
      '- Menus review is two days late because keyboard behaviour needed another pass; no impact on the milestone',
    ),
  },
];

// ---- Sprints -----------------------------------------------------------------

export const SPRINTS: SprintSeed[] = [
  { key: 'eng18', team: 'ENG', number: 18, startOffset: -48, endOffset: -34, completed: true, goal: 'Lay the SAML groundwork and get the new search indexing pipeline running end to end.' },
  { key: 'eng19', team: 'ENG', number: 19, startOffset: -34, endOffset: -20, completed: true, goal: 'SAML sign-in for our own workspace, and the new index in front of internal users.' },
  { key: 'eng20', team: 'ENG', number: 20, startOffset: -20, endOffset: -6, completed: true, goal: 'Finish just-in-time provisioning, land hybrid ranking and start the assistant internal alpha.' },
  { key: 'eng21', team: 'ENG', number: 21, startOffset: -6, endOffset: 8, goal: 'SCIM provisioning at beta quality and inline AI suggestions ready for the private beta.' },
  { key: 'eng22', team: 'ENG', number: 22, startOffset: 8, endOffset: 22, goal: null },
  { key: 'mob7', team: 'MOB', number: 7, startOffset: -31, endOffset: -17, completed: true, goal: 'Ship notification preferences on both platforms and settle the offline architecture.' },
  { key: 'mob8', team: 'MOB', number: 8, startOffset: -17, endOffset: -3, completed: true, goal: 'Roll push v2 out to everyone and ship read-only offline on iOS and Android.' },
  { key: 'mob9', team: 'MOB', number: 9, startOffset: -3, endOffset: 11, goal: 'Fix the token-refresh data loss bug and make offline editing on iOS work end to end.' },
  { key: 'mob10', team: 'MOB', number: 10, startOffset: 11, endOffset: 25, goal: null },
];

// ---- Issues -----------------------------------------------------------------

const ISSUE_LIST: IssueSeed[] = [
  // ENG · Sprint 18 (completed)
  {
    key: 'eng-request-ids', team: 'ENG', title: 'Include request IDs in public API error responses',
    description: md(
      "Support can't match customer-reported API errors to our logs, because error bodies don't include the request ID we already generate at the edge.",
      '',
      '**Acceptance criteria**',
      '- [x] Every 4xx and 5xx body includes `request_id`',
      '- [x] The same value is returned in the `X-Request-Id` header',
      '- [x] API reference updated',
      '',
      '```json',
      '{ "error": { "code": "not_found", "message": "Document not found", "request_id": "req_8f2c1e" } }',
      '```',
    ),
    state: 'done', priority: 3, estimate: 2, type: 'Improvement', assignee: ME, creator: 'grace',
    labels: ['api', 'improvement'], sprint: 'eng18', openedOffset: -55.3, startedOffset: -46.8, completedOffset: -44.2,
  },
  {
    key: 'eng-index-worker', team: 'ENG', title: 'Move search indexing off the save path and onto the job queue',
    description: md(
      'Indexing runs inline when a document is saved, so saves stall whenever the search cluster is slow. Move it onto the job queue so saving never waits on search.',
      '',
      '- Batch writes per workspace (500 documents or 2 seconds, whichever comes first)',
      '- Retry with backoff; dead-letter after 5 attempts',
      '- Emit `search.index.lag_seconds` so we can alert on it',
    ),
    state: 'done', priority: 2, estimate: 5, type: 'Task', assignee: 'tomas', creator: 'tomas', project: 'search', milestone: 'search_m1',
    labels: ['infra', 'performance'], sprint: 'eng18', openedOffset: -61.7, startedOffset: -47.5, completedOffset: -40.3,
  },
  {
    key: 'eng-idp-model', team: 'ENG', title: 'Model identity provider connections per workspace',
    state: 'done', priority: 3, estimate: 5, type: 'Task', assignee: 'ana', creator: 'ana', project: 'sso', milestone: 'sso_m1',
    labels: ['api', 'security'], sprint: 'eng18', openedOffset: -57.9, startedOffset: -47.2, completedOffset: -38.6,
  },
  {
    key: 'eng-paste-table', team: 'ENG', title: 'Editor loses the selection after pasting a table from a spreadsheet',
    description: md(
      '### Steps to reproduce',
      '1. Copy a 3×3 range from any spreadsheet app',
      '2. Paste it into an empty paragraph',
      '3. Press an arrow key',
      '',
      '### Expected',
      'The caret lands in the paragraph after the pasted table.',
      '',
      '### Actual',
      'The selection is lost and the next keypress scrolls the document to the top.',
    ),
    state: 'done', priority: 2, estimate: 3, type: 'Bug', assignee: 'kenji', creator: 'marcus',
    labels: ['bug', 'frontend'], sprint: 'eng18', openedOffset: -50.2, startedOffset: -45.1, completedOffset: -43.7,
  },
  {
    key: 'eng-ci-cache', team: 'ENG', title: 'Cache dependency installs on CI',
    state: 'done', priority: 0, estimate: 3, type: 'Chore', assignee: 'grace', creator: 'grace',
    labels: ['infra', 'techdebt'], sprint: 'eng18', openedOffset: -49.0, startedOffset: -44.3, completedOffset: -36.9,
  },
  {
    key: 'eng-archived-switcher', team: 'ENG', title: 'Workspace switcher lists archived workspaces',
    state: 'done', priority: 3, estimate: 2, type: 'Bug', assignee: 'kenji', creator: 'priya',
    labels: ['bug', 'frontend'], sprint: 'eng18', openedOffset: -45.8, startedOffset: -41.2, completedOffset: -39.2,
  },
  {
    key: 'eng-backfill-updated', team: 'ENG', title: 'Backfill missing edit timestamps on older documents',
    state: 'done', priority: 0, estimate: 3, type: 'Chore', assignee: 'tomas', creator: 'tomas', project: 'search',
    labels: ['techdebt'], sprint: 'eng18', openedOffset: -52.4, startedOffset: -39.8, completedOffset: -35.1,
  },
  {
    key: 'eng-hosted-search-spike', team: 'ENG', title: 'Spike: hosted search service vs. running our own cluster',
    description: 'Canceled before we started: enterprise customers need data residency in regions none of the hosted options offer, so search stays in-house.',
    state: 'canceled', priority: 3, estimate: 2, type: 'Spike', assignee: 'tomas', creator: 'priya', project: 'search',
    sprint: 'eng18', openedOffset: -60.5, canceledOffset: -41.0,
  },

  // ENG · Sprint 19 (completed)
  {
    key: 'eng-prompt-templates', team: 'ENG', title: 'Prototype prompt templates for summarize, rewrite and continue',
    description: md(
      'Time-box: 3 days. Try a small set of prompt templates against 40 internal documents and grade the output.',
      '',
      '**Findings**',
      '- Summaries hold up to about 6,000 words; beyond that we need chunking',
      '- Rewrite needs the surrounding paragraph for tone, not just the selection',
      '- "Continue writing" is the riskiest: it invents facts. Ship it last.',
    ),
    state: 'done', priority: 3, estimate: 3, type: 'Spike', assignee: ME, creator: ME, project: 'aiassist',
    sprint: 'eng19', openedOffset: -39.6, startedOffset: -33.2, completedOffset: -29.5,
  },
  {
    key: 'eng-saml-acs', team: 'ENG', title: 'SAML assertion consumer service with signature validation',
    description: md(
      'Implement `POST /sso/saml/acs`.',
      '',
      '- [x] Validate response and assertion signatures against the stored certificates',
      '- [x] Reject assertions outside `NotBefore` / `NotOnOrAfter`, allowing 2 minutes of clock skew',
      '- [x] Replay protection keyed on assertion ID',
      '- [x] Match `NameID` and the email attribute to a workspace member',
    ),
    state: 'done', priority: 2, estimate: 8, type: 'Feature', assignee: 'ana', creator: 'ana', project: 'sso', milestone: 'sso_m1',
    labels: ['api', 'security'], sprint: 'eng19', openedOffset: -44.8, startedOffset: -33.8, completedOffset: -24.1,
  },
  {
    key: 'eng-index-flag', team: 'ENG', title: 'Serve the new search index to internal workspaces behind a flag',
    state: 'done', priority: 3, estimate: 5, type: 'Feature', assignee: 'tomas', creator: 'tomas', project: 'search', milestone: 'search_m1',
    labels: ['api'], sprint: 'eng19', openedOffset: -41.1, startedOffset: -32.0, completedOffset: -27.6,
  },
  {
    key: 'eng-mentions-slow', team: 'ENG', title: 'Mentions autocomplete is slow in workspaces with 5,000+ members',
    description: md(
      'Reported by two enterprise workspaces. Typing `@` fetches the full member list on every keystroke.',
      '',
      '### Steps to reproduce',
      '1. Open a document in a workspace with more than 5,000 members',
      '2. Type `@an`',
      '',
      '### Expected',
      'Suggestions in under 150 ms.',
      '',
      '### Actual',
      '1.8–2.5 s per keystroke, and the editor drops input while it waits.',
    ),
    state: 'done', priority: 2, estimate: 3, type: 'Bug', assignee: 'kenji', creator: 'marcus', project: 'search',
    labels: ['performance', 'frontend', 'customer'], sprint: 'eng19', openedOffset: -36.4, startedOffset: -31.0, completedOffset: -26.2,
  },
  {
    key: 'eng-key-rotation', team: 'ENG', title: 'Rotate API signing keys without downtime',
    state: 'done', priority: 3, estimate: 5, type: 'Task', assignee: 'grace', creator: 'priya',
    labels: ['security', 'infra'], sprint: 'eng19', openedOffset: -38.7, startedOffset: -30.5, completedOffset: -21.3,
  },
  {
    key: 'eng-thread-scroll', team: 'ENG', title: 'Comment thread jumps to the top when a new reply arrives',
    state: 'done', priority: 2, estimate: 2, type: 'Bug', assignee: 'kenji', creator: 'sofia',
    labels: ['bug', 'regression', 'frontend'], sprint: 'eng19', openedOffset: -29.4, startedOffset: -28.9, completedOffset: -27.9,
  },
  {
    key: 'eng-drop-share-links', team: 'ENG', title: 'Drop the unused legacy share links table',
    state: 'done', priority: 0, estimate: 1, type: 'Chore', assignee: 'grace', creator: 'tomas',
    labels: ['techdebt'], sprint: 'eng19', openedOffset: -64.2, startedOffset: -22.9, completedOffset: -22.4,
  },

  // ENG · Sprint 20 (completed)
  {
    key: 'eng-saml-metadata', team: 'ENG', title: 'Let workspace admins upload identity provider metadata',
    description: md(
      'Admins currently paste the SSO URL, entity ID and certificate separately, and most setup mistakes happen there. Accept a metadata file or URL and parse it for them.',
      '',
      '- [x] Accept a file upload or a metadata URL',
      '- [x] Show the parsed values for confirmation before saving',
      '- [x] Warn when the signing certificate expires within 30 days',
    ),
    state: 'done', priority: 3, estimate: 3, type: 'Feature', assignee: ME, creator: 'ana', project: 'sso',
    labels: ['frontend'], sprint: 'eng20', openedOffset: -26.3, startedOffset: -18.6, completedOffset: -13.4,
  },
  {
    key: 'eng-ai-killswitch', team: 'ENG', title: 'Workspace setting to turn off all AI features',
    description: "Several enterprise admins won't join the beta unless they can turn AI off for the whole workspace. Admin-only setting: on by default for Business, off for Enterprise until an admin opts in. When off, hide every assistant entry point and reject assistant calls server-side.",
    state: 'done', priority: 2, estimate: 2, type: 'Feature', assignee: ME, creator: 'marcus', project: 'aiassist', milestone: 'ai_m1',
    labels: ['security'], sprint: 'eng20', openedOffset: -22.1, startedOffset: -15.2, completedOffset: -11.8,
  },
  {
    key: 'eng-hybrid-ranking', team: 'ENG', title: 'Hybrid ranking: blend keyword and semantic scores',
    description: md(
      'Keyword search misses paraphrases ("vacation policy" vs. "time-off guidelines"); semantic search alone is bad at exact titles and IDs. Score both and blend.',
      '',
      '```ts',
      'const score = 0.6 * bm25(doc, query) + 0.4 * cosine(doc.embedding, query.embedding) + recencyBoost(doc.updatedAt);',
      '```',
      '',
      'Weights tuned on the internal judgement set: nDCG@10 went from 0.61 to 0.74, with p95 latency at 180 ms.',
    ),
    state: 'done', priority: 2, estimate: 8, type: 'Feature', assignee: 'tomas', creator: 'tomas', project: 'search', milestone: 'search_m2',
    labels: ['api', 'performance'], sprint: 'eng20', openedOffset: -30.2, startedOffset: -19.5, completedOffset: -8.3,
  },
  {
    key: 'eng-assistant-panel', team: 'ENG', title: 'Assistant side panel with summarize, rewrite and continue',
    description: md(
      'First usable version of the assistant for the internal alpha.',
      '',
      '- [x] Opens from the toolbar and with Cmd+J',
      '- [x] Works on the selection, or the whole document when nothing is selected',
      '- [x] *Insert below* and *Replace selection* actions',
      '- [x] Hidden entirely when the workspace AI setting is off',
    ),
    state: 'done', priority: 3, estimate: 5, type: 'Feature', assignee: 'kenji', creator: 'marcus', project: 'aiassist', milestone: 'ai_m1',
    labels: ['frontend'], sprint: 'eng20', openedOffset: -24.4, startedOffset: -17.1, completedOffset: -9.6,
  },
  {
    key: 'eng-jit-provisioning', team: 'ENG', title: 'Create members just in time on first SAML sign-in',
    state: 'done', priority: 3, estimate: 5, type: 'Feature', assignee: 'ana', creator: 'ana', project: 'sso',
    labels: ['api'], sprint: 'eng20', openedOffset: -27.0, startedOffset: -18.0, completedOffset: -12.7,
  },
  {
    key: 'eng-api-500-deleted', team: 'ENG', title: 'Public API returns 500 instead of 404 for deleted documents',
    state: 'done', priority: 3, estimate: 1, type: 'Bug', assignee: 'grace', creator: 'marcus',
    labels: ['bug', 'api'], sprint: 'eng20', openedOffset: -16.3, startedOffset: -15.9, completedOffset: -15.1,
  },
  {
    key: 'eng-restore-drill', team: 'ENG', title: 'Nightly restore drill fails for documents over 50 MB',
    description: md(
      '### What happened',
      'The restore drill failed three nights running. Large documents time out during the checksum step, so the drill marks the whole backup as unverified.',
      '',
      '### Fix',
      'Stream the checksum instead of loading the document into memory, and raise the step timeout for documents over 10 MB.',
    ),
    state: 'done', priority: 2, estimate: 3, type: 'Bug', assignee: 'grace', creator: 'grace',
    labels: ['bug', 'infra'], sprint: 'eng20', openedOffset: -19.2, startedOffset: -14.0, completedOffset: -7.2,
  },
  {
    key: 'eng-selfhosted-saml', team: 'ENG', title: 'SAML settings page for self-hosted installs',
    description: 'Canceled: self-hosted installs reach end of support before this would ship, and the remaining enterprise customers on self-hosted are moving to cloud workspaces.',
    state: 'canceled', priority: 4, type: 'Feature', creator: 'marcus', project: 'sso',
    sprint: 'eng20', openedOffset: -33.5, canceledOffset: -10.5,
  },

  // ENG · Sprint 21 (active)
  {
    key: 'eng-scim', team: 'ENG', title: 'SCIM 2.0 provisioning for enterprise workspaces',
    description: md(
      'Let IT admins create, update and deactivate Quillmark members from their identity provider instead of by hand. This is the top blocker in three enterprise deals.',
      '',
      '**Scope**',
      '- `/Users` create, update, patch and deactivate',
      '- `/Groups` mapped to workspace teams',
      '- A bearer token per workspace that admins can rotate',
      '',
      '**Out of scope**',
      '- Custom attribute mapping (follow-up)',
      '- Provisioning guests',
      '',
      'Each part is tracked as a sub-issue.',
    ),
    state: 'progress', priority: 1, type: 'Feature', assignee: 'ana', creator: 'priya', project: 'sso', milestone: 'sso_m2',
    labels: ['api', 'security', 'customer'], sprint: 'eng21', openedOffset: -21.5, startedOffset: -11.8, dueOffset: 3,
  },
  {
    key: 'eng-scim-users', team: 'ENG', title: 'SCIM: create, update and patch users', parent: 'eng-scim',
    description: 'Implement `POST`, `PUT` and `PATCH /scim/v2/Users`. Match existing members by email before creating anyone, so a workspace that already invited people by hand doesn\'t end up with duplicates.',
    state: 'done', priority: 2, estimate: 5, type: 'Task', assignee: 'ana', creator: 'ana', project: 'sso', milestone: 'sso_m2',
    labels: ['api'], sprint: 'eng21', openedOffset: -20.8, startedOffset: -9.7, completedOffset: -4.1,
  },
  {
    key: 'eng-scim-deactivate', team: 'ENG', title: 'SCIM: deactivating a user revokes their sessions and API tokens', parent: 'eng-scim',
    description: md(
      '`active: false` currently only hides the member. It also needs to:',
      '',
      '- [x] Mark the member as deactivated',
      '- [ ] Revoke all sessions (web, iOS, Android)',
      '- [ ] Revoke personal API tokens',
      '- [ ] Move ownership of private documents to the workspace admin queue',
    ),
    state: 'progress', priority: 1, estimate: 3, type: 'Task', assignee: 'ana', creator: 'ana', project: 'sso', milestone: 'sso_m2',
    labels: ['api', 'security'], sprint: 'eng21', openedOffset: -20.7, startedOffset: -3.6, dueOffset: 1,
  },
  {
    key: 'eng-scim-groups', team: 'ENG', title: 'SCIM: map identity provider groups to workspace teams', parent: 'eng-scim',
    description: md(
      'Enterprise admins manage access with groups in their identity provider and expect those groups to control team membership in Quillmark.',
      '',
      '**Acceptance criteria**',
      '- [ ] `/Groups` create, update and delete',
      '- [ ] Admins choose which pushed groups map to which teams',
      '- [ ] Removing someone from a mapped group removes their team access',
      '- [ ] Unmapped groups are stored but have no effect',
    ),
    state: 'todo', priority: 2, estimate: 5, type: 'Feature', assignee: 'tomas', creator: 'ana', project: 'sso', milestone: 'sso_m2',
    labels: ['api'], sprint: 'eng21', openedOffset: -20.6, dueOffset: 6,
  },
  {
    key: 'eng-scim-conformance', team: 'ENG', title: 'SCIM: run the conformance suite in CI', parent: 'eng-scim',
    description: 'Run the SCIM 2.0 conformance suite against a staging workspace on every change to `services/scim`, and fail the build on any required test.',
    state: 'review', priority: 3, estimate: 2, type: 'Task', assignee: 'grace', creator: 'ana', project: 'sso', milestone: 'sso_m2',
    labels: ['infra'], sprint: 'eng21', openedOffset: -9.2, startedOffset: -2.9, dueOffset: -1,
  },
  {
    key: 'eng-inline-ai', team: 'ENG', title: 'Inline AI suggestions in the editor',
    description: md(
      "Beta users want suggestions where they're typing, not in a side panel. Show a grey ghost-text continuation after a pause; Tab accepts, Esc dismisses.",
      '',
      '**Acceptance criteria**',
      '- [ ] Suggestions appear after 600 ms of idle typing, never mid-word',
      "- [ ] Never move the caret or reflow text on collaborators' screens",
      '- [ ] Respect the workspace AI setting and usage quotas',
      '- [ ] Track accept and dismiss rates',
    ),
    state: 'progress', priority: 2, type: 'Feature', assignee: ME, creator: 'marcus', project: 'aiassist', milestone: 'ai_m2',
    labels: ['feature', 'frontend'], sprint: 'eng21', openedOffset: -16.4, startedOffset: -6.8,
  },
  {
    key: 'eng-stream-completions', team: 'ENG', title: 'Stream completions over the collaboration websocket', parent: 'eng-inline-ai',
    description: 'Opening a separate HTTP stream per suggestion added 300–400 ms of connection setup on mobile networks. Multiplex completion chunks over the socket clients already hold open, on a new `ai.suggest` channel.',
    state: 'done', priority: 2, estimate: 5, type: 'Task', assignee: 'tomas', creator: ME, project: 'aiassist', milestone: 'ai_m2',
    labels: ['api', 'performance'], sprint: 'eng21', openedOffset: -16.0, startedOffset: -8.1, completedOffset: -2.8,
  },
  {
    key: 'eng-ghost-text', team: 'ENG', title: 'Render ghost-text suggestions without moving the caret', parent: 'eng-inline-ai',
    description: md(
      'Render suggestions as an editor decoration rather than inserting text, so collaborators never see them and undo history stays clean.',
      '',
      '- [x] Decoration follows the caret while the suggestion is still valid',
      '- [x] Suggestion disappears as soon as typed text diverges from it',
      '- [ ] Hidden during IME composition',
      '- [ ] Passes contrast checks in both themes',
    ),
    state: 'review', priority: 2, estimate: 3, type: 'Task', assignee: ME, creator: ME, project: 'aiassist', milestone: 'ai_m2',
    labels: ['frontend'], sprint: 'eng21', openedOffset: -15.9, startedOffset: -4.7,
  },
  {
    key: 'eng-accept-shortcuts', team: 'ENG', title: 'Tab to accept and Esc to dismiss a suggestion', parent: 'eng-inline-ai',
    description: 'Tab already indents list items, so only capture it while a suggestion is visible. Screen readers need a short announcement when a suggestion appears.',
    state: 'todo', priority: 3, estimate: 2, type: 'Improvement', assignee: ME, creator: 'marcus', project: 'aiassist', milestone: 'ai_m2',
    labels: ['frontend', 'a11y'], sprint: 'eng21', openedOffset: -2.5, dueOffset: 2,
  },
  {
    key: 'eng-ai-quotas', team: 'ENG', title: 'Per-workspace AI usage quotas with a soft-limit warning', parent: 'eng-inline-ai',
    description: md(
      '- [ ] Monthly token budget per plan, tracked per workspace',
      '- [ ] Warn admins at 80%; pause inline suggestions at 100% (the side panel keeps working until 120%)',
      '- [ ] Budgets reset on the billing anniversary, not the calendar month',
    ),
    state: 'todo', priority: 2, estimate: 3, type: 'Feature', assignee: ME, creator: 'priya', project: 'aiassist', milestone: 'ai_m2',
    labels: ['api'], sprint: 'eng21', openedOffset: -13.3, dueOffset: 4,
  },
  {
    key: 'eng-saml-encrypted', team: 'ENG', title: 'SAML: IdP-initiated sign-in fails when the assertion is encrypted',
    description: md(
      'Found while a pilot customer was setting up. SP-initiated sign-in works; IdP-initiated sign-in with encrypted assertions fails.',
      '',
      '### Steps to reproduce',
      '1. Configure a connection with *Encrypt assertions* enabled in the identity provider',
      "2. Start sign-in from the identity provider's app dashboard",
      '',
      '### Expected',
      'The user lands in their workspace.',
      '',
      '### Actual',
      '`400` from `/sso/saml/acs` with `SamlAssertionError: signature not found`. Sentry event attached.',
      '',
      '### Notes',
      "We verify the assertion signature before decrypting, so the signature element isn't there yet.",
    ),
    state: 'progress', priority: 1, estimate: 3, type: 'Bug', assignee: ME, creator: 'ana', project: 'sso', milestone: 'sso_m2',
    labels: ['bug', 'security', 'customer'], sprint: 'eng21', openedOffset: -7.9, startedOffset: -5.3, dueOffset: -2,
  },
  {
    key: 'eng-typo-tolerance', team: 'ENG', title: 'Search: tolerate one-letter typos in document titles',
    description: "Allow an edit distance of 1 for title terms of five or more characters. Skip terms that look like identifiers (`ENG-142`, hex strings), or they'll match everything.",
    state: 'done', priority: 3, estimate: 3, type: 'Improvement', assignee: 'kenji', creator: 'tomas', project: 'search', milestone: 'search_m2',
    labels: ['improvement'], sprint: 'eng21', openedOffset: -10.4, startedOffset: -8.6, completedOffset: -5.4,
  },
  {
    key: 'eng-presence-flicker', team: 'ENG', title: 'Presence cursors flicker when two people edit the same line',
    description: md(
      '### Steps to reproduce',
      '1. Open the same document in two windows, signed in as different people',
      '2. Put both cursors on the same line and type',
      '',
      '### Expected',
      'Each cursor stays where its owner is typing.',
      '',
      '### Actual',
      'Both cursors jump between the two positions several times a second.',
    ),
    state: 'done', priority: 2, estimate: 2, type: 'Bug', assignee: 'kenji', creator: 'sofia',
    labels: ['bug', 'frontend'], sprint: 'eng21', openedOffset: -4.4, startedOffset: -3.1, completedOffset: -1.6,
  },
  {
    key: 'eng-rate-limit', team: 'ENG', title: 'Rate-limit the public API by workspace, not by token',
    description: md(
      'One integration created 40 personal tokens to get around the per-token limit and slowed the API down for every workspace on the same shard. Limits should apply per workspace.',
      '',
      '- [x] Sliding-window limiter keyed on workspace ID',
      '- [x] `429` responses include `Retry-After`',
      '- [ ] Dashboard of workspaces hitting the limit',
      '- [ ] Changelog entry and API reference update',
    ),
    state: 'review', priority: 2, estimate: 3, type: 'Improvement', assignee: ME, creator: 'grace',
    labels: ['api', 'security'], sprint: 'eng21', openedOffset: -11.6, startedOffset: -4.9, dueOffset: -3,
  },
  {
    key: 'eng-cmdk-escape', team: 'ENG', title: "Cmd+K palette doesn't close on Escape inside nested menus",
    description: md(
      '### Steps to reproduce',
      '1. Press Cmd+K',
      '2. Arrow down to *Move to…* and press Right to open the submenu',
      '3. Press Escape',
      '',
      '### Expected',
      'The submenu closes and focus returns to the palette.',
      '',
      '### Actual',
      'Nothing happens. A second Escape closes the whole palette and focus is lost.',
    ),
    state: 'done', priority: 3, estimate: 1, type: 'Bug', assignee: 'kenji', creator: ME,
    labels: ['bug', 'frontend', 'a11y'], sprint: 'eng21', openedOffset: -3.1, startedOffset: -1.2, completedOffset: -0.4,
  },
  {
    key: 'eng-redact-secrets', team: 'ENG', title: 'Redact secrets and tokens from assistant prompt context',
    description: 'Documents sometimes contain API keys, passwords and connection strings. Before sending context to the model, run the detectors we already use for public-link scanning and replace matches with `[redacted]`. Log how many matches were redacted, never the values.',
    state: 'progress', priority: 2, estimate: 5, type: 'Task', assignee: ME, creator: 'priya', project: 'aiassist', milestone: 'ai_m2',
    labels: ['security'], sprint: 'eng21', openedOffset: -12.2, startedOffset: -1.9,
  },
  {
    key: 'eng-scim-docs', team: 'ENG', title: 'Write the SCIM setup guide for workspace admins',
    description: 'Step-by-step guide to connecting an identity provider over SCIM: generating the token, the base URL, attribute mapping, and a troubleshooting section for the most common errors.',
    state: 'todo', priority: 3, estimate: 1, type: 'Task', assignee: ME, creator: 'marcus', project: 'sso', milestone: 'sso_m3',
    labels: ['docs'], sprint: 'eng21', openedOffset: -9.4,
  },

  // ENG · Sprint 22 (upcoming)
  {
    key: 'eng-search-permissions', team: 'ENG', title: 'Search results ignore permission changes until the next reindex',
    description: md(
      'When someone loses access to a private document, it keeps appearing in their search results, title and snippet included, until the nightly reindex.',
      '',
      '### Steps to reproduce',
      '1. Share a private document with a teammate',
      '2. The teammate searches for it and it appears',
      '3. Remove their access, then search again',
      '',
      '### Expected',
      'The document disappears from their results immediately.',
      '',
      '### Actual',
      'It still appears with a snippet. Opening it correctly shows *No access*.',
    ),
    state: 'todo', priority: 2, estimate: 5, type: 'Bug', assignee: 'tomas', creator: 'kenji', project: 'search', milestone: 'search_m2',
    labels: ['bug', 'security'], sprint: 'eng22', openedOffset: -6.8, dueOffset: 12,
  },
  {
    key: 'eng-pooler-upgrade', team: 'ENG', title: 'Upgrade the Postgres connection pooler and remove legacy pool settings',
    state: 'todo', priority: 3, estimate: 2, type: 'Chore', assignee: 'grace', creator: 'grace',
    labels: ['infra', 'techdebt'], sprint: 'eng22', openedOffset: -8.8, dueOffset: 14,
  },
  {
    key: 'eng-enforce-sso', team: 'ENG', title: 'Enforce SSO-only sign-in when a workspace requires it',
    description: "When an admin turns on *Require SSO*, refuse password and magic-link sign-in for members on verified domains. Admins keep a break-glass password login so a broken identity provider can't lock everyone out.",
    state: 'todo', priority: 2, estimate: 3, type: 'Feature', assignee: 'ana', creator: 'ana', project: 'sso', milestone: 'sso_m3',
    labels: ['security'], sprint: 'eng22', openedOffset: -14.1, dueOffset: 20,
  },
  {
    key: 'eng-search-filters', team: 'ENG', title: 'Search filters for author, last edited and workspace section',
    description: md(
      '- [ ] Filter by author (multi-select)',
      '- [ ] Filter by last edited: past week, month, year or a custom range',
      '- [ ] Filter by workspace section',
      '- [ ] Filters are kept in the URL so a search can be shared',
    ),
    state: 'todo', priority: 3, estimate: 5, type: 'Feature', assignee: 'kenji', creator: 'marcus', project: 'search', milestone: 'search_m2',
    labels: ['frontend'], sprint: 'eng22', openedOffset: -18.5,
  },
  {
    key: 'eng-assistant-citations', team: 'ENG', title: 'Assistant answers should cite the documents they used',
    description: "Consistent beta feedback: people don't trust an answer they can't check. Link each part of an answer to the paragraph it came from.",
    state: 'backlog', priority: 3, estimate: 5, type: 'Feature', creator: ME, project: 'aiassist', milestone: 'ai_m3',
    labels: ['feature', 'customer'], sprint: 'eng22', openedOffset: -9.9,
  },

  // ENG · Intake
  {
    key: 'eng-pasted-screenshots', team: 'ENG', title: 'Pasted screenshots disappear after refreshing the page',
    description: md(
      'From a support ticket: two people in the same workspace. Screenshots pasted from the clipboard show while editing but are gone after a refresh. Dragging the same file in works.',
      '',
      '**Environment:** web app, both on a hotel network with frequent disconnects.',
    ),
    state: 'intake', priority: 0, type: 'Bug', creator: 'marcus',
    labels: ['bug', 'customer'], openedOffset: -0.6,
  },
  {
    key: 'eng-export-markdown', team: 'ENG', title: 'Export a whole workspace as Markdown with the folder structure intact',
    description: 'Requested by a team moving their handbook to a static site. Today export produces one flat file per document, and links between documents still point at Quillmark URLs.',
    state: 'intake', priority: 0, type: 'Feature', creator: 'priya',
    labels: ['customer'], openedOffset: -3.1,
  },
  {
    key: 'eng-webhook-signature', team: 'ENG', title: 'Webhook retries are signed with the old key after a key rotation',
    description: md(
      "A customer's endpoint started rejecting retried deliveries after we rotated signing keys. First attempts verify; retries reuse the signature computed when the delivery was first queued.",
      '',
      '```',
      'X-Quillmark-Signature: t=1726118400,v1=5f0c9a…  (key id: whk_01, rotated out)',
      '```',
    ),
    state: 'intake', priority: 2, type: 'Bug', creator: 'tomas',
    labels: ['bug', 'api'], openedOffset: -1.9,
  },
  {
    key: 'eng-guest-invites', team: 'ENG', title: 'Guests can see an invite field in the share dialog',
    description: "Guests shouldn't be able to invite anyone. The API rejects the request, but the dialog shows the invite field and fails with a generic toast. Probably UI only; worth confirming there's no path around the API check.",
    state: 'intake', priority: 1, type: 'Bug', creator: 'kenji',
    labels: ['security'], openedOffset: -2.4,
  },
  {
    key: 'eng-shared-link-search', team: 'ENG', title: "Documents shared with someone don't show up in their search results",
    description: 'Support ticket from a workspace admin. Looks like the same stale-permissions problem as the reindex bug.',
    state: 'intake', priority: 0, type: 'Bug', creator: ME,
    labels: ['customer'], openedOffset: -0.2,
  },

  // ENG · Backlog
  {
    key: 'eng-legacy-export', team: 'ENG', title: 'Remove the legacy v1 export endpoint',
    description: 'Only two workspaces have called it in the last 90 days, and both have been contacted. Needs a deprecation notice in the changelog first.',
    state: 'backlog', priority: 4, estimate: 2, type: 'Chore', assignee: ME, creator: 'grace',
    labels: ['api', 'techdebt'], openedOffset: -118.4,
  },
  {
    key: 'eng-vector-store-spike', team: 'ENG', title: 'Spike: move embeddings out of Postgres into a dedicated vector store',
    description: md(
      'Time-box: 3 days. Embedding lookups are 40% of search p95 in the largest workspaces.',
      '',
      '**Questions to answer**',
      '1. Does a tuned in-database index get us inside the latency budget?',
      '2. What does running a second datastore cost us operationally?',
    ),
    state: 'backlog', priority: 3, estimate: 3, type: 'Spike', assignee: ME, creator: 'tomas', project: 'search',
    labels: ['performance', 'infra'], openedOffset: -19.7,
  },
  {
    key: 'eng-audit-schema', team: 'ENG', title: 'Audit log: define the event schema and retention tiers',
    description: md(
      'Decide what we record before building anything else.',
      '',
      '- [ ] Event list, with actor, target, IP address and user agent for each',
      '- [ ] Retention: 1 year on Enterprise, 90 days on Business',
      '- [ ] Storage estimate for our largest workspace',
      '- [ ] Review with security before the first event is written',
    ),
    state: 'backlog', priority: 2, type: 'Task', creator: 'priya', project: 'audit', milestone: 'audit_m1',
    labels: ['security'], openedOffset: -12.3, dueOffset: 40,
  },
  {
    key: 'eng-audit-stream', team: 'ENG', title: 'Audit log: stream events to a customer-provided endpoint',
    state: 'backlog', priority: 3, estimate: 5, type: 'Feature', creator: 'priya', project: 'audit', milestone: 'audit_m1',
    labels: ['api'], openedOffset: -12.2,
  },
  {
    key: 'eng-audit-admin-ui', team: 'ENG', title: 'Audit log: admin page with filters and CSV export',
    state: 'backlog', priority: 0, type: 'Feature', creator: 'marcus', project: 'audit', milestone: 'audit_m2',
    labels: ['frontend'], openedOffset: -11.9,
  },
  {
    key: 'eng-shortcut-reference', team: 'ENG', title: 'Keyboard shortcut reference is out of date',
    description: 'The `?` overlay still lists Cmd+Shift+L for checklists (now Cmd+Shift+9) and is missing every shortcut added for tables.',
    state: 'backlog', priority: 4, estimate: 1, type: 'Task', assignee: 'kenji', creator: 'sofia',
    labels: ['docs'], openedOffset: -96.2,
  },
  {
    key: 'eng-billing-webhooks', team: 'ENG', title: 'Handle payment provider webhooks in the new billing service',
    description: 'Handle subscription created, updated and canceled, and invoice paid and failed. Every handler must be idempotent: the provider retries for up to three days.',
    state: 'backlog', priority: 3, estimate: 5, type: 'Task', assignee: 'grace', creator: 'grace', project: 'billing',
    labels: ['api'], openedOffset: -31.2,
  },
  {
    key: 'eng-billing-proration', team: 'ENG', title: 'Show a proration preview before changing seat count mid-term',
    state: 'backlog', priority: 3, type: 'Feature', creator: 'marcus', project: 'billing',
    labels: ['customer', 'frontend'], openedOffset: -27.8,
  },
  {
    key: 'eng-billing-dualwrite', team: 'ENG', title: 'Dual-write invoices to the old and new billing systems',
    description: "Canceled when the migration was paused. If we pick it back up, we'll backfill from the provider's export instead of dual-writing.",
    state: 'canceled', priority: 3, estimate: 5, type: 'Task', assignee: 'grace', creator: 'grace', project: 'billing',
    labels: ['techdebt'], openedOffset: -29.5, canceledOffset: -8.4,
  },
  {
    key: 'eng-sidebar-dnd', team: 'ENG', title: 'Dragging pages in the sidebar is janky with 200+ pages',
    description: 'Reordering a page in a large workspace drops to around 15 fps because every row re-renders on each drag event. Virtualize the tree and memoize rows.',
    state: 'backlog', priority: 3, type: 'Improvement', creator: 'marcus',
    labels: ['performance', 'frontend'], openedOffset: -142.3,
  },
  {
    key: 'eng-merged-cells', team: 'ENG', title: 'Tables: support merged cells',
    description: 'Our most requested table feature. Needs a decision on how merged cells survive Markdown export, which has no syntax for them.',
    state: 'backlog', priority: 0, type: 'Feature', creator: 'marcus',
    labels: ['customer'], openedOffset: -131.0,
  },
  {
    key: 'eng-focus-rings', team: 'ENG', title: 'Visible focus rings for every button in the editor toolbar',
    description: "Several toolbar buttons remove the default outline and add nothing back, so keyboard users can't tell where focus is. Use the focus ring token from the design system.",
    state: 'backlog', priority: 3, estimate: 2, type: 'Improvement', creator: 'sofia',
    labels: ['a11y', 'frontend'], openedOffset: -45.1,
  },
  {
    key: 'eng-sse-spike', team: 'ENG', title: 'Spike: replace the websocket transport with server-sent events',
    description: 'Canceled: server-sent events are one-way, so every edit would need its own request, and the prototype was slower on every network profile we tested.',
    state: 'canceled', priority: 4, type: 'Spike', assignee: 'tomas', creator: 'tomas',
    labels: ['infra'], openedOffset: -110.2, canceledOffset: -62.5,
  },
  {
    key: 'eng-prompt-injection', team: 'ENG', title: 'Ignore hidden instructions in pasted web content',
    description: md(
      'Content pasted from the web can carry hidden text (white on white, zero-width characters, HTML comments) telling the model to do something else.',
      '',
      '- [ ] Strip hidden and zero-width text from assistant context',
      '- [ ] Keep system instructions separate from document content',
      '- [ ] Add adversarial examples to the evaluation set',
    ),
    state: 'backlog', priority: 2, estimate: 3, type: 'Improvement', creator: ME, project: 'aiassist', milestone: 'ai_m3',
    labels: ['security'], openedOffset: -6.2,
  },
  {
    key: 'eng-multi-idp', team: 'ENG', title: 'SAML: allow more than one identity provider per workspace',
    state: 'backlog', priority: 0, type: 'Feature', creator: 'marcus', project: 'sso',
    labels: ['customer'], openedOffset: -34.9,
  },
  {
    key: 'eng-search-comments', team: 'ENG', title: 'Search: index comments and attachment file names',
    description: "Comments are where decisions get made, and people search for them. Index comment text with the parent document's permissions, plus attachment file names (not their contents).",
    state: 'backlog', priority: 0, estimate: 5, type: 'Feature', creator: 'tomas', project: 'search', milestone: 'search_m3',
    labels: ['feature'], openedOffset: -40.4,
  },
  {
    key: 'eng-tone-presets', team: 'ENG', title: 'Assistant: tone presets for rewrite (formal, friendly, concise)',
    state: 'backlog', priority: 4, estimate: 2, type: 'Feature', creator: 'marcus', project: 'aiassist', milestone: 'ai_m3',
    labels: ['customer'], openedOffset: -15.6,
  },

  // MOB · Push notifications v2, before sprints
  {
    key: 'mob-token-migration', team: 'MOB', title: 'Migrate device tokens to the new push delivery service',
    state: 'done', priority: 3, estimate: 5, type: 'Task', assignee: 'lukas', creator: 'priya', project: 'push',
    labels: ['ios', 'android'], openedOffset: -69.5, startedOffset: -61.8, completedOffset: -48.3,
  },

  // MOB · Sprint 7 (completed)
  {
    key: 'mob-notif-prefs', team: 'MOB', title: 'Notification preferences per document and per workspace',
    description: md(
      '- [x] Workspace level: all activity, mentions and replies only, or nothing',
      '- [x] Document level: follow or mute',
      '- [x] Settings sync across devices',
      '- [x] Same options on iOS and Android',
    ),
    state: 'done', priority: 2, estimate: 5, type: 'Feature', assignee: 'lukas', creator: 'marcus', project: 'push', milestone: 'push_m1',
    labels: ['android', 'feature'], sprint: 'mob7', openedOffset: -40.2, startedOffset: -30.4, completedOffset: -22.1,
  },
  {
    key: 'mob-ios-grouping', team: 'MOB', title: 'iOS: group notifications by comment thread',
    state: 'done', priority: 3, estimate: 3, type: 'Feature', assignee: 'amara', creator: 'amara', project: 'push', milestone: 'push_m1',
    labels: ['ios'], sprint: 'mob7', openedOffset: -38.3, startedOffset: -29.0, completedOffset: -24.6,
  },
  {
    key: 'mob-deeplink-crash', team: 'MOB', title: 'Crash when opening a notification for a deleted comment',
    description: md(
      '### Steps to reproduce',
      '1. Get mentioned in a comment',
      '2. Have the comment deleted',
      '3. Tap the notification',
      '',
      '### Expected',
      'The document opens with a note that the comment was deleted.',
      '',
      '### Actual',
      'The app crashes.',
      '',
      '```',
      'Fatal error: Unexpectedly found nil while unwrapping an Optional value',
      'CommentThreadViewController.swift:212',
      '```',
    ),
    state: 'done', priority: 2, estimate: 2, type: 'Bug', assignee: 'amara', creator: 'lukas', project: 'push',
    labels: ['bug', 'ios'], sprint: 'mob7', openedOffset: -27.5, startedOffset: -26.9, completedOffset: -25.8,
  },
  {
    key: 'mob-android-permission', team: 'MOB', title: 'Android: ask for notification permission after the first comment, not at launch',
    description: 'Only 41% of people allow notifications when we ask on first launch. Ask the first time someone comments or is mentioned instead, with one sentence about what they will receive.',
    state: 'done', priority: 3, estimate: 3, type: 'Improvement', assignee: 'lukas', creator: 'sofia', project: 'push', milestone: 'push_m1',
    labels: ['android'], sprint: 'mob7', openedOffset: -35.1, startedOffset: -28.2, completedOffset: -18.4,
  },
  {
    key: 'mob-offline-design', team: 'MOB', title: 'Spike: offline architecture — operation log or document snapshots?',
    description: md(
      'Time-box: one week, both platforms.',
      '',
      "**Recommendation:** operation log. Snapshots are simpler to store but can't be merged with edits other people made while you were offline, and the sync engine already speaks operations. Storage stays bounded because the log is compacted after each successful sync.",
    ),
    state: 'done', priority: 3, estimate: 2, type: 'Spike', assignee: 'amara', creator: 'priya', project: 'offline',
    labels: ['ios', 'android'], sprint: 'mob7', openedOffset: -44.1, startedOffset: -30.1, completedOffset: -19.7,
  },

  // MOB · Sprint 8 (completed)
  {
    key: 'mob-push-rollout', team: 'MOB', title: 'Roll out push v2 to 100% and delete the old token table',
    state: 'done', priority: 3, estimate: 2, type: 'Chore', assignee: 'lukas', creator: 'lukas', project: 'push', milestone: 'push_m2',
    labels: ['android', 'ios'], sprint: 'mob8', openedOffset: -18.2, startedOffset: -14.1, completedOffset: -9.2,
  },
  {
    key: 'mob-silent-push', team: 'MOB', title: 'Silent pushes wake the iOS app far too often',
    state: 'done', priority: 2, estimate: 3, type: 'Bug', assignee: 'amara', creator: 'amara', project: 'push', milestone: 'push_m2',
    labels: ['performance', 'ios'], sprint: 'mob8', openedOffset: -16.2, startedOffset: -15.4, completedOffset: -11.5,
  },
  {
    key: 'mob-ios-readonly', team: 'MOB', title: 'iOS: keep the last 50 opened documents available offline',
    description: 'Cache the 50 most recently opened documents, including images under 5 MB, and evict the least recently opened first. Show a clear read-only state when a cached document is opened offline.',
    state: 'done', priority: 2, estimate: 5, type: 'Feature', assignee: 'amara', creator: 'priya', project: 'offline', milestone: 'off_m1',
    labels: ['ios'], sprint: 'mob8', openedOffset: -29.8, startedOffset: -16.0, completedOffset: -5.1,
  },
  {
    key: 'mob-android-readonly', team: 'MOB', title: 'Android: read-only offline cache for recent documents',
    state: 'done', priority: 3, estimate: 3, type: 'Feature', assignee: 'lukas', creator: 'priya', project: 'offline', milestone: 'off_m1',
    labels: ['android'], sprint: 'mob8', openedOffset: -29.7, startedOffset: -12.9, completedOffset: -3.9,
  },
  {
    key: 'mob-rich-previews', team: 'MOB', title: 'Rich push previews with document thumbnails',
    description: 'Canceled for v2: rendering a thumbnail for every notification tripled delivery latency. Worth revisiting if we pre-render thumbnails for another reason.',
    state: 'canceled', priority: 4, estimate: 3, type: 'Feature', assignee: 'lukas', creator: 'marcus', project: 'push',
    labels: ['android'], sprint: 'mob8', openedOffset: -33.0, canceledOffset: -12.0,
  },

  // MOB · Sprint 9 (active)
  {
    key: 'mob-ios-offline-edit', team: 'MOB', title: 'Offline editing on iOS',
    description: md(
      'Builds on read-only offline and the shared operation format from the architecture spike.',
      '',
      '**Acceptance criteria**',
      '- [x] Edits made offline are stored locally and survive app restarts',
      '- [ ] Queued edits replay in order when the connection returns',
      '- [ ] A merge that fails shows a banner pointing at the paragraph',
      "- [ ] The header shows when you're working offline",
      '- [ ] No edit is ever dropped without telling the user',
    ),
    state: 'progress', priority: 2, type: 'Feature', assignee: 'amara', creator: 'priya', project: 'offline', milestone: 'off_m2',
    labels: ['ios', 'feature'], sprint: 'mob9', openedOffset: -20.3, startedOffset: -6.1, dueOffset: 9,
  },
  {
    key: 'mob-op-queue', team: 'MOB', title: 'Persist pending edits in a local operation queue', parent: 'mob-ios-offline-edit',
    description: 'Store pending operations in SQLite, in order, with the base revision each was made against. The queue must survive the app being killed and the device restarting.',
    state: 'done', priority: 2, estimate: 5, type: 'Task', assignee: 'amara', creator: 'amara', project: 'offline', milestone: 'off_m2',
    labels: ['ios'], sprint: 'mob9', openedOffset: -19.8, startedOffset: -6.0, completedOffset: -1.2,
  },
  {
    key: 'mob-conflict-banner', team: 'MOB', title: "Show a banner when an offline edit can't be merged", parent: 'mob-ios-offline-edit',
    state: 'progress', priority: 3, estimate: 3, type: 'Feature', assignee: 'amara', creator: 'sofia', project: 'offline', milestone: 'off_m2',
    labels: ['ios'], sprint: 'mob9', openedOffset: -19.5, startedOffset: -1.4,
  },
  {
    key: 'mob-replay-queue', team: 'MOB', title: 'Replay queued edits on reconnect with backoff', parent: 'mob-ios-offline-edit',
    description: "On reconnect, send queued operations in order. Back off exponentially on server errors (up to 5 minutes) and never discard an operation the server hasn't acknowledged.",
    state: 'todo', priority: 2, estimate: 3, type: 'Task', assignee: 'amara', creator: 'amara', project: 'offline', milestone: 'off_m2',
    labels: ['ios'], sprint: 'mob9', openedOffset: -19.4, dueOffset: 7,
  },
  {
    key: 'mob-offline-badge', team: 'MOB', title: 'Offline indicator in the document header', parent: 'mob-ios-offline-edit',
    state: 'review', priority: 3, estimate: 1, type: 'Improvement', assignee: 'amara', creator: 'sofia', project: 'offline', milestone: 'off_m2',
    labels: ['ios'], sprint: 'mob9', openedOffset: -18.9, startedOffset: -2.1,
  },
  {
    key: 'mob-android-offline-spike', team: 'MOB', title: 'Spike: reuse the iOS operation format for Android offline editing',
    description: 'Time-box: 3 days. Can Android store and replay the same operation format as iOS unchanged? If not, what has to change in the shared spec?',
    state: 'progress', priority: 3, estimate: 2, type: 'Spike', assignee: 'lukas', creator: 'priya', project: 'offline', milestone: 'off_m3',
    labels: ['android'], sprint: 'mob9', openedOffset: -8.3, startedOffset: -2.4,
  },
  {
    key: 'mob-keyboard-composer', team: 'MOB', title: 'Keyboard covers the comment composer on small Android phones',
    description: "On screens under 6 inches the software keyboard covers the comment composer, so you can't see what you're typing. Only happens with gesture navigation enabled.",
    state: 'done', priority: 3, estimate: 2, type: 'Bug', assignee: 'lukas', creator: 'marcus',
    labels: ['bug', 'android'], sprint: 'mob9', openedOffset: -2.2, startedOffset: -1.5, completedOffset: -0.6,
  },
  {
    key: 'mob-screen-reader-toolbar', team: 'MOB', title: 'Screen reader announces every formatting button as "button"',
    description: 'Bold, italic, heading and checklist buttons in the iOS formatting toolbar have no accessibility labels.',
    state: 'todo', priority: 3, estimate: 1, type: 'Bug', creator: 'sofia',
    labels: ['a11y', 'ios'], sprint: 'mob9', openedOffset: -9.6,
  },
  {
    key: 'mob-sync-token-refresh', team: 'MOB', title: 'Edits made during an auth token refresh are silently dropped',
    description: md(
      '### Steps to reproduce',
      '1. Open a document and start typing',
      '2. Let the access token expire (or force it from the debug menu)',
      '3. Keep typing through the refresh',
      '',
      '### Expected',
      'Every edit is saved.',
      '',
      '### Actual',
      'Edits typed during the refresh show as saved but never reach the server, and disappear when the document is reopened.',
    ),
    state: 'progress', priority: 1, estimate: 3, type: 'Bug', assignee: 'lukas', creator: 'amara', project: 'offline',
    labels: ['bug', 'regression', 'android'], sprint: 'mob9', openedOffset: -2.8, startedOffset: -2.6, dueOffset: -1,
  },

  // MOB · Sprint 10 (upcoming)
  {
    key: 'mob-android-op-queue', team: 'MOB', title: 'Android: operation queue for offline edits',
    state: 'todo', priority: 2, estimate: 5, type: 'Feature', assignee: 'lukas', creator: 'priya', project: 'offline', milestone: 'off_m3',
    labels: ['android'], sprint: 'mob10', openedOffset: -8.1,
  },
  {
    key: 'mob-cold-start', team: 'MOB', title: 'Get Android cold start under 1.5 seconds on mid-range devices',
    description: 'Cold start is 2.4 s at p50 on mid-range devices. Most of that is initializing the sync engine and the editor on the main thread before the document list is drawn.',
    state: 'todo', priority: 3, estimate: 3, type: 'Improvement', assignee: 'lukas', creator: 'priya',
    labels: ['performance', 'android'], sprint: 'mob10', openedOffset: -23.4, dueOffset: 18,
  },
  {
    key: 'mob-home-widget', team: 'MOB', title: 'Home screen widget for recent documents',
    state: 'backlog', priority: 4, estimate: 3, type: 'Feature', creator: 'marcus',
    labels: ['ios', 'customer'], sprint: 'mob10', openedOffset: -41.7,
  },

  // MOB · Backlog
  {
    key: 'mob-continue-elsewhere', team: 'MOB', title: 'Pick up a document on another device at the same scroll position',
    state: 'backlog', priority: 0, type: 'Feature', creator: 'marcus',
    labels: ['feature'], openedOffset: -102.4,
  },
  {
    key: 'mob-tablet-layout', team: 'MOB', title: 'Two-pane layout for Android tablets',
    state: 'backlog', priority: 0, estimate: 5, type: 'Improvement', creator: 'sofia',
    labels: ['android'], openedOffset: -66.3,
  },
  {
    key: 'mob-share-large-pdf', team: 'MOB', title: 'Sharing a PDF over 20 MB to Quillmark fails silently',
    description: md(
      '### Steps to reproduce',
      '1. Open a PDF larger than 20 MB in another app',
      '2. Share it to Quillmark',
      '',
      '### Expected',
      'The PDF is attached to a new or existing document.',
      '',
      '### Actual',
      'The share sheet closes after a few seconds with no error.',
    ),
    state: 'backlog', priority: 3, estimate: 2, type: 'Bug', creator: 'amara',
    labels: ['bug', 'ios', 'customer'], openedOffset: -37.9,
  },
  {
    key: 'mob-dictation-undo', team: 'MOB', title: 'Dictated text is inserted at the wrong position after undo',
    state: 'backlog', priority: 2, estimate: 2, type: 'Bug', creator: 'marcus',
    labels: ['bug', 'ios'], openedOffset: -9.1,
  },

  // DES · Design system 2.0
  {
    key: 'des-core-components', team: 'DES', title: 'Core component specs for Design system 2.0',
    description: "Each spec covers anatomy, sizes, states (hover, focus, pressed, disabled, loading), keyboard behaviour and dark mode. Engineering picks a component up once its spec is marked Done.",
    state: 'progress', priority: 2, type: 'Task', assignee: 'sofia', creator: 'sofia', project: 'ds', milestone: 'ds_m2',
    openedOffset: -30.1, startedOffset: -21.4, dueOffset: 5,
  },
  {
    key: 'des-buttons', team: 'DES', title: 'Buttons and icon buttons: sizes, states and focus', parent: 'des-core-components',
    state: 'done', priority: 3, estimate: 2, type: 'Task', assignee: 'sofia', creator: 'sofia', project: 'ds', milestone: 'ds_m2',
    labels: ['a11y'], openedOffset: -29.8, startedOffset: -21.2, completedOffset: -16.3,
  },
  {
    key: 'des-menus', team: 'DES', title: 'Menu and combobox specs, including keyboard behaviour', parent: 'des-core-components',
    description: 'Covers dropdown menus, context menus and the combobox used in pickers: arrow keys, Home/End, type-ahead, submenu timing and screen reader announcements.',
    state: 'review', priority: 2, estimate: 3, type: 'Task', assignee: 'sofia', creator: 'sofia', project: 'ds', milestone: 'ds_m2',
    labels: ['a11y'], openedOffset: -29.6, startedOffset: -9.2, dueOffset: -2,
  },
  {
    key: 'des-toasts', team: 'DES', title: 'Toast and inline alert specs', parent: 'des-core-components',
    description: 'Toasts are for passing confirmations only; anything someone needs to act on is an inline alert. Include copy guidance: sentence case, no exclamation marks, say what happened and what to do next.',
    state: 'progress', priority: 3, estimate: 2, type: 'Task', assignee: 'sofia', creator: 'sofia', project: 'ds', milestone: 'ds_m2',
    labels: ['uxwriting'], openedOffset: -29.5, startedOffset: -3.2,
  },
  {
    key: 'des-table', team: 'DES', title: 'Table component spec: sorting, density and empty states', parent: 'des-core-components',
    state: 'todo', priority: 3, estimate: 5, type: 'Task', assignee: 'sofia', creator: 'sofia', project: 'ds', milestone: 'ds_m2',
    openedOffset: -29.4,
  },
  {
    key: 'des-color-tokens', team: 'DES', title: 'Color tokens for light and dark themes, with contrast checks',
    description: 'Semantic tokens (`--text-primary`, `--surface-raised`, `--border-subtle`, status colors) with light and dark values. Every text and background pair must reach 4.5:1.',
    state: 'done', priority: 2, estimate: 5, type: 'Task', assignee: 'sofia', creator: 'sofia', project: 'ds', milestone: 'ds_m1',
    labels: ['a11y'], openedOffset: -47.6, startedOffset: -40.2, completedOffset: -22.5,
  },
  {
    key: 'des-type-scale', team: 'DES', title: 'Type scale and spacing tokens',
    state: 'done', priority: 3, estimate: 3, type: 'Task', assignee: 'kenji', creator: 'sofia', project: 'ds', milestone: 'ds_m1',
    openedOffset: -46.9, startedOffset: -31.0, completedOffset: -19.8,
  },
  {
    key: 'des-icon-audit', team: 'DES', title: 'Icon audit: remove duplicates and fill the gaps',
    state: 'backlog', priority: 0, estimate: 3, type: 'Chore', creator: 'sofia', project: 'ds',
    openedOffset: -38.2,
  },
  {
    key: 'des-docs-site', team: 'DES', title: 'Information architecture for the component documentation site',
    state: 'todo', priority: 3, estimate: 3, type: 'Task', assignee: 'kenji', creator: 'sofia', project: 'ds', milestone: 'ds_m3',
    labels: ['docs'], openedOffset: -12.7,
  },

  // DES · Onboarding redesign
  {
    key: 'des-signup-interviews', team: 'DES', title: 'Interview eight people who signed up in the last month',
    description: md(
      "30-minute calls with people who created a workspace in the last month: half who stayed active, half who didn't.",
      '',
      '- [x] Recruit participants',
      '- [x] Discussion guide',
      '- [ ] Run eight sessions',
      '- [ ] Share highlights and notes',
    ),
    state: 'progress', priority: 3, estimate: 3, type: 'Task', assignee: 'elena', creator: ME, project: 'onboarding', milestone: 'onb_m1',
    labels: ['research'], openedOffset: -10.2, startedOffset: -4.3, dueOffset: 10,
  },
  {
    key: 'des-trial-survey', team: 'DES', title: "Synthesize exit-survey answers from trial workspaces that didn't convert",
    state: 'todo', priority: 3, estimate: 2, type: 'Task', assignee: 'elena', creator: 'marcus', project: 'onboarding', milestone: 'onb_m1',
    labels: ['research'], openedOffset: -9.8,
  },
  {
    key: 'des-empty-states-copy', team: 'DES', title: 'Rewrite empty states for a brand-new workspace',
    description: 'Rewrite the empty states a new workspace sees first: documents, search, inbox and templates. Each should say what belongs there and offer one action.',
    state: 'todo', priority: 3, estimate: 2, type: 'Improvement', creator: ME, project: 'onboarding', milestone: 'onb_m2',
    labels: ['uxwriting'], openedOffset: -7.4,
  },
  {
    key: 'des-checklist-concepts', team: 'DES', title: 'Onboarding checklist: three concept directions',
    state: 'backlog', priority: 3, estimate: 5, type: 'Feature', assignee: 'sofia', creator: 'sofia', project: 'onboarding', milestone: 'onb_m2',
    openedOffset: -7.2,
  },

  // DES · Other
  {
    key: 'des-ai-panel-review', team: 'DES', title: 'Design review: assistant side panel states',
    description: 'Final review of the assistant side panel before the private beta: empty, loading, streaming, error, quota reached and turned off by an admin.',
    state: 'review', priority: 2, estimate: 2, type: 'Task', assignee: 'sofia', creator: 'kenji',
    openedOffset: -6.4, startedOffset: -3.9, dueOffset: 1,
  },
  {
    key: 'des-error-style-guide', team: 'DES', title: 'Error message style guide for the editor and billing screens',
    state: 'backlog', priority: 4, estimate: 2, type: 'Task', creator: 'elena', project: 'ds',
    labels: ['uxwriting'], openedOffset: -91.8,
  },
  {
    key: 'des-illustrated-empty', team: 'DES', title: 'Explore illustrated empty states',
    description: "Canceled in favour of copy-first empty states. Illustrations didn't test better than one clear sentence and a button, and each would need a dark-mode variant.",
    state: 'canceled', priority: 4, estimate: 3, type: 'Spike', assignee: 'sofia', creator: 'marcus',
    openedOffset: -52.3, canceledOffset: -24.6,
  },
];

/**
 * Sorted by when each issue was opened, because the seed numbers issues per team
 * in array order: ENG-1 is the oldest, and the most recent intake item is last.
 * A sub-issue is always opened after its parent, so parents still come first.
 */
export const ISSUES: IssueSeed[] = [...ISSUE_LIST].sort((a, b) => a.openedOffset - b.openedOffset);

// ---- Comments ---------------------------------------------------------------

type ThreadComment = Omit<CommentSeed, 'issue' | 'replyTo'> & { replyTo?: number };

/**
 * Each thread is written in one place. Inside a thread `replyTo` is the position
 * of the root comment within that thread; it is turned into the index into
 * COMMENTS the seed expects, so adding a comment never breaks another thread.
 */
function threads(list: Array<[issue: string, comments: ThreadComment[]]>): CommentSeed[] {
  const out: CommentSeed[] = [];
  for (const [issue, comments] of list) {
    const base = out.length;
    for (const { replyTo, ...comment } of comments) {
      out.push(replyTo === undefined ? { issue, ...comment } : { issue, ...comment, replyTo: base + replyTo });
    }
  }
  return out;
}

export const COMMENTS: CommentSeed[] = threads([
  ['eng-saml-encrypted', [
    {
      author: 'ana', offset: -7.6,
      body: 'Sentry event attached. It only happens on IdP-initiated flows with *Encrypt assertions* on. SP-initiated works because that flow signs the whole response rather than the assertion. We call `verifyAssertionSignature()` before `decryptAssertion()`, so there is nothing to verify yet.',
      reactions: [{ emoji: '👀', member: ME }, { emoji: '👀', member: 'tomas' }],
    },
    {
      author: ME, offset: -5.2, replyTo: 0,
      body: "Swapping the order fixes the reproduction locally. The catch: after decrypting, the signature references an ID inside the decrypted element, so we have to canonicalize the decrypted XML before verifying or the digest check fails. Working on that now.",
    },
    {
      author: 'tomas', offset: -4.6,
      body: "Before this merges, could we add the pilot customer's metadata (scrubbed) as a fixture? Hand-written fixtures have missed provider-specific XML quirks twice now. @Grace Lindqvist has the scrubbing script from the key rotation work.",
      reactions: [{ emoji: '👍', member: 'grace' }, { emoji: '👍', member: 'ana' }],
    },
    {
      author: 'grace', offset: -4.1, replyTo: 2,
      body: 'It\'s `scripts/scrub-saml-fixture.ts`. It replaces certificates, IDs and emails but keeps element order, which is the part that matters here.',
    },
    {
      author: 'priya', offset: -1.3,
      body: "Bumped to Urgent: the pilot's admin is blocked on rolling out to their second office. Is Friday realistic, or should we point them at SP-initiated sign-in for now?",
    },
    {
      author: ME, offset: -1.1,
      body: "Friday is realistic. Canonicalization is done and tests pass against all four provider fixtures, including the scrubbed one. I'd still send them the SP-initiated workaround today so they aren't waiting on our deploy.",
    },
  ]],
  ['eng-scim', [
    {
      author: 'marcus', offset: -18.2,
      body: 'Which of the three deals needs group mapping at launch, and which only need user provisioning? If only one needs groups, I\'d ship `/Users` first and follow with `/Groups`.',
    },
    {
      author: 'ana', offset: -17.9, replyTo: 0,
      body: 'Two of the three only need users. The third maps groups to teams and says it is a hard requirement for their 1,200-seat rollout. Agreed on sequencing: `/Users` is first in the sub-issues.',
      reactions: [{ emoji: '👍', member: 'marcus' }],
    },
    {
      author: 'ana', offset: -1.05,
      body: 'Status: `/Users` is merged. Deactivation is the long pole, because revoking mobile sessions needs a new server-to-app logout path; the apps cache refresh tokens. Groups hasn\'t started. Realistically GA moves by one sprint. @Priya Raman I\'ll post a check-in today.',
    },
  ]],
  ['eng-scim-groups', [
    {
      author: 'tomas', offset: -6.3,
      body: md(
        'Two options:',
        '',
        '1. **Auto-create** a team for every pushed group. Zero setup, but a large identity provider pushes hundreds of groups and the sidebar becomes unusable.',
        '2. **Explicit mapping.** Admins pick which groups map to which teams; unmapped groups are ignored.',
        '',
        "I'm leaning towards 2, with suggested mappings sorted by member count.",
      ),
    },
    {
      author: 'sofia', offset: -5.9, replyTo: 0,
      body: "+1 for explicit mapping. I can mock the mapping table this week. It's close to the pattern in the new permissions settings, so it shouldn't need any new components.",
    },
    {
      author: 'ana', offset: -2.2,
      body: 'Heads up that this should wait for deactivation to land: removing someone from a mapped group has to go through the same access-removal path.',
    },
  ]],
  ['eng-ghost-text', [
    {
      author: 'kenji', offset: -1.2,
      body: md(
        'Reviewed. The decoration approach is much cleaner than inserting a real text node. Two things:',
        '',
        '- During IME composition the suggestion renders over the composition underline. We should hide suggestions while `view.composing` is true.',
        '- The ghost text uses `--text-tertiary`, which is 2.9:1 on the dark theme.',
      ),
    },
    {
      author: ME, offset: -0.9, replyTo: 0,
      body: "Good catch on composition, fix pushed. On contrast: ghost text is meant to be quiet, but I don't want it failing checks. @Sofia Marin is there a token for this?",
    },
    {
      author: 'sofia', offset: -0.7, replyTo: 0,
      body: "Use `--text-placeholder`. It's 4.6:1 in both themes in the new tokens, and the search field already uses it, so it will read as \"not typed yet\".",
      reactions: [{ emoji: '❤️', member: 'kenji' }, { emoji: '👍', member: ME }],
    },
  ]],
  ['eng-inline-ai', [
    {
      author: 'marcus', offset: -9.8,
      body: 'For the private beta, can we launch with suggestions in paragraphs only (no tables, code blocks or headings)? Every beta customer asked about paragraphs; nobody asked about tables.',
    },
    {
      author: ME, offset: -9.5,
      body: "Yes, and it removes the hardest caret-mapping cases too. I'll gate suggestions on node type and add it to the beta FAQ.",
      reactions: [{ emoji: '🚀', member: 'marcus' }],
    },
    {
      author: 'tomas', offset: -0.3,
      body: 'Streaming is merged. First-token latency on the internal alpha is 420 ms at p50 and 900 ms at p95. Inside the 1-second budget, though only just on slow mobile connections.',
    },
  ]],
  ['eng-rate-limit', [
    {
      author: 'grace', offset: -2.6,
      body: 'Implementation looks right. My worry is memory: keying on workspace × endpoint × window is roughly 2M keys at peak. Could we key on workspace only and weight the expensive endpoints instead?',
    },
    {
      author: ME, offset: -2.3, replyTo: 0,
      body: 'Switched to one key per workspace with weighted costs: search and export cost 5, everything else 1. That brings it down to about 40k keys. PR updated.',
      reactions: [{ emoji: '🎉', member: 'grace' }],
    },
    {
      author: 'marcus', offset: -1.5,
      body: "Can we give the handful of workspaces already above the new limit a heads-up before this ships? I don't want their integrations to start failing without warning.",
    },
  ]],
  ['eng-search-permissions', [
    {
      author: 'tomas', offset: -6.1,
      body: 'Root cause: we index `viewer_ids` on each document and only refresh it in the nightly reindex. Sharing changes never enqueue a reindex. Two ways to fix it: enqueue a partial reindex on every access change, or check permissions at query time.',
    },
    {
      author: 'priya', offset: -5.8, replyTo: 0,
      body: "Query-time checks are the only option I'd trust for enterprise. Stale-until-reindex will fail a security review however short the window is. What does it cost in latency?",
    },
    {
      author: 'tomas', offset: -5.4, replyTo: 0,
      body: "About 25 ms at p95 with the permission cache warm. I'll check at query time and keep `viewer_ids` as a pre-filter so we aren't checking every candidate.",
      reactions: [{ emoji: '👍', member: 'priya' }, { emoji: '👍', member: 'ana' }],
    },
  ]],
  ['mob-sync-token-refresh', [
    {
      author: 'lukas', offset: -2.7,
      body: 'Reproduced on Android. When the access token expires mid-session, the sync client gets a `401`, refreshes the token, then drops the operations that were in flight instead of re-queuing them. The editor has already shown them as saved.',
    },
    {
      author: 'amara', offset: -2.5,
      body: 'iOS has the same bug in a different place: we clear the outbox on any non-retryable error, and `401` is marked non-retryable. It also affects offline replay, because reconnecting after a long gap always starts with a token refresh.',
    },
    {
      author: 'priya', offset: -2.3,
      body: 'Marking this Urgent. @Lukas Brenner please take the Android fix and @Amara Okafor the iOS side. Can we also add a server-side guard so clients can never drop operations the server has acknowledged?',
    },
    {
      author: 'lukas', offset: -0.8, replyTo: 2,
      body: 'Android fix is up in quillmark/android#452. Operations stay in the outbox until the server acknowledges them by sequence number, and a `401` is now retried once after the refresh. The server-side guard should be its own issue.',
      reactions: [{ emoji: '🚀', member: 'priya' }, { emoji: '🎉', member: 'amara' }],
    },
  ]],
  ['mob-ios-offline-edit', [
    {
      author: 'sofia', offset: -14.6,
      body: "Offline states are ready for review: a badge in the header, a quiet \"Saved on this device\" in place of \"Saved\", and a banner only when a merge actually fails. No modal, since people go offline mid-sentence.",
      reactions: [{ emoji: '❤️', member: 'amara' }, { emoji: '👍', member: 'priya' }],
    },
    {
      author: 'amara', offset: -14.2, replyTo: 0,
      body: "Love that the banner only shows on failure. One constraint: we won't know a merge failed until we reconnect, so the banner can appear minutes after the edit. Can it say which paragraph it's about?",
    },
    {
      author: 'sofia', offset: -13.8,
      body: 'Yes. Tapping the banner scrolls to the paragraph and highlights it for two seconds. The Figma file is updated.',
    },
  ]],
  ['des-menus', [
    {
      author: 'kenji', offset: -8.0,
      body: 'Question on the combobox: should Home and End move through the options, or the caret in the text input? The spec says options, but inside a text field people expect Home and End to move the caret.',
    },
    {
      author: 'sofia', offset: -7.6, replyTo: 0,
      body: 'The caret. Spec updated: Home and End stay in the input; Page Up and Page Down move the highlighted option by ten.',
    },
    {
      author: 'elena', offset: -3.0,
      body: "From last week's sessions: three of five participants tried to click the section headers in menus. Worth making headers visually lighter, or using dividers only.",
    },
  ]],
  ['des-ai-panel-review', [
    {
      author: 'sofia', offset: -3.8,
      body: 'Walkthrough video and Figma file are attached. The main open question is where the empty state points people: "Summarize this document" (safe and fast) or a free-form prompt (more flexible, more blank-page anxiety).',
    },
    {
      author: 'marcus', offset: -3.2,
      body: "Summarize. In the alpha it's the first thing 70% of people try, and it works on any document.",
    },
    {
      author: 'kenji', offset: -2.9,
      body: 'From the implementation side: the loading state shows a skeleton for the whole panel, but tokens stream in under a second, so the skeleton would flash and vanish. Could it just be a blinking caret?',
      reactions: [{ emoji: '😄', member: 'sofia' }, { emoji: '👍', member: ME }],
    },
  ]],
  ['eng-pasted-screenshots', [
    {
      author: 'kenji', offset: -0.5,
      body: 'Likely cause: if the paste happens while the upload socket is reconnecting, we keep the `blob:` URL in the document and never retry the upload. A refresh throws the blob away.',
    },
    {
      author: 'marcus', offset: -0.35,
      body: "That fits the ticket: both of them were on the same unreliable hotel network. I'll ask support for timestamps so we can check the reconnect logs.",
    },
  ]],
  ['eng-presence-flicker', [
    {
      author: 'kenji', offset: -3.0,
      body: 'Both clients broadcast presence on every keystroke and whichever message arrives last wins, so the cursor bounces between the two positions. Debouncing to 50 ms and ordering by logical clock fixes it.',
    },
    {
      author: 'sofia', offset: -1.5,
      body: 'Tested on two laptops side by side. No flicker at all now.',
      reactions: [{ emoji: '🎉', member: 'kenji' }],
    },
  ]],
  ['mob-offline-design', [
    {
      author: 'lukas', offset: -23.4,
      body: 'Agree with the recommendation. On Android the operation log fits neatly next to what we already store for undo, so storage cost will be lower than the estimate in the doc.',
    },
    {
      author: 'priya', offset: -21.0,
      body: "Approved. Let's make the operation format shared across both platforms from day one, so Android offline editing is mostly UI work. @Amara Okafor could you write it up as a short spec in the repo?",
      reactions: [{ emoji: '👍', member: 'amara' }, { emoji: '👍', member: 'lukas' }],
    },
  ]],
  ['eng-hybrid-ranking', [
    {
      author: 'tomas', offset: -10.4,
      body: 'Judgement set results are in the PR. The biggest wins are paraphrased queries; exact-title queries did not regress, because keyword scores still dominate when a title matches.',
      reactions: [{ emoji: '🚀', member: 'priya' }, { emoji: '🎉', member: ME }],
    },
    {
      author: 'marcus', offset: -9.0,
      body: "@Tomás Ortega can we turn this on for the three beta workspaces before GA? Their admins keep telling us search can't find things that are obviously there.",
    },
    {
      author: 'tomas', offset: -8.6, replyTo: 1,
      body: 'Enabled for all three this morning.',
    },
  ]],
  ['eng-scim-docs', [
    {
      author: 'marcus', offset: -8.9,
      body: 'Please include a troubleshooting section for the three errors support sees most: wrong base URL, expired token, and an email that doesn\'t match an existing member.',
    },
    {
      author: ME, offset: -8.5,
      body: "Will do. I'll write that part once deactivation behaviour settles, since it changes what admins see when someone leaves.",
    },
  ]],
  ['eng-enforce-sso', [
    {
      author: 'priya', offset: -13.2,
      body: '@Ana Petrova break-glass sign-ins need to be visible: every password sign-in while *Require SSO* is on should land in the audit log once it exists, and email all admins until then.',
    },
    {
      author: 'ana', offset: -12.9,
      body: "Agreed. I'll send the admin email from day one and add an audit event when the log ships.",
    },
  ]],
  ['mob-conflict-banner', [
    {
      author: 'amara', offset: -1.2,
      body: "Copy question for @Sofia Marin: \"Some changes couldn't be saved\" feels alarming when the changes are actually still on the device. Something closer to \"We couldn't merge a change\"?",
    },
    {
      author: 'sofia', offset: -0.9,
      body: 'How about **"One edit conflicts with a newer version"** with a *Review* button? It says what happened without implying anything was lost.',
      reactions: [{ emoji: '❤️', member: 'amara' }],
    },
  ]],
]);

// ---- Relations & attachments -----------------------------------------------

export const RELATIONS: RelationSeed[] = [
  { issue: 'eng-scim-deactivate', related: 'eng-scim-groups', type: 'blocks' },
  { issue: 'eng-scim-docs', related: 'eng-scim', type: 'blocked_by' },
  { issue: 'eng-saml-encrypted', related: 'eng-enforce-sso', type: 'blocks' },
  { issue: 'mob-replay-queue', related: 'mob-sync-token-refresh', type: 'blocked_by' },
  { issue: 'eng-audit-stream', related: 'eng-audit-schema', type: 'blocked_by' },
  { issue: 'eng-stream-completions', related: 'eng-ghost-text', type: 'blocks' },
  { issue: 'eng-shared-link-search', related: 'eng-search-permissions', type: 'duplicate_of' },
  { issue: 'eng-webhook-signature', related: 'eng-key-rotation', type: 'relates' },
  { issue: 'eng-redact-secrets', related: 'eng-prompt-injection', type: 'relates' },
  { issue: 'mob-ios-offline-edit', related: 'mob-android-offline-spike', type: 'relates' },
  { issue: 'des-ai-panel-review', related: 'eng-assistant-panel', type: 'relates' },
  { issue: 'des-menus', related: 'eng-cmdk-escape', type: 'relates' },
];

export const ATTACHMENTS: AttachmentSeed[] = [
  { issue: 'eng-hybrid-ranking', url: 'https://github.com/quillmark/api/pull/874', title: 'quillmark/api#874 Blend keyword and embedding scores', creator: 'tomas', offset: -10.6 },
  { issue: 'eng-scim-users', url: 'https://github.com/quillmark/api/pull/889', title: 'quillmark/api#889 SCIM /Users create, update and patch', creator: 'ana', offset: -5.0 },
  { issue: 'eng-scim-conformance', url: 'https://github.com/quillmark/api/pull/911', title: 'quillmark/api#911 Run SCIM conformance suite in CI', creator: 'grace', offset: -2.7 },
  { issue: 'eng-rate-limit', url: 'https://github.com/quillmark/api/pull/903', title: 'quillmark/api#903 Per-workspace sliding window rate limiter', creator: ME, offset: -2.8 },
  { issue: 'eng-stream-completions', url: 'https://github.com/quillmark/web/pull/2481', title: 'quillmark/web#2481 Stream assistant completions over the collab socket', creator: 'tomas', offset: -3.6 },
  { issue: 'eng-presence-flicker', url: 'https://github.com/quillmark/web/pull/2498', title: 'quillmark/web#2498 Debounce presence updates', creator: 'kenji', offset: -2.4 },
  { issue: 'eng-ghost-text', url: 'https://github.com/quillmark/web/pull/2517', title: 'quillmark/web#2517 Ghost-text decoration for inline suggestions', creator: ME, offset: -1.4 },
  { issue: 'eng-cmdk-escape', url: 'https://github.com/quillmark/web/pull/2522', title: 'quillmark/web#2522 Close nested menus on Escape before the palette', creator: 'kenji', offset: -0.8 },
  { issue: 'eng-saml-encrypted', url: 'https://quillmark.sentry.io/issues/4518327761/', title: 'SamlAssertionError: signature not found', creator: 'ana', offset: -7.8 },
  { issue: 'mob-sync-token-refresh', url: 'https://quillmark.sentry.io/issues/4520913388/', title: 'SyncWriteRejected (401) during token refresh', creator: 'lukas', offset: -2.75 },
  { issue: 'mob-sync-token-refresh', url: 'https://github.com/quillmark/android/pull/452', title: 'quillmark/android#452 Keep operations queued until acknowledged', creator: 'lukas', offset: -0.8 },
  { issue: 'mob-keyboard-composer', url: 'https://github.com/quillmark/android/pull/447', title: 'quillmark/android#447 Respect keyboard insets in the comment composer', creator: 'lukas', offset: -0.9 },
  { issue: 'mob-push-rollout', url: 'https://github.com/quillmark/android/pull/439', title: 'quillmark/android#439 Remove legacy push token storage', creator: 'lukas', offset: -9.6 },
  { issue: 'mob-op-queue', url: 'https://github.com/quillmark/ios/pull/612', title: 'quillmark/ios#612 Persist pending operations in SQLite', creator: 'amara', offset: -2.0 },
  { issue: 'mob-offline-badge', url: 'https://github.com/quillmark/ios/pull/618', title: 'quillmark/ios#618 Offline indicator in the document header', creator: 'amara', offset: -1.9 },
  { issue: 'des-color-tokens', url: 'https://www.figma.com/file/Xk4pQ9wLm2RtZ7vBn3HcJd/Color-Tokens', title: 'Color Tokens', creator: 'sofia', offset: -30.0 },
  { issue: 'des-buttons', url: 'https://www.figma.com/file/pT8sVn1KqW5eYh2LmZ6rAc/DS-2.0-Buttons', title: 'DS 2.0 — Buttons', creator: 'sofia', offset: -20.0 },
  { issue: 'des-menus', url: 'https://www.figma.com/file/bR3mJ7xN0cQe9WtK4sLh2V/DS-2.0-Menus-and-Combobox', title: 'DS 2.0 — Menus and combobox', creator: 'sofia', offset: -8.5 },
  { issue: 'des-ai-panel-review', url: 'https://www.figma.com/file/gH6wT2pZ8kYd1FqM5nXv3S/Assistant-Side-Panel', title: 'Assistant side panel', creator: 'sofia', offset: -3.85 },
  { issue: 'des-ai-panel-review', url: 'https://www.loom.com/share/4f9c2e7a1b8d4630a5e2c9f17b3d8e06', title: 'Walkthrough: assistant panel states', creator: 'sofia', offset: -3.82 },
];

// ---- Views & templates ------------------------------------------------------

const OPEN_STATES = ['intake', 'backlog', 'unstarted', 'started'];

export const VIEWS: ViewSeed[] = [
  {
    key: 'urgent-high', name: 'Urgent & high priority', description: 'Open urgent and high-priority work across every team.',
    icon: '🔥', color: '#D24A22', filters: { priorities: [1, 2], statusTypes: OPEN_STATES },
    grouping: 'team', ordering: 'priority', display: 'List',
  },
  {
    key: 'bugs-sprint', name: 'Bugs in current sprints', description: 'Every bug scheduled in an active sprint, by status.',
    icon: '🐛', color: '#BF8300', filters: { issueTypes: ['Bug'], sprintIds: ['active'] },
    grouping: 'status', ordering: 'priority', display: 'Board',
  },
  {
    key: 'blocked', name: 'Blocked work', description: 'Open issues waiting on another open issue.',
    icon: '⛔', color: '#B04FA6', filters: { relation: 'blocked', statusTypes: OPEN_STATES },
    grouping: 'assignee', ordering: 'priority', display: 'List',
  },
  {
    key: 'unestimated', name: 'Unestimated backlog', team: 'ENG', description: 'Backlog and planned work that still needs an estimate before sprint planning.',
    icon: '📐', color: '#3F76D0', filters: { teamKeys: ['ENG'], estimated: 'no', statusTypes: ['backlog', 'unstarted'] },
    grouping: 'project', ordering: 'created', display: 'List',
  },
  {
    key: 'customer-requests', name: 'Customer requests', description: 'Everything customers have asked for, grouped by team.',
    icon: '💬', color: '#2B86B8', filters: { labelKeys: ['customer'], statusTypes: OPEN_STATES },
    grouping: 'team', ordering: 'created', display: 'List',
  },
  {
    key: 'my-overdue', name: 'My overdue', description: 'Issues assigned to you that are past their due date.',
    icon: '⏰', color: '#8656C9', filters: { assigneeKeys: [ME], due: 'overdue' },
    grouping: 'none', ordering: 'due', display: 'List',
  },
  {
    key: 'design-reviews', name: 'Design reviews', team: 'DES', description: 'Design work in progress and waiting for feedback.',
    icon: '🖍️', color: '#B04FA6', filters: { teamKeys: ['DES'], statusTypes: ['started'] },
    grouping: 'status', ordering: 'updated', display: 'Board',
  },
];

export const TEMPLATES: TemplateSeed[] = [
  {
    name: 'Bug report', team: 'ENG', title: '', priority: 0, type: 'Bug', labels: ['bug'],
    description: md(
      '## Steps to reproduce',
      '1. ',
      '2. ',
      '3. ',
      '',
      '## Expected',
      '',
      '',
      '## Actual',
      '',
      '',
      '## Environment',
      '- Platform (web, iOS, Android):',
      '- App version:',
      '- Workspace:',
    ),
  },
  {
    name: 'Feature request', title: '', priority: 0, type: 'Feature', labels: ['feature'],
    description: md(
      '## Problem',
      "Who is affected, and what can't they do today?",
      '',
      '## Proposal',
      '',
      '',
      '## Acceptance criteria',
      '- [ ] ',
      '- [ ] ',
      '',
      '## Customer requests',
      'Link tickets or conversations.',
    ),
  },
  {
    name: 'Design request', team: 'DES', title: '', priority: 0, type: 'Task', labels: [],
    description: md(
      '## Context',
      "What's the problem, and who is it for?",
      '',
      '## What you need',
      '- [ ] Explorations',
      '- [ ] High-fidelity designs',
      '- [ ] Prototype for testing',
      '- [ ] Copy review',
      '',
      '## Constraints',
      'Platforms, deadlines, components that must be reused.',
      '',
      '## Links',
      '',
    ),
  },
  {
    name: 'Spike / investigation', team: 'ENG', title: 'Spike: ', priority: 3, estimate: 2, type: 'Spike', labels: [],
    description: md(
      '**Time-box:** 2 days',
      '',
      '## Questions to answer',
      '1. ',
      '2. ',
      '',
      '## Out of scope',
      '',
      '',
      '## Findings',
      '_Fill in before closing._',
      '',
      '## Recommendation',
      '',
    ),
  },
];

// ---- Inbox & pins for whoever opens the app ---------------------------

export const NOTIFICATIONS: NotificationSeed[] = [
  {
    type: 'commented', actor: 'tomas', issue: 'eng-inline-ai', name: 'Tomás Ortega commented on {issue}',
    body: 'Streaming is merged. First-token latency on the internal alpha is 420 ms at p50 and 900 ms at p95.', offset: -0.3, read: false,
  },
  {
    type: 'completed', actor: 'kenji', issue: 'eng-cmdk-escape', name: 'Kenji Watanabe completed {issue}',
    body: "Cmd+K palette doesn't close on Escape inside nested menus", offset: -0.4, read: false,
  },
  {
    type: 'intake', actor: 'marcus', issue: 'eng-pasted-screenshots', name: 'Marcus Bell added {issue} to Intake',
    body: 'Pasted screenshots disappear after refreshing the page', offset: -0.58, read: false,
  },
  {
    type: 'commented', actor: 'sofia', issue: 'eng-ghost-text', name: 'Sofia Marin replied on {issue}',
    body: "Use `--text-placeholder`. It's 4.6:1 in both themes in the new tokens.", offset: -0.7, read: false,
  },
  {
    type: 'check_in', actor: 'ana', project: 'sso', name: 'Ana Petrova posted a check-in on SSO & SCIM provisioning',
    body: 'Still At Risk. SCIM user provisioning is done, but deactivation and group mapping will push GA by about one sprint.', offset: -1.0, read: false,
  },
  {
    type: 'mentioned', actor: 'priya', issue: 'eng-saml-encrypted', name: 'Priya Raman mentioned you in {issue}',
    body: 'Is Friday realistic, or should we point them at SP-initiated sign-in for now?', offset: -1.3, read: false,
  },
  {
    type: 'blocked', actor: 'ana', issue: 'eng-scim-docs', name: 'Ana Petrova marked {issue} as blocked',
    body: 'Blocked by SCIM 2.0 provisioning for enterprise workspaces', offset: -1.9, read: true,
  },
  {
    type: 'check_in', actor: 'priya', project: 'offline', name: 'Priya Raman posted a check-in on Offline mode',
    body: 'Off Track: we found a sync bug that drops edits during token refresh, and fixing it comes before offline editing.', offset: -2.0, read: true,
  },
  {
    type: 'assigned', actor: 'marcus', issue: 'eng-accept-shortcuts', name: 'Marcus Bell assigned you {issue}',
    body: 'Tab to accept and Esc to dismiss a suggestion', offset: -2.48, read: true,
  },
  {
    type: 'commented', actor: 'grace', issue: 'eng-rate-limit', name: 'Grace Lindqvist commented on {issue}',
    body: 'Implementation looks right. My worry is memory: keying on workspace × endpoint × window is roughly 2M keys at peak.', offset: -2.6, read: true,
  },
  {
    type: 'completed', actor: 'tomas', issue: 'eng-stream-completions', name: 'Tomás Ortega completed {issue}',
    body: 'Stream completions over the collaboration websocket', offset: -2.8, read: true,
  },
  {
    type: 'intake', actor: 'priya', issue: 'eng-export-markdown', name: 'Priya Raman added {issue} to Intake',
    body: 'Export a whole workspace as Markdown with the folder structure intact', offset: -3.08, read: true,
  },
  {
    type: 'status_changed', actor: 'elena', issue: 'des-signup-interviews', name: 'Elena Voss moved {issue} to In Progress',
    body: 'Interview eight people who signed up in the last month', offset: -4.3, read: true,
  },
  {
    type: 'mentioned', actor: 'tomas', issue: 'eng-saml-encrypted', name: 'Tomás Ortega mentioned you in {issue}',
    body: "Before this merges, could we add the pilot customer's metadata (scrubbed) as a fixture?", offset: -4.6, read: true,
  },
];

export const PINS: PinSeed[] = [
  { entityType: 'Project', key: 'sso' },
  { entityType: 'Project', key: 'aiassist' },
  { entityType: 'View', key: 'urgent-high' },
  { entityType: 'Goal', key: 'ai' },
];
