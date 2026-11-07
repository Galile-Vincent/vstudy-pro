import { SurfaceErrorBoundary } from './components/surface-error-boundary';
import { ReviewView } from "./review";
import { ExistingAnalyticsPrompt } from './analytics-ui';
import { track } from './analytics';
import { HistoryView, HistoryFinder } from "./history";
import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from "react";
let loadedWelcome: ComponentType | undefined;
const loadWelcome = () => import("./welcome").then(module => { loadedWelcome = module.default; return module; });
const WelcomeView = lazy(loadWelcome);
import { LibraryView, LibrarySidebar } from "./library";
import { AppShell, useNavigate } from "./shell";
import { CoursesView } from "./courses";
import { LearningHelp, ContextCoach } from "./onboarding/help";
import { HomeView } from "./home";
import { Workspace } from "./workspace";
import { desktop } from './bridge';
import { AiCliSetupHost } from './ai-cli/setup';
import { ProviderSettings, type Providers } from './providers';
import { AgentsProvider } from './settings/agents-state';
import { AgentNavigation } from './settings/agents-navigation';
import { AgentConsent, AgentStatus } from './settings/agents-consent';
function GlobalSettings() {
  const [open, setOpen] = useState(false);
  const [initialTab, setInitialTab] = useState('general');
  const [providers, setProviders] = useState<Providers>([]);
  const refresh = async () => setProviders(await desktop.invoke('providers:list', {}));
  useEffect(() => {
    const show = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: string }>).detail?.tab;
      setInitialTab(tab ?? 'general');
      setOpen(true);
      void refresh();
    };
    window.addEventListener('vstudy:open-settings', show);
    return () => window.removeEventListener('vstudy:open-settings', show);
  }, []);
  return open ? <SurfaceErrorBoundary resetKeys={[initialTab]}><ProviderSettings initialTab={initialTab} providers={providers} onClose={() => { setOpen(false); window.dispatchEvent(new Event("vstudy:providers-changed")); }} onRefresh={refresh}/></SurfaceErrorBoundary> : null;
}
function Views() {
  const { route } = useNavigate();
  useEffect(() => {
    const screen = ({library:'library',workspace:'document',courses:'moodle',history:'chat'} as const)[route.view as 'library' | 'workspace' | 'courses' | 'history'];
    if (screen) track('screen_viewed', {screen_name:screen});
  }, [route.view]);
  const Tour = useMemo(() => route.view === 'welcome' ? loadedWelcome ?? WelcomeView : WelcomeView, [route.view]);
  useEffect(() => {
    // Parse the optional tour during idle, outside the click's frame budget.
    const idle = window.requestIdleCallback(() => { void loadWelcome(); });
    return () => window.cancelIdleCallback(idle);
  }, []);
  return <SurfaceErrorBoundary resetKeys={[JSON.stringify(route)]}>{route.view === "welcome" ? (<Suspense fallback={null}><Tour /></Suspense>) : route.view === "workspace" ? (
    <Workspace key={route.documentId} />
  ) : route.view === "review" ? (<ReviewView/>) : route.view === "history" ? (<HistoryView/>) : route.view === "courses" ? (
    <CoursesView />
  ) : route.view === "library" ? (
    <LibraryView key={JSON.stringify(route.query)} />
  ) : (
    <HomeView />
  )}</SurfaceErrorBoundary>;
}
export function App() {
  return (
    <AgentsProvider>
      <AppShell sidebar={<LibrarySidebar />} status={<AgentStatus />}>
        <ExistingAnalyticsPrompt/><ContextCoach /><Views /><GlobalSettings /><LearningHelp /><HistoryFinder/><AiCliSetupHost/><AgentConsent /><AgentNavigation />
      </AppShell>
    </AgentsProvider>
  );
}
