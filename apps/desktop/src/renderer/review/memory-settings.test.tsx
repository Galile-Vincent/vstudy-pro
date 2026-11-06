// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemorySettings } from './memory-settings';
const invoke = vi.fn();
vi.mock('../bridge', () => ({ desktop: { invoke: (...args: unknown[]) => invoke(...args) } }));
vi.mock('../../shared/i18n', () => ({ tr: (key: string) => key }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({}) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('shows the notice once, saves the switch, and requires confirmation before erasing', async () => {
  const prefs = { memoryEnabled: true, noticeAcknowledged: false, timeZone: 'UTC' };
  invoke.mockImplementation(async (channel, input) => channel === 'review:prefs:erase' ? { ok: true } : { ...prefs, ...input });
  render(<MemorySettings />);
  await screen.findByText('review:memory_notice');
  fireEvent.click(screen.getByRole('button', { name: 'review:acknowledge' }));
  await waitFor(() => expect(screen.queryByText('review:memory_notice')).toBeNull());
  expect(invoke).toHaveBeenCalledWith('review:prefs:set', { noticeAcknowledged: true });
  fireEvent.click(screen.getByRole('checkbox', { name: 'review:memory_enabled' }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:prefs:set', { memoryEnabled: false }));
  fireEvent.click(screen.getByRole('button', { name: 'review:erase_memory' }));
  expect(invoke).not.toHaveBeenCalledWith('review:prefs:erase', {});
  fireEvent.click(screen.getByRole('button', { name: 'review:erase_confirm' }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:prefs:erase', {}));
});
it('offers retry when preferences cannot be read', async () => {
  invoke.mockRejectedValueOnce(new Error('offline'));
  render(<MemorySettings />);
  await screen.findByRole('alert');
  invoke.mockResolvedValue({ memoryEnabled: false, noticeAcknowledged: true, timeZone: 'UTC' });
  fireEvent.click(screen.getByRole('button', { name: 'review:retry' }));
  await screen.findByRole('checkbox');
});
