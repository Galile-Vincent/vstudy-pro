// @vitest-environment jsdom
/** Settings is driven through visible controls and the validated IPC effects they request. */
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { i18n, tr } from '../../shared/i18n';
import type { AgentsState } from '../../shared/mcp';
import { AgentsSettings } from './agents';
import { ids, pairingFixture, stateFixture, grantFixture, mountAgents, button, click, toggle } from './agents-test-helpers';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../bridge', () => ({ desktop: { invoke } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let state: AgentsState;
let view: Awaited<ReturnType<typeof mountAgents>>;
beforeEach(async () => {
  await i18n.changeLanguage('en');
  state = stateFixture();
  invoke.mockReset().mockImplementation(async (channel, request) => {
    if (channel === 'mcp:state') return state;
    if (channel === 'mcp:enable') state = { ...state, enabled: request.enabled };
    if (channel === 'mcp:revoke') state = { ...state, grants: state.grants.map(grant => grant.id === request.grantId ? { ...grant, revokedAt: new Date().toISOString() } : grant) };
    if (channel === 'mcp:edit-grant') state = { ...state, grants: state.grants.map(grant => grant.id === request.grantId ? { ...grant, ...request } : grant) };
    return { ok: true };
  });
});
afterEach(async () => { await view?.unmount(); vi.useRealTimers(); });
const mount = async () => { view = await mountAgents(<AgentsSettings />); };

it('leaves the master off until the user switches it on and off', async () => {
  await mount();
  const master = document.querySelector<HTMLButtonElement>('[role=switch]')!;
  expect(master.getAttribute('aria-checked')).toBe('false');
  expect(invoke.mock.calls).toEqual([['mcp:state', {}]]);
  await act(() => master.click());
  expect(master.getAttribute('aria-checked')).toBe('true');
  await act(() => master.click());
  expect(invoke.mock.calls.filter(([channel]) => channel === 'mcp:enable')).toEqual([
    ['mcp:enable', { enabled: true }], ['mcp:enable', { enabled: false }],
  ]);
});

it('shows grants with account IDs, permissions and local dates and revokes the exact grant', async () => {
  state.grants = [grantFixture()];
  await mount();
  expect(view.host.textContent).toContain(ids.account);
  expect(view.host.textContent).toContain('Read courses and accounts');
  expect(view.host.textContent).toContain('Never');
  expect(view.host.querySelector('time')?.dateTime).toBe('2026-01-01T00:00:00.000Z');
  await click('Revoke access');
  expect(invoke).toHaveBeenCalledWith('mcp:revoke', { grantId: ids.grant });
  expect(view.host.textContent).toContain('Revoked');
  expect(view.host.textContent).not.toContain('Revoke access');
});

it('edits exact scopes, accounts and future expiry only after save', async () => {
  state.grants = [grantFixture()];
  await mount();
  await click('Edit access');
  await toggle('Read grades');
  await toggle('Other School');
  expect(invoke.mock.calls.some(([channel]) => channel === 'mcp:edit-grant')).toBe(false);
  const expiry = document.querySelector<HTMLInputElement>('input[type=datetime-local]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(() => { setter.call(expiry, '2099-07-08T14:30'); expiry.dispatchEvent(new Event('input', { bubbles: true })); });
  await click('Save access');
  expect(invoke).toHaveBeenCalledWith('mcp:edit-grant', {
    grantId: ids.grant, scopes: ['read:courses', 'read:grades'], accountIds: [ids.account, ids.otherAccount],
    expiresAt: new Date('2099-07-08T14:30').toISOString(),
  });
  expect(document.querySelector('[role=dialog]')).toBeNull();
});

it('blocks saving without an account or permission and with an expired date', async () => {
  state.grants = [grantFixture()];
  await mount(); await click('Edit access');
  await toggle('Example University');
  expect(button('Save access').disabled).toBe(true);
  await toggle('Example University'); await toggle('Read courses and accounts');
  expect(button('Save access').disabled).toBe(true);
  await toggle('Read courses and accounts');
  const expiry = document.querySelector<HTMLInputElement>('input[type=datetime-local]')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(expiry, '2020-01-01T00:00');
    expiry.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(button('Save access').disabled).toBe(true);
  expect(document.querySelector('[role=alert]')?.textContent).toContain('future');
  expect(invoke.mock.calls.some(([channel]) => channel === 'mcp:edit-grant')).toBe(false);
});

it('shows safe offline and action errors without leaking raw IPC exceptions', async () => {
  invoke.mockRejectedValueOnce(new Error('token=secret'));
  await mount();
  expect(view.host.textContent).toContain(tr('agents:offline'));
  expect(document.querySelector<HTMLButtonElement>('[role=switch]')!.disabled).toBe(true);
  expect(view.host.textContent).not.toContain('token=');
  await click('Refresh');
  invoke.mockRejectedValueOnce(new Error('wsfunction=secret'));
  await act(() => document.querySelector<HTMLButtonElement>('[role=switch]')!.click());
  expect(view.host.textContent).toContain(tr('agents:action_error'));
  expect(view.host.textContent).not.toContain('wsfunction=');
});

it('renders every activity entry with fixed statuses and literal redacted arguments', async () => {
  const injection = '<img src=x onerror="alert(1)"><a href="https://evil.test">click</a>';
  state.activity = [
    { id: ids.proposal, at: '2026-02-03T04:05:06.000Z', clientName: injection, tool: 'list_courses', accountId: ids.account, status: 'OK', args: { query: injection, token: '[REDACTED]' } },
    { id: ids.otherProposal, at: '2026-02-03T05:05:06.000Z', clientName: 'Other agent', tool: 'get_course', accountId: null, status: injection, args: {} },
  ];
  await mount();
  expect(view.host.querySelectorAll('.agents-activity > li')).toHaveLength(2);
  expect(view.host.textContent).toContain('Completed');
  expect(view.host.textContent).toContain('Unknown result');
  expect(view.host.textContent).toContain(injection);
  expect(view.host.textContent).toContain('[REDACTED]');
  expect(view.host.querySelector('img,a,script')).toBeNull();
});

it.each(['en', 'zh-Hant', 'ja'])('renders translated controls in %s', async locale => {
  await i18n.changeLanguage(locale);
  await mount();
  expect(button(tr('agents:master')).getAttribute('aria-checked')).toBe('false');
  expect(view.host.textContent).toContain(tr('agents:no_grants'));
  expect(view.host.textContent).not.toContain('agents:');
});

it('shows platform unavailability without losing Settings controls', async () => {
  state.unavailable = true;
  await mount();
  expect(view.host.textContent).toContain('Agent access is unavailable on this platform/build');
  expect(document.querySelector('[role=switch]')).not.toBeNull();
});

it('lists pending requests with a review action', async () => {
  state.enabled = true;
  state.pairings = [pairingFixture()];
  await mount();
  expect(view.host.textContent).toContain('Waiting for you');
  expect(button('Review')).toBeTruthy();
});

it('announces successful revocation inline', async () => {
  state.grants = [grantFixture()];
  await mount(); await click('Revoke access');
  expect(view.host.querySelector('[role=status]')?.textContent).toContain('Access revoked');
});

it('allows a failed pairing denial to be retried and reports the error', async () => {
  state.enabled=true;state.pairings=[pairingFixture()];await mount();
  invoke.mockRejectedValueOnce(new Error('private failure'));
  await click('Deny');
  expect(view.host.textContent).toContain(tr('agents:action_error'));
  await click('Deny');
  expect(invoke.mock.calls.filter(([c])=>c==='mcp:pair-decision')).toHaveLength(2);
});
