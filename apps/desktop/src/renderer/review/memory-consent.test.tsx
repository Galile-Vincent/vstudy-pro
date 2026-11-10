// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryConsentCard as Card } from './memory-consent';
import { i18n } from '../../shared/i18n';
import en from '../../shared/locales/en/review.json';
import ja from '../../shared/locales/ja/review.json';
import zhHant from '../../shared/locales/zh-Hant/review.json';
const invoke = vi.fn();
vi.mock('../bridge', () => ({ desktop: { invoke: (...args: unknown[]) => invoke(...args) } }));
let prefs = { memoryEnabled: true, noticeAcknowledged: false, consentAcknowledged: false, timeZone: 'UTC' };
beforeEach(async () => {
  sessionStorage.clear();
  prefs = { memoryEnabled: true, noticeAcknowledged: false, consentAcknowledged: false, timeZone: 'UTC' };
  invoke.mockImplementation(async (channel: string, input: object) => channel === 'review:prefs:set' ? (prefs = { ...prefs, ...input }) : prefs);
  await i18n.changeLanguage('en');
});
afterEach(async () => { cleanup(); invoke.mockReset(); await i18n.changeLanguage('en'); });
it.each([['en', en], ['ja', ja], ['zh-Hant', zhHant]] as const)('discloses what is sent, to which provider and when, in %s, and turns memory on only on request', async (language, catalog) => {
  await i18n.changeLanguage(language);
  render(<Card />);
  expect(await screen.findByText(catalog.memory_disclosure)).toBeTruthy();
  expect(screen.getByRole('heading', { name: catalog.consent_title })).toBeTruthy();
  expect(screen.getAllByRole('region', {name: catalog.consent_title})).toHaveLength(1);
  expect(screen.getAllByRole('region')).toHaveLength(1);
  expect(invoke).not.toHaveBeenCalledWith('review:prefs:set', expect.anything());
  fireEvent.click(screen.getByRole('button', { name: catalog.consent_turn_on }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:prefs:set', { memoryEnabled: true, consentAcknowledged: true }));
  expect(await screen.findByRole('status')).toBeTruthy();
  expect(screen.queryByText(catalog.memory_disclosure)).toBeNull();
});
it('Not now keeps memory off and does not ask again until the app restarts', async () => {
  const first = render(<Card />);
  fireEvent.click(await screen.findByRole('button', { name: en.consent_not_now }));
  expect(screen.queryByText(en.memory_disclosure)).toBeNull();
  expect(invoke).not.toHaveBeenCalledWith('review:prefs:set', expect.anything());
  first.unmount();
  render(<Card />);
  expect(screen.queryByText(en.memory_disclosure)).toBeNull();
  sessionStorage.clear();
  render(<Card />);
  expect(await screen.findByText(en.memory_disclosure)).toBeTruthy();
});
it.each([
  ['already agreed', { consentAcknowledged: true }],
  ['memory switched off by the student', { memoryEnabled: false }],
])('stays out of the way when %s', async (_name, change) => {
  prefs = { ...prefs, ...change };
  render(<Card />);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:prefs:get', {}));
  expect(screen.queryByRole('region')).toBeNull();
});
it('offers another try when saving fails and leaves memory off', async () => {
  render(<Card />);
  invoke.mockImplementation(async (channel: string) => { if (channel === 'review:prefs:set') throw new Error('disk'); return prefs; });
  fireEvent.click(await screen.findByRole('button', { name: en.consent_turn_on }));
  expect((await screen.findByRole('alert')).textContent).toBe(en.error);
  expect(screen.getByRole('button', { name: en.consent_turn_on })).toBeTruthy();
});
