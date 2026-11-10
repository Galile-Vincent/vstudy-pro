// @vitest-environment jsdom
/** Consent tests exercise exact decisions, explicit grants, expiry, races and inert external text. */
import { act } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { i18n, tr } from '../../shared/i18n';
import type { AgentsState } from '../../shared/mcp';
import { AgentConsent, AgentStatus } from './agents-consent';
import { ids, stateFixture, pairingFixture, proposalFixture, mountAgents, button, click, checkbox, toggle } from './agents-test-helpers';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../bridge', () => ({ desktop: { invoke } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let state: AgentsState;
let view: Awaited<ReturnType<typeof mountAgents>>;
const decisions = () => invoke.mock.calls.filter(([channel]) => channel.endsWith('-decision'));
beforeEach(async () => {
  await i18n.changeLanguage('en');
  state = { ...stateFixture(), enabled: true };
  invoke.mockReset().mockImplementation(async channel => channel === 'mcp:state' ? state : { ok: true });
});
afterEach(async () => { await view?.unmount(); vi.useRealTimers(); });
const mount = async () => { view = await mountAgents(<><AgentStatus /><AgentConsent /></>); };

it('defaults to requested read scopes only and requires an account and code comparison', async () => {
  state.pairings = [pairingFixture()]; await mount();
  expect(document.body.textContent).toContain('ABCD-1234');
  expect(document.body.textContent).toContain('self-reported');
  expect(checkbox('Read courses and accounts').getAttribute('aria-checked')).toBe('true');
  expect(checkbox('Read course content').getAttribute('aria-checked')).toBe('true');
  expect(checkbox('Read grades').getAttribute('aria-checked')).toBe('false');
  expect(checkbox('Propose local planner changes').getAttribute('aria-checked')).toBe('false');
  expect(document.querySelector('[role=dialog]')!.textContent).not.toContain('Read course files');
  expect(checkbox('Example University').getAttribute('aria-checked')).toBe('false');
  expect(button('Pair with selected access').disabled).toBe(true);
  await toggle('I compared both codes');
  expect(button('Pair with selected access').disabled).toBe(true);
  await toggle('Example University');
  expect(button('Pair with selected access').disabled).toBe(false);
  await click('Pair with selected access');
  expect(decisions()).toEqual([['mcp:pair-decision', { pairingId: ids.pairing, approve: true, scopes: ['read:courses', 'read:content'], accountIds: [ids.account] }]]);
  expect(document.querySelector('[role=dialog]')).toBeNull();
});

it('permits only explicit requested grade and write additions', async () => {
  state.pairings = [pairingFixture()]; await mount();
  await toggle('I compared both codes'); await toggle('Other School');
  await toggle('Read grades'); await toggle('Propose local planner changes');
  await click('Pair with selected access');
  expect(decisions()).toEqual([['mcp:pair-decision', { pairingId: ids.pairing, approve: true, scopes: ['read:courses', 'read:content', 'read:grades', 'write:local'], accountIds: [ids.otherAccount] }]]);
});

it('cannot pair with no account or with no selected scope', async () => {
  state.pairings = [pairingFixture()]; state.accounts = []; await mount();
  await toggle('I compared both codes');
  expect(button('Pair with selected access').disabled).toBe(true);
  expect(document.body.textContent).toContain('Connect a school in Courses');
  await toggle('Read courses and accounts'); await toggle('Read course content');
  expect(button('Pair with selected access').disabled).toBe(true);
  expect(decisions()).toEqual([]);
});

it('denies the exact pairing with no granted scopes or accounts and focuses Deny', async () => {
  state.pairings = [pairingFixture()]; await mount();
  expect(document.activeElement).toBe(button('Deny'));
  await click('Deny');
  expect(decisions()).toEqual([['mcp:pair-decision', { pairingId: ids.pairing, approve: false, scopes: [], accountIds: [] }]]);
});

