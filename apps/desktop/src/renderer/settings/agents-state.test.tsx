// @vitest-environment jsdom
/** Polling and commands share one authority even when several UI consumers mount. */
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AgentsProvider, useAgents } from './agents-state';
import type { AgentsState } from '../../shared/mcp';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../bridge', () => ({ desktop: { invoke } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
let state: AgentsState;
function Consumer() {
  const agents = useAgents();
  return <><output>{agents.connection}:{String(agents.state?.enabled)}</output>
    <button disabled={agents.pending} onClick={() => void agents.act('mcp:enable', { enabled: true })}>Enable</button>
    <button onClick={() => void agents.refresh()}>Refresh</button></>;
}
beforeEach(() => {
  vi.useFakeTimers();
  state = { enabled: false, grants: [], pairings: [], proposals: [], activity: [], activeCalls: 0, accounts: [] };
  invoke.mockReset().mockImplementation(async channel => {
    if (channel === 'mcp:state') return state;
    state = { ...state, enabled: true };
    return { ok: true };
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.useRealTimers(); });
const mount = () => act(() => root.render(<AgentsProvider><Consumer /><Consumer /></AgentsProvider>));

it('shares one non-overlapping poll and never enables agents by mounting', async () => {
  await mount();
  expect(invoke.mock.calls).toEqual([['mcp:state', {}]]);
  expect(host.textContent).toContain('ready:false');
  let resolve!: (value: AgentsState) => void;
  invoke.mockImplementation(() => new Promise(done => { resolve = done; }));
  await act(() => vi.advanceTimersByTimeAsync(1000));
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(invoke).toHaveBeenCalledTimes(2);
  await act(() => resolve(state));
});

it('sends an explicit master switch action once while pending', async () => {
  await mount();
  let done!: () => void;
  invoke.mockImplementation(channel => channel === 'mcp:state' ? Promise.resolve(state) : new Promise(resolve => {
    done = () => { state = { ...state, enabled: true }; resolve({ ok: true }); };
  }));
  await act(() => { host.querySelector('button')!.click(); host.querySelector('button')!.click(); });
  expect(invoke.mock.calls.filter(([channel]) => channel === 'mcp:enable')).toEqual([['mcp:enable', { enabled: true }]]);
  expect(host.querySelector('button')!.disabled).toBe(true);
  await act(() => done());
  expect(host.textContent).toContain('ready:true');
});

it('discards a read that started before a user mutation', async () => {
  await mount();
  const old = state;
  let resolve!: (value: AgentsState) => void;
  invoke.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await act(() => host.querySelectorAll('button')[1]!.click());
  await act(() => host.querySelector('button')!.click());
  await act(() => resolve(old));
  expect(host.textContent).toContain('ready:true');
});

it('reports offline and recovers through a refresh without changing the saved switch', async () => {
  invoke.mockRejectedValueOnce(new Error('secret raw error'));
  await mount();
  expect(host.textContent).toContain('offline:undefined');
  await act(() => host.querySelectorAll('button')[1]!.click());
  expect(host.textContent).toContain('ready:false');
});

it('stops polling after the provider unmounts', async () => {
  await mount();
  await act(() => root.render(null));
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('keeps one polling loop under the app StrictMode lifecycle', async () => {
  await act(() => root.render(<StrictMode><AgentsProvider><Consumer /><Consumer /></AgentsProvider></StrictMode>));
  expect(invoke.mock.calls).toEqual([['mcp:state', {}]]);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(invoke.mock.calls).toEqual([['mcp:state', {}], ['mcp:state', {}]]);
});
