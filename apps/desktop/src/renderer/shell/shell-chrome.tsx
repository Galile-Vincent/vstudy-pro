import { Button, IconButton, useAppShellMobile } from '@astryxdesign/core';
import { Menu, Search } from 'lucide-react';
import { useCallback, useEffect, type ReactNode } from 'react';
import { tr } from '../../shared/i18n';
import { HelpMenu } from '../onboarding/help';
import { TabStrip } from './tab-strip';
import type { Route } from './index';

const titleKeys: Partial<Record<Route['view'], string>> = {
  home: 'library:home',
  'ai-chats': 'web-chat:title',
  exams: 'exams:title',
  review: 'review:title',
  history: 'history:title',
  moodle: 'webview:title',
  courses: 'moodle:courses',
  welcome: 'welcome:page_title',
};
const pageTitle = (route: Route) =>
  route.view === 'hosted-chat' && route.provider ? tr(`web-chat:${route.provider}`) : tr(titleKeys[route.view] ?? 'common:library');

/** One toggle for both layouts: it collapses the docked rail, or opens the drawer on a narrow window. */
function useSidebarToggle(visible: boolean, setVisible: (visible: boolean) => void) {
  const mobile = useAppShellMobile();
  const toggle = useCallback(() => {
    if (mobile.isMobile) mobile.toggleMobileNav();
    else setVisible(!visible);
  }, [mobile, visible, setVisible]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'b' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('vstudy:toggle-sidebar', toggle);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('vstudy:toggle-sidebar', toggle);
    };
  }, [toggle]);
  return { toggle, expanded: mobile.isMobile ? mobile.isMobileNavOpen : visible };
}

export function ShellChrome({ route, status, sidebarVisible, setSidebarVisible }: {
  route: Route; status: ReactNode; sidebarVisible: boolean; setSidebarVisible: (visible: boolean) => void;
}) {
  const { toggle, expanded } = useSidebarToggle(sidebarVisible, setSidebarVisible);
  const workspace = route.view === 'workspace';
  return (
    <header className="shell-chrome">
      <TabStrip />
      {workspace ? (
        <div className="shell-workspace-status">{status}</div>
      ) : (
        <div className="shell-topbar">
          <IconButton
            variant="ghost"
            className="shell-toggle"
            label={tr('common:toggle_document_library')}
            aria-expanded={expanded}
            icon={<Menu />}
            onClick={toggle}
          />
          <span className="shell-title">{pageTitle(route)}</span>
          {status}
          <HelpMenu />
          <Button
            variant="ghost"
            size="sm"
            className="shell-history-trigger"
            label={tr('history:find')}
            icon={<Search />}
            tooltip={`${tr('history:find')} (${tr('history:shortcut')})`}
            onClick={() => window.dispatchEvent(new Event('vstudy:find-history'))}
          >
            <span>{tr('history:find')}</span>
            <kbd>{tr('history:shortcut')}</kbd>
          </Button>
        </div>
      )}
    </header>
  );
}
