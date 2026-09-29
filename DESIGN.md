# Issue Tracker: product and design brief

Issue Tracker is an issue tracker for product teams. It has the full capability set of a
modern tracker (intake, issues, sprints, projects, goals, roadmap, reports, views,
inbox, settings, AI assists) with **its own point of view**. It must never look or
feel like Linear. This file is the source of truth for how every screen looks and
behaves. Read it fully before writing UI.

---

## 1. Point of view

1. **Paper, ink and a highlighter.** Warm stone neutrals (not blue-grey), ink-black
   primary actions, a marigold *highlighter* for "you are here / selected / current",
   vermilion *signal* only for things asking for attention (unread, intake waiting).
2. **Words before glyphs.** Where there's room, statuses and priorities show their
   names next to their glyph. Icon-only rows are a last resort for narrow space.
3. **A ledger, not a feed.** Issue lists are real tables with column headers you can
   sort by, aligned cells you can edit in place, and group bands.
4. **Stay in flow.** Clicking an issue opens it in a sheet over the right of the page;
   J/K keep moving through the list behind it. Full page is one click away.
5. **Decide one thing at a time.** Intake is a review deck. Inbox is a two-pane reader.
6. **Scope, don't duplicate.** There is ONE Issues, Sprints, Projects, Roadmap and
   Reports. A team switcher in the top bar scopes them (`/eng/issues`, `/all/sprints`).
7. **Editorial calm.** Serif display type for page titles, big numbers and issue
   titles; generous whitespace around dense data; motion is quick and quiet.

### Never (the Linear tells)
- No left sidebar with nested team trees. Navigation is the top bar.
- No circular status rings, no 3-bar signal priority icons, no indigo/purple accent,
  no Inter, no all-grey monochrome UI, no headerless single-line icon rows.
- No shadcn default look (`bg-muted`, `text-muted-foreground`, `rounded-md border
  shadow-sm` cards) and no `@project/components/ui/*` or `@project/ui` imports.
- No lucide icons. Icons are Phosphor (`@phosphor-icons/react`).

---

## 2. Vocabulary (use exactly these words in UI copy)

| Concept | Issue Tracker word | Notes |
| --- | --- | --- |
| Inbound, unaccepted work | **Intake** | status type `intake`; the review deck at `/:scope/intake` |
| Time-boxed iteration | **Sprint** | per team; "Sprint 21"; the current one is "current sprint" |
| Company objective grouping projects | **Goal** | |
| Project status post that sets health | **Check-in** | "Post a check-in", "Latest check-in" |
| Workflow state | **Status** | status categories: Intake, Backlog, To do, In flight, Done, Canceled |
| Favorite | **Pin** | "Pin", "Unpin", "Pinned" |
| Analytics | **Reports** | |
| Sub-issues section | **Breakdown** | rows are still "sub-issues" |
| Project dates | Start → **Target** | |
| Saved filter set | **View** | |

Tone: plain, warm, specific. Sentence case everywhere ("New issue", not "New Issue").
Empty states say what the surface is for and give one next step.

---

## 3. Information architecture

Top bar (56px, on paper): **Logo + "Issue Tracker"** · **Scope switcher** (All teams / a team)
· **Home · Inbox · Issues · Sprints · Projects · Goals · Roadmap · Reports** · search
(⌘K) · **New issue** (C) · account menu (profile, settings, shortcuts, theme).
Below `lg` (1024px) the section links collapse into a menu button; between `lg` and `xl`
the wordmark hides and New issue shrinks to its icon so all eight links still fit.

