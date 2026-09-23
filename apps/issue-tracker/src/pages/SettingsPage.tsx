import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { GeneralSettings } from '../features/settings/GeneralSettings';
import { SettingsLockContext } from '../features/settings/kit';
import { LabelsSettings } from '../features/settings/LabelsSettings';
import { MembersSettings } from '../features/settings/MembersSettings';
import { SECTIONS, SettingsNav, SettingsNavSelect, type SectionKey } from '../features/settings/SettingsNav';
import { TeamDetail } from '../features/settings/TeamDetail';
import { TeamsSettings } from '../features/settings/TeamsSettings';
import { TemplatesSettings } from '../features/settings/TemplatesSettings';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useWorkspace } from '../lib/workspace';
import { PageBody, PageHeader } from '../ui/Layout';

/**
 * Settings is a document, not an app inside the app: the page header, a plain
 * list of sections down the left, and the chosen section's cards on the right.
 */
export function SettingsPage() {
  const { section = 'general', itemId } = useParams();
  const ws = useWorkspace();

  // hasOwn, not `in`: "/settings/constructor" must not match Object.prototype.
  const known = Object.prototype.hasOwnProperty.call(SECTIONS, section);
  const team = known && section === 'teams' && itemId ? ws.teamById.get(itemId) : undefined;
  const current = team ? `/settings/teams/${team.id}` : `/settings/${section}`;
  const label = !known ? 'Settings' : team ? team.name : SECTIONS[section as SectionKey].label;

  // A new section starts at the top, not wherever the last one was scrolled to.
  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 });
  }, [current]);

  useDocumentTitle(label, known && 'Settings');

  if (!known) return <Navigate to="/settings/general" replace />;
  if (itemId && section !== 'teams') return <Navigate to={`/settings/${section}`} replace />;
  if (section === 'teams' && itemId && !team) return <Navigate to="/settings/teams" replace />;

  // Mirrors `assertCan` on the server: those endpoints refuse these writes, so the controls say so up front.
  const role = ws.me.role ?? 'Member';
  const lock =
    section === 'members' && role !== 'Admin'
      ? 'Only admins can manage members. Ask an admin to invite people or change roles.'
      : section !== 'general' && section !== 'members' && role === 'Guest'
        ? 'Guests can see how the workspace is set up but can’t change it. Ask an admin or a member to make changes.'
        : null;

  const content = team ? (
    <TeamDetail team={team} />
  ) : section === 'members' ? (
    <MembersSettings />
  ) : section === 'teams' ? (
    <TeamsSettings />
  ) : section === 'labels' ? (
    <LabelsSettings />
  ) : section === 'templates' ? (
    <TemplatesSettings />
  ) : (
    <GeneralSettings />
  );

  return (
    <>
      <div className="mx-auto w-full max-w-[1120px]">
        <PageHeader title="Settings" description="Your profile, the people in this workspace, and how each team works." />
      </div>
      <PageBody narrow className="pb-24 pt-6">
        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
          <SettingsNav current={current} />
          <SettingsNavSelect current={current} />
          <div key={current} className="min-w-0 animate-fade-in">
            <SettingsLockContext.Provider value={lock}>{content}</SettingsLockContext.Provider>
          </div>
        </div>
      </PageBody>
    </>
  );
}
