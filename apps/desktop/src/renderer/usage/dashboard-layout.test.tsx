// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { UsageDashboard } from './dashboard';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('./subscriptions', () => ({ SubscriptionMeters: () => <section data-testid="limits" /> }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const empty = {
  summary: { inputTokens: 1, outputTokens: 2, costUsd: 1, calls: 1, unknownPrices: 0, groups: [] },
  cacheReadTokens: 3,
  cacheWriteTokens: 4,
  reasoningTokens: 5,
  days: [],
};
it('orders controls, two stats, token details, chart, breakdown, then subscription limits', async () => {
  invoke.mockResolvedValue(empty);
  const { container } = render(<UsageDashboard documents={[]} />);
  await act(async () => {});
  const order = [
    screen.getByRole('combobox', { name: 'Usage period' }),
    ...container.querySelectorAll('[data-slot=stat]'),
    container.querySelector('dl'),
    container.querySelector('figure'),
    container.querySelector('table'),
    screen.getByTestId('limits'),
  ] as Node[];
  expect(container.querySelectorAll('[data-slot=stat]')).toHaveLength(2);
  for (let i = 1; i < order.length; i++)
    expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.querySelector('h1, main')).toBeNull();
  expect(container.querySelector('h3')).not.toBeNull();
});
