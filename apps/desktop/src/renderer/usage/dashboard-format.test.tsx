// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { i18n } from '../../shared/i18n';
import { UsageDashboard } from './dashboard';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('./subscriptions', () => ({ SubscriptionMeters: () => null }));
afterEach(async () => {
  cleanup();
  vi.resetAllMocks();
  await i18n.changeLanguage('en');
});
const dashboard = {
  summary: {
    inputTokens: 36500000,
    outputTokens: 7300000,
    costUsd: 219,
    calls: 12345,
    unknownPrices: 0,
    groups: [
      {
        providerId: 'openai-api',
        modelId: 'm',
        documentId: null,
        inputTokens: 36500000,
        outputTokens: 7300000,
        costUsd: 219,
        calls: 12345,
        unknownPrices: 0,
      },
    ],
  },
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  days: [
    { date: '2026-11-03', inputTokens: 1200, outputTokens: 340 },
    { date: '2026-11-04', inputTokens: 5, outputTokens: 6 },
  ],
};
const show = async (language: string) => {
  await i18n.changeLanguage(language);
  invoke.mockResolvedValue(dashboard);
  const view = render(<UsageDashboard documents={[]} />);
  await act(async () => {});
  return view;
};
const expected = {
  en: { calls: '12,345', date: 'Nov 3, 2026' },
  'zh-Hant': { calls: '12,345', date: '2026年11月3日' },
  ja: { calls: '12,345', date: '2026/11/03' },
} as const;
for (const language of ['en', 'zh-Hant', 'ja'] as const)
  it(`formats breakdown calls and every chart date in ${language}`, async () => {
    const { container } = await show(language);
    const { calls, date } = expected[language];
    expect(screen.getByRole('cell', { name: calls })).toBeTruthy();
    expect(container.textContent).not.toContain('2026-11-03');
    expect(container.textContent).not.toContain('12345');
    const title = container.querySelector('svg title')?.textContent ?? '';
    expect(title).toContain(date);
    const table = container.querySelector('details table');
    expect(table?.textContent).toContain(date);
    expect(container.querySelectorAll('.usage-axis-labels span')[0]?.textContent).toBe(date);
  });
