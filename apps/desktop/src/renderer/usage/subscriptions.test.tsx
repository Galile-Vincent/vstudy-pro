// @vitest-environment jsdom
import { act, fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { i18n } from '../../shared/i18n';
import { SubscriptionWindowMeter } from './meter';
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
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('defaults to one collapsed summary with the highest provider window and wired disclosure', async () => {
  render(<SubscriptionMeters compact />);
  await waitFor(() => expect(screen.getByText('85%', { selector: '.subscription-summary-percent' })).toBeTruthy());
  const button = screen.getByRole('button', { name: 'Expand subscription usage' });
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(document.getElementById(button.getAttribute('aria-controls')!)?.hidden).toBe(true);
  expect(screen.getByText('Codex · 5h', { selector: '.subscription-summary-label' })).toBeTruthy();
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
  let resolve!: (rows: SubscriptionUsage[]) => void;
  vi.mocked(desktop.invoke).mockReturnValue(new Promise<SubscriptionUsage[]>(done => { resolve = done; }));
  localStorage.setItem(key, 'true');
  const { container } = render(<SubscriptionMeters compact />);
  expect(container.querySelector('small[role="status"]')?.textContent).toBe('Usage…');
  await act(async () => resolve([]));
  await waitFor(() => expect(container.querySelector('small[role="status"]')).toBeNull());
  expect(screen.getByText('Usage')).toBeTruthy();
  expect(screen.getByText('—')).toBeTruthy();
  expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('Unknown');
});
it('does not summarize stale windows as current usage', async () => {
  vi.mocked(desktop.invoke).mockResolvedValue([{ ...usage('claude', [99]), status: 'stale' }, usage('codex', [0])]);
  render(<SubscriptionMeters compact />);
  await waitFor(() => expect(screen.getByText('0%', { selector: '.subscription-summary-percent' })).toBeTruthy());
  expect(screen.getByText('Codex · 5h', { selector: '.subscription-summary-label' })).toBeTruthy();
});
it('works when storage reads and writes throw', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('disabled'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled'); });
  render(<SubscriptionMeters compact />);
  fireEvent.click(screen.getByRole('button', { name: 'Expand subscription usage' }));
  expect(screen.getByRole('button', { name: 'Collapse subscription usage' }).getAttribute('aria-expanded')).toBe('true');
});

it('names the selected window and reports providers without current data', async () => {
  vi.mocked(desktop.invoke).mockResolvedValue([
    { ...usage('claude', [99]), status: 'unavailable' }, usage('codex', [10]),
  ]);
  render(<SubscriptionMeters compact />);
  const bar = await screen.findByRole('progressbar', { name: 'Codex · 5h' });
  expect(bar.getAttribute('aria-valuetext')).toBe('Codex · 5h: 10% used');
  expect(screen.getByText('1 unavailable')).toBeTruthy();
});
it('breaks equal usage ties by the soonest reset', async () => {
  const claude = usage('claude', [85]);
  const codex = usage('codex', [85]);
  claude.windows[0]!.resetsAt = '2026-11-10T00:00:00Z';
  codex.windows[0]!.resetsAt = '2026-11-09T12:00:00Z';
  vi.mocked(desktop.invoke).mockResolvedValue([claude, codex]);
  render(<SubscriptionMeters compact />);
  expect(await screen.findByRole('progressbar', { name: 'Codex · 5h' })).toBeTruthy();
});

it('exposes one subscription landmark when expanded', async () => {
  localStorage.setItem(key, 'true');
  render(<SubscriptionMeters compact />);
  await screen.findByText('Codex · 5h', { selector: '.subscription-summary-label' });
  expect(screen.getAllByRole('region', { name: 'Subscription limits' })).toHaveLength(1);
});

it('only adds a details tab stop while the expanded content overflows', async () => {
  let resize = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  localStorage.setItem(key, 'true');
  const { container, unmount } = render(<SubscriptionMeters compact />);
  await screen.findByText('Codex · 5h', { selector: '.subscription-summary-label' });
  const details = container.querySelector('.subscription-details')!;
  expect(details.getAttribute('tabindex')).toBeNull();
  Object.defineProperties(details, {
    scrollHeight: { configurable: true, value: 300 },
    clientHeight: { configurable: true, value: 200 },
  });
  act(() => resize());
  expect(details.getAttribute('tabindex')).toBe('0');
  Object.defineProperty(details, 'clientHeight', { value: 400 });
  act(() => resize());
  expect(details.getAttribute('tabindex')).toBeNull();
  unmount();
  expect(disconnect).toHaveBeenCalled();
});

it('preserves the full text of truncated summary and window labels', async () => {
  const label = 'A very long subscription provider and weekly usage window label';
  render(<><SubscriptionMeters compact /><SubscriptionWindowMeter label={label} usedPercent={30} /></>);
  await screen.findByText('Codex · 5h', { selector: '.subscription-summary-label' });
  expect(screen.getByText('Codex · 5h').getAttribute('title')).toBe('Codex · 5h');
  expect(screen.getByText(label).getAttribute('title')).toBe(label);
  expect(screen.getByRole('progressbar', { name: label })).toBeTruthy();
});

it.each(['stale', 'not-signed-in', 'unsupported', 'unavailable'] as const)(
  'shows a non-color indicator for a %s provider', async status => {
    vi.mocked(desktop.invoke).mockResolvedValue([
      { ...usage('claude', [99]), status }, usage('codex', [10]),
    ]);
    render(<SubscriptionMeters compact />);
    expect(await screen.findByText('1 unavailable')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Codex · 5h' })
      .getAttribute('aria-valuenow')).toBe('10');
  },
);
it('counts every provider without current data', async () => {
  vi.mocked(desktop.invoke).mockResolvedValue([
    { ...usage('claude', []), status: 'unavailable' },
    { ...usage('codex', []), status: 'stale' },
  ]);
  render(<SubscriptionMeters compact />);
  expect(await screen.findByText('2 unavailable')).toBeTruthy();
  expect(screen.getByText('—')).toBeTruthy();
});
it('shows an unavailable summary when the initial request fails', async () => {
  vi.mocked(desktop.invoke).mockRejectedValue(new Error('offline'));
  render(<SubscriptionMeters compact />);
  expect(await screen.findByText('Unavailable', { selector: '.subscription-summary-unavailable' })).toBeTruthy();
  expect(screen.getByText('—')).toBeTruthy();
  expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('Unknown');
});
it('clears the current summary after a failed refresh and recovers', async () => {
  render(<SubscriptionMeters compact />);
  await screen.findByText('85%', { selector: '.subscription-summary-percent' });
  vi.mocked(desktop.invoke).mockRejectedValueOnce(new Error('offline'));
  act(() => window.dispatchEvent(new Event('subscription-refresh')));
  await screen.findByText('Unavailable', { selector: '.subscription-summary-unavailable' });
  expect(screen.getByText('—')).toBeTruthy();
  expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
  act(() => window.dispatchEvent(new Event('subscription-refresh')));
  await screen.findByText('85%', { selector: '.subscription-summary-percent' });
  expect(screen.queryByText('Unavailable')).toBeNull();
});
it.each([false, true])('uses a stable tie rule with reversed providers: %s', async reverse => {
  const rows = [usage('codex', [85, 85]), usage('claude', [85, 85])];
  vi.mocked(desktop.invoke).mockResolvedValue(reverse ? rows.reverse() : rows);
  render(<SubscriptionMeters compact />);
  expect(await screen.findByRole('progressbar', { name: 'Claude · 5h' })).toBeTruthy();
});
it('identifies a weekly window in the summary and accessible value', async () => {
  vi.mocked(desktop.invoke).mockResolvedValue([usage('claude', [10, 85])]);
  render(<SubscriptionMeters compact />);
  const bar = await screen.findByRole('progressbar', { name: 'Claude · Weekly' });
  expect(bar.getAttribute('aria-valuetext')).toBe('Claude · Weekly: 85% used');
});
it('keeps the details target mounted and visible when compact becomes false', async () => {
  const { container, rerender } = render(<SubscriptionMeters compact />);
  const id = screen.getByRole('button', { name: 'Expand subscription usage' }).getAttribute('aria-controls')!;
  rerender(<SubscriptionMeters compact={false} />);
  await screen.findByRole('progressbar', { name: 'Codex 5h' });
  expect(document.getElementById(id)?.hidden).toBe(false);
  for (const control of container.querySelectorAll('[aria-controls]')) {
    expect(document.getElementById(control.getAttribute('aria-controls')!)).toBeTruthy();
  }
  expect(screen.queryByRole('button', { name: 'Expand subscription usage' })).toBeNull();
});
it('exposes an expanded localized summary label without shrinking its percentage', async () => {
  const original = i18n.getResource('en', 'usage', 'quota_window_label');
  const pattern = '{{provider}} subscription usage over the entire {{window}} window';
  i18n.addResource('en', 'usage', 'quota_window_label', pattern);
  try {
    render(<SubscriptionMeters compact />);
    const label = await screen.findByText('Codex subscription usage over the entire 5h window');
    expect(label.getAttribute('title')).toBe(label.textContent);
    expect(screen.getByText('85%', { selector: '.subscription-summary-percent' })).toBeTruthy();
  } finally {
    i18n.addResource('en', 'usage', 'quota_window_label', original);
  }
});
it('mirrors the track in RTL while preserving the usage value', () => {
  const style = document.createElement('style');
  style.textContent = readFileSync('src/renderer/usage/usage.css', 'utf8');
  document.head.append(style);
  try {
    const { container } = render(<div dir="rtl"><SubscriptionWindowMeter label="Weekly" usedPercent={30} /></div>);
    const bar = screen.getByRole('progressbar', { name: 'Weekly' });
    expect(getComputedStyle(bar).transform).toBe('scaleX(-1)');
    expect(bar.getAttribute('aria-valuenow')).toBe('30');
    expect(container.querySelector('[data-slot=progress-indicator]')?.getAttribute('style'))
      .toContain('translateX(-70%)');
  } finally {
    style.remove();
  }
});
