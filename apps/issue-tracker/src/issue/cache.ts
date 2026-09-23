import type { QueryClient } from '@tanstack/react-query';
import { qk } from '../lib/queries';
import type { IssueDetail } from '../lib/types';

/**
 * An issue's detail can be cached under its identifier (lists, the full page)
 * or under its record id (the inbox opens notifications by id). Writes and
 * refreshes go to every cached copy of the issue, whichever key holds it —
 * otherwise a comment posted in one place silently misses the other.
 */
export function patchDetail(qc: QueryClient, issueId: string, fn: (detail: IssueDetail) => IssueDetail) {
  qc.setQueriesData<IssueDetail>({ queryKey: qk.issueRoot }, old => (old?.issue?.id === issueId ? fn(old) : old));
}

export function refreshDetail(qc: QueryClient, issueId: string) {
  return qc.invalidateQueries({
    queryKey: qk.issueRoot,
    predicate: q => (q.state.data as IssueDetail | undefined)?.issue?.id === issueId,
  });
}

/** Snapshot every cached copy, to roll back an optimistic write. */
export function snapshotDetail(qc: QueryClient, issueId: string) {
  const snap = qc.getQueriesData<IssueDetail>({ queryKey: qk.issueRoot }).filter(([, d]) => d?.issue?.id === issueId);
  return () => {
    for (const [key, data] of snap) qc.setQueryData(key, data);
  };
}
