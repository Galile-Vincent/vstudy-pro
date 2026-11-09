// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SubscriptionMeters } from './subscriptions';
import { desktop } from '../bridge';
import type { SubscriptionUsage } from '../../shared/subscription-usage';
vi.mock('../bridge', () => ({ desktop: { invoke: vi.fn() } }));
const key = 'vstudy-subscription-meters-expanded';
const usage = (provider: SubscriptionUsage['provider'], percentages: number[]): SubscriptionUsage => ({
  provider, status: 'ready', windows: percentages.map((usedPercent, i) => ({ label: i ? 'weekly' : '5h', usedPercent, resetsAt: null })),
  fetchedAt: null, nextRefreshAt: '2026-11-09T00:00:00Z',
});
beforeEach(() => {
  localStorage.clear();
  vi.mocked(desktop.invoke).mockResolvedValue([usage('claude', [10, 70]), usage('codex', [85, 20])]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('defaults to one collapsed summary with the highest provider window and wired disclosure', async () => {
  render(<SubscriptionMeters compact />);
  await waitFor(() => expect(screen.getByText('85%', { selector: '.subscription-summary-percent' })).toBeTruthy());
  const button = screen.getByRole('button', { name: 'Expand subscription usage' });
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(document.getElementById(button.getAttribute('aria-controls')!)?.hidden).toBe(true);
  expect(screen.getByText('Codex', { selector: '.subscription-summary-label' })).toBeTruthy();
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('85');
  expect(screen.queryByRole('button', { name: 'Refresh usage' })).toBeNull();
});
it('expands and collapses with pointer, exposes every window and refresh, and persists both states', async () => {
  const { unmount } = render(<SubscriptionMeters compact />);
  await waitFor(() => expect(screen.getByText('85%', { selector: '.subscription-summary-percent' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Expand subscription usage' }));
  expect(document.getElementById(screen.getByRole('button', { name: 'Collapse subscription usage' }).getAttribute('aria-controls')!)?.hidden).toBe(false);
  expect(screen.getAllByRole('progressbar')).toHaveLength(5);
  expect(localStorage.getItem(key)).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh usage' }));
  await waitFor(() => expect(desktop.invoke).toHaveBeenCalledWith('usage:subscriptions', { refresh: true, allowClaudeKeychain: false }));
  unmount();
  render(<SubscriptionMeters compact />);
  expect(screen.getByRole('button', { name: 'Collapse subscription usage' }).getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Collapse subscription usage' }));
  expect(localStorage.getItem(key)).toBe('false');
});
it('uses Usage and an unknown value when no current data exists', async () => {
  vi.mocked(desktop.invoke).mockResolvedValue([]);
  render(<SubscriptionMeters compact />);
  await waitFor(() => expect(document.querySelector('[aria-busy=false]')).toBeTruthy());
  expect(screen.getByText('Usage')).toBeTruthy();
  expect(screen.getByText('—')).toBeTruthy();
  expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('Unknown');
});
it('does not summarize stale windows as current usage', async () => {
  vi.mocked(desktop.invoke).mockResolvedValue([{ ...usage('claude', [99]), status: 'stale' }, usage('codex', [0])]);
  render(<SubscriptionMeters compact />);
  await waitFor(() => expect(screen.getByText('0%', { selector: '.subscription-summary-percent' })).toBeTruthy());
  expect(screen.getByText('Codex', { selector: '.subscription-summary-label' })).toBeTruthy();
});
it('works when storage reads and writes throw', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('disabled'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled'); });
  render(<SubscriptionMeters compact />);
  fireEvent.click(screen.getByRole('button', { name: 'Expand subscription usage' }));
  expect(screen.getByRole('button', { name: 'Collapse subscription usage' }).getAttribute('aria-expanded')).toBe('true');
});
