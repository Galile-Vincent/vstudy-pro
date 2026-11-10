import { AppShell as AstryxAppShell, MobileNav, SideNav } from '@astryxdesign/core';
import { ShellBrand, ShellDestinations, ShellFooter } from './shell-nav';
import { ShellChrome } from './shell-chrome';
import { mergeTabPresentation, activeTab, currentRoute, createTab, loadTabs, saveTabs, tabReducer, type TabAction } from './tab-state';
import { MAX_APP_TABS, type TabSet, type TabRoute } from '../../shared/app-tabs';
import { HistorySwipeNavigation, hasNavigationOverlay } from './history-swipe-navigation';
import { canMoveHistory, historyRoute, type HistoryDirection } from './navigation-history';
/** Navigation frame and profile-local routes shared by the study views. */
import { useScrollChrome } from './use-scroll-chrome';
import './scroll-chrome.css';
import '../motion/motion.css';
import { applyAppearance } from '../settings/apply-appearance';
import { transitionTo } from "./view-transition";
import { desktop } from "../bridge";
import { applyLanguage } from "../i18n";
import {
  createContext,
  startTransition,
  useContext,
  useState,
  useLayoutEffect,
  useRef,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Home } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tr } from "../../shared/i18n";
import "./shell.css";
import "./art-reader.css";
export type View = "hosted-chat" | "moodle" | "ai-chats" | "exams" | "home" | "library" | "workspace" | "welcome" | "courses" | "history" | "review";
export type Route = Omit<TabRoute, 'view'> & {
  view: View;
  aiParse?: boolean;
  connectSchool?: boolean;
};
type Navigation = { recordMoodleImport:(id:string,documentId:string,expectedRoute:Route)=>boolean; updateNativePresentation:(id:string,presentation:Partial<import('../../shared/app-tabs').TabPresentation>,title?:string,expectedRoute?:Route)=>void; tabs: TabSet; activeTabId: string; openTab: (route: Route | View) => boolean; activateTab: (id: string) => void; closeTab: (id: string) => void; reorderTabs: (ids: string[]) => void; route: Route; navigate: (route: Route | View) => void; closeWelcome: () => void; canGoBack: boolean; canGoForward: boolean; goBack: () => void; goForward: () => void };
const NavigationContext = createContext<Navigation | null>(null);
export function useOptionalNavigation() { return useContext(NavigationContext); }
export function useNavigate() {
  const value = useContext(NavigationContext);
  if (!value) throw new Error("Navigation provider missing");
  return value;
}
const tabScroller = () => {
  const content = document.getElementById('shell-content');
  return content?.querySelector<HTMLElement>('[data-tab-scroll]') ?? content;
};
const scrollKeys: Record<string, (el: HTMLElement) => void> = {
  PageDown: el => el.scrollBy({ top: el.clientHeight * 0.875 }),
  PageUp: el => el.scrollBy({ top: -el.clientHeight * 0.875 }),
  Home: el => el.scrollTo({ top: 0 }),
  End: el => el.scrollTo({ top: el.scrollHeight }),
};
const forwardScrollKeys = (event: ReactKeyboardEvent<HTMLElement>) => {
  if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const scroller = tabScroller();
  if (!scroller || scroller === event.currentTarget || !scrollKeys[event.key]) return;
  event.preventDefault();
  scrollKeys[event.key]!(scroller);
};
export function AppShell({
  children,
  sidebar,
  status,
}: {
  children: ReactNode;
  sidebar?: ReactNode;
  status?: ReactNode;
}) {
  useTranslation();
  useScrollChrome();
  // Pages own the main landmark (PageContainer as="main"); Astryx's wrapper must not add a second one.
  useLayoutEffect(() => { document.getElementById('astryx-app-shell-main')?.removeAttribute('role'); });
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [displayName, setDisplayName] = useState('');
  useEffect(() => {
    const pointer=()=>{document.documentElement.dataset.inputModality='pointer';};
    const keyboard=(event:KeyboardEvent)=>{if(['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))document.documentElement.dataset.inputModality='keyboard';};
    document.addEventListener('pointerdown',pointer,true);document.addEventListener('keydown',keyboard,true);
    return()=>{document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('keydown',keyboard,true);};
  }, []);
  useEffect(() => {
    void desktop
      .invoke("settings:get", {})
      .then((s) => { setDisplayName(s.displayName ?? ''); applyAppearance(s); return applyLanguage(s.language); });
    void desktop.invoke("settings:appearance", {}).then((a) => {
      document.documentElement.dataset.reducedTransparency = String(
        a.reducedTransparency,
      );
    });
  }, []);
  const [tabs, setTabs] = useState(() => loadTabs(localStorage, crypto.randomUUID()));
  const tabsRef = useRef(tabs);
  const [transientRoute, setTransientRoute] = useState<Pick<Route, 'aiParse' | 'connectSchool'> & { view?: 'welcome' }>({});
  const route: Route = { ...currentRoute(tabs), ...transientRoute };
  const history = activeTab(tabs).history;
  const dispatch = (action: TabAction) => {
    tabsRef.current = tabReducer(tabsRef.current, action);
    setTabs(tabsRef.current);
  };
  useEffect(() => {
    const timer = setTimeout(() => saveTabs(localStorage, tabs), 200);
    const flush = () => { queueMicrotask(()=>saveTabs(localStorage, tabsRef.current)); };
    window.addEventListener('pagehide', flush);
    return () => { clearTimeout(timer); window.removeEventListener('pagehide', flush); };
  }, [tabs]);
  useEffect(()=>desktop.onWebChatCleared?.(provider=>{for(const tab of tabsRef.current.tabs)if(tab.presentation.kind==='hosted-chat' && tab.presentation.provider===provider)dispatch({type:'presentation',id:tab.id,presentation:{kind:'hosted-chat',provider,scrollTop:0}});}),[]);
  const capture = () => {
    const tab = activeTab(tabsRef.current);
    if(tab.presentation.kind==='moodle' || tab.presentation.kind==='hosted-chat') return;
    dispatch({ type: 'presentation', id: tab.id, presentation: { ...tab.presentation, scrollTop: tabScroller()?.scrollTop ?? 0 } });
  };
  useLayoutEffect(() => {
    const content = tabScroller();
    if (!content) return;
    const presentation=activeTab(tabsRef.current).presentation;
    if(presentation.kind==='moodle' || presentation.kind==='hosted-chat') return;
    const top = presentation.scrollTop;
    content.scrollTop = top;
    const observer = new ResizeObserver(() => { content.scrollTop = top; });
    if (content.firstElementChild) observer.observe(content.firstElementChild);
    const stop = () => observer.disconnect();
    content.addEventListener('wheel', stop, { once: true });
    const timer = setTimeout(stop, 1500);
    return () => { stop(); clearTimeout(timer); content.removeEventListener('wheel', stop); };
  }, [tabs.activeId]);
  const openTab: Navigation['openTab'] = value => {
    if(tabsRef.current.tabs.length>=MAX_APP_TABS){window.dispatchEvent(new Event('vstudy:tab-limit'));return false;}
    capture(); setTransientRoute({});
    dispatch({ type: 'open', tab: createTab(crypto.randomUUID(), typeof value === 'string' ? { view: value } : value, Date.now()) });
    return true;
  };
  const activateTab = (id: string) => { capture(); setTransientRoute({}); dispatch({ type: 'activate', id, now: Date.now() }); };
  const focusAfterClose = useRef(false);
  const closeTab = (id: string) => {
    if (!tabsRef.current.tabs.some(tab => tab.id === id)) return;
    focusAfterClose.current = true;
    capture();
    setTransientRoute({});
    dispatch({ type: 'close', id, fallback: createTab(crypto.randomUUID(), { view: 'home' }, Date.now()) });
  };
  useLayoutEffect(() => {
    if (!focusAfterClose.current) return;
    focusAfterClose.current = false;
    (document.getElementById(`tab-${tabs.activeId}`) ?? document.getElementById('shell-content'))?.focus();
  }, [tabs.activeId, tabs.tabs.length]);
  const reorderTabs = (ids: string[]) => dispatch({ type: 'reorder', ids });
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1199px)');
    const update = () => { if (media.matches && (route.view === 'workspace' || window.innerWidth < 720)) setSidebarVisible(false); };
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [route.view]);
  const welcomeReturn = useRef<Element | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(focusTimer.current), []);
  useEffect(() => {
    if (document.activeElement?.closest('[role=tablist]') || route.view === 'welcome' || route.aiParse || welcomeReturn.current || focusTimer.current !== undefined) return;
    const frame = requestAnimationFrame(() => {
      if (!document.querySelector(".app-tabs-menu") && !document.activeElement?.closest("[role=tablist]")) document.getElementById("shell-content")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [route.view, route.documentId, route.courseId]);
  const lastHistoryMove = useRef(-Infinity);
  const goHistory = (direction: HistoryDirection) => {
    if (performance.now() - lastHistoryMove.current < 300 || hasNavigationOverlay() || !canMoveHistory(activeTab(tabsRef.current).history, direction)) return;
    lastHistoryMove.current = performance.now();
    transitionTo(() => { setTransientRoute({}); dispatch({ type: 'history', id: tabsRef.current.activeId, direction }); }, false, false, direction);
  };
  const previous = useRef<Route>({ view: "home" });
  const returnSettings = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const navigate: Navigation["navigate"] = (value) => {
    clearTimeout(focusTimer.current);
    focusTimer.current = undefined;
    welcomeReturn.current = null;
    const next = typeof value === "string" ? { view: value } : value;
    const id = tabs.activeId;
    const apply = () => {
      if (id === tabsRef.current.activeId) setTransientRoute(next.view === 'welcome' ? { view: 'welcome' } : { ...(next.aiParse ? { aiParse: true } : {}), ...(next.connectSchool ? { connectSchool: true } : {}) });
      if (next.view !== 'welcome') dispatch({ type: 'replace-route', id, route: next });
    };
    if (next.view === 'welcome' && route.view !== 'welcome') { previous.current = historyRoute(route); returnFocus.current = document.activeElement as HTMLElement; returnSettings.current = !!returnFocus.current?.closest(".settings-dialog"); }
    if (next.view === 'welcome' || route.view === 'welcome') startTransition(apply);
    else if(next.view==='moodle' || route.view==='moodle' || next.view==='hosted-chat' || route.view==='hosted-chat') apply();
    else if ((next.view === 'workspace' && next.documentId) || (route.view === 'workspace' && next.view === 'library')) transitionTo(apply, false, true);
    else transitionTo(apply);
  };
  const closeWelcome = () => {
    navigate(previous.current);
    welcomeReturn.current = document.activeElement;
  };
  useEffect(() => {
    if (route.view === 'welcome' || !welcomeReturn.current) return;
    const origin = welcomeReturn.current;
    welcomeReturn.current = null;
    focusTimer.current = setTimeout(() => {
      focusTimer.current = undefined;
      const active = document.activeElement;
      if (active !== origin && active !== document.body && active?.id !== 'shell-content') return;
      if (returnSettings.current) {
        window.dispatchEvent(new Event("vstudy:open-settings"));
        focusTimer.current = setTimeout(() => {
          focusTimer.current = undefined;
          const active = document.activeElement;
          if (active === origin || active === document.body || active?.id === 'shell-content' || active?.closest('.settings-dialog')) document.getElementById("welcome-settings-entry")?.focus();
        }, 0);
      } else if (returnFocus.current?.isConnected) returnFocus.current.focus();
      else document.getElementById("welcome-entry")?.focus();
    }, 0);
  }, [route.view]);
  const navigation = (
      <ShellDestinations route={route} navigate={navigate} openTab={openTab} library={sidebar} />
  );
  return (
    <NavigationContext.Provider
  value={{
    recordMoodleImport: (id, documentId, expectedRoute) => {
      const tab = tabsRef.current.tabs.find((tab) => tab.id === id);
      const current = tab?.history.entries[tab.history.index];
      if (
        current?.view !== 'moodle' ||
        current.accountId !== expectedRoute.accountId ||
        JSON.stringify(current.target) !== JSON.stringify(expectedRoute.target)
      )
        return false;
      if (current.target?.kind === 'file') dispatch({ type: 'imported', id, documentId });
      return saveTabs(localStorage, tabsRef.current);
    },
    updateNativePresentation: (id, presentation, title, expectedRoute) => {
      const tab = tabsRef.current.tabs.find((tab) => tab.id === id);
      const current = tab?.history.entries[tab.history.index];
      if (
        expectedRoute &&
        (current?.view !== expectedRoute.view ||
          current.documentId !== expectedRoute.documentId)
      )
        return;
      if (!tab) return;
      const next = mergeTabPresentation(tab.presentation, presentation);
      if (
        JSON.stringify(tab.presentation) !== JSON.stringify(next) ||
        (title !== undefined && title !== tab.title)
      )
        dispatch({
          type: 'presentation',
          id,
          presentation: next,
          ...(title ? { title } : {}),
        });
    },
    tabs,
    activeTabId: tabs.activeId,
    openTab,
    activateTab,
    closeTab,
    reorderTabs,
    route,
    navigate,
    canGoBack: canMoveHistory(history, 'back'),
    canGoForward: canMoveHistory(history, 'forward'),
    goBack: () => goHistory('back'),
    goForward: () => goHistory('forward'),
    closeWelcome,
  }}
>
  <AstryxAppShell
    className="app-shell"
    data-view={route.view}
    data-sidebar={sidebarVisible ? 'expanded' : 'collapsed'}
    variant="section"
    sideNav={
      <SideNav
        className="shell-sidebar"
        header={<ShellBrand />}
        collapsible={{ isCollapsed: !sidebarVisible, onCollapsedChange: collapsed => setSidebarVisible(!collapsed), hasButton: false }}
        footer={<ShellFooter displayName={displayName} onSettings={() => window.dispatchEvent(new Event('vstudy:open-settings'))} />}
      >
        {navigation}
      </SideNav>
    }
    mobileNav={{ hasToggle: false, content: <MobileNav className="shell-sidebar" header={<ShellBrand />}>{navigation}</MobileNav> }}
  >
    <div className="shell-column">
      <ShellChrome route={route} status={status} sidebarVisible={sidebarVisible} setSidebarVisible={setSidebarVisible} />
      <div
        id="shell-content"
        className="shell-content"
        tabIndex={-1}
        onKeyDown={forwardScrollKeys}
      >
        {children}
        <HistorySwipeNavigation
          canGoBack={canMoveHistory(history, 'back')}
          canGoForward={canMoveHistory(history, 'forward')}
          onNavigate={goHistory}
        />
      </div>
    </div>
  </AstryxAppShell>
</NavigationContext.Provider>
  );
}
export function HomePlaceholder() {
  useTranslation();
  return (
    <div className="empty">
  <Home aria-hidden="true" />
  <h1>{tr('library:home')}</h1>
  <p>{tr('library:homePlaceholder')}</p>
</div>
  );
}
