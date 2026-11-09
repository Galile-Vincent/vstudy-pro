// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SubscriptionMeters } from './subscriptions';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const rows = [
  {
    provider: 'claude',
    status: 'ready',
    windows: [{ label: '5h', usedPercent: 40, resetsAt: null }],
    fetchedAt: null,
    nextRefreshAt: '2026-11-09T00:00:00.000Z',
  },
];
const settle = () => act(async () => {});
it('clears the unavailable state once a refresh succeeds', async () => {
  invoke.mockRejectedValue(new Error('probe failed'));
  render(<SubscriptionMeters />);
  await settle();
  expect(screen.getByText('Unavailable')).toBeTruthy();
  invoke.mockResolvedValue(rows);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh usage' }));
  await settle();
  expect(screen.queryByText('Unavailable')).toBeNull();
  expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
});
it('clears the unavailable state when Keychain consent triggers a successful refresh', async () => {
  invoke.mockRejectedValue(new Error('probe failed'));
  render(<SubscriptionMeters />);
  await settle();
  expect(screen.getByText('Unavailable')).toBeTruthy();
  invoke.mockResolvedValue(rows);
  fireEvent.click(screen.getByRole('checkbox'));
  await settle();
  expect(invoke).toHaveBeenLastCalledWith('usage:subscriptions', {
    allowClaudeKeychain: true,
    refresh: true,
  });
  expect(screen.queryByText('Unavailable')).toBeNull();
  expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
});
