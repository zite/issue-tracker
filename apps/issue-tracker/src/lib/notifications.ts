import {
  ArrowsClockwise, At, Bell, ChatCircle, CheckCircle, Clock, FlagBanner, Heart, Prohibit, Shapes, TrayArrowDown, UserPlus, UserMinus,
} from '@phosphor-icons/react';
import type { Notification } from './types';
import type { Workspace } from './workspace';

/** How each notification type reads in a sentence, and the badge it wears. */
export const NOTIFICATION_KIND: Record<string, { verb: string; icon: typeof At; tone: string }> = {
  mentioned: { verb: 'mentioned you', icon: At, tone: 'bg-highlight text-highlight-ink' },
  assigned: { verb: 'assigned you', icon: UserPlus, tone: 'bg-info text-white dark:text-paper' },
  unassigned: { verb: 'unassigned you', icon: UserMinus, tone: 'bg-ink-3 text-white dark:text-paper' },
  commented: { verb: 'commented', icon: ChatCircle, tone: 'bg-ink-2 text-white dark:text-paper' },
  status_changed: { verb: 'moved it', icon: ArrowsClockwise, tone: 'bg-warning text-white dark:text-paper' },
  priority_changed: { verb: 'marked it urgent', icon: FlagBanner, tone: 'bg-danger text-white dark:text-paper' },
  completed: { verb: 'finished it', icon: CheckCircle, tone: 'bg-success text-white dark:text-paper' },
  check_in: { verb: 'posted a check-in', icon: Shapes, tone: 'bg-violet text-white dark:text-paper' },
  due_soon: { verb: 'Due soon', icon: Clock, tone: 'bg-warning text-white dark:text-paper' },
  blocked: { verb: 'blocked it', icon: Prohibit, tone: 'bg-danger text-white dark:text-paper' },
  subscribed: { verb: 'added you as a follower', icon: Bell, tone: 'bg-ink-2 text-white dark:text-paper' },
  reaction: { verb: 'reacted', icon: Heart, tone: 'bg-signal text-white dark:text-paper' },
  intake: { verb: 'filed it in intake', icon: TrayArrowDown, tone: 'bg-signal text-white dark:text-paper' },
};

export function kindOf(n: Pick<Notification, 'type'>) {
  return NOTIFICATION_KIND[n.type] ?? NOTIFICATION_KIND.commented;
}

/** The verb for a row, sharper than the kind's default: "moved it to In Review", "marked it urgent". */
export function verbFor(n: Pick<Notification, 'type' | 'name'>) {
  const kind = kindOf(n);
  const name = n.name ?? '';
  switch (n.type) {
    case 'status_changed': {
      const to = /\bto (.+)$/.exec(name)?.[1];
      return to ? `moved it to ${to}` : kind.verb;
    }
    case 'priority_changed':
      return /urgent/i.test(name) ? 'marked it urgent' : kind.verb;
    case 'blocked':
      return 'marked it blocked';
    case 'due_soon':
      return /overdue/i.test(name) ? 'Overdue' : /tomorrow/i.test(name) ? 'Due tomorrow' : 'Due soon';
    case 'commented':
      return /replied/i.test(name) ? 'replied' : kind.verb;
    default:
      return kind.verb;
  }
}

/** Reminders come from the calendar, not a person — even though the record names the creator for its avatar. */
export const actorOf = (ws: Pick<Workspace, 'memberById'>, n: Pick<Notification, 'type' | 'actorId'>) => (n.type === 'due_soon' || !n.actorId ? undefined : ws.memberById.get(n.actorId));
