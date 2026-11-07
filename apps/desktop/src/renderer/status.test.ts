import { afterEach, expect, it, vi } from 'vitest';
import { tr } from '../shared/i18n';
import { errorText, statusText } from './status';
afterEach(() => vi.restoreAllMocks());
it('logs unmapped status codes in development builds and keeps the generic fallback', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(statusText({ code: 'nowhere.unknown_code', params: {} })).toBe(tr('errors:generic'));
  expect(warn).toHaveBeenCalledWith('Unmapped status code: nowhere.unknown_code');
});
it('does not log mapped codes', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(statusText({ code: 'errors.network', params: {} })).toBe(tr('errors:network'));
  expect(warn).not.toHaveBeenCalled();
});
it.each(['errors.disk_full', 'errors.permission_denied', 'errors.offline'])('shows next-step copy for %s', code => {
  const text = errorText(new Error('VSTUDY_STATUS:' + JSON.stringify({ code, params: {} })));
  expect(text).not.toBe(tr('errors:generic'));
  expect(text.length).toBeGreaterThan(30);
});
