import { lazy, Suspense, useEffect, useState } from 'react';
import type { CliProvider } from '../../shared/ai-cli';
import { aiCliSetupEvent } from './entry';
import { cliProviders } from './model';

const AiCliSetup = lazy(() => import('./setup').then(module => ({ default: module.AiCliSetup })));

export function AiCliSetupHost() {
  const [request, setRequest] = useState<{ provider?: CliProvider }>();
  useEffect(() => {
    const show = (event: Event) => {
      const provider = (event as CustomEvent<{ provider?: CliProvider }>).detail?.provider;
      setRequest(provider && cliProviders.includes(provider) ? { provider } : {});
    };
    window.addEventListener(aiCliSetupEvent, show);
    return () => window.removeEventListener(aiCliSetupEvent, show);
  }, []);
  return request ? <Suspense fallback={null}><AiCliSetup key={request.provider ?? 'choose'} initialProvider={request.provider} onClose={() => setRequest(undefined)} /></Suspense> : null;
}