| Route | Page | Owner |
| --- | --- | --- |
| `/home` | Today: greeting, focus strip, my in-flight work, up next, needs attention, sprint pulse, pinned, recent inbox | core |
| `/home/assigned` `/home/created` `/home/subscribed` | My issues tabs (IssuesView) | core |
| `/inbox` | two-pane reader | core |
| `/:scope/issues` `/:scope/issues/active` `/:scope/issues/backlog` | IssuesView + tabs incl. **Intake** link and saved views menu | core |
| `/:scope/intake` | Intake review deck, shares the Issues header and tab row (`IssuesTabs`) so the header never jumps between tabs | core |
| `/issue/:key` | full issue page | core |
| `/list?f=&title=` | ad-hoc filtered list (Reports drill-downs, "New view") | core |
| `/:scope/sprints`, `/sprint/:id` | sprints overview, sprint page | sprints agent |
| `/:scope/projects`, `/project/:id/:tab?` (`overview` default, `issues`, `check-ins`) | projects, project page | projects agent |
| `/goals`, `/goal/:id` | goals, goal page | goals+roadmap agent |
| `/:scope/roadmap` | timeline | goals+roadmap agent |
| `/:scope/reports` | reports | reports agent |
| `/views`, `/view/:id`, `/people/:id` | views directory, a view, a person | views agent |
| `/settings/:section/:itemId?` | general, members, teams (+ team detail tabs), labels, templates | settings agent |

`scope` is `all` or a lowercase team key. `useScope()` (`src/lib/scope.tsx`) returns
`{ key, team, to(section, rest?) }`. A scoped page reads `scope.team` (null = all teams).
Pages about a single team call `useContextTeam(teamId)` so New issue defaults to it.

Keyboard: `⌘K` palette · `C` new issue · `/` search in view · `?` shortcuts ·
`[` `]` cycle team scope · `⌘,` settings · `G` then `H` home, `M` my issues, `N` inbox,
`I` issues, `T` intake, `S` sprints, `P` projects, `O` goals, `R` roadmap, `E` reports,
`V` views.

---

## 4. Layout

- The shell is `h-dvh` with the top bar and a scrolling `<main id="main">`. Pages
  scroll inside main. Use `sticky top-0` for in-page sticky headers.
- Every page: `<PageHeader eyebrow title description actions tabs />` then
  `<PageBody>`. Horizontal padding is `px-4 sm:px-7`.
- Section landing pages reached from the top bar (Home, Inbox, Issues, Sprints,
  Projects, Roadmap, Reports, Views) are full width, so the title never shifts
  sideways when you move between sections. Reading pages (settings, a goal, a
  project overview) may center at `max-w-[1120px]` (`<PageBody narrow>`).
- A tab row never changes the page header above it: tabs swap the content below,
  not the title.
- Content sits in **cards** on the paper ground: `<Card>` (white, 12px radius,
  hairline border). Nested panels inside cards use `bg-sunken` wells, not more borders.
- Right-hand "facts" columns are 300–340px cards, not borderless rails.
- Mobile (<640px) must work: stack columns, tables become stacked rows, dialogs are
  near full width, hover-only actions get a visible `⋯` button.

---

## 5. Tokens (Tailwind class names)

Surfaces: `bg-paper` (app ground) · `bg-card` (cards, sheets, popovers) ·
`bg-sunken` (wells, table header, board lanes, keyboard-active menu item) ·
`bg-hover` (hover) · `bg-pressed` (pressed / selected nav).
Lines: `border-line` (hairlines) · `border-line-strong` (dividers on paper, secondary
buttons) · `border-control` (inputs; use `/60`).
Text: `text-ink` · `text-ink-2` (secondary) · `text-ink-3` (tertiary, meta, placeholders).
Never fade text with opacity modifiers (`text-ink/50`); use ink-2/ink-3.
Accents: `bg-primary text-on-primary` (ink buttons) · `bg-highlight text-highlight-ink`
(marigold; selection, current, counts on active tabs) · `text-signal`/`bg-signal`
(unread, attention) · tones `success warning danger info violet` for text, and
`bg-<tone>/10` washes for badges. Selection wash on rows: `bg-highlight/25`
(dark: `dark:bg-highlight/10`).

Type scale: `text-micro` (11, uppercase labels with `uppercase font-semibold text-ink-3`),
`text-meta` (12), `text-ui` (13, dense UI, tables, menus), `text-body` (14, prose,
inputs in forms), `text-title` (15 semibold, card/section titles),
`font-display text-display-sm` (24 serif: dialog titles, issue title in sheet,
empty-state headlines), `font-display text-display` (32 serif: page titles),
`font-display text-display-lg` (44 serif: hero numbers, home greeting).
Numbers in tables/stats: add `tabular`. Issue keys: `font-mono text-[11.5px] text-ink-3`.

