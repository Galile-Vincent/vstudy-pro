import { TabStrip } from './tab-strip';
import { mergeTabPresentation, activeTab, currentRoute, createTab, loadTabs, saveTabs, tabReducer, type TabAction } from './tab-state';
import type { TabSet, TabRoute } from '../../shared/app-tabs';
import { HistorySwipeNavigation, hasNavigationOverlay } from './history-swipe-navigation';
import { canMoveHistory, historyRoute, type HistoryDirection } from './navigation-history';
import { ClipboardCheck } from "lucide-react";
/** Navigation frame and profile-local routes shared by the study views. */
import { Brand } from '../components/brand';
import { useScrollChrome } from './use-scroll-chrome';
import { SubscriptionMeters } from '../usage/subscriptions';
import './scroll-chrome.css';
import { HelpMenu } from "../onboarding/help";
import { useSidebarOverlay } from './use-sidebar-overlay';
import { applyAppearance } from '../settings/apply-appearance';
import { Button } from '../components/ui/button';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup } from '../components/ui/sidebar';
import { transitionTo } from "./view-transition";
import { desktop } from "../bridge";
import { applyLanguage } from "../i18n";
import {
  createContext,
  useCallback,
  startTransition,
  useContext,
  useState,
  useLayoutEffect,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { Home, BookOpen, ArrowLeft, Menu, Settings, GraduationCap, Search, History as HistoryIcon } from "lucide-react";
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
type Navigation = { updateNativePresentation:(id:string,presentation:Partial<import('../../shared/app-tabs').TabPresentation>,title?:string,expectedRoute?:Route)=>void; tabs: TabSet; activeTabId: string; openTab: (route: Route | View) => void; activateTab: (id: string) => void; closeTab: (id: string) => void; reorderTabs: (ids: string[]) => void; route: Route; navigate: (route: Route | View) => void; closeWelcome: () => void; canGoBack: boolean; canGoForward: boolean; goBack: () => void; goForward: () => void };
const NavigationContext = createContext<Navigation | null>(null);
export function useOptionalNavigation() { return useContext(NavigationContext); }
export function useNavigate() {
  const value = useContext(NavigationContext);
  if (!value) throw new Error("Navigation provider missing");
  return value;
}
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
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [displayName, setDisplayName] = useState('');
  useEffect(() => {
    const toggle = () => setSidebarVisible(visible => !visible);
    window.addEventListener('vstudy:toggle-sidebar', toggle);
    return () => window.removeEventListener('vstudy:toggle-sidebar', toggle);
  }, []);
  const closeSidebar = useCallback(() => setSidebarVisible(false), []);
  const sidebarOverlay = useSidebarOverlay(closeSidebar);
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
  useEffect(() => {void desktop.invoke('web-chat:sync',{tabIds:tabs.tabs.map(tab=>tab.id)}).catch(()=>{});void desktop.invoke('moodle:webview-sync',{tabIds:tabs.tabs.map(tab=>tab.id)}).catch(()=>{});},[tabs]);
  const capture = () => {
    const tab = activeTab(tabsRef.current);
    if(tab.presentation.kind==='moodle' || tab.presentation.kind==='hosted-chat') return;
    dispatch({ type: 'presentation', id: tab.id, presentation: { ...tab.presentation, scrollTop: document.getElementById('shell-content')?.scrollTop ?? 0 } });
  };
  useLayoutEffect(() => {
    const content = document.getElementById('shell-content');
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
    capture(); setTransientRoute({});
    dispatch({ type: 'open', tab: createTab(crypto.randomUUID(), typeof value === 'string' ? { view: value } : value, Date.now()) });
  };
  const activateTab = (id: string) => { capture(); setTransientRoute({}); dispatch({ type: 'activate', id, now: Date.now() }); };
  const closeTab = (id: string) => { capture(); setTransientRoute({}); dispatch({ type: 'close', id, fallback: createTab(crypto.randomUUID(), { view: 'home' }, Date.now()) }); };
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
    if (sidebarOverlay) closeSidebar();
    transitionTo(() => { setTransientRoute({}); dispatch({ type: 'history', id: tabsRef.current.activeId, direction }); }, false, false, direction);
  };
  const previous = useRef<Route>({ view: "home" });
  const returnSettings = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const navigate: Navigation["navigate"] = (value) => {
    clearTimeout(focusTimer.current);
    focusTimer.current = undefined;
    welcomeReturn.current = null;
    if (sidebarOverlay) closeSidebar();
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
  return (
    <NavigationContext.Provider value={{ updateNativePresentation:(id,presentation,title,expectedRoute)=>{const tab=tabsRef.current.tabs.find(tab=>tab.id===id);const current=tab?.history.entries[tab.history.index];if(expectedRoute && (current?.view!==expectedRoute.view || current.documentId!==expectedRoute.documentId))return;if(!tab)return;const next=mergeTabPresentation(tab.presentation,presentation);if(JSON.stringify(tab.presentation)!==JSON.stringify(next) || (title!==undefined && title!==tab.title))dispatch({type:'presentation',id,presentation:next,...(title ? {title} : {})});}, tabs, activeTabId: tabs.activeId, openTab, activateTab, closeTab, reorderTabs, route, navigate, canGoBack: canMoveHistory(history, 'back'), canGoForward: canMoveHistory(history, 'forward'), goBack: () => goHistory('back'), goForward: () => goHistory('forward'), closeWelcome }}>
      <SidebarProvider open={sidebarVisible} onOpenChange={setSidebarVisible}><div className="app-shell" data-view={route.view} data-sidebar-overlay={sidebarOverlay}>
        <a className="skip-link" href="#shell-content">
          {tr("common:skip_content")}
        </a>
        <Sidebar role="complementary" collapsible="none"
          hidden={!sidebarVisible}
          className="shell-sidebar"
          aria-label={tr("common:document_library")}
        >
          <SidebarHeader className="shell-brand"><span className="art-reader-brand-mark" aria-hidden="true"><Brand/></span><span>{tr("library:brand")}</span></SidebarHeader><SidebarContent>
          <SidebarGroup><p className="art-reader-sidebar-label">{tr("art-reader:workspace")}</p><SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton
              aria-current={route.view === "home" ? "page" : undefined}
              onClick={(event) => (event.metaKey || event.ctrlKey ? openTab : navigate)("home")}
            >
              <Home />
              {tr("library:home")}
            </SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton aria-current={route.view === "ai-chats" ? "page" : undefined} onClick={(event) => (event.metaKey || event.ctrlKey ? openTab : navigate)("ai-chats")}><HistoryIcon/>{tr("web-chat:title")}</SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton
              data-parent={!!route.query?.folderId}
              aria-current={route.view === "library" || route.view === "workspace" ? "page" : undefined}
              onClick={(event) => (event.metaKey || event.ctrlKey ? openTab : navigate)("library")}
            >
              <BookOpen />
              {tr("common:library")}
            </SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton aria-current={route.view === "courses" ? "page" : undefined} onClick={(event) => (event.metaKey || event.ctrlKey ? openTab : navigate)("courses")}><GraduationCap />{tr("moodle:courses")}</SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton aria-current={route.view === "exams" ? "page" : undefined} onClick={(event) => (event.metaKey || event.ctrlKey ? openTab : navigate)("exams")}><ClipboardCheck/>{tr("exams:title")}</SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton aria-current={route.view === "review" ? "page" : undefined} onClick={(event) => (event.metaKey || event.ctrlKey ? openTab : navigate)("review")}><BookOpen/>{tr("review:title")}</SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton aria-current={route.view === "history" ? "page" : undefined} onClick={(event) => (event.metaKey || event.ctrlKey ? openTab : navigate)("history")}><HistoryIcon/>{tr("history:title")}</SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu></SidebarGroup>
          {sidebar}</SidebarContent><SidebarFooter><SubscriptionMeters compact /><div className="art-reader-profile"><span className="art-reader-avatar" aria-hidden="true">{displayName ? Array.from(displayName)[0]?.toLocaleUpperCase() : <Brand/>}</span><span><strong>{displayName || tr("library:brand")}</strong><small>{tr("art-reader:local")}</small></span><Button variant="ghost" size="icon" aria-label={tr("common:settings")} title={tr("common:settings")} onClick={() => window.dispatchEvent(new Event("vstudy:open-settings"))}><Settings aria-hidden="true"/></Button></div></SidebarFooter>
        </Sidebar>
        <div className="shell-main">
          <TabStrip />
          <header className="shell-topbar">
            <Button variant="ghost"
              className="shell-toggle"
              aria-label={tr("common:toggle_document_library")}
              aria-expanded={sidebarVisible}
              onClick={() => setSidebarVisible((v) => !v)}
            >
              <Menu />
            </Button>
            {route.view === "workspace" ? (
              <Button variant="ghost"
                onClick={() =>
                  navigate({
                    view: "library",
                    query: route.query,
                    title: route.title,
                  })
                }
              >
                <ArrowLeft />
                {route.title ?? tr("common:library")}
              </Button>
            ) : (
              <span>
                {route.view === "home"
                  ? tr("library:home")
                  : route.view === "hosted-chat" && route.provider ? tr(`web-chat:${route.provider}`) : route.view === "ai-chats" ? tr("web-chat:title") : route.view === "exams" ? tr("exams:title") : route.view === "review" ? tr("review:title") : route.view === "history" ? tr("history:title") : route.view === "moodle" ? tr("webview:title") : route.view === "courses" ? tr("moodle:courses") : route.view === "welcome" ? tr("welcome:page_title") : tr("common:library")}
              </span>
            )}
            {route.view !== 'workspace' && status}
            <HelpMenu />
            <Button variant="ghost" className="shell-history-trigger" aria-label={tr('history:find')} title={tr('history:find') + ' (' + tr('history:shortcut') + ')'} onClick={() => window.dispatchEvent(new Event('vstudy:find-history'))}><Search size={16}/><span>{tr('history:find')}</span><kbd>{tr('history:shortcut')}</kbd></Button>
          </header>
          {route.view === 'workspace' && <div className="shell-workspace-status">{status}</div>}
          <div id="shell-content" role={route.view === "library" ? "main" : undefined} className="shell-content" tabIndex={-1}>
            {children}
            <HistorySwipeNavigation canGoBack={canMoveHistory(history, "back")} canGoForward={canMoveHistory(history, "forward")} onNavigate={goHistory} />
          </div>
        </div>
      </div></SidebarProvider>
    </NavigationContext.Provider>
  );
}
export function HomePlaceholder() {
  useTranslation();
  return (
    <div className="empty">
      <Home aria-hidden="true" />
      <h1>{tr("library:home")}</h1>
      <p>{tr("library:homePlaceholder")}</p>
    </div>
  );
}
