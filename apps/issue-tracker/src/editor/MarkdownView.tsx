import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../ui/cn';
import { useWorkspace } from '../lib/workspace';

const SAFE = /^(https?:|mailto:|#|\/|mention:|issue:)/i;

/**
 * Read-only Markdown with the tracker's own links: `@Name` becomes a mention
 * chip and `ENG-42` becomes a link to that issue. Unsafe URL schemes are
 * dropped rather than rendered.
 */
export const MarkdownView = memo(function MarkdownView({ children, className }: { children: string; className?: string }) {
  const ws = useWorkspace();

  const source = useMemo(() => {
    let text = children ?? '';
    // Longest names first, so "Ana Petrova" wins over "Ana".
    const members = [...ws.members].sort((a, b) => b.name.length - a.name.length);
    for (const m of members) {
      const escaped = m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(`(^|[\\s(])@${escaped}(?![\\w])`, 'g'), `$1[@${m.name}](mention:${m.id})`);
    }
    const keys = ws.teams.map(t => t.key).filter(Boolean).join('|');
    if (keys) {
      // Not inside code spans or existing links — a light guard that handles the common cases.
      text = text.replace(new RegExp(`(^|[\\s(])((?:${keys})-\\d+)(?![\\w\\]])`, 'g'), '$1[$2](issue:$2)');
    }
    return text;
  }, [children, ws.members, ws.teams]);

  return (
    <div className={cn('prose-issue-tracker', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={url => (SAFE.test(url) ? url : '')}
        components={{
          a: ({ href, children: kids }) => {
            if (href?.startsWith('mention:')) {
              return <span className="rounded-xs bg-highlight/35 px-1 py-px font-medium text-ink no-underline dark:bg-highlight/20">{kids}</span>;
            }
            if (href?.startsWith('issue:')) {
              return (
                <a href={`#/issue/${href.slice(6)}`} className="rounded-xs bg-sunken px-1 py-px font-mono text-[12.5px] font-medium text-ink no-underline ring-1 ring-inset ring-line hover:bg-hover">
                  {kids}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {kids}
              </a>
            );
          },
          input: props => <input {...props} disabled className="mr-1.5 translate-y-[1px]" />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
});
