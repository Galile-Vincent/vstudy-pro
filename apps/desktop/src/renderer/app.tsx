import { DeletionNotice } from './deletion-notice';
import { ChatSessionHost } from './chat-session-host';
import { MoodleWebviewPane } from './courses/webview-pane';
import { documentIdSchema } from '../shared/domain';
import { ExamsView } from './exams';
import { WebChatHub, HostedChat } from './web-chat';
import { SurfaceErrorBoundary } from './components/surface-error-boundary';
import { ReviewView } from "./review";
import { ExistingAnalyticsPrompt } from './analytics-ui';
import { track } from './analytics';
import { HistoryView, HistoryFinder } from "./history";
import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from "react";
const DevGallery = import.meta.env.DEV ? lazy(() => import('./design')) : null;
const galleryHash = '#/design';
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
import { AiCliSetupHost } from './ai-cli/setup-host';
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
function ActiveViews() {
  const { activeTabId, tabs, route } = useNavigate();
  return <div id="active-tab-panel" data-native={route.view==='moodle' || route.view==='hosted-chat'} role={tabs.tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={tabs.tabs.length > 1 ? `tab-${activeTabId}` : undefined} data-tab-id={activeTabId}><Views key={activeTabId} /></div>;
}
function Views() {
  const { route, activeTabId, closeTab, navigate } = useNavigate();
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
  return <SurfaceErrorBoundary resetKeys={[JSON.stringify(route)]}>{route.view === "welcome" ? (<Suspense fallback={null}><Tour /></Suspense>) : route.view === "moodle" && route.accountId && route.target ? (<MoodleWebviewPane tabId={activeTabId} accountId={route.accountId} target={route.target} onClose={()=>closeTab(activeTabId)} onDocument={id=>navigate({view:"workspace",documentId:documentIdSchema.parse(id)})} onReconnect={()=>navigate({view:"courses",connectSchool:true})}/>) : route.view === "hosted-chat" && route.provider ? (<HostedChat provider={route.provider}/>) : route.view === "workspace" ? (
    <Workspace key={route.documentId} />
  ) : route.view === "ai-chats" ? (<WebChatHub/>) : route.view === "exams" ? (<ExamsView onOpenLibrary={() => navigate("library")} />) : route.view === "review" ? (<ReviewView/>) : route.view === "history" ? (<HistoryView/>) : route.view === "courses" ? (
    <CoursesView />
  ) : route.view === "library" ? (
    <LibraryView key={JSON.stringify(route.query)} />
  ) : (
    <HomeView />
  )}</SurfaceErrorBoundary>;
}
function Application() {
  return (
    <AgentsProvider>
      <AppShell sidebar={<LibrarySidebar />} status={<><DeletionNotice /><AgentStatus /></>}>
        <ExistingAnalyticsPrompt/><ContextCoach /><ChatSessionHost><ActiveViews /></ChatSessionHost><GlobalSettings /><LearningHelp /><HistoryFinder/><AiCliSetupHost/><AgentConsent /><AgentNavigation />
      </AppShell>
    </AgentsProvider>
  );
}

export function App() {
  const [gallery, setGallery] = useState(() => location.hash === galleryHash);
  useEffect(() => {
    if (!DevGallery) return;
    const update = () => setGallery(location.hash === galleryHash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return DevGallery && gallery ? <Suspense fallback={null}><DevGallery/></Suspense> : <Application/>;
}
