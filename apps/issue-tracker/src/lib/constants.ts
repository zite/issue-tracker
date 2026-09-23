import type { IssueType, StatusType } from './types';

/**
 * Priority is stored as a number where URGENCY IS LOW and 0 means "none" — so
 * "none" must sort last everywhere despite being the smallest value.
 */
export const PRIORITIES = [
  { value: 1, label: 'Urgent', shortcut: '1' },
  { value: 2, label: 'High', shortcut: '2' },
  { value: 3, label: 'Medium', shortcut: '3' },
  { value: 4, label: 'Low', shortcut: '4' },
  { value: 0, label: 'No priority', shortcut: '0' },
] as const;

export const PRIORITY_LABEL: Record<number, string> = { 0: 'No priority', 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' };
export const priorityRank = (p: number) => (p === 0 ? 99 : p);

export const STATUS_TYPES: StatusType[] = ['intake', 'backlog', 'unstarted', 'started', 'completed', 'canceled'];
export const STATUS_TYPE_LABEL: Record<string, string> = {
  intake: 'Intake', backlog: 'Backlog', unstarted: 'To do', started: 'In flight', completed: 'Done', canceled: 'Canceled',
};
export const OPEN_STATUS_TYPES: StatusType[] = ['intake', 'backlog', 'unstarted', 'started'];
export const isOpenType = (t: string | null | undefined) => !t || OPEN_STATUS_TYPES.includes(t as StatusType);
export const isDoneType = (t: string | null | undefined) => t === 'completed' || t === 'canceled';

export const ISSUE_TYPES: IssueType[] = ['Feature', 'Bug', 'Improvement', 'Task', 'Spike', 'Chore'];

export const ESTIMATE_SCALES: Record<string, Array<{ value: number; label: string }>> = {
  fibonacci: [1, 2, 3, 5, 8, 13].map(v => ({ value: v, label: `${v} point${v === 1 ? '' : 's'}` })),
  linear: [1, 2, 3, 4, 5].map(v => ({ value: v, label: `${v} point${v === 1 ? '' : 's'}` })),
  exponential: [1, 2, 4, 8, 16].map(v => ({ value: v, label: `${v} point${v === 1 ? '' : 's'}` })),
  tshirt: [
    { value: 1, label: 'XS' }, { value: 2, label: 'S' }, { value: 3, label: 'M' }, { value: 5, label: 'L' }, { value: 8, label: 'XL' },
  ],
  none: [],
};

export const ESTIMATE_SCALE_LABEL: Record<string, string> = {
  fibonacci: 'Fibonacci', linear: 'Linear', exponential: 'Exponential', tshirt: 'T-shirt sizes', none: 'Not used',
};

export function estimateLabel(value: number | null | undefined, scale = 'fibonacci', short = false) {
  if (value == null) return null;
  if (scale === 'tshirt') return ESTIMATE_SCALES.tshirt.find(e => e.value === value)?.label ?? String(value);
  return short ? String(value) : `${value} pt${value === 1 ? '' : 's'}`;
}

export const PROJECT_STATUSES = ['Backlog', 'Planned', 'In Progress', 'Paused', 'Completed', 'Canceled'] as const;
export const PROJECT_HEALTH = ['On Track', 'At Risk', 'Off Track'] as const;
export const GOAL_STATUSES = ['Planned', 'Active', 'Completed'] as const;

export const GROUPINGS = [
  { value: 'status', label: 'Status' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'priority', label: 'Priority' },
  { value: 'project', label: 'Project' },
  { value: 'sprint', label: 'Sprint' },
  { value: 'label', label: 'Label' },
  { value: 'team', label: 'Team' },
  { value: 'type', label: 'Type' },
  { value: 'none', label: 'No grouping' },
] as const;
export type Grouping = (typeof GROUPINGS)[number]['value'];

export const ORDERINGS = [
  { value: 'manual', label: 'Manual' },
  { value: 'priority', label: 'Priority' },
  { value: 'updated', label: 'Last updated' },
  { value: 'created', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'due', label: 'Due date' },
  { value: 'estimate', label: 'Estimate' },
  { value: 'status', label: 'Status' },
  { value: 'identifier', label: 'ID' },
  { value: 'title', label: 'Title' },
] as const;
export type Ordering = (typeof ORDERINGS)[number]['value'];

export const DISPLAY_PROPERTIES = [
  { key: 'identifier', label: 'ID' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'labels', label: 'Labels' },
  { key: 'project', label: 'Project' },
  { key: 'milestone', label: 'Milestone' },
  { key: 'sprint', label: 'Sprint' },
  { key: 'estimate', label: 'Estimate' },
  { key: 'dueDate', label: 'Due' },
  { key: 'type', label: 'Type' },
  { key: 'links', label: 'Links' },
  { key: 'subIssues', label: 'Sub-issues' },
  { key: 'created', label: 'Created' },
  { key: 'updated', label: 'Updated' },
] as const;
export type DisplayProperty = (typeof DISPLAY_PROPERTIES)[number]['key'];

export const REACTIONS = ['👍', '❤️', '🎉', '😄', '👀', '🚀', '🙏', '💯'] as const;

/** Swatches tuned to sit on paper and on charcoal — for labels, projects, teams and goals. */
export const SWATCHES = [
  '#8A8275', '#5F6B7A', '#D24A22', '#DF7422', '#BF8300', '#8D9A2E', '#2E9460', '#1F8A86',
  '#2B86B8', '#3F76D0', '#5B5FD0', '#8656C9', '#B04FA6', '#D0487A', '#A0563A', '#6E7F5C',
];

export const PROJECT_ICONS = ['📐', '🚀', '🔐', '🔎', '📱', '✨', '🎨', '💳', '📈', '🧭', '🛠️', '⚡', '🌍', '🧪', '📦', '🤖', '🗂️', '🧱', '🎯', '📣'];
export const TEAM_ICONS = ['⚙️', '📱', '🎨', '🧭', '🛡️', '📊', '🧪', '🌐', '💬', '🚚', '🔬', '🏗️'];
export const VIEW_ICONS = ['📌', '🔥', '🐛', '🧊', '⏳', '🎯', '🚦', '🧹', '🧑‍💻', '📬', '🗓️', '⭐'];