it('shows the exact proposal target, payload, account and risk as text', async () => {
  const injection = '<img src=x onerror=alert(1)><a href="https://evil.test">open</a>';
  state.proposals = [{ ...proposalFixture(), target: injection, payload: { text: injection }, clientName: injection }];
  await mount();
  expect(document.body.textContent).toContain(injection);
  expect(document.querySelector('pre')?.textContent).toBe(JSON.stringify({ text: injection }, null, 2));
  expect(document.body.textContent).toContain('Example University · student');
  expect(document.body.textContent).toContain(ids.account);
  expect(document.body.textContent).toContain('School draft or public post');
  expect(document.body.textContent).toContain('60 seconds remaining');
  expect(document.querySelector('img,a,script')).toBeNull();
  expect(document.activeElement).toBe(button('Deny'));
});

it.each([true, false])('sends a one-shot proposal decision with approve=%s and the exact ID', async approve => {
  state.proposals = [proposalFixture()]; await mount(); await toggle('I confirm this is my own work');
  await click(approve ? 'Approve once' : 'Deny');
  expect(decisions()).toEqual([['mcp:proposal-decision', { proposalId: ids.proposal, approve }]]);
  expect(document.querySelector('[role=dialog]')).toBeNull();
});

it('uses Escape as a denial', async () => {
  state.proposals = [proposalFixture()]; await mount(); await toggle('I confirm this is my own work');
  await act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(decisions()).toEqual([['mcp:proposal-decision', { proposalId: ids.proposal, approve: false }]]);
});

it.each(['pairing', 'proposal'])('disables %s approval at the exact expiry deadline', async kind => {
  vi.useFakeTimers();
  const expiresAt = new Date(Date.now() + 600).toISOString();
  if (kind === 'pairing') state.pairings = [{ ...pairingFixture(), expiresAt }];
  else state.proposals = [{ ...proposalFixture(), expiresAt }];
  await mount();
  if (kind === 'pairing') { await toggle('I compared both codes'); await toggle('Example University'); }
  else await toggle('I confirm this is my own work');
  const approve = button(kind === 'pairing' ? 'Pair with selected access' : 'Approve once');
  expect(approve.disabled).toBe(false);
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(approve.disabled).toBe(true);
  expect(document.body.textContent).toContain('This request has expired.');
  await act(() => approve.click());
  expect(decisions()).toEqual([]);
  await click('Close');
  expect(document.querySelector('[role=dialog]')).toBeNull();
});

it('rejects approval when the wall clock passes expiry before the UI clock rerenders', async () => {
  vi.useFakeTimers(); state.proposals = [proposalFixture()]; await mount(); await toggle('I confirm this is my own work');
  const approve = button('Approve once'); expect(approve.disabled).toBe(false);
  vi.setSystemTime(Date.now() + 61000);
  await act(() => approve.click());
  expect(decisions()).toEqual([]);
});

it('disables all decisions during async work and never retries an uncertain decision', async () => {
  vi.useFakeTimers(); state.proposals = [proposalFixture()]; await mount(); await toggle('I confirm this is my own work');
  let reject!: (error: Error) => void;
  invoke.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  await act(() => { button('Approve once').click(); button('Approve once').click(); button('Deny').click(); });
  expect(button('Approve once').disabled).toBe(true);
  expect(button('Deny').disabled).toBe(true);
  expect(decisions()).toHaveLength(1);
  await act(() => reject(new Error('raw secret')));
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(button('Approve once').disabled).toBe(true);
  expect(document.body.textContent).toContain('cannot be sent again here');
  expect(document.body.textContent).not.toContain('raw secret');
  await click('Close');
  expect(decisions()).toHaveLength(1);
});

it('never approves an already expired proposal and does not auto-deny by sending a write', async () => {
  state.proposals = [{ ...proposalFixture(), expiresAt: '2020-01-01T00:00:00.000Z' }]; await mount();
  expect(button('Approve once').disabled).toBe(true);
  expect(button('Deny').disabled).toBe(true);
  expect(decisions()).toEqual([]);
});

