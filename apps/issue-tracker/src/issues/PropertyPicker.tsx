import type { ReactNode } from 'react';
import { useIssueActions } from '../lib/mutations';
import type { Issue, IssueType } from '../lib/types';
import { useWorkspace } from '../lib/workspace';
import {
  AssigneePicker, DatePicker, EstimatePicker, LabelPicker, MilestonePicker, PriorityPicker, ProjectPicker, SprintPicker, StatusPicker, TypePicker,
} from '../pickers/pickers';

export type PickerKind = 'status' | 'priority' | 'assignee' | 'labels' | 'project' | 'milestone' | 'sprint' | 'estimate' | 'due' | 'type';

/** One value shared by every issue, or undefined when they differ. */
function common<T>(issues: Issue[], get: (i: Issue) => T): T | undefined {
  if (!issues.length) return undefined;
  const first = get(issues[0]);
  return issues.every(i => get(i) === first) ? first : undefined;
}

/**
 * Wires any property picker to one issue or a whole selection. With several
 * issues it shows the value they share (or nothing) and applies the change to
 * all of them in one bulk request.
 */
export function IssuePropertyPicker({
  issues, kind, trigger, open, onOpenChange, align = 'start',
}: {
  issues: Issue[];
  kind: PickerKind;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
}) {
  const ws = useWorkspace();
  const actions = useIssueActions();
  const single = issues.length === 1 ? issues[0] : null;
  const teamIds = [...new Set(issues.map(i => i.teamId))];
  const teamId = teamIds.length === 1 ? teamIds[0] : null;
  const pass = { trigger, open, onOpenChange, align };

  const apply = (patch: Parameters<typeof actions.update>[1]) => {
    if (single) return actions.update(single, patch).catch(() => undefined);
    return actions.bulkUpdate(issues, patch, { toastMessage: `Updated ${issues.length} issues` });
  };

  switch (kind) {
    case 'status': {
      if (!teamId) {
        // A multi-team selection picks a status from the first team's workflow; the server maps it by category.
        const firstTeam = issues[0]?.teamId ?? ws.teams[0]?.id ?? null;
        return <StatusPicker {...pass} teamId={firstTeam} value={null} onChange={v => v && apply({ statusId: v })} />;
      }
      return <StatusPicker {...pass} teamId={teamId} value={common(issues, i => i.statusId) ?? null} onChange={v => v && apply({ statusId: v })} />;
    }
    case 'priority':
      return <PriorityPicker {...pass} value={common(issues, i => i.priority) ?? -1} onChange={v => apply({ priority: v })} />;
    case 'assignee':
      return <AssigneePicker {...pass} teamId={teamId} value={common(issues, i => i.assigneeId) as string | null} onChange={v => apply({ assigneeId: v })} />;
    case 'project':
      return <ProjectPicker {...pass} teamId={teamId} value={common(issues, i => i.projectId) as string | null} onChange={v => apply({ projectId: v })} />;
    case 'milestone': {
      const projectId = common(issues, i => i.projectId) ?? null;
      return <MilestonePicker {...pass} projectId={projectId} value={common(issues, i => i.milestoneId) as string | null} onChange={v => single && actions.update(single, { milestoneId: v }).catch(() => undefined)} />;
    }
    case 'sprint':
      return <SprintPicker {...pass} teamId={teamId ?? issues[0]?.teamId ?? null} value={common(issues, i => i.sprintId) as string | null} onChange={v => apply({ sprintId: v })} />;
    case 'estimate':
      return <EstimatePicker {...pass} teamId={teamId} value={common(issues, i => i.estimate) as number | null} onChange={v => apply({ estimate: v })} />;
    case 'type':
      return <TypePicker {...pass} value={common(issues, i => i.issueType) ?? null} onChange={v => v && apply({ issueType: v as IssueType })} />;
    case 'due':
      return <DatePicker {...pass} value={common(issues, i => i.dueDate) ?? null} onChange={v => apply({ dueDate: v })} />;
    case 'labels': {
      const shared = ws.labels.map(l => l.id).filter(id => issues.every(i => i.labelIds.includes(id)));
      return (
        <LabelPicker
          {...pass}
          teamId={teamId}
          value={single ? single.labelIds : shared}
          onChange={next => {
            if (single) return actions.setLabels(single, next);
            const added = next.filter(id => !shared.includes(id));
            const removed = shared.filter(id => !next.includes(id));
            return actions.bulkUpdate(issues, { addLabelIds: added, removeLabelIds: removed } as never);
          }}
        />
      );
    }
  }
}
