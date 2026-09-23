import { useEffect } from 'react';
import { useAppActions } from './app-actions';

/**
 * Name the team a page is about (a sprint's team, a project's team) so "New
 * issue" and "G then T" default to it. Cleared when the page unmounts, after
 * which the scope's team applies again.
 */
export function useContextTeam(teamId: string | null | undefined) {
  const { setContextTeam } = useAppActions();
  useEffect(() => {
    if (!teamId) return;
    setContextTeam(teamId);
    return () => setContextTeam(null);
  }, [teamId, setContextTeam]);
}