it('removes stale requests when the master is disabled or the backend cancels them', async () => {
  vi.useFakeTimers(); state.proposals = [proposalFixture()]; await mount(); await toggle('I confirm this is my own work');
  const approve = button('Approve once');
  state = { ...state, enabled: false, proposals: [] };
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(document.querySelector('[role=dialog]')).toBeNull();
  await act(() => approve.click());
  expect(decisions()).toEqual([]);
});

it('blocks pairing if the selected account disappears during consent', async () => {
  vi.useFakeTimers(); state.pairings = [pairingFixture()]; await mount();
  await toggle('I compared both codes'); await toggle('Example University');
  expect(button('Pair with selected access').disabled).toBe(false);
  state = { ...state, accounts: [] };
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(button('Pair with selected access').disabled).toBe(true);
  expect(decisions()).toEqual([]);
});

it('blocks pairing after all requested permissions are deselected', async () => {
  state.pairings = [pairingFixture()]; await mount();
  await toggle('I compared both codes'); await toggle('Example University');
  await toggle('Read courses and accounts'); await toggle('Read course content');
  expect(button('Pair with selected access').disabled).toBe(true);
  expect(decisions()).toEqual([]);
});

it('blocks approval when polling goes offline and allows a safe local dismissal', async () => {
  vi.useFakeTimers(); state.proposals = [proposalFixture()]; await mount(); await toggle('I confirm this is my own work');
  invoke.mockRejectedValueOnce(new Error('private raw failure'));
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(button('Approve once').disabled).toBe(true);
  expect(document.body.textContent).toContain(tr('agents:offline'));
  await click('Close');
  expect(document.querySelector('[role=dialog]')).toBeNull();
  expect(decisions()).toEqual([]);
});

it('does not replace the active request when a different request arrives', async () => {
  vi.useFakeTimers(); state.pairings = [pairingFixture()]; await mount();
  await toggle('I compared both codes');
  state = { ...state, proposals: [proposalFixture()] };
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(document.body.textContent).toContain('Allow this agent to connect?');
  expect(checkbox('I compared both codes').getAttribute('aria-checked')).toBe('true');
  await click('Deny');
  expect(document.body.textContent).toContain('Approve this action?');
  expect(document.activeElement).toBe(button('Deny'));
});

it('shows a live accessible status and opens Agents settings without mounting the page', async () => {
  state.activeCalls = 2; await mount();
  const listener = vi.fn(); window.addEventListener('vstudy:open-settings', listener);
  try {
    const status = view.host.querySelector('[data-testid=agent-status]');
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.textContent).toContain('Agent active · 2 calls');
    expect(view.host.querySelector('[data-testid=agents-settings]')).toBeNull();
    await click('Agent active · 2 calls');
    expect((listener.mock.calls[0]![0] as CustomEvent).detail).toEqual({ tab: 'agents' });
  } finally { window.removeEventListener('vstudy:open-settings', listener); }
});

it.each(['en', 'zh-Hant', 'ja'])('translates pairing scopes and risk labels in %s', async locale => {
  await i18n.changeLanguage(locale); state.pairings = [pairingFixture()]; await mount();
  expect(document.body.textContent).toContain(tr('agents:scope_read_courses'));
  expect(document.body.textContent).toContain(tr('agents:pair_title'));
  expect(document.body.textContent).not.toContain('agents:');
});
it('requires the student to confirm ownership before approving an assignment submission',async()=>{
  state.proposals=[{...proposalFixture(),tool:'save_assignment_draft',risk:'high',payload:{text:'My own reflection.',studentOwned:true}}];
  await mount();
  expect(button('Approve once').disabled).toBe(true);
  await toggle('I confirm this is my own work');
  expect(button('Approve once').disabled).toBe(false);
  await click('Approve once');
  expect(decisions()).toEqual([['mcp:proposal-decision',{proposalId:ids.proposal,approve:true}]]);
});

it('returns focus to the previous settings control after Escape', async () => {
  const control = document.createElement('button');
  document.body.append(control); control.focus();
  await mount();
  await act(() => document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true})));
  await act(() => new Promise(resolve => setTimeout(resolve, 10)));
  expect(document.activeElement).toBe(control);
  control.remove();
});
