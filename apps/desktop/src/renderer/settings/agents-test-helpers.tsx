/** Shared inert fixtures and DOM interactions for observable agent UI tests. */
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect } from 'vitest';
import type { AgentsState, Grant, Pairing, Proposal } from '../../shared/mcp';
import { AgentsProvider } from './agents-state';

export const ids = {
  account: '11111111-1111-4111-8111-111111111111',
  otherAccount: '22222222-2222-4222-8222-222222222222',
  grant: '33333333-3333-4333-8333-333333333333',
  client: '44444444-4444-4444-8444-444444444444',
  pairing: '55555555-5555-4555-8555-555555555555',
  proposal: '66666666-6666-4666-8666-666666666666',
  otherProposal: '77777777-7777-4777-8777-777777777777',
};
export const future = () => new Date(Date.now() + 86400000).toISOString();
export const grantFixture = (): Grant => ({
  id: ids.grant, clientId: ids.client, clientName: 'My agent', scopes: ['read:courses'], accountIds: [ids.account],
  createdAt: '2026-01-01T00:00:00.000Z', expiresAt: future(), lastUsedAt: null, revokedAt: null,
});
export const pairingFixture = (): Pairing => ({
  id: ids.pairing, clientId: ids.client, clientName: 'My agent', code: 'ABCD-1234',
  requestedScopes: ['read:courses', 'read:content', 'read:grades', 'write:local'], expiresAt: future(),
});
export const proposalFixture = (): Proposal => ({
  id: ids.proposal, grantId: ids.grant, clientName: 'My agent', tool: 'save_assignment_draft', risk: 'high',
  accountId: ids.account, target: 'Example University / Biology / My assignment', payload: { text: 'My own essay', studentOwned: true },
  createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(),
});
export const stateFixture = (): AgentsState => ({
  enabled: false, grants: [], pairings: [], proposals: [], activity: [], activeCalls: 0,
  accounts: [{ id: ids.account, school: 'Example University', user: 'student' }, { id: ids.otherAccount, school: 'Other School', user: 'other-student' }],
});
export async function mountAgents(children: ReactNode) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  await act(() => root.render(<AgentsProvider>{children}</AgentsProvider>));
  return { host, root, unmount: async () => { await act(() => root.unmount()); host.remove(); } };
}
export function button(name: string, scope: ParentNode = document) {
  const value = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === name || item.getAttribute('aria-label') === name || !!item.id && [...scope.querySelectorAll('label')].some(label => label.htmlFor === item.id && label.textContent?.trim() === name));
  expect(value, `button ${name}`).toBeDefined();
  return value!;
}
export async function click(name: string, scope: ParentNode = document) { await act(() => button(name, scope).click()); }
export function checkbox(label: string) {
  const target = [...document.querySelectorAll('label')].find(item => item.textContent?.includes(label));
  const element = target?.htmlFor ? document.getElementById(target.htmlFor) as HTMLInputElement | null : null;
  expect(element, `checkbox ${label}`).toBeTruthy();
  return element!;
}
export async function toggle(label: string) { await act(() => checkbox(label).click()); }
