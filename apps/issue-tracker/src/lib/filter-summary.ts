import { OPEN_STATUS_TYPES, PRIORITY_LABEL, STATUS_TYPE_LABEL, priorityRank } from './constants';
import type { IssueFilters, SavedView } from './types';
import type { Workspace } from './workspace';

/**
 * Saved filters, in words.
 *
 * A saved view stores raw ids and tokens (`__me__`, `active`, `none`). People
 * read it as clauses: "Assignee · Me", "Priority · Urgent, High", "Sprint ·
 * Current". Each clause carries a chip form (field + values) and a sentence
 * form ("Priority is Urgent or High") so a card, a tooltip or a save dialog can
 * pick whichever fits.
 */

export type FilterClause = {
  key: keyof IssueFilters;
  /** The field, sentence case: "Assignee". */
  field: string;
  /** Resolved names in display order: ["Me", "Tomás Ortega"]. */
  values: string[];
  /** "Priority is Urgent or High" / "Overdue". */
  sentence: string;
};

type Names = Pick<Workspace, 'teamById' | 'memberById' | 'statusById' | 'labelById' | 'projectById' | 'milestoneById' | 'sprintById' | 'goalById'>;

const DUE: Record<string, [chip: string, sentence: string]> = {
  overdue: ['Overdue', 'Overdue'],
  today: ['Today', 'Due today'],
  week: ['Within a week', 'Due within a week'],
  month: ['Within a month', 'Due within a month'],
  any: ['Has a date', 'Has a due date'],
  none: ['No date', 'No due date'],
};

const RELATION: Record<string, [string, string]> = {
  blocked: ['Blocked', 'Blocked by open work'],
  blocking: ['Blocking', 'Blocking other work'],
  any: ['Any', 'Has a relation'],
};

const ORDER_PHRASE: Record<string, string> = {
  manual: 'Manual order',
  priority: 'Priority order',
  due: 'Soonest due first',
  created: 'Newest first',
  oldest: 'Oldest first',
  updated: 'Recently updated first',
  title: 'By title',
  estimate: 'Largest estimate first',
  status: 'Status order',
  identifier: 'By ID',
};

const GROUP_NOUN: Record<string, string> = {
  status: 'status', assignee: 'assignee', priority: 'priority', project: 'project', sprint: 'sprint',
  label: 'label', team: 'team', type: 'type',
};

const joinOr = (values: string[]) =>
  values.length <= 1 ? values[0] ?? '' : `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}`;

const daysPhrase = (n: number) => (n === 1 ? 'the last day' : n === 7 ? 'the last week' : n === 14 ? 'the last 2 weeks' : n === 30 ? 'the last month' : `the last ${n} days`);

function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every(v => b.includes(v));
}

/** Resolve a list of ids to names; ids that no longer exist read as "a removed …". */
function names(ids: Array<string | number>, lookup: (id: string) => string | undefined, special: Record<string, string>, noun: string) {
  const out: string[] = [];
  let missing = 0;
  for (const raw of ids) {
    const id = String(raw);
    if (special[id]) out.push(special[id]);
    else {
      const name = lookup(id);
      if (name) out.push(name);
      else missing += 1;
    }
  }
  if (missing) out.push(missing === 1 ? `a removed ${noun}` : `${missing} removed ${noun}s`);
  return [...new Set(out)];
}