Radii: `rounded-xs` 4 (chips, keycaps) · `rounded-sm` 6 (menu items, small buttons) ·
`rounded-md` 8 (buttons, inputs) · `rounded-lg` 12 (cards, popovers) · `rounded-xl` 16
(dialogs, sheet) · `rounded-full` (people, pills, counts).
Shadows: `shadow-hairline` (buttons/cards) · `shadow-raised` (hovered card, active
segment) · `shadow-pop` (popovers, dialogs) · `shadow-sheet` (issue sheet).
Motion: `animate-pop-in` (popovers), `animate-rise-in` (content appearing),
`animate-sheet-in`, `animate-dialog-in`, `animate-bar-in` (bulk bar), `animate-deck-in`.

The highlighter stroke: wrap a short word in `<span className="hl">` to underline it
with marigold (active nav item, the one key number in a sentence). Use sparingly:
at most one per region.

---

## 6. The kit (`src/ui`, `src/glyphs`, `src/pickers`, `src/editor`)

Import by relative path. Do not modify kit files from a feature; if you need a
primitive that doesn't exist, build it inside your feature folder and mention it in
your report.

- `ui/cn`: `cn(...)` (tailwind-merge that knows the custom type scale).
- `ui/Button`: `<Button variant="primary|secondary|ghost|quiet|danger|highlight|link" size="xs|sm|md|lg" icon leading trailing shortcut loading asChild>`.
  One `primary` per screen region. Toolbar buttons are `ghost size="sm"`. Icon-only
  buttons need `icon` + `aria-label` (wrap in `Tooltip`).
- `ui/Kbd`: `<Kbd keys="mod+enter" />`, `<Kbd keys="G I" />`, or `<Kbd>C</Kbd>`.
- `ui/Tooltip`: `<Tooltip content="Pin" shortcut="mod+.">child</Tooltip>`.
- `ui/Popover`: `Popover, PopoverTrigger, PopoverContent` (already styled).
- `ui/Menu`: dropdown: `Menu, MenuTrigger, MenuContent, MenuItem(icon, shortcut, hint, destructive), MenuCheckboxItem, MenuRadioGroup, MenuRadioItem, MenuLabel, MenuSeparator, MenuSub, MenuSubTrigger, MenuSubContent`; context menu equivalents `ContextMenu*`.
- `ui/Dialog`: `Dialog, DialogContent(size sm|md|lg|xl, label), DialogHeader(title, description), DialogBody, DialogFooter(start)`, `ConfirmDialog`. For confirmations prefer `useAppActions().confirm({...})`.
- `ui/Form`: `Input, Textarea(minRows, bare), Field(label, hint, error), SearchField, Switch, Checkbox, Segmented`.
- `ui/Tabs`: `<Tabs items=[{value,label,count,to?}] value onChange end />` (underline tabs; `to` makes router links).
- `ui/Avatar`: `Avatar(person,size)`, `Unassigned`, `AvatarStack(people,max)`.
- `ui/Chip`: `Badge(tone, dot, icon)`, `Count(tone)`, `LabelChip(name,color)`, `Swatch`.
- `ui/Progress`: `ProgressBar(value,max | segments[], tone, height)`, `ProgressRing(value,size)`.
- `ui/Layout`: `PageHeader, PageBody(narrow), Card(padded), Section(title,count,action,description), Eyebrow, Skeleton, ListSkeleton, EmptyState(icon,title,actions,compact), FactRow(label)`.
- `ui/Calendar`: styled react-day-picker.
- `glyphs`: `StatusGlyph(status, siblings)`, `PriorityGlyph(priority)`, `TypeGlyph(type)`,
  `HealthPill(health, compact)`, `HEALTH`, `Mark(icon,color,name,size)` for teams/projects,
  `GoalMark`, `SprintGlyph(progress,status)`, `Logo`, `GlyphLabel`.
- `pickers/pickers`: `StatusPicker, PriorityPicker, AssigneePicker, LabelPicker, ProjectPicker, MilestonePicker, SprintPicker, EstimatePicker, TypePicker, TeamPicker, MemberMultiPicker, DatePicker, IssueSearchPicker`; `pickers/OptionPicker` for custom ones. All take `value onChange trigger` (+ `open onOpenChange align`).
- `editor/RichEditor` (Markdown in/out, ⌘↵ submit), `editor/MarkdownView` (renders
  @mentions and issue keys), `editor/MentionComposer` (comment box).
