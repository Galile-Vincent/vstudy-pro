/** One app-wide poller owns agent state and serializes user actions across every surface. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AgentsState } from '../../shared/mcp';
import type { IpcRequest } from '../../shared/ipc';
import { desktop } from '../bridge';

type Action = 'mcp:enable' | 'mcp:revoke' | 'mcp:edit-grant' | 'mcp:pair-decision' | 'mcp:proposal-decision';
type Connection = 'loading' | 'ready' | 'offline';
type Agents = {
  state: AgentsState | null;
  connection: Connection;
  pending: boolean;
  failed: boolean;
  attempted: ReadonlySet<string>;
  refresh: () => Promise<void>;
  act: <C extends Action>(channel: C, request: IpcRequest<C>) => Promise<boolean>;
};
const Context = createContext<Agents | null>(null);

export function AgentsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AgentsState | null>(null);
  const [connection, setConnection] = useState<Connection>('loading');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempted, setAttempted] = useState<ReadonlySet<string>>(new Set());
  const alive = useRef(false);
  const revision = useRef(0);
  const reading = useRef<Promise<void> | null>(null);
  const locked = useRef(false);
  const decisions = useRef(new Set<string>());
  const settled = useRef(new Set<string>());
  const latest = useRef(state);
  latest.current = state;
  const online = useRef(connection);
  online.current = connection;

  const refresh = useCallback((): Promise<void> => {
    if (reading.current) return reading.current;
    const version = revision.current;
    const read = desktop.invoke('mcp:state', {}).then(value => {
      if (!alive.current || version !== revision.current) return;
      setState({ ...value,
        pairings: value.pairings.filter(p => !settled.current.has(p.id)),
        proposals: value.proposals.filter(p => !settled.current.has(p.id)),
      });
      setConnection('ready');
    }).catch(() => {
      if (alive.current && version === revision.current) setConnection('offline');
    }).finally(() => { if (reading.current === read) reading.current = null; });
    reading.current = read;
    return read;
  }, []);

  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const poll = async () => {
      await refresh();
      if (!stopped) timer = setTimeout(() => void poll(), 1000);
    };
    void poll();
    return () => { alive.current = false; stopped = true; clearTimeout(timer); };
  }, [refresh]);

  const act = async <C extends Action>(channel: C, request: IpcRequest<C>): Promise<boolean> => {
    if (locked.current || online.current !== 'ready') return false;
    const decisionId = 'proposalId' in request ? request.proposalId : 'pairingId' in request ? request.pairingId : null;
    if (decisionId) {
      if (decisions.current.has(decisionId)) return false;
      const current = latest.current;
      const item = channel === 'mcp:pair-decision'
        ? current?.pairings.find(p => p.id === decisionId)
        : current?.proposals.find(p => p.id === decisionId);
      if (!current?.enabled || !item || Date.parse(item.expiresAt) <= Date.now()) return false;
      decisions.current.add(decisionId);
      setAttempted(new Set(decisions.current));
    }
    locked.current = true;
    revision.current++;
    setPending(true);
    setFailed(false);
    try {
      await desktop.invoke(channel, request);
      if (decisionId) settled.current.add(decisionId);
      await reading.current;
      await refresh();
      return true;
    } catch {
      if (alive.current) { setFailed(true); setConnection('offline'); }
      return false;
    } finally {
      locked.current = false;
      if (alive.current) setPending(false);
    }
  };

  return <Context.Provider value={{ state, connection, pending, failed, attempted, refresh, act }}>{children}</Context.Provider>;
}

export function useAgents() {
  const agents = useContext(Context);
  if (!agents) throw new Error('AgentsProvider is required');
  return agents;
}
