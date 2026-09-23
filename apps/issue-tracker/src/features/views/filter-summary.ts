import type { IssueFilters, SavedView } from '../../lib/types';
import type { ViewOptions } from '../../lib/view';

// Filter and layout wording lives in lib so the issue toolbar and save dialog read the same way.
export { clauseChip, describeFilters, filterSentence, layoutSentence, type FilterClause } from '../../lib/filter-summary';

// ---- The saved view itself --------------------------------------------------

export type ParsedView = {
  filters: IssueFilters;
  options: Partial<ViewOptions>;
  layout: 'list' | 'board';
  /** The one team the filters are scoped to, when exactly one. */
  singleTeamId: string | null;
};

function parseObject(raw: string | null | undefined) {
  try {
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    // A malformed saved view falls back to everything rather than breaking the page.
    return {};
  }
}

export function parseView(view: Pick<SavedView, 'filters' | 'options' | 'display'>): ParsedView {
  const filters = parseObject(view.filters) as IssueFilters;
  const options = parseObject(view.options) as Partial<ViewOptions>;
  const teamIds = Array.isArray(filters.teamIds) ? filters.teamIds : [];
  return {
    filters,
    options,
    layout: view.display === 'Board' ? 'board' : 'list',
    singleTeamId: teamIds.length === 1 ? String(teamIds[0]) : null,
  };
}

/** Shared views are anyone's to change; a personal view belongs to whoever made it. */
export function canEditView(view: Pick<SavedView, 'ownerId'>, meId: string) {
  return !view.ownerId || view.ownerId === meId;
}

export function viewLink(viewId: string) {
  return `${window.location.origin}${window.location.pathname}#/view/${viewId}`;
}
