import { LibraryView, LibrarySidebar } from "./library";
import { AppShell, useNavigate } from "./shell";
import { HomeView } from "./home";
import { Workspace } from "./workspace";
function Views() {
  const { route } = useNavigate();
  return route.view === "workspace" ? (
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
