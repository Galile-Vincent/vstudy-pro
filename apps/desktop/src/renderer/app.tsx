import { lazy, Suspense, useEffect } from "react";
const WelcomeView = lazy(() => import("./welcome"));
import { LibraryView, LibrarySidebar } from "./library";
import { AppShell, useNavigate } from "./shell";
import { HomeView } from "./home";
import { Workspace } from "./workspace";
function Views() {
  const { route } = useNavigate();
  useEffect(() => {
    // Parse the optional tour during idle, outside the click's frame budget.
    const idle = window.requestIdleCallback(() => { void import('./welcome'); void import('./document-presentation'); });
    return () => window.cancelIdleCallback(idle);
  }, []);
  return route.view === "welcome" ? (<Suspense fallback={null}><WelcomeView /></Suspense>) : route.view === "workspace" ? (
    <Workspace />
  ) : route.view === "library" ? (
    <LibraryView key={JSON.stringify(route.query)} />
  ) : (
    <HomeView />
  );
}
export function App() {
  return (
    <AppShell sidebar={<LibrarySidebar />}>
      <Views />
    </AppShell>
  );
}
