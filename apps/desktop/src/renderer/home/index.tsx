import { useEffect, useState } from 'react';
import { useNavigate } from '../shell';
import { Home } from './home';
import { desktop } from '../bridge';
import { applyLanguage } from '../i18n';
import { ProviderSettings, type Providers } from '../providers';
import { Onboarding } from '../onboarding/onboarding';
export function HomeView() {
  const { navigate } = useNavigate();
  const [onboarding, setOnboarding] = useState(false);
  const [usage, setUsage] = useState(false);
  const [providers, setProviders] = useState<Providers>([]);
  useEffect(() => { void desktop.invoke('settings:get', {}).then(async s => { await applyLanguage(s.language); setOnboarding(!s.onboardingCompleted); }).catch(() => {}); }, []);
  return <><Home navigate={(view, documentId) => navigate(documentId ? { view, documentId } : { view })} onFolder={folderId => navigate({ view:'library', query:{folderId}, title:undefined })} onUsage={() => { void desktop.invoke('providers:list', {}).then(setProviders); setUsage(true); }}/>{onboarding && <Onboarding onComplete={() => setOnboarding(false)}/>} {usage && <ProviderSettings providers={providers} initialTab="usage" onClose={() => setUsage(false)} onRefresh={async () => setProviders(await desktop.invoke('providers:list', {}))}/>}</>;
}