- `issues/IssuesView`: the one issue list/board for any surface. Props:
  `surfaceKey, baseFilters, lockedFields?, teamId?, defaults?, defaultFilters?,
  createDefaults?, emptyState?, savedView?, hideSaveView?, toolbarStart?, className?, fill?`.
- `lib/*`: `useWorkspace()` (every reference table indexed: `teamById, memberById,
  statusById, statusesByTeam, labelById, projectById, milestonesByProject, sprintById,
  sprintsByTeam, goalById, viewById, activeSprint(teamId), statusFor(teamId,type), labelsFor,
  membersFor, isPinned(type,id)`), `queries.ts` (react-query hooks + `qk` keys),
  `mutations.ts` (`useIssueActions()` optimistic writes, `usePinToggle()`),
  `app-actions.tsx` (`useAppActions()`: `openCreateIssue(defaults)`, `openPeek(id)`,
  `confirm(opts)`, `openPalette`), `format.ts` (`timeAgo, shortDate, dueLabel, plural,
  percent`), `constants.ts`, `errors.ts` (`errorMessage(e, fallback)`), `clipboard.ts`.

---

## 7. Patterns

**Page header.** Eyebrow = where this belongs (team mark + name, or breadcrumb
"Projects ›"), serif title, one-line description in ink-2, actions right (one
primary). Tabs underneath with counts.

**Cards and sections.** A section title is `text-title font-semibold` with a count
in ink-3 and an action on the right. Don't stack more than two levels of boxes.

**Tables** (projects list, members, workload…): header row `bg-sunken` with
`text-micro uppercase font-semibold text-ink-3`, rows 40px `text-ui`, hairline
separators, row hover `bg-hover/60`, the name column first and flexible. Sortable
headers show a caret. On mobile, collapse to stacked rows.

**Inline editing.** A property value is a button that opens its picker
(`rounded-sm px-1.5 hover:bg-hover`). Show a value's name + glyph; when empty show the
action in ink-3 ("Set target", "Add label"). Titles edit in place (Enter saves, Esc
reverts).

**Writes.** Optimistic by default: patch the cache, call the endpoint, roll back and
`toast.error(errorMessage(e, 'Couldn’t …'))` on failure, then invalidate. Success
toasts only when the result isn't visible on screen, and include Undo for
destructive/reversible actions.

**Dates.** Relative for recent activity (`timeAgo`), `shortDate` for dates,
`dueLabel` for due dates (overdue in `text-danger`, soon in `text-warning`).

**Charts** (recharts): ink for the primary series, highlighter marigold for the
"now/current" emphasis, `line-strong` gridlines (dashed), tones for semantic series
(success = done, warning = in flight, info = scope). Tooltips are ink panels with
on-primary text (same as `Tooltip`). No chart gradients.

**Empty states.** `EmptyState` with a Phosphor icon (size 22, weight "duotone"),
serif headline, one sentence, one action.

**Loading.** Skeletons shaped like the content. Never a lone spinner for a page.

**Destructive actions.** Always `confirm({ title, description, confirmLabel, destructive: true })`.

**Dark mode.** Everything uses tokens, so it works. Check both themes before
calling a surface done.

**Accessibility.** Buttons are buttons; icon buttons have `aria-label`; focus rings
are visible (don't remove outlines); color is never the only signal.

---

## 8. Data rules (the backend already exists; read before calling endpoints)

- Endpoints live in `apps/issue-tracker/src/api/*` and are imported from `zitejs/api`.
  Server helpers in `src/server/*`. Seed in `src/seed/*`; it only runs when an admin
  presses Load sample data in Settings → General, never on its own.
- Rows carry **ids**; resolve names from `useWorkspace()`.
- Foreign keys are text columns; an unset text is `''` → mapped to `null` on the way
  out. SQL joins cast the uuid side (`t.id::text = i."teamId"`).
- The actor always comes from the session (`getActor(context)`); never send an actor id.
- Roles (`Admin | Member | Guest`) are enforced server-side via `assertCan`; mirror
  them in UI by disabling with an explanation, not hiding.
