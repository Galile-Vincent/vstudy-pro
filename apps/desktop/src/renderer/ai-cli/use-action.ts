/** Own one preview and action session. Poll only a visible running action, and close late launches. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CliActionId, CliActionPlan, CliActionSession, CliFailure } from '../../shared/ai-cli';
import { desktop } from '../bridge';
import { aiCliChanged } from './entry';

export function useCliAction(onFinished: () => Promise<unknown>) {
  const [plan, setPlan] = useState<CliActionPlan>();
  const [session, setSession] = useState<CliActionSession>();
  const [error, setError] = useState<CliFailure>();
  const [busy, setBusy] = useState(false);
  const [externalOpened, setExternalOpened] = useState(false);
  const mounted = useRef(true);
  const active = useRef<CliActionSession | undefined>(undefined);
  const generation = useRef(0);
  const locked = useRef(false);
  const finish = useRef(onFinished);
  finish.current = onFinished;
  const close = useCallback(async (clearOutput = true) => {
    generation.current++;
    setPlan(undefined); setError(undefined); setExternalOpened(false);
    if (clearOutput) setSession(undefined);
    const value = active.current;
    if (value) {
      await desktop.invoke('ai-cli:close', { id: value.id });
      active.current = undefined;
      setSession(clearOutput ? undefined : { ...value, phase: 'cancelled', error: 'cancelled' });
      await finish.current();
      aiCliChanged();
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      if (active.current) void desktop.invoke('ai-cli:close', { id: active.current.id }).catch(() => {});
    };
  }, []);
  const preview = useCallback(async (actionId: CliActionId) => {
    if (locked.current || active.current?.phase === 'running') return;
    const request = ++generation.current;
    setPlan(undefined); setError(undefined); setBusy(true); setExternalOpened(false);
    try {
      const next = await desktop.invoke('ai-cli:preview', { actionId });
      if (mounted.current && request === generation.current) { setPlan(next); return next; }
    } catch { if (mounted.current && request === generation.current) setError('unknown'); }
    finally { if (mounted.current && request === generation.current) setBusy(false); }
  }, []);
  const run = async (ownTerminal = false, selectedPlan = plan) => {
    const plan = selectedPlan;
    if (!plan || !plan.available && !(ownTerminal && plan.reason === 'unsupported' && plan.actionId.startsWith('login-')) || busy || locked.current || active.current?.phase === 'running') return;
    locked.current = true;
    setBusy(true); setError(undefined);
    const request = generation.current;
    try {
      if (active.current) {
        await desktop.invoke('ai-cli:close', { id: active.current.id });
        active.current = undefined; setSession(undefined);
      }
      if (ownTerminal) {
        const result = await desktop.invoke('ai-cli:openTerminal', { actionId: plan.actionId, token: plan.token });
        if (mounted.current) { setPlan(undefined); setExternalOpened(result.ok); }
        return;
      }
      const next = await desktop.invoke('ai-cli:run', { actionId: plan.actionId, token: plan.token });
      if (!mounted.current || request !== generation.current) {
        await desktop.invoke('ai-cli:close', { id: next.id });
        return;
      }
      active.current = next; setSession(next); setPlan(undefined);
      if (next.phase !== 'running') { await finish.current(); aiCliChanged(); }
    } catch { if (mounted.current) { setError('unknown'); setPlan(undefined); } }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  useEffect(() => {
    if (session?.phase !== 'running') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reading = false;
    const poll = async () => {
      if (stopped || document.hidden || reading) return;
      reading = true;
      try {
        const next = await desktop.invoke('ai-cli:read', { id: session.id });
        if (stopped) return;
        active.current = next; setSession(next); setError(undefined);
        if (next.phase !== 'running') { await finish.current(); aiCliChanged(); return; }
        timer = setTimeout(() => void poll(), 350);
      } catch { if (!stopped) { setError('unknown'); timer = setTimeout(() => void poll(), 1500); } }
      finally { reading = false; }
    };
    const visibility = () => { if (timer) clearTimeout(timer); void poll(); };
    document.addEventListener('visibilitychange', visibility);
    void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [session?.id, session?.phase]);
  return { plan, session, error, busy, externalOpened, preview, run, close };
}
