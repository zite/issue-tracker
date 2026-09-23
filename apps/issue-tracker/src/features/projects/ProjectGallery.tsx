import { CaretRight, Plus } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { ProjectSummary } from '../../lib/types';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Skeleton } from '../../ui/Layout';
import { Tooltip } from '../../ui/Tooltip';
import { ProjectStatusGlyph } from './bits';
import { ProjectCard } from './ProjectCard';
import { STATUS_LABEL, progressOf, useCollapsedSections, type ProjectStatus } from './model';

export type ProjectSection = { status: ProjectStatus; projects: ProjectSummary[] };

/** A status section's heading: a ruled line with the name, a count and a "+" for that status. */
export function SectionHeading({ section, collapsed, onToggle, onCreate, className, children }: {
  section: ProjectSection;
  collapsed: boolean;
  onToggle: () => void;
  onCreate: (status: ProjectStatus) => void;
  className?: string;
  children?: ReactNode;
}) {
  const avg = section.projects.length ? section.projects.reduce((a, p) => a + progressOf(p), 0) / section.projects.length : 0.5;
  const label = STATUS_LABEL[section.status];
  return (
    <div className={cn('group/section flex h-8 items-center gap-2', className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="-ml-1.5 flex h-7 min-w-0 items-center gap-2 rounded-sm px-1.5 text-ink transition-colors hover:bg-hover"
      >
        <CaretRight size={11} weight="bold" className={cn('shrink-0 text-ink-3 transition-transform duration-150', !collapsed && 'rotate-90')} />
        <ProjectStatusGlyph status={section.status} progress={avg} />
        <h2 className="truncate text-title font-semibold">{label}</h2>
        <span className="tabular text-ui font-normal text-ink-3">{section.projects.length}</span>
      </button>
      {children ?? <span className="h-px min-w-4 flex-1 bg-line" aria-hidden />}
      <Tooltip content={`New project · ${label}`}>
        <Button
          variant="ghost"
          size="xs"
          icon
          aria-label={`New project · ${label}`}
          onClick={() => onCreate(section.status)}
          className="opacity-0 focus-visible:opacity-100 group-hover/section:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Plus size={13} weight="bold" />
        </Button>
      </Tooltip>
    </div>
  );
}

export function ProjectGallery({ sections, onEdit, onCreate, showTeam }: {
  sections: ProjectSection[];
  onEdit: (p: ProjectSummary) => void;
  onCreate: (status: ProjectStatus) => void;
  showTeam: boolean;
}) {
  const [collapsed, toggle] = useCollapsedSections('issue-tracker:projects:collapsed');
  return (
    <div className="flex flex-col gap-7 pb-16">
      {sections.map(section => {
        const isCollapsed = collapsed.has(section.status);
        return (
          <section key={section.status} aria-label={STATUS_LABEL[section.status]} className="animate-rise-in">
            <SectionHeading section={section} collapsed={isCollapsed} onToggle={() => toggle(section.status)} onCreate={onCreate} className="sticky top-0 z-[5] -mx-2 h-10 bg-paper px-2" />
            {!isCollapsed && (
              <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
                {section.projects.map(p => (
                  <ProjectCard key={p.id} project={p} onEdit={onEdit} showTeam={showTeam} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function GallerySkeleton() {
  return (
    <div className="flex flex-col gap-7" aria-hidden>
      {[3, 4].map((n, s) => (
        <div key={s}>
          <div className="flex h-8 items-center gap-2">
            <Skeleton className="h-3.5 w-3.5" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="rounded-lg border border-line bg-card p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-[30%]" />
                  <Skeleton className="h-4 flex-1" />
                  <div className="shrink-0" style={{ width: `${20 + ((i * 23) % 30)}%` }} />
                </div>
                <Skeleton className="mt-3 h-3 w-11/12" />
                <Skeleton className="mt-2 h-3 w-3/5" />
                <Skeleton className="mt-5 h-1.5 w-full rounded-full" />
                <div className="mt-6 flex items-center gap-2 border-t border-line pt-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="ml-auto h-5 w-5 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
