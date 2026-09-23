import { ArrowLeft } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IssuesView } from '../issues/IssuesView';
import type { IssueFilters } from '../lib/types';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { Button } from '../ui/Button';
import { PageHeader } from '../ui/Layout';

/** Build a link to an ad-hoc list — Reports drill-downs and "New view" use it. */
export { listLink } from '../lib/format';

/**
 * An ad-hoc list from a link: `?f=` carries the filters, `?title=` the name.
 * Every distinct link gets its own remembered display state, so a link always
 * opens exactly as it was shared.
 */
export function FilteredIssuesPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get('f') ?? '';
  const title = params.get('title') || 'Issues';
  useDocumentTitle(title);
  const filters = useMemo<IssueFilters>(() => {
    try {
      const parsed = JSON.parse(raw || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }, [raw]);
  const single = filters.teamIds?.length === 1 ? filters.teamIds[0] : null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow={
          <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1 hover:text-ink">
            <ArrowLeft size={12} /> Back
          </button>
        }
        title={title}
        description={raw ? 'A list built from a link. Change anything, then save it as a view from ⋯.' : 'Start from everything, narrow it down, then save it as a view from ⋯.'}
        actions={title === 'New view' ? <Button variant="ghost" onClick={() => navigate('/views')}>Cancel</Button> : undefined}
      />
      <IssuesView
        key={raw}
        fill
        surfaceKey={`list:${raw || 'all'}`}
        baseFilters={{}}
        defaultFilters={filters}
        teamId={single}
        defaults={{ grouping: single ? 'status' : 'team', ordering: 'priority', completed: 'week' }}
      />
    </div>
  );
}
