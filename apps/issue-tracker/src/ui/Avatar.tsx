import type { CSSProperties } from 'react';
import { initials } from '../lib/format';
import { cn } from './cn';

type PersonLike = { name: string; avatarUrl?: string | null; color?: string | null };

/**
 * People are round; everything else in Issue Tracker (teams, projects, goals) is a
 * rounded square. Initials sit on a soft tint of the person's colour with the
 * colour itself as text, mixed toward ink so it stays legible in both themes.
 */
export function Avatar({ person, size = 20, className, ring }: { person: PersonLike | null | undefined; size?: number; className?: string; ring?: boolean }) {
  if (!person) return <Unassigned size={size} className={className} />;
  const color = person.color || '#8a8173';
  const style: CSSProperties = {
    width: size,
    height: size,
    // Initials lighten as the circle grows, so large avatars don't look shouty.
    fontSize: Math.max(8, Math.round(size * (size >= 28 ? 0.36 : 0.42))),
    ['--c' as string]: color,
  };
  return (
    <span
      title={person.name}
      style={style}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold leading-none',
        'bg-[color:color-mix(in_oklab,var(--c)_22%,rgb(var(--card)))] text-[color:color-mix(in_oklab,var(--c)_62%,rgb(var(--ink)))]',
        'dark:bg-[color:color-mix(in_oklab,var(--c)_42%,rgb(var(--card)))] dark:text-[color:color-mix(in_oklab,var(--c)_22%,rgb(var(--ink)))]',
        ring && 'ring-2 ring-card',
        className,
      )}
    >
      {person.avatarUrl ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : initials(person.name)}
    </span>
  );
}

export function Unassigned({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      title="Unassigned"
      style={{ width: size, height: size }}
      className={cn('inline-flex shrink-0 rounded-full border border-dashed border-control bg-transparent', className)}
    />
  );
}

export function AvatarStack({ people, size = 20, max = 4, className }: { people: PersonLike[]; size?: number; max?: number; className?: string }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  // Overlap just enough to read as a group without covering the initials.
  const overlap = { marginLeft: -Math.max(3, Math.round(size * 0.18)) };
  return (
    <span className={cn('inline-flex items-center', className)}>
      {shown.map((p, i) => (
        <span key={`${p.name}-${i}`} style={i > 0 ? overlap : undefined} className="inline-flex rounded-full">
          <Avatar person={p} size={size} className="ring-[1.5px] ring-card" />
        </span>
      ))}
      {rest > 0 && (
        <span
          style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.4)), ...overlap }}
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-sunken font-semibold text-ink-2 ring-[1.5px] ring-card"
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
