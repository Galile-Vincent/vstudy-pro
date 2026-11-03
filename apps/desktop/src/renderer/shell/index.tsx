import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup } from '../components/ui/sidebar';
import { transitionTo } from "./view-transition";
import { desktop } from "../bridge";
import { applyLanguage } from "../i18n";
import {
  createContext,
  startTransition,
  useContext,
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { Home, BookOpen, ArrowLeft, Menu, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tr } from "../../shared/i18n";
import type { Document } from "../../shared";
import type { LibraryQuery } from "../../shared/library";
import "./shell.css";
export type View = "home" | "library" | "workspace" | "welcome";
export type Route = {
  view: View;
  documentId?: Document["id"] | undefined;
  query?: Partial<LibraryQuery> | undefined;
  title?: string | undefined;
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
}: {
  children: ReactNode;
  sidebar?: ReactNode;
}) {
  useTranslation();
  const [sidebarVisible, setSidebarVisible] = useState(true);
  useEffect(() => {
    const pointer=()=>{document.documentElement.dataset.inputModality='pointer';};
    const keyboard=(event:KeyboardEvent)=>{if(['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))document.documentElement.dataset.inputModality='keyboard';};
    document.addEventListener('pointerdown',pointer,true);document.addEventListener('keydown',keyboard,true);
    return()=>{document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('keydown',keyboard,true);};
  }, []);
  useEffect(() => {
    void desktop
      .invoke("settings:get", {})
      .then((s) => applyLanguage(s.language));
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
      if (saved && ["home", "library", "workspace"].includes(saved.view))
        return saved;
    } catch {
      /* Storage can be unavailable. */
    }
    return { view: "home" };
  });
  useEffect(() => {
    const media = window.matchMedia('(max-width: 999px)');
    const update = () => { if (media.matches && (route.view === 'workspace' || window.innerWidth < 720)) setSidebarVisible(false); };
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [route.view]);
  useEffect(() => {
    if (route.view === 'welcome') return;
    const frame = requestAnimationFrame(() => { document.getElementById("shell-content")?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [route.view, route.documentId]);
  const previous = useRef<Route>({ view: "home" });
  const returnSettings = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const navigate: Navigation["navigate"] = (value) => {
    const next = typeof value === "string" ? { view: value } : value;
    if (next.view === 'welcome' && route.view !== 'welcome') { previous.current = route; returnFocus.current = document.activeElement as HTMLElement; returnSettings.current = !!returnFocus.current?.closest(".settings-dialog"); }
    if (next.view === 'welcome' || route.view === 'welcome') startTransition(() => setRoute(next));
    else if ((next.view === 'workspace' && next.documentId) || (route.view === 'workspace' && next.view === 'library')) transitionTo(() => setRoute(next), false, true);
    else transitionTo(() => setRoute(next));
    try { localStorage.setItem("vstudy-route", JSON.stringify(next)); } catch { /* Route persistence is optional. */ }
  };
  return (
    <NavigationContext.Provider value={{ route, navigate, closeWelcome: () => { navigate(previous.current); setTimeout(() => { const target = returnFocus.current; if (returnSettings.current) { window.dispatchEvent(new Event("vstudy:open-settings")); setTimeout(() => document.getElementById("welcome-settings-entry")?.focus(), 100); } else if (target?.isConnected) target.focus(); else document.getElementById("welcome-entry")?.focus(); }, 350); } }}>
      <SidebarProvider open={sidebarVisible} onOpenChange={setSidebarVisible}><div className="app-shell" data-view={route.view}>
        <a className="skip-link" href="#shell-content">
          {tr("common:skip_content")}
        </a>
        <Sidebar role="complementary" collapsible="none"
          hidden={!sidebarVisible}
          className="shell-sidebar"
          aria-label={tr("common:document_library")}
        >
          <SidebarHeader className="shell-brand">{tr("library:brand")}</SidebarHeader><SidebarContent>
          <SidebarGroup><SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton
              aria-current={route.view === "home" ? "page" : undefined}
              onClick={() => navigate("home")}
            >
              <Home />
              {tr("library:home")}
            </SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton
              data-parent={!!route.query?.folderId}
              aria-current={route.view === "library" ? "page" : undefined}
              onClick={() => navigate("library")}
            >
              <BookOpen />
              {tr("common:library")}
            </SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu></SidebarGroup>
          {sidebar}</SidebarContent><SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton onClick={() => window.dispatchEvent(new Event("vstudy:open-settings"))}><Settings/>{tr("common:settings")}</SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
        </Sidebar>
        <div className="shell-main">
          <header className="shell-topbar">
            <button
              className="shell-toggle"
              aria-label={tr("common:toggle_document_library")}
              aria-expanded={sidebarVisible}
              onClick={() => setSidebarVisible((v) => !v)}
            >
              <Menu />
            </button>
            {route.view === "workspace" ? (
              <button
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
              </button>
            ) : (
              <span>
                {route.view === "home"
                  ? tr("library:home")
                  : route.view === "welcome" ? tr("welcome:page_title") : tr("common:library")}
              </span>
            )}
          </header>
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
