// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { i18n } from '../../shared/i18n';
import en from '../../shared/locales/en/review.json';
import ja from '../../shared/locales/ja/review.json';
import zhHant from '../../shared/locales/zh-Hant/review.json';
import { ArtifactPanel } from './artifacts';
const { invoke, subscribe } = vi.hoisted(() => ({ invoke: vi.fn(), subscribe: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke, onReviewProgress: subscribe } }));
vi.mock('../markdown', () => ({ DocumentMarkdown: ({ source }: { source: string }) => <article>{source}</article> }));
vi.mock('./scope-picker', () => ({ ScopePicker: ({ onChange }: { onChange: (s: unknown) => void }) => <button onClick={() => onChange({ kind: 'weak' })}>scope</button> }));
vi.mock('./test-player', () => ({ TestPlayer: () => null }));
const assumptions = ['retakeAttempt:3f2a0000-0000-4000-8000-000000000000', 'Some sources omitted due to excerpt budget', 'Source excerpt limited to first 6000 bytes: doc', 'Undated units based on when you asked: unit', 'a note from a future build'];
const artifact = { id: 'artifact', courseId: 'course', kind: 'note', title: 'A note', status: 'ready', createdAt: '2026-11-06T00:00:00.000Z', bodyMarkdown: '# Osmosis', test: null, scope: { kind: 'weak' }, errorCode: null,
  resolvedScope: { unitIds: ['unit'], documentIds: ['doc'], conceptKeys: ['osmosis'], sources: [{ documentId: 'doc', version: 'original', excerptHash: 'hash' }], assumptions, timeZone: 'Asia/Taipei', from: null, to: null } };
function setup(replyLanguage?: string) {
  subscribe.mockReturnValue(vi.fn());
  invoke.mockImplementation(async (channel: string) => {
    if (channel === 'documents:list') return [{ id: 'doc', title: 'Cell biology' }];
    if (channel === 'review:courses:units') return { items: [{ id: 'unit', title: 'Week 3' }], nextCursor: null };
    if (channel === 'review:artifact:list') return { items: [artifact], nextCursor: null };
    if (channel === 'settings:get') return { replyLanguage };
    if (channel === 'providers:list') return [{ config: { id: 'openai-api', enabled: true }, availability: { available: true }, models: [{ id: 'model', name: 'Model' }] }];
    if (channel === 'review:artifact:get' || channel === 'review:artifact:generate') return artifact;
    return { ok: true };
  });
}
beforeEach(async () => { await i18n.changeLanguage('en'); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it.each([['zh-Hant', zhHant], ['ja', ja], ['en', en]] as const)('explains assumptions in %s, hides the retake marker and drops unknown text', async (language, catalog) => {
  await i18n.changeLanguage(language); setup('auto');
  render(<ArtifactPanel courseId="course" kind="note" selection={null} />);
  fireEvent.click(await screen.findByRole('button', { name: 'A note' }));
  const list = (await screen.findByText(catalog.assumption_sources_omitted)).closest('ul')!;
  await waitFor(() => expect([...list.querySelectorAll('li')].map(li => li.textContent)).toEqual([
    catalog.assumption_sources_omitted,
    catalog.assumption_excerpt_limited.replace('{{document}}', 'Cell biology'),
    catalog.assumption_undated_units.replace('{{units}}', 'Week 3'),
  ]));
  expect(document.body.textContent).not.toContain('retakeAttempt');
  expect(document.body.textContent).not.toContain('future build');
});
it.each([['ja', 'auto', 'ja'], ['en', 'ja', 'ja'], ['zh-Hant', 'auto', 'zh-Hant'], ['ja', 'en', 'en']] as const)('with UI %s and reply language %s generates in %s', async (ui, reply, expected) => {
  await i18n.changeLanguage(ui); setup(reply);
  render(<ArtifactPanel courseId="course" kind="note" selection={null} />);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('settings:get', {}));
  fireEvent.click(screen.getByText('scope'));
  await waitFor(() => expect((screen.getByRole('button', { name: (ui === 'en' ? en : ui === 'ja' ? ja : zhHant).generate_note }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: (ui === 'en' ? en : ui === 'ja' ? ja : zhHant).generate_note }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:artifact:generate', expect.objectContaining({ locale: expected })));
});
