import { EnvelopeSimple, ShieldCheck } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Mark } from '../../glyphs';
import type { Member, Team } from '../../lib/types';
import { Avatar } from '../../ui/Avatar';
import { Badge, type Tone } from '../../ui/Chip';
import { cn } from '../../ui/cn';

const STATUS_TONE: Record<string, Tone> = { Invited: 'info', Deactivated: 'neutral', Suspended: 'warning' };

/**
 * A person, set like a byline on the paper ground: portrait, serif name, what
 * they do and how to reach them, then their role and teams. Stats sit to the
 * right on wide screens and drop below on narrow ones.
 */
export function ProfileHero({ member, teams, isMe, aside }: { member: Member; teams: Team[]; isMe: boolean; aside?: ReactNode }) {
  const role = member.role || 'Member';
  const status = member.status && member.status !== 'Active' ? member.status : null;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
      <div className="flex min-w-0 items-start gap-4 sm:items-center sm:gap-5">
        <Avatar person={member} size={72} className={cn(status === 'Deactivated' && 'grayscale')} />
        <div className="min-w-0">
          {isMe && <div className="mb-0.5 text-micro font-semibold uppercase text-ink-3">Your profile</div>}
          <h1 className="truncate font-display text-[28px] leading-9 text-ink sm:text-display">{member.name}</h1>
          <p className="mt-0.5 flex min-w-0 flex-col items-start gap-y-0.5 text-body text-ink-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1.5">
            {member.jobTitle && <span className="max-w-full truncate">{member.jobTitle}</span>}
            {/* On a phone the title and email stack, so a trailing dot would dangle at the end of a line. */}
            {member.jobTitle && member.email && <span aria-hidden className="hidden text-ink-3 sm:inline">·</span>}
            {member.email && (
              <a
                href={`mailto:${member.email}`}
                className="inline-flex min-w-0 max-w-full items-center gap-1 underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-ink hover:decoration-ink"
              >
                <EnvelopeSimple size={14} className="shrink-0 text-ink-3" aria-hidden />
                <span className="truncate">{member.email}</span>
              </a>
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge tone={role === 'Guest' ? 'info' : 'neutral'} icon={role === 'Admin' ? <ShieldCheck size={12} weight="bold" /> : undefined}>
              {role}
            </Badge>
            {status && (
              <Badge tone={STATUS_TONE[status] ?? 'warning'} dot>
                {status}
              </Badge>
            )}
            {teams.length > 0 && <span aria-hidden className="mx-1 h-4 w-px bg-line-strong" />}
            {teams.map(t => (
              <Link
                key={t.id}
                to={`/${t.key.toLowerCase()}/issues`}
                title={`${t.name} issues`}
                className="inline-flex h-6 items-center gap-1.5 rounded-sm bg-card pl-1 pr-2 text-meta font-medium text-ink-2 ring-1 ring-inset ring-line transition-colors hover:bg-hover hover:text-ink"
              >
                <Mark icon={t.icon} color={t.color} name={t.name} size={16} />
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
      {aside}
    </div>
  );
}
