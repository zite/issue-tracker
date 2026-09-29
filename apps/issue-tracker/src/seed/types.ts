/**
 * Shapes for the sample workspace, which an admin loads from Settings → General.
 *
 * Every relationship is written as a KEY into another list, never an id — ids
 * do not exist until the seed endpoint inserts the rows. Dates are DAY OFFSETS
 * from the moment of seeding (negative = past), so a sample loaded months
 * from now still has a sprint in flight and believable overdue work.
 *
 * `ME` stands for the admin who loads the sample. The seed endpoint rewrites it
 * to that person's member id, so they land on real work in "My issues" and an
 * inbox with something in it.
 */

export const ME = '__me__';
export type MemberRef = string; // a MemberSeed key, or ME

export type StateKey = 'intake' | 'backlog' | 'todo' | 'progress' | 'review' | 'done' | 'canceled';
export type IssueType = 'Feature' | 'Bug' | 'Improvement' | 'Task' | 'Spike' | 'Chore';

export type TeamSeed = {
  key: string; // also used as the identifier prefix, e.g. ENG
  name: string;
  description: string;
  icon: string; // a single emoji
  color: string; // hex
  sprintsEnabled: boolean;
  sprintDurationWeeks: number;
  intakeEnabled: boolean;
  estimateScale: 'fibonacci' | 'linear' | 'exponential' | 'tshirt' | 'none';
};

export type MemberSeed = {
  key: string;
  name: string;
  email: string; // use the reserved .test TLD
  jobTitle: string;
  role: 'Admin' | 'Member' | 'Guest';
  color: string;
  teams: string[]; // TeamSeed keys
};

export type LabelSeed = { key: string; name: string; color: string; description: string; team?: string };

export type GoalSeed = {
  key: string; name: string; summary: string; description: string;
  status: 'Planned' | 'Active' | 'Completed'; owner: MemberRef; icon: string; color: string; targetOffset: number | null;
};

export type ProjectSeed = {
  key: string; name: string; summary: string; description: string; // Markdown
  status: 'Backlog' | 'Planned' | 'In Progress' | 'Paused' | 'Completed' | 'Canceled';
  health: 'On Track' | 'At Risk' | 'Off Track' | 'Unknown';
  lead: MemberRef; team: string; goal?: string; priority: 0 | 1 | 2 | 3 | 4;
  icon: string; color: string; startOffset: number | null; targetOffset: number | null; completedOffset?: number;
};

export type MilestoneSeed = { key: string; project: string; name: string; description: string; targetOffset: number };

export type CheckInSeed = { project: string; author: MemberRef; health: 'On Track' | 'At Risk' | 'Off Track'; body: string; offset: number };

export type SprintSeed = { key: string; team: string; number: number; startOffset: number; endOffset: number; goal: string | null; completed?: boolean };

export type IssueSeed = {
  key: string;
  team: string;
  title: string;
  description?: string; // Markdown
  state: StateKey;
  priority: 0 | 1 | 2 | 3 | 4; // 0 none, 1 urgent, 2 high, 3 medium, 4 low
  estimate?: number;
  type: IssueType;
  assignee?: MemberRef;
  creator: MemberRef;
  project?: string;
  milestone?: string;
  sprint?: string;
  parent?: string; // IssueSeed key
  labels?: string[];
  openedOffset: number;
  startedOffset?: number;
  completedOffset?: number;
  canceledOffset?: number;
  dueOffset?: number;
};

export type CommentSeed = {
  issue: string;
  author: MemberRef;
  body: string; // Markdown; mention people as @First Last
  offset: number;
  /** Index into COMMENTS of the root comment this replies to. */
  replyTo?: number;
  reactions?: Array<{ emoji: string; member: MemberRef }>;
};

export type RelationSeed = { issue: string; related: string; type: 'blocks' | 'blocked_by' | 'relates' | 'duplicate_of' };

export type AttachmentSeed = { issue: string; url: string; title: string; creator: MemberRef; offset: number };

/** Filters use keys; the endpoint resolves them into the ids `listIssues` filters on. */
export type ViewFilterSeed = {
  teamKeys?: string[];
  statusTypes?: string[];
  assigneeKeys?: MemberRef[]; // 'none' allowed
  priorities?: number[];
  issueTypes?: IssueType[];
  projectKeys?: string[];
  labelKeys?: string[];
  sprintIds?: Array<'active' | 'upcoming' | 'none'>;
  due?: 'overdue' | 'today' | 'week' | 'month' | 'none' | 'any';
  relation?: 'blocked' | 'blocking' | 'any';
  estimated?: 'yes' | 'no';
};

export type ViewSeed = {
  key: string; name: string; description: string; team?: string; icon: string; color: string;
  filters: ViewFilterSeed;
  grouping: 'status' | 'assignee' | 'priority' | 'project' | 'sprint' | 'label' | 'team' | 'type' | 'none';
  ordering: 'manual' | 'priority' | 'due' | 'created' | 'updated' | 'estimate' | 'title';
  display: 'List' | 'Board';
};

export type TemplateSeed = {
  name: string; team?: string; title: string; description: string; priority: 0 | 1 | 2 | 3 | 4;
  estimate?: number; type: IssueType; labels: string[];
};

export type NotificationSeed = {
  type: 'assigned' | 'mentioned' | 'commented' | 'status_changed' | 'completed' | 'check_in' | 'blocked' | 'intake' | 'priority_changed';
  actor: string; // MemberSeed key (never ME)
  issue?: string;
  project?: string;
  name: string; // e.g. "Priya Raman mentioned you in ENG-42" — use the identifier placeholder {issue}
  body: string;
  offset: number;
  read: boolean;
};

export type PinSeed = { entityType: 'Project' | 'View' | 'Goal' | 'Sprint'; key: string };
