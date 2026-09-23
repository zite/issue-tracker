import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import type { Team } from './types';
import { useWorkspace } from './workspace';

/**
 * Team scope.
 *
 * Issue Tracker has one Issues, one Sprints, one Projects, one Roadmap and one Reports
 * — not a copy of each per team. The scope (all teams, or one team) is the
 * first URL segment of those sections, e.g. `/eng/issues` or `/all/sprints`,
 * and the last one used is remembered so the nav always lands where you were.
 */

export const SCOPED_SECTIONS = ['issues', 'intake', 'sprints', 'projects', 'roadmap', 'reports'] as const;
export type ScopedSection = (typeof SCOPED_SECTIONS)[number];

const STORAGE_KEY = 'issue-tracker:scope';

type ScopeState = {
  /** 'all' or a lowercase team key. */
  key: string;
  team: Team | null;
  setScope: (key: string) => void;
  /** A scoped section's path under the current scope. */
  to: (section: ScopedSection, rest?: string) => string;
  /** The same path under another scope — used by the switcher. */
  withScope: (key: string) => string | null;
};

const ScopeContext = createContext<ScopeState | null>(null);

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? 'all';
  } catch {
    return 'all';
  }
}

export function ScopeProvider({ children }: { children: ReactNode }) {
  const ws = useWorkspace();
  const location = useLocation();
  const [stored, setStored] = useState(readStored);

  const routeMatch = matchPath('/:scope/:section/*', location.pathname);
  const routeScope = routeMatch && SCOPED_SECTIONS.includes(routeMatch.params.section as ScopedSection) ? routeMatch.params.scope!.toLowerCase() : null;

  const resolve = useCallback((key: string | null | undefined) => {
    const k = (key ?? 'all').toLowerCase();
    if (k === 'all') return { key: 'all', team: null };
    const team = ws.teamByKey.get(k.toUpperCase()) ?? null;
    return team ? { key: k, team } : { key: 'all', team: null };
  }, [ws.teamByKey]);

  const current = resolve(routeScope ?? stored);

  // Visiting a scoped URL makes that scope the remembered one.
  useEffect(() => {
    if (routeScope && routeScope !== stored && resolve(routeScope).key === routeScope) {
      setStored(routeScope);
      try {
        localStorage.setItem(STORAGE_KEY, routeScope);
      } catch {
        /* storage may be unavailable */
      }
    }
  }, [routeScope, stored, resolve]);

  const value = useMemo<ScopeState>(() => ({
    key: current.key,
    team: current.team,
    setScope: key => {
      const next = resolve(key).key;
      setStored(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
    },
    to: (section, rest = '') => `/${current.key}/${section}${rest}`,
    withScope: key => {
      if (!routeMatch || !routeScope) return null;
      const tail = location.pathname.split('/').slice(2).join('/');
      return `/${resolve(key).key}/${tail}${location.search}`;
    },
  }), [current.key, current.team, resolve, routeMatch, routeScope, location.pathname, location.search]);

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope() {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope must be used inside ScopeProvider');
  return ctx;
}

/** Switch scope, keeping the section when the current page is scoped. */
export function useSwitchScope() {
  const scope = useScope();
  const navigate = useNavigate();
  return useCallback((key: string) => {
    const path = scope.withScope(key);
    scope.setScope(key);
    if (path) navigate(path);
  }, [scope, navigate]);
}
