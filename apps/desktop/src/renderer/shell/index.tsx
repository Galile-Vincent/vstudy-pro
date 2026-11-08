import { HistorySwipeNavigation, hasNavigationOverlay } from './history-swipe-navigation';
import { createRouteHistory, pushRoute, moveHistory, canMoveHistory, historyRoute, type HistoryDirection } from './navigation-history';
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
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { Home, BookOpen, ArrowLeft, Menu, Settings, GraduationCap, Search, History as HistoryIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tr } from "../../shared/i18n";
import type { Document } from "../../shared";
import type { LibraryQuery } from "../../shared/library";
import "./shell.css";
import "./art-reader.css";
export type View = "ai-chats" | "exams" | "home" | "library" | "workspace" | "welcome" | "courses" | "history" | "review";
export type Route = {
  view: View;
  conversationId?: import("../../shared/domain").Conversation["id"] | undefined;
  messageId?: string | undefined;
  courseId?: string | undefined;
  documentId?: Document["id"] | undefined;
  query?: Partial<LibraryQuery> | undefined;
  title?: string | undefined;
  aiParse?: boolean;
  connectSchool?: boolean;
};
type Navigation = { route: Route; navigate: (route: Route | View) => void; closeWelcome: () => void; canGoBack: boolean; canGoForward: boolean; goBack: () => void; goForward: () => void };
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
  const [route, setRoute] = useState<Route>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("vstudy-route") ?? "null",
      ) as Route | null;
      if (saved && ["home", "library", "workspace", "courses", "history", "review", "exams", "ai-chats"].includes(saved.view))
        return historyRoute(saved);
    } catch {
      /* Storage can be unavailable. */
    }
    return { view: "home" };
  });
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
    if (route.view === 'welcome' || route.aiParse || welcomeReturn.current || focusTimer.current !== undefined) return;
    const frame = requestAnimationFrame(() => { document.getElementById("shell-content")?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [route.view, route.documentId, route.courseId]);
  const [history, setHistory] = useState(() => createRouteHistory(route));
  const historyRef = useRef(history);
  const lastHistoryMove = useRef(-Infinity);
  const persistRoute = (next: Route) => {
    if (next.view === "welcome") return;
    try { localStorage.setItem("vstudy-route", JSON.stringify(historyRoute(next))); } catch { /* Route persistence is optional. */ }
  };
  const goHistory = (direction: HistoryDirection) => {
    if (performance.now() - lastHistoryMove.current < 300 || hasNavigationOverlay()) return;
    const nextHistory = moveHistory(historyRef.current, direction);
    if (nextHistory === historyRef.current) return;
    lastHistoryMove.current = performance.now();
    historyRef.current = nextHistory;
    const next = nextHistory.entries[nextHistory.index]!;
    if (sidebarOverlay) closeSidebar();
    transitionTo(() => { setHistory(nextHistory); setRoute(next); }, false, false, direction);
    persistRoute(next);
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
    historyRef.current = pushRoute(historyRef.current, next);
    setHistory(historyRef.current);
    if (next.view === 'welcome' && route.view !== 'welcome') { previous.current = historyRoute(route); returnFocus.current = document.activeElement as HTMLElement; returnSettings.current = !!returnFocus.current?.closest(".settings-dialog"); }
    if (next.view === 'welcome' || route.view === 'welcome') startTransition(() => setRoute(next));
    else if ((next.view === 'workspace' && next.documentId) || (route.view === 'workspace' && next.view === 'library')) transitionTo(() => setRoute(next), false, true);
    else transitionTo(() => setRoute(next));
    persistRoute(next);
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
    <NavigationContext.Provider value={{ route, navigate, canGoBack: canMoveHistory(history, 'back'), canGoForward: canMoveHistory(history, 'forward'), goBack: () => goHistory('back'), goForward: () => goHistory('forward'), closeWelcome }}>
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
              onClick={() => navigate("home")}
            >
              <Home />
              {tr("library:home")}
            </SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton aria-current={route.view === "ai-chats" ? "page" : undefined} onClick={() => navigate("ai-chats")}><HistoryIcon/>{tr("web-chat:title")}</SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton
              data-parent={!!route.query?.folderId}
              aria-current={route.view === "library" || route.view === "workspace" ? "page" : undefined}
              onClick={() => navigate("library")}
            >
              <BookOpen />
              {tr("common:library")}
            </SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton aria-current={route.view === "courses" ? "page" : undefined} onClick={() => navigate("courses")}><GraduationCap />{tr("moodle:courses")}</SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton aria-current={route.view === "exams" ? "page" : undefined} onClick={() => navigate("exams")}><ClipboardCheck/>{tr("exams:title")}</SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton aria-current={route.view === "review" ? "page" : undefined} onClick={() => navigate("review")}><BookOpen/>{tr("review:title")}</SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton aria-current={route.view === "history" ? "page" : undefined} onClick={() => navigate("history")}><HistoryIcon/>{tr("history:title")}</SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu></SidebarGroup>
          {sidebar}</SidebarContent><SidebarFooter><SubscriptionMeters compact /><div className="art-reader-profile"><span className="art-reader-avatar" aria-hidden="true">{displayName ? Array.from(displayName)[0]?.toLocaleUpperCase() : <Brand/>}</span><span><strong>{displayName || tr("library:brand")}</strong><small>{tr("art-reader:local")}</small></span><Button variant="ghost" size="icon" aria-label={tr("common:settings")} title={tr("common:settings")} onClick={() => window.dispatchEvent(new Event("vstudy:open-settings"))}><Settings aria-hidden="true"/></Button></div></SidebarFooter>
        </Sidebar>
        <div className="shell-main">
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
                  : route.view === "ai-chats" ? tr("web-chat:title") : route.view === "exams" ? tr("exams:title") : route.view === "review" ? tr("review:title") : route.view === "history" ? tr("history:title") : route.view === "courses" ? tr("moodle:courses") : route.view === "welcome" ? tr("welcome:page_title") : tr("common:library")}
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
