/** Navigation frame and profile-local routes shared by the study views. */
import { Brand } from '../components/brand';
import { useScrollChrome } from './use-scroll-chrome';
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
export type View = "home" | "library" | "workspace" | "welcome" | "courses" | "history";
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
type Navigation = { route: Route; navigate: (route: Route | View) => void; closeWelcome: () => void };
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
      if (saved && ["home", "library", "workspace", "courses", "history"].includes(saved.view))
        return saved;
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
  useEffect(() => {
    if (route.view === 'welcome' || route.aiParse) return;
    const frame = requestAnimationFrame(() => { document.getElementById("shell-content")?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [route.view, route.documentId, route.courseId]);
  const previous = useRef<Route>({ view: "home" });
  const returnSettings = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const navigate: Navigation["navigate"] = (value) => {
    if (sidebarOverlay) closeSidebar();
    const next = typeof value === "string" ? { view: value } : value;
    if (next.view === 'welcome' && route.view !== 'welcome') { previous.current = route; returnFocus.current = document.activeElement as HTMLElement; returnSettings.current = !!returnFocus.current?.closest(".settings-dialog"); }
    if (next.view === 'welcome' || route.view === 'welcome') startTransition(() => setRoute(next));
    else if ((next.view === 'workspace' && next.documentId) || (route.view === 'workspace' && next.view === 'library')) transitionTo(() => setRoute(next), false, true);
    else transitionTo(() => setRoute(next));
    try { localStorage.setItem("vstudy-route", JSON.stringify({ ...next, connectSchool: undefined })); } catch { /* Route persistence is optional. */ }
  };
  return (
    <NavigationContext.Provider value={{ route, navigate, closeWelcome: () => { navigate(previous.current); setTimeout(() => { const target = returnFocus.current; if (returnSettings.current) { window.dispatchEvent(new Event("vstudy:open-settings")); setTimeout(() => document.getElementById("welcome-settings-entry")?.focus(), 100); } else if (target?.isConnected) target.focus(); else document.getElementById("welcome-entry")?.focus(); }, 350); } }}>
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
            <SidebarMenuItem><SidebarMenuButton
              data-parent={!!route.query?.folderId}
              aria-current={route.view === "library" || route.view === "workspace" ? "page" : undefined}
              onClick={() => navigate("library")}
            >
              <BookOpen />
              {tr("common:library")}
            </SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton aria-current={route.view === "courses" ? "page" : undefined} onClick={() => navigate("courses")}><GraduationCap />{tr("moodle:courses")}</SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton aria-current={route.view === "history" ? "page" : undefined} onClick={() => navigate("history")}><HistoryIcon/>{tr("history:title")}</SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu></SidebarGroup>
          {sidebar}</SidebarContent><SidebarFooter><div className="art-reader-profile"><span className="art-reader-avatar" aria-hidden="true">{displayName ? Array.from(displayName)[0]?.toLocaleUpperCase() : <Brand/>}</span><span><strong>{displayName || tr("library:brand")}</strong><small>{tr("art-reader:local")}</small></span></div><SidebarMenu><SidebarMenuItem><SidebarMenuButton onClick={() => window.dispatchEvent(new Event("vstudy:open-settings"))}><Settings/>{tr("common:settings")}</SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
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
                  : route.view === "history" ? tr("history:title") : route.view === "courses" ? tr("moodle:courses") : route.view === "welcome" ? tr("welcome:page_title") : tr("common:library")}
              </span>
            )}
            {route.view !== 'workspace' && status}
            <HelpMenu />
            <Button variant="ghost" className="shell-history-trigger" aria-label={tr('history:find')} title={tr('history:find') + ' (' + tr('history:shortcut') + ')'} onClick={() => window.dispatchEvent(new Event('vstudy:find-history'))}><Search size={16}/><span>{tr('history:find')}</span><kbd>{tr('history:shortcut')}</kbd></Button>
          </header>
          {route.view === 'workspace' && <div className="shell-workspace-status">{status}</div>}
          <div id="shell-content" role={route.view === "library" ? "main" : undefined} className="shell-content" tabIndex={-1}>
            {children}
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