export function describeFilters(filters: IssueFilters, ws: Names, opts: { omit?: Array<keyof IssueFilters> } = {}): FilterClause[] {
  const f = filters as Record<string, unknown>;
  const omit = new Set(opts.omit ?? []);
  const clauses: FilterClause[] = [];
  const list = (key: keyof IssueFilters) => {
    const v = f[key];
    return Array.isArray(v) && v.length && !omit.has(key) ? (v as Array<string | number>) : null;
  };
  const push = (key: keyof IssueFilters, field: string, values: string[], sentence?: string) => {
    if (!values.length) return;
    clauses.push({ key, field, values, sentence: sentence ?? `${field} is ${joinOr(values)}` });
  };
  const person = (id: string) => ws.memberById.get(id)?.name;

  const teams = list('teamIds');
  if (teams) push('teamIds', 'Team', names(teams, id => ws.teamById.get(id)?.name, {}, 'team'));

  const statusIds = list('statusIds');
  if (statusIds) push('statusIds', 'Status', names(statusIds, id => ws.statusById.get(id)?.name, {}, 'status'));

  const statusTypes = list('statusTypes')?.map(String);
  if (statusTypes) {
    if (sameSet(statusTypes, OPEN_STATUS_TYPES)) push('statusTypes', 'Status', ['Open'], 'Still open');
    else if (sameSet(statusTypes, ['backlog', 'unstarted', 'started'])) push('statusTypes', 'Status', ['Accepted, not done'], 'Accepted and not done');
    else {
      const order = Object.keys(STATUS_TYPE_LABEL);
      const sorted = [...statusTypes].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      push('statusTypes', 'Status', sorted.map(t => STATUS_TYPE_LABEL[t] ?? t));
    }
  }

  const assignees = list('assigneeIds');
  if (assignees) push('assigneeIds', 'Assignee', names(assignees, person, { __me__: 'Me', none: 'No one' }, 'person'));

  const creators = list('creatorIds');
  if (creators) push('creatorIds', 'Creator', names(creators, person, { __me__: 'Me' }, 'person'));

  const priorities = list('priorities');
  if (priorities) {
    const sorted = [...new Set(priorities.map(Number))].sort((a, b) => priorityRank(a) - priorityRank(b));
    push('priorities', 'Priority', sorted.map(p => PRIORITY_LABEL[p] ?? String(p)));
  }

  const types = list('issueTypes');
  if (types) push('issueTypes', 'Type', types.map(String));

  const sprints = list('sprintIds');
  if (sprints) {
    const values = names(
      sprints,
      id => {
        const s = ws.sprintById.get(id);
        if (!s) return undefined;
        const team = s.teamId ? ws.teamById.get(s.teamId) : undefined;
        return team ? `${team.key} ${s.name}` : s.name;
      },
      { active: 'Current', upcoming: 'Next', none: 'Unscheduled' },
      'sprint',
    );
    push('sprintIds', 'Sprint', values, `Sprint is ${joinOr(values.map(v => (v === 'Current' || v === 'Next' || v === 'Unscheduled' ? v.toLowerCase() : v)))}`);
  }

  const projects = list('projectIds');
  if (projects) push('projectIds', 'Project', names(projects, id => ws.projectById.get(id)?.name, { none: 'No project' }, 'project'));

  const goals = list('goalIds');
  if (goals) push('goalIds', 'Goal', names(goals, id => ws.goalById.get(id)?.name, {}, 'goal'));

  const milestones = list('milestoneIds');
  if (milestones) push('milestoneIds', 'Milestone', names(milestones, id => ws.milestoneById.get(id)?.name, {}, 'milestone'));

  const labels = list('labelIds');
  if (labels) {
    const values = names(labels, id => ws.labelById.get(id)?.name, { none: 'No label' }, 'label');
    push('labelIds', 'Label', values, values.length > 1 ? `Label is any of ${values.join(', ')}` : undefined);
  }

  const subscribers = list('subscriberIds');
  if (subscribers) push('subscriberIds', 'Subscriber', names(subscribers, person, { __me__: 'Me' }, 'person'));

  if (typeof f.due === 'string' && !omit.has('due')) {
    const [chip, sentence] = DUE[f.due] ?? [f.due, `Due ${f.due}`];
    push('due', 'Due', [chip], sentence);
  }
  if (typeof f.estimated === 'string' && !omit.has('estimated')) {
    push('estimated', 'Estimate', [f.estimated === 'yes' ? 'Set' : 'Missing'], f.estimated === 'yes' ? 'Estimated' : 'Not estimated');
  }
  if (typeof f.relation === 'string' && !omit.has('relation')) {
    const [chip, sentence] = RELATION[f.relation] ?? [f.relation, f.relation];
    push('relation', 'Relation', [chip], sentence);
  }
  if (typeof f.createdWithinDays === 'number' && !omit.has('createdWithinDays')) {
    push('createdWithinDays', 'Created', [`Last ${f.createdWithinDays}d`], `Created in ${daysPhrase(f.createdWithinDays)}`);
  }
  if (typeof f.completedWithinDays === 'number' && !omit.has('completedWithinDays')) {
    push('completedWithinDays', 'Completed', [`Last ${f.completedWithinDays}d`], `Completed in ${daysPhrase(f.completedWithinDays)}`);
  }
  if (typeof f.search === 'string' && f.search.trim() && !omit.has('search')) {
    push('search', 'Matches', [`“${f.search.trim()}”`], `Matches “${f.search.trim()}”`);
  }
  if (f.topLevelOnly && !omit.has('topLevelOnly')) push('topLevelOnly', 'Sub-issues', ['Hidden'], 'Top-level issues only');
  if (f.includeArchived && !omit.has('includeArchived')) push('includeArchived', 'Archived', ['Included'], 'Including archived');

  return clauses;
}

/** "Assignee is Me · Priority is Urgent or High · Sprint is current", or "All issues". */
export function filterSentence(clauses: FilterClause[]) {
  return clauses.length ? clauses.map(c => c.sentence).join(' · ') : 'All issues';
}

/** A chip's text: "Priority · Urgent, High", trimmed to two names with a count for the rest. */
export function clauseChip(clause: FilterClause, maxValues = 2) {
  const shown = clause.values.slice(0, maxValues).join(', ');
  const rest = clause.values.length - maxValues;
  return { field: clause.field, value: rest > 0 ? `${shown} +${rest}` : shown };
}

/** "Grouped by status · Priority order" (lists) or "Columns by status · Newest first" (boards). */
export function layoutSentence(view: Pick<SavedView, 'display' | 'grouping' | 'ordering'>) {
  const board = view.display === 'Board';
  // A board always has columns; with no grouping saved it lays out by status.
  const noun = GROUP_NOUN[view.grouping] ?? (board ? 'status' : undefined);
  const grouping = noun ? `${board ? 'Columns' : 'Grouped'} by ${noun}` : 'Ungrouped';
  return `${grouping} · ${ORDER_PHRASE[view.ordering] ?? 'Manual order'}`;
}
