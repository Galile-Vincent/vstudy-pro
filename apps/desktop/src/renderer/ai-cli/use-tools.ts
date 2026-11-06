/** File-only inventory refreshes on explicit setup changes and window focus, without idle polling. */
import { useCallback, useEffect, useState } from 'react';
import type { CliToolState } from '../../shared/ai-cli';
import { desktop } from '../bridge';

export function useCliTools() {
  const [tools, setTools] = useState<CliToolState[]>([]);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    try { setTools(await desktop.invoke('ai-cli:list', {})); setError(false); setLoaded(true); }
    catch { setError(true); }
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
