import { PRIORITY_LABEL } from './constants';
import type { Issue } from './types';
import type { Workspace } from './workspace';

/** Export exactly what is on screen — the filters and ordering someone already chose. */
export function exportIssuesCsv(issues: Issue[], ws: Workspace, filename = 'issues.csv') {
  const header = ['ID', 'Title', 'Status', 'Priority', 'Type', 'Assignee', 'Team', 'Project', 'Milestone', 'Sprint', 'Labels', 'Estimate', 'Due date', 'Created', 'Started', 'Completed', 'Parent'];
  const rows = issues.map(i => [
    i.identifier,
    i.title,
    ws.statusOf(i)?.name ?? '',
    PRIORITY_LABEL[i.priority] ?? '',
    i.issueType ?? '',
    ws.memberById.get(i.assigneeId ?? '')?.name ?? '',
    ws.teamById.get(i.teamId ?? '')?.name ?? '',
    ws.projectById.get(i.projectId ?? '')?.name ?? '',
    ws.milestoneById.get(i.milestoneId ?? '')?.name ?? '',
    ws.sprintById.get(i.sprintId ?? '')?.name ?? '',
    i.labelIds.map(id => ws.labelById.get(id)?.name).filter(Boolean).join('; '),
    i.estimate ?? '',
    i.dueDate ?? '',
    i.openedAt?.slice(0, 10) ?? '',
    i.startedAt?.slice(0, 10) ?? '',
    i.completedAt?.slice(0, 10) ?? '',
    i.parentIdentifier ?? '',
  ]);
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map(r => r.map(escape).join(',')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
