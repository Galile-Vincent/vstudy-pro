/** File-only inventory refreshes on explicit setup changes and window focus, without idle polling. */
import { useCallback, useEffect, useState } from 'react';
import type { CliProvider, CliToolState } from '../../shared/ai-cli';
import { desktop } from '../bridge';
import { detectTool, type CliDetection } from './model';

export function useCliTools() {
  const [tools, setTools] = useState<CliToolState[]>([]);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async (provider?: CliProvider): Promise<CliDetection> => {
    try {
      const next = await desktop.invoke('ai-cli:list', {});
      setTools(next); setError(false); setLoaded(true);
      return provider ? detectTool(next, provider) : { kind: 'not-found' };
    }
    catch (cause) { setError(true); return { kind: 'failed', reason: cause instanceof Error ? cause.message : 'unknown' }; }
  }, []);
  useEffect(() => {
    void refresh();
    const changed = () => void refresh();
    window.addEventListener('vstudy:ai-cli-changed', changed);
    window.addEventListener('vstudy:providers-changed', changed);
    window.addEventListener('focus', changed);
    return () => {
      window.removeEventListener('vstudy:ai-cli-changed', changed);
      window.removeEventListener('vstudy:providers-changed', changed);
      window.removeEventListener('focus', changed);
    };
  }, [refresh]);
  return { tools, error, loaded, refresh };
}
