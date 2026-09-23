import { useMemo, useState } from 'react';
import { Dialog, DialogBody, DialogContent, DialogHeader } from '../ui/Dialog';
import { SearchField } from '../ui/Form';
import { Kbd } from '../ui/Kbd';

const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: 'Anywhere',
    items: [
      ['Search or run a command', 'mod+k'],
      ['New issue', 'c'],
      ['Search this list', '/'],
      ['Keyboard shortcuts', '?'],
      ['Previous / next team scope', '[ ]'],
      ['Settings', 'mod+,'],
      ['Toggle dark theme', 'mod+shift+l'],
    ],
  },
  {
    title: 'Go to',
    items: [
      ['Home', 'G H'],
      ['My issues', 'G M'],
      ['Inbox', 'G N'],
      ['Issues', 'G I'],
      ['Intake', 'G T'],
      ['Sprints', 'G S'],
      ['Projects', 'G P'],
      ['Goals', 'G O'],
      ['Roadmap', 'G R'],
      ['Reports', 'G E'],
      ['Views', 'G V'],
    ],
  },
  {
    title: 'Lists and boards',
    items: [
      ['Move down / up', 'J K'],
      ['Open in the sheet', 'enter'],
      ['Toggle the sheet', 'space'],
      ['Open full page', 'mod+enter'],
      ['Select', 'x'],
      ['Extend selection', 'shift+J'],
      ['Select all', 'mod+a'],
      ['Clear selection', 'esc'],
    ],
  },
  {
    title: 'Issues',
    items: [
      ['Status', 's'],
      ['Priority', 'p'],
      ['Assignee', 'a'],
      ['Take it (assign to me)', 'i'],
      ['Labels', 'l'],
      ['Project', 'shift+p'],
      ['Sprint', 'shift+s'],
      ['Due date', 'shift+d'],
      ['Estimate', 'shift+e'],
      ['Type', 'shift+t'],
      ['Archive', 'mod+backspace'],
      ['Copy ID', 'mod+.'],
      ['Copy link', 'mod+shift+,'],
      ['Copy branch name', 'mod+shift+.'],
    ],
  },
  {
    title: 'Intake and inbox',
    items: [
      ['Accept', '1'],
      ['Accept & plan it', '2'],
      ['Mark duplicate', '3'],
      ['Decline', '4'],
      ['Skip for now', 'right'],
      ['Inbox: done', 'e'],
      ['Inbox: read / unread', 'u'],
      ['Inbox: snooze…', 'shift+h'],
      ['Inbox: open full page', 'mod+enter'],
    ],
  },
  {
    title: 'Writing',
    items: [
      ['Submit', 'mod+enter'],
      ['Mention someone', '@'],
      ['Quick add in a new title', '@ # ! + ^'],
      ['Checklist', '[ ] space'],
      ['Heading', '# space'],
      ['Bold', 'mod+b'],
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState('');
  const groups = useMemo(
    () => GROUPS.map(g => ({ ...g, items: g.items.filter(([label]) => label.toLowerCase().includes(q.trim().toLowerCase())) })).filter(g => g.items.length),
    [q],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader title="Keyboard shortcuts" description="Issue Tracker is built to be driven from the keyboard." />
        <div className="px-5 pb-2">
          <SearchField value={q} onChange={setQ} placeholder="Find a shortcut" autoFocus />
        </div>
        <DialogBody className="columns-1 gap-8 pb-6 sm:columns-2 lg:columns-3">
          {groups.map(g => (
            <section key={g.title} className="mb-5 break-inside-avoid">
              <h3 className="mb-1.5 text-micro font-semibold uppercase text-ink-3">{g.title}</h3>
              {g.items.map(([label, keys]) => (
                <div key={label} className="flex min-h-8 items-center justify-between gap-3 border-b border-dashed border-line text-ui last:border-b-0">
                  <span className="text-ink-2">{label}</span>
                  {keys.includes(' ') && !keys.includes('+') && keys.length <= 5 && /^[A-Z] [A-Z]$/.test(keys) ? (
                    <span className="flex items-center gap-1 text-meta text-ink-3">
                      <Kbd>{keys[0]}</Kbd> then <Kbd>{keys[2]}</Kbd>
                    </span>
                  ) : (
                    <Kbd keys={keys} />
                  )}
                </div>
              ))}
            </section>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
