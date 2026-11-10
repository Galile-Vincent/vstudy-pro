import { IconButton, SideNavItem, SideNavSection, useSideNavCollapse } from '@astryxdesign/core';
import { BookOpen, ClipboardCheck, GraduationCap, History as HistoryIcon, Home, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { tr } from '../../shared/i18n';
import { Brand } from '../components/brand';
import { SubscriptionMeters } from '../usage/subscriptions';
import { UpdateRow } from './update-row';
import type { Route, View } from './index';

type Go = (route: Route | View) => unknown;
type Destination = { view: View; icon: ReactNode; label: string; matches: readonly View[] };

const destinations: readonly Destination[] = [
  { view: 'home', icon: <Home />, label: 'library:home', matches: ['home'] },
  { view: 'ai-chats', icon: <HistoryIcon />, label: 'web-chat:title', matches: ['ai-chats'] },
  { view: 'library', icon: <BookOpen />, label: 'common:library', matches: ['library', 'workspace'] },
  { view: 'courses', icon: <GraduationCap />, label: 'moodle:courses', matches: ['courses'] },
  { view: 'exams', icon: <ClipboardCheck />, label: 'exams:title', matches: ['exams'] },
  { view: 'review', icon: <BookOpen />, label: 'review:title', matches: ['review'] },
  { view: 'history', icon: <HistoryIcon />, label: 'history:title', matches: ['history'] },
];

export function ShellBrand() {
  return (
    <span className="shell-brand">
      <span className="art-reader-brand-mark" aria-hidden="true"><Brand beta /></span>
      <span>
        {tr('library:brand')}
        <span className="sr-only"> {tr('library:beta')}</span>
      </span>
    </span>
  );
}

export function ShellDestinations({ route, navigate, openTab, library }: {
  route: Route; navigate: Go; openTab: Go; library?: ReactNode;
}) {
  const { isCollapsed } = useSideNavCollapse();
  return (
    <>
      <SideNavSection title={tr('art-reader:workspace')} isHeaderHidden={isCollapsed}>
        {destinations.map(({ view, icon, label, matches }) => (
          <SideNavItem
            key={`${view}:${label}`}
            label={tr(label)}
            icon={icon}
            isSelected={matches.includes(route.view)}
            data-parent={view === 'library' ? !!route.query?.folderId : undefined}
            onClick={event => (event.metaKey || event.ctrlKey ? openTab : navigate)(view)}
          />
        ))}
      </SideNavSection>
      {!isCollapsed && library}
    </>
  );
}

export function ShellFooter({ displayName, onSettings }: { displayName: string; onSettings: () => void }) {
  const { isCollapsed } = useSideNavCollapse();
  const settings = (
    <IconButton variant="ghost" label={tr('common:settings')} tooltip={tr('common:settings')} icon={<Settings />} onClick={onSettings} />
  );
  return (
    <div className="shell-footer" data-collapsed={isCollapsed || undefined}>
      {!isCollapsed && <SubscriptionMeters compact />}
      <UpdateRow />
      <div className="art-reader-profile">
        {!isCollapsed && (
          <>
            <span className="art-reader-avatar" aria-hidden="true">
              {displayName ? Array.from(displayName)[0]?.toLocaleUpperCase() : <Brand />}
            </span>
            <span>
              <strong>{displayName || tr('library:brand')}</strong>
              <small>{tr('art-reader:local')}</small>
            </span>
          </>
        )}
        {settings}
      </div>
    </div>
  );
}
