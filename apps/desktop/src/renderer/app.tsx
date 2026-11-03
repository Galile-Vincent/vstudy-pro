import { lazy, Suspense } from "react";
const WelcomeView = lazy(() => import("./welcome"));
import { LibraryView, LibrarySidebar } from "./library";
import { AppShell, useNavigate } from "./shell";
import { HomeView } from "./home";
import { Workspace } from "./workspace";
function Views() {
  const { route } = useNavigate();
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
