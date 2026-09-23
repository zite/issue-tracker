import type {
  BootstrapOutputType,
  GetSprintOutputType,
  GetIssueOutputType,
  GetProjectOutputType,
  ListSprintsOutputType,
  ListIssuesInputType,
  ListIssuesOutputType,
  ListNotificationsOutputType,
  ListProjectsOutputType,
} from 'zitejs/api';

export type Bootstrap = BootstrapOutputType;
export type Me = Bootstrap['me'];
export type Team = Bootstrap['teams'][number];
export type Member = Bootstrap['members'][number];
export type Status = Bootstrap['statuses'][number];
export type Label = Bootstrap['labels'][number];
export type Goal = Bootstrap['goals'][number];
export type ProjectRef = Bootstrap['projects'][number];
export type Milestone = Bootstrap['milestones'][number];
export type Sprint = Bootstrap['sprints'][number];
export type SavedView = Bootstrap['views'][number];
export type IssueTemplate = Bootstrap['templates'][number];
export type Pin = Bootstrap['pins'][number];

export type Issue = ListIssuesOutputType['issues'][number];
export type IssueList = ListIssuesOutputType;
export type IssueFilters = NonNullable<ListIssuesInputType['filters']>;
export type IssueDetail = GetIssueOutputType;
export type Comment = IssueDetail['comments'][number];
export type ActivityItem = IssueDetail['activity'][number];
export type Relation = IssueDetail['relations'][number];
export type Attachment = IssueDetail['attachments'][number];

export type ProjectSummary = ListProjectsOutputType['projects'][number];
export type ProjectDetail = GetProjectOutputType;
export type SprintSummary = ListSprintsOutputType['sprints'][number];
export type SprintDetail = GetSprintOutputType;
export type Notification = ListNotificationsOutputType['notifications'][number];

export type StatusType = 'intake' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
export type IssueType = 'Feature' | 'Bug' | 'Improvement' | 'Task' | 'Spike' | 'Chore';

/** The properties of an issue a person can change directly. */
export type IssuePatch = Partial<{
  title: string;
  description: string | null;
  statusId: string;
  priority: number;
  estimate: number | null;
  issueType: IssueType;
  assigneeId: string | null;
  projectId: string | null;
  milestoneId: string | null;
  sprintId: string | null;
  parentId: string | null;
  dueDate: string | null;
  archived: boolean;
}>;
