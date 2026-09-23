import { SquaresFour } from '@phosphor-icons/react';
import { Mark } from '../glyphs';
import { useScope } from '../lib/scope';

/** The eyebrow on every scoped section: the team it's showing, or "All teams". */
export function ScopeEyebrow() {
  const scope = useScope();
  return scope.team ? (
    <>
      <Mark icon={scope.team.icon} color={scope.team.color} name={scope.team.name} size={18} />
      <span className="font-medium text-ink">{scope.team.name}</span>
      <span className="font-mono text-[11px] text-ink-3">{scope.team.key}</span>
    </>
  ) : (
    <>
      <SquaresFour size={15} weight="bold" className="text-ink-3" />
      <span className="font-medium text-ink">All teams</span>
    </>
  );
}
