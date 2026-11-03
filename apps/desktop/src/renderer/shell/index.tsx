import { desktop } from "../bridge";
import { applyLanguage } from "../i18n";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { Home, BookOpen, ArrowLeft, Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tr } from "../../shared/i18n";
import type { Document } from "../../shared";
import type { LibraryQuery } from "../../shared/library";
import "./shell.css";
export type View = "home" | "library" | "workspace";
export type Route = {
  view: View;
  documentId?: Document["id"] | undefined;
  query?: Partial<LibraryQuery> | undefined;
  title?: string | undefined;
};
type Navigation = { route: Route; navigate: (route: Route | View) => void };
const NavigationContext = createContext<Navigation | null>(null);
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
    const update = () => { if (route.view === 'workspace' && media.matches) setSidebarVisible(false); };
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [route.view]);
  const navigate: Navigation["navigate"] = (value) => {
    const next = typeof value === "string" ? { view: value } : value;
    setRoute(next);
    localStorage.setItem("vstudy-route", JSON.stringify(next));
  };
  return (
    <NavigationContext.Provider value={{ route, navigate }}>
      <div className="app-shell" data-view={route.view}>
        <a className="skip-link" href="#shell-content">
          {tr("common:skip_content")}
        </a>
        <aside
          hidden={!sidebarVisible}
          className="shell-sidebar"
          aria-label={tr("common:document_library")}
        >
          <div className="shell-brand">{tr("library:brand")}</div>
          <nav>
            <button
              aria-current={route.view === "home" ? "page" : undefined}
              onClick={() => navigate("home")}
            >
              <Home />
              {tr("library:home")}
            </button>
            <button
              data-parent={!!route.query?.folderId}
              aria-current={route.view === "library" ? "page" : undefined}
              onClick={() => navigate("library")}
            >
              <BookOpen />
              {tr("common:library")}
            </button>
          </nav>
          {sidebar}
        </aside>
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
                  : tr("common:library")}
              </span>
            )}
          </header>
          <div id="shell-content" className="shell-content" tabIndex={-1}>
            {children}
          </div>
        </div>
      </div>
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
