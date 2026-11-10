// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { i18n } from '../../shared/i18n';
import en from '../../shared/locales/en/review.json';
import ja from '../../shared/locales/ja/review.json';
import { MemorySettings } from './memory-settings';
const invoke = vi.fn();
vi.mock('../bridge', () => ({ desktop: { invoke: (...args: unknown[]) => invoke(...args) } }));
beforeEach(async () => {
  HTMLDialogElement.prototype.showModal ??= function() { this.open = true; };
  HTMLDialogElement.prototype.close ??= function() { this.open = false; };
  await i18n.changeLanguage('en');
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('shows memory as off until the student agrees, then saves the switch and requires confirmation before erasing', async () => {
  let prefs = { memoryEnabled: true, noticeAcknowledged: false, consentAcknowledged: false, timeZone: 'UTC' };
  invoke.mockImplementation(async (channel, input) => channel === 'review:prefs:erase' ? { ok: true } : (prefs = { ...prefs, ...input }));
  render(<MemorySettings />);
  const toggle = await screen.findByRole('switch', { name: en.memory_enabled }) as HTMLInputElement;
  expect(screen.getByText(en.memory_disclosure)).toBeTruthy();
  expect(toggle.checked).toBe(false);
  fireEvent.click(toggle);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:prefs:set', { memoryEnabled: true, consentAcknowledged: true }));
  await waitFor(() => expect(toggle.checked).toBe(true));
  fireEvent.click(toggle);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:prefs:set', { memoryEnabled: false }));
  fireEvent.click(screen.getByRole('button', { name: en.erase_memory }));
  expect(invoke).not.toHaveBeenCalledWith('review:prefs:erase', {});
  fireEvent.click(screen.getByRole('button', { name: en.erase_confirm }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:prefs:erase', {}));
});
it('describes the automatic provider request in the interface language', async () => {
  await i18n.changeLanguage('ja');
  invoke.mockResolvedValue({ memoryEnabled: true, noticeAcknowledged: true, consentAcknowledged: true, timeZone: 'UTC' });
  render(<MemorySettings />);
  expect(await screen.findByText(ja.memory_disclosure)).toBeTruthy();
  expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(true);
});
it('offers retry when preferences cannot be read', async () => {
  invoke.mockRejectedValueOnce(new Error('offline'));
  render(<MemorySettings />);
  await screen.findByRole('alert');
  invoke.mockResolvedValue({ memoryEnabled: false, noticeAcknowledged: true, consentAcknowledged: true, timeZone: 'UTC' });
  fireEvent.click(screen.getByRole('button', { name: en.retry }));
  await screen.findByRole('switch');
});
