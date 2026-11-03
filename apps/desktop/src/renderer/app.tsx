import { lazy, Suspense, useEffect, useState } from "react";
const WelcomeView = lazy(() => import("./welcome"));
import { LibraryView, LibrarySidebar } from "./library";
import { AppShell, useNavigate } from "./shell";
import { HomeView } from "./home";
import { Workspace } from "./workspace";
import { desktop } from './bridge';
import { ProviderSettings, type Providers } from './providers';
function GlobalSettings() {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<Providers>([]);
  const refresh = async () => setProviders(await desktop.invoke('providers:list', {}));
  useEffect(() => {
    const show = () => { setOpen(true); void refresh(); };
    window.addEventListener('vstudy:open-settings', show);
    return () => window.removeEventListener('vstudy:open-settings', show);
  }, []);
  return open ? <ProviderSettings providers={providers} onClose={() => setOpen(false)} onRefresh={refresh}/> : null;
}
function Views() {
  const { route } = useNavigate();
  useEffect(() => {
    // Parse the optional tour during idle, outside the click's frame budget.
    const idle = window.requestIdleCallback(() => { void import('./welcome'); });
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
      <Views /><GlobalSettings />
    </AppShell>
  );
}
